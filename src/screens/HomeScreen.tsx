import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    AppState as RNAppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useShareIntent } from 'expo-share-intent';

import { UrlInput } from '../components/UrlInput';
import { ActionButton } from '../components/ActionButton';
import { StatusIndicator } from '../components/StatusIndicator';
import { HeadlessWebView } from '../components/HeadlessWebView';
import { QueueList } from '../components/QueueList';
import { DumpButton } from '../components/DumpButton';
import { ScreensaverButton } from '../components/ScreensaverButton';
import { SettingsModal } from './SettingsModal';
import { FileList } from '../components/FileList';

import type { Settings, ConnectionStatus, AppState, ExtractionResult, QueuedArticle } from '../types';
import { isValidUrl } from '../utils/sanitizer';
import { getSettings, saveSettings, getCurrentIp } from '../services/settings';
import { extractArticle } from '../services/extractor';
import { buildEpub } from '../services/epub_builder';
import { uploadToStock, checkStockConnection } from '../services/x4_upload';
import { uploadToCrossPoint, checkCrossPointConnection, uploadScreensaverToCrossPoint } from '../services/crosspoint_upload';
import { convertImageToScreensaverBmp } from '../services/image_converter';
import { getQueue, addToQueue, removeFromQueue } from '../services/queue_storage';
import { processQueue } from '../services/queue_processor';

export function HomeScreen() {
    // State
    const [url, setUrl] = useState('');
    const [clipboardUrl, setClipboardUrl] = useState<string | undefined>();
    const [appState, setAppState] = useState<AppState>('idle');
    const [errorMessage, setErrorMessage] = useState<string | undefined>();
    const [settings, setSettings] = useState<Settings>({
        firmwareType: 'crosspoint',
        stockIp: '192.168.3.3',
        crossPointIp: 'crosspoint.local',
    });
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
        connected: false,
        ip: 'crosspoint.local',
        firmwareType: 'crosspoint',
        checking: true,
    });
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [sendLoading, setSendLoading] = useState(false);
    const [extractionUrl, setExtractionUrl] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    // Queue state
    const [queue, setQueue] = useState<QueuedArticle[]>([]);
    const [dumpLoading, setDumpLoading] = useState(false);
    const [dumpProgress, setDumpProgress] = useState<{
        current: number;
        total: number;
        title?: string;
    } | undefined>();

    // Screensaver state
    const [screensaverLoading, setScreensaverLoading] = useState(false);

    // Load settings and queue on mount
    useEffect(() => {
        loadSettings();
        loadQueue();
    }, []);

    // Handle Share Intent — auto-add URL to queue, or upload image as screensaver
    const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();

    useEffect(() => {
        if (!hasShareIntent) return;

        // Handle shared images (from gallery share sheet)
        if ((shareIntent.type === 'media' || shareIntent.type === 'file') && shareIntent.files && shareIntent.files.length > 0) {
            const file = shareIntent.files[0];
            const fileUri = file.path;
            const width = file.width ?? undefined;
            const height = file.height ?? undefined;

            // Generate a .bmp filename
            const originalName = file.fileName || `shared_${Date.now()}`;
            const baseName = originalName.replace(/\.[^.]+$/, '');
            const filename = `${baseName}.bmp`;

            console.log('Received shared image:', filename, fileUri);

            handleSendScreensaver(fileUri, filename, width, height).catch(err => {
                console.warn('Failed to upload shared screensaver:', err);
                Alert.alert('Upload Failed', 'Could not convert and upload the shared image.');
            });

            resetShareIntent();
            return;
        }

        // Handle shared URLs (existing behavior)
        if (shareIntent.type === 'text' || shareIntent.type === 'weburl') {
            const sharedValue = shareIntent.type === 'weburl'
                ? shareIntent.webUrl
                : shareIntent.text;

            console.log('Received share intent:', sharedValue);

            if (sharedValue && isValidUrl(sharedValue.trim())) {
                // Auto-add to queue (catch to avoid unhandled rejection)
                handleAddToQueueFromShare(sharedValue.trim()).catch(err => {
                    console.warn('Failed to add shared URL to queue:', err);
                    // Fallback: put in input so user can try manually
                    setUrl(sharedValue.trim());
                });
            } else if (sharedValue) {
                // Not a valid URL — put it in the input for manual handling
                setUrl(sharedValue);
            }

            setClipboardUrl(undefined);
            resetShareIntent();
        }
    }, [hasShareIntent, shareIntent, resetShareIntent]);

    // Check clipboard and connection when app comes to foreground
    useEffect(() => {
        const subscription = RNAppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                checkClipboard();
                checkConnection();
                loadQueue(); // Refresh queue when app comes back
            }
        });

        // Initial checks
        checkClipboard();
        checkConnection();

        return () => subscription.remove();
    }, [settings]);

    const loadSettings = async () => {
        const loaded = await getSettings();
        setSettings(loaded);
        setConnectionStatus(prev => ({
            ...prev,
            ip: getCurrentIp(loaded),
            firmwareType: loaded.firmwareType,
        }));
    };

    const loadQueue = async () => {
        const items = await getQueue();
        setQueue(items);
    };

    const checkClipboard = async () => {
        try {
            const hasString = await Clipboard.hasStringAsync();
            if (hasString) {
                const text = await Clipboard.getStringAsync();
                if (text && isValidUrl(text.trim())) {
                    setClipboardUrl(text.trim());
                } else {
                    setClipboardUrl(undefined);
                }
            } else {
                setClipboardUrl(undefined);
            }
        } catch (error) {
            console.warn('Failed to check clipboard:', error);
        }
    };

    const checkConnection = async () => {
        setConnectionStatus(prev => ({ ...prev, checking: true }));

        const ip = getCurrentIp(settings);
        let connected = false;

        if (settings.firmwareType === 'crosspoint') {
            connected = await checkCrossPointConnection(ip);
        } else {
            connected = await checkStockConnection(ip);
        }

        setConnectionStatus({
            connected,
            ip,
            firmwareType: settings.firmwareType,
            checking: false,
        });
    };

    const handleUseClipboard = () => {
        if (clipboardUrl) {
            setUrl(clipboardUrl);
        }
    };

    const handleSaveSettings = async (newSettings: Settings) => {
        await saveSettings(newSettings);
        setSettings(newSettings);
        setConnectionStatus(prev => ({
            ...prev,
            ip: getCurrentIp(newSettings),
            firmwareType: newSettings.firmwareType,
        }));
        setTimeout(checkConnection, 100);
    };

    // --- Add to Queue ---
    const handleAddToQueue = async () => {
        const targetUrl = url.trim();
        if (!targetUrl) {
            Alert.alert('Error', 'Please enter a URL');
            return;
        }
        if (!isValidUrl(targetUrl)) {
            Alert.alert('Error', 'Please enter a valid URL');
            return;
        }

        try {
            await addToQueue(targetUrl);
            setUrl('');
            await loadQueue();
            Alert.alert('Added to Queue ✓', 'Article saved for later sending.');
        } catch (error) {
            console.warn('Failed to add to queue:', error);
            Alert.alert('Error', 'Failed to save article to queue.');
        }
    };

    const handleAddToQueueFromShare = async (sharedUrl: string) => {
        await addToQueue(sharedUrl);
        await loadQueue();

        Alert.alert('Added to Queue ✓', 'Shared article saved for later sending.');
    };

    // --- Remove from Queue ---
    const handleRemoveFromQueue = async (id: string) => {
        try {
            await removeFromQueue(id);
            await loadQueue();
        } catch (error) {
            console.warn('Failed to remove from queue:', error);
            Alert.alert('Error', 'Failed to remove article from queue.');
        }
    };

    // --- Dump Queue ---
    const handleDumpQueue = async () => {
        if (!connectionStatus.connected) {
            Alert.alert('Not Connected', 'Please connect to the X4 WiFi hotspot first.');
            return;
        }

        const pendingCount = queue.filter(
            item => item.status === 'pending' || item.status === 'failed' || item.status === 'processing'
        ).length;

        if (pendingCount === 0) {
            Alert.alert('Queue Empty', 'No articles to send.');
            return;
        }

        setDumpLoading(true);
        setDumpProgress(undefined);

        try {
            const result = await processQueue(settings, (current, total, title) => {
                setDumpProgress({ current, total, title });
            });

            // Refresh queue and file list
            await loadQueue();
            setRefreshKey(prev => prev + 1);

            // Show summary
            if (result.failed.length === 0) {
                Alert.alert(
                    'All Sent! ✓',
                    `${result.succeeded} article${result.succeeded !== 1 ? 's' : ''} sent to your X4.`
                );
            } else {
                const failedSummary = result.failed
                    .map(f => `• ${f.title || f.url}\n  ${f.error}`)
                    .join('\n\n');

                Alert.alert(
                    'Partially Sent',
                    `${result.succeeded} sent, ${result.failed.length} failed:\n\n${failedSummary}\n\nFailed articles remain in the queue.`
                );
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            Alert.alert('Dump Failed', message);
        } finally {
            setDumpLoading(false);
            setDumpProgress(undefined);
        }
    };

    // --- Send to X4 (direct, one-off) ---
    const handleSendToX4 = async () => {
        if (!url.trim()) {
            Alert.alert('Error', 'Please enter a URL');
            return;
        }

        if (!isValidUrl(url.trim())) {
            Alert.alert('Error', 'Please enter a valid URL');
            return;
        }

        if (!connectionStatus.connected) {
            Alert.alert(
                'Not Connected',
                'Please connect to the X4 WiFi hotspot first.'
            );
            return;
        }

        setSendLoading(true);
        setAppState('processing');
        setErrorMessage(undefined);

        // Check if we need to use WebView extraction (Twitter/X)
        const targetUrl = url.trim();
        const hostname = new URL(targetUrl).hostname;
        if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
            console.log('Using WebView extraction for Twitter/X');
            setExtractionUrl(targetUrl);
            return;
        }

        // Standard extraction
        try {
            const extraction = await extractArticle(targetUrl);
            await processExtractionResult(extraction);
        } catch (error) {
            handleError(error);
        }
    };

    const handleError = (error: any) => {
        const message = error instanceof Error ? error.message : 'Unknown error';
        setAppState('error');
        setErrorMessage(message);
        Alert.alert('Error', message);
        setSendLoading(false);
        setExtractionUrl(null);
    };

    const processExtractionResult = async (extraction: ExtractionResult) => {
        try {
            if (!extraction.success || !extraction.article) {
                throw new Error(extraction.error || 'Failed to extract article');
            }

            const epub = await buildEpub(extraction.article);

            const ip = getCurrentIp(settings);
            let uploadResult;

            if (settings.firmwareType === 'crosspoint') {
                uploadResult = await uploadToCrossPoint(ip, epub.data, epub.filename);
            } else {
                uploadResult = await uploadToStock(ip, epub.data, epub.filename);
            }

            if (!uploadResult.success) {
                throw new Error(uploadResult.error || 'Upload failed');
            }

            setAppState('success');
            setRefreshKey(prev => prev + 1);

            Alert.alert(
                'Success! ✓',
                `"${extraction.article.title}" has been sent to your X4.`,
                [{ text: 'OK', onPress: () => setAppState('idle') }]
            );

        } catch (error) {
            handleError(error);
        } finally {
            if (!extractionUrl) {
                setSendLoading(false);
            }
        }
    };

    const handleExtractionComplete = async (result: ExtractionResult) => {
        setExtractionUrl(null);
        await processExtractionResult(result);
        setSendLoading(false);
    };

    // --- Send Screensaver ---
    const handleSendScreensaver = async (uri: string, filename: string, width?: number, height?: number) => {
        if (!connectionStatus.connected) {
            Alert.alert('Not Connected', 'Please connect to the X4 WiFi hotspot first.');
            return;
        }

        setScreensaverLoading(true);
        try {
            // Convert any image to 480×800 uncompressed BMP
            const bmp = await convertImageToScreensaverBmp(uri, width, height);

            const ip = getCurrentIp(settings);
            const result = await uploadScreensaverToCrossPoint(ip, bmp.data, bmp.filename);

            if (!result.success) {
                throw new Error(result.error || 'Upload failed');
            }

            setRefreshKey(prev => prev + 1);
            Alert.alert('Success! ✓', `Screensaver "${bmp.filename}" has been sent to your X4.`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            Alert.alert('Upload Failed', message);
        } finally {
            setScreensaverLoading(false);
        }
    };

    const pendingCount = queue.filter(
        item => item.status === 'pending' || item.status === 'failed' || item.status === 'processing'
    ).length;

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.settingsButton}
                    onPress={() => setSettingsVisible(true)}
                >
                    <Text style={styles.settingsIcon}>⚙️</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Send to X4</Text>
                <View style={styles.headerSpacer} />
            </View>

            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
                keyboardShouldPersistTaps="handled"
            >
                {/* URL Input */}
                <UrlInput
                    value={url}
                    onChange={setUrl}
                    clipboardUrl={clipboardUrl}
                    onUseClipboard={handleUseClipboard}
                    disabled={sendLoading || dumpLoading}
                />

                {/* Action Buttons */}
                <View style={styles.buttonRow}>
                    <View style={styles.buttonHalf}>
                        <ActionButton
                            title="SEND NOW"
                            icon="◉"
                            onPress={handleSendToX4}
                            loading={sendLoading}
                            disabled={!url.trim() || dumpLoading}
                            variant="primary"
                        />
                    </View>
                    <View style={styles.buttonHalf}>
                        <ActionButton
                            title="ADD TO QUEUE"
                            icon="＋"
                            onPress={handleAddToQueue}
                            loading={false}
                            disabled={!url.trim() || sendLoading || dumpLoading}
                            variant="secondary"
                        />
                    </View>
                </View>

                {/* Error message */}
                {errorMessage && (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{errorMessage}</Text>
                    </View>
                )}

                {/* Connection Status */}
                <View style={styles.statusContainer}>
                    <StatusIndicator
                        status={connectionStatus}
                        onRetry={checkConnection}
                    />
                </View>

                {/* Queue Section */}
                <View style={styles.queueSection}>
                    <Text style={styles.sectionTitle}>
                        Queue {queue.length > 0 ? `(${queue.length})` : ''}
                    </Text>

                    <QueueList
                        queue={queue}
                        onRemove={handleRemoveFromQueue}
                        disabled={dumpLoading}
                    />

                    {queue.length > 0 && (
                        <View style={styles.dumpButtonContainer}>
                            <DumpButton
                                count={pendingCount}
                                connected={connectionStatus.connected}
                                loading={dumpLoading}
                                progress={dumpProgress}
                                onPress={handleDumpQueue}
                            />
                        </View>
                    )}
                </View>

                {/* Screensaver Section */}
                <View style={styles.screensaverSection}>
                    <Text style={styles.sectionTitle}>Screensavers</Text>
                    <ScreensaverButton
                        connected={connectionStatus.connected}
                        onImageSelected={handleSendScreensaver}
                        loading={screensaverLoading}
                    />
                </View>

                {/* File List */}
                {connectionStatus.connected && (
                    <FileList
                        settings={settings}
                        connected={connectionStatus.connected}
                        refreshTrigger={refreshKey}
                    />
                )}
            </ScrollView>

            {/* Settings Modal */}
            <SettingsModal
                visible={settingsVisible}
                onClose={() => setSettingsVisible(false)}
                settings={settings}
                onSave={handleSaveSettings}
            />

            {/* Headless WebView for Extraction */}
            {extractionUrl && (
                <HeadlessWebView
                    url={extractionUrl}
                    onExtractionComplete={handleExtractionComplete}
                />
            )}
        </SafeAreaView>
    );
}



const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1a1a2e',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    settingsButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    settingsIcon: {
        fontSize: 20,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
    },
    headerSpacer: {
        width: 40,
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: 20,
        paddingTop: 10,
    },
    buttonRow: {
        flexDirection: 'row',
        marginTop: 24,
        gap: 10,
    },
    buttonHalf: {
        flex: 1,
    },

    errorContainer: {
        marginTop: 16,
        padding: 12,
        backgroundColor: 'rgba(248, 113, 113, 0.1)',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(248, 113, 113, 0.3)',
    },
    errorText: {
        color: '#f87171',
        fontSize: 14,
        textAlign: 'center',
    },
    statusContainer: {
        marginTop: 24,
    },
    queueSection: {
        marginTop: 28,
    },
    sectionTitle: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 12,
    },
    dumpButtonContainer: {
        marginTop: 16,
    },
    screensaverSection: {
        marginTop: 28,
    },
});

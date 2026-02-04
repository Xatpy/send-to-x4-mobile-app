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
import { SettingsModal } from './SettingsModal';
import { FileList } from '../components/FileList';

import type { Settings, ConnectionStatus, AppState, ExtractionResult } from '../types';
import { isValidUrl } from '../utils/sanitizer';
import { getSettings, saveSettings, getCurrentIp } from '../services/settings';
import { extractArticle } from '../services/extractor';
import { buildEpub } from '../services/epub_builder';
import { uploadToStock, checkStockConnection } from '../services/x4_upload';
import { uploadToCrossPoint, checkCrossPointConnection } from '../services/crosspoint_upload';

export function HomeScreen() {
    // State
    const [url, setUrl] = useState('');
    const [clipboardUrl, setClipboardUrl] = useState<string | undefined>();
    const [appState, setAppState] = useState<AppState>('idle');
    const [errorMessage, setErrorMessage] = useState<string | undefined>();
    const [settings, setSettings] = useState<Settings>({
        firmwareType: 'crosspoint',
        stockIp: '192.168.3.3',
        crossPointIp: '192.168.1.224',
    });
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
        connected: false,
        ip: '192.168.1.224',
        firmwareType: 'crosspoint',
        checking: true,
    });
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [sendLoading, setSendLoading] = useState(false);
    const [extractionUrl, setExtractionUrl] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    // Load settings on mount
    useEffect(() => {
        loadSettings();
    }, []);

    // Handle Share Intent
    const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();

    useEffect(() => {
        if (hasShareIntent && (shareIntent.type === 'text' || shareIntent.type === 'weburl')) {
            // Extract URL from webUrl or text property
            const sharedValue = shareIntent.type === 'weburl'
                ? shareIntent.webUrl
                : shareIntent.text;

            console.log('Received share intent:', sharedValue);

            if (sharedValue && isValidUrl(sharedValue)) {
                setUrl(sharedValue);
            } else if (sharedValue) {
                // Simple fallback: set the whole text if it's not empty
                setUrl(sharedValue);
            }

            // Clear clipboard detection to avoid confusion when sharing
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
        // Re-check connection with new settings
        setTimeout(checkConnection, 100);
    };

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
            // Extraction continues in onExtractionComplete
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

            // 2. Build EPUB
            const epub = await buildEpub(extraction.article);

            // 3. Upload to X4
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

            // Success!
            setAppState('success');
            setRefreshKey(prev => prev + 1); // Trigger file list refresh

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
            // If called from WebView callback, we clear URL there
        }
    };

    const handleExtractionComplete = async (result: ExtractionResult) => {
        setExtractionUrl(null); // Unmount WebView
        await processExtractionResult(result);
        setSendLoading(false);
    };



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
                    disabled={sendLoading}
                />

                {/* Action Button */}
                <View style={styles.buttonContainer}>
                    <ActionButton
                        title="SEND TO X4"
                        icon="◉"
                        onPress={handleSendToX4}
                        loading={sendLoading}
                        disabled={!url.trim()}
                        variant="primary"
                    />
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
    buttonContainer: {
        marginTop: 24,
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
});

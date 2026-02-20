/**
 * ArticlesScreen — Tab for sending articles to X4.
 *
 * Features:
 *   - URL input with clipboard detection
 *   - Send Now (one-off) / Add to Queue
 *   - Queue list with batch dump
 *   - Headless WebView extraction for Twitter/X
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Alert,
    AppState as RNAppState,
    TouchableOpacity,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useConnection } from '../contexts/ConnectionProvider';
import { UrlInput } from '../components/UrlInput';
import { ActionButton } from '../components/ActionButton';
import { QueueList } from '../components/QueueList';
import { DumpButton } from '../components/DumpButton';
import { HeadlessWebView } from '../components/HeadlessWebView';

import type { AppState, ExtractionResult, QueuedArticle } from '../types';
import { isValidUrl } from '../utils/sanitizer';
import { extractArticle } from '../services/extractor';
import { buildEpub } from '../services/epub_builder';
import { uploadToStock } from '../services/x4_upload';
import { uploadToCrossPoint } from '../services/crosspoint_upload';
import { getCurrentIp, getArticleFolder } from '../services/settings';
import { getQueue, addToQueue, removeFromQueue, clearQueue } from '../services/queue_storage';
import { prefetchArticle } from '../services/queue_prefetch';

import { processQueue } from '../services/queue_processor';

interface ArticlesScreenProps {
    /** Pre-filled URL from share intent */
    sharedUrl?: string | null;
    onSharedUrlConsumed?: () => void;
}

export function ArticlesScreen({ sharedUrl, onSharedUrlConsumed }: ArticlesScreenProps) {
    const { settings, connectionStatus } = useConnection();

    // Local state
    const [url, setUrl] = useState('');
    const [clipboardUrl, setClipboardUrl] = useState<string | undefined>();
    const [appState, setAppState] = useState<AppState>('idle');
    const [errorMessage, setErrorMessage] = useState<string | undefined>();
    const [sendLoading, setSendLoading] = useState(false);
    const [extractionUrl, setExtractionUrl] = useState<string | null>(null);

    // Queue state
    const [queue, setQueue] = useState<QueuedArticle[]>([]);
    const [dumpLoading, setDumpLoading] = useState(false);
    const [dumpProgress, setDumpProgress] = useState<{
        current: number;
        total: number;
        title?: string;
    } | undefined>();
    const [currentUploadProgress, setCurrentUploadProgress] = useState<number | undefined>();
    const [queueLoading, setQueueLoading] = useState(false);

    const loadQueue = useCallback(async () => {
        const items = await getQueue();
        setQueue(items);
    }, []);

    // Load queue on mount
    useEffect(() => {
        loadQueue();
    }, [loadQueue]);

    // Handle shared URL from share intent
    useEffect(() => {
        if (sharedUrl) {
            handleAddToQueueFromShare(sharedUrl).catch(err => {
                console.warn('Failed to add shared URL to queue:', err);
                setUrl(sharedUrl);
            });
            onSharedUrlConsumed?.();
        }
    }, [sharedUrl]);

    // Check clipboard on foreground
    useEffect(() => {
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

        checkClipboard();

        const sub = RNAppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                checkClipboard();
                loadQueue();
            }
        });

        return () => sub.remove();
    }, [loadQueue]);

    // --- Handlers ---

    const handleUseClipboard = () => {
        if (clipboardUrl) setUrl(clipboardUrl);
    };

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

        setQueueLoading(true);
        try {
            // Pre-fetch: extract + build EPUB now while we have internet
            const prefetch = await prefetchArticle(targetUrl);

            if (prefetch.success && prefetch.path && prefetch.filename) {
                await addToQueue(targetUrl, prefetch.title, false, prefetch.path, prefetch.filename);
                setUrl('');
                await loadQueue();
                Alert.alert('Downloaded & Queued ✓', `"${prefetch.title || 'Article'}" is ready to send offline.`);
            } else {
                // Fallback: queue URL only (will need internet at send time)
                await addToQueue(targetUrl);
                setUrl('');
                await loadQueue();
                Alert.alert(
                    'Queued (not downloaded)',
                    `Could not download the article now: ${prefetch.error || 'Unknown error'}. It will be fetched when you send.`
                );
            }
        } catch (error) {
            console.warn('Failed to add to queue:', error);
            Alert.alert('Error', 'Failed to save article to queue.');
        } finally {
            setQueueLoading(false);
        }
    };

    const handlePickEpub = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/epub+zip', 'application/x-epub'],
                copyToCacheDirectory: true, // Ensure we have access
            });

            if (result.canceled || !result.assets || result.assets.length === 0) return;

            const file = result.assets[0];
            await addToQueue(file.uri, file.name || 'Imported EPUB', true);
            await loadQueue();
            Alert.alert('Added to Queue ✓', `"${file.name || 'File'}" saved for later sending.`);
        } catch (error) {
            console.warn('Pick epub error:', error);
            Alert.alert('Error', 'Failed to pick EPUB file.');
        }
    };

    const handleAddToQueueFromShare = async (sharedUrlValue: string) => {
        setQueueLoading(true);
        try {
            const prefetch = await prefetchArticle(sharedUrlValue);

            if (prefetch.success && prefetch.path && prefetch.filename) {
                await addToQueue(sharedUrlValue, prefetch.title, false, prefetch.path, prefetch.filename);
                await loadQueue();
                Alert.alert('Downloaded & Queued ✓', `"${prefetch.title || 'Article'}" is ready to send offline.`);
            } else {
                await addToQueue(sharedUrlValue);
                await loadQueue();
                Alert.alert('Queued (not downloaded)', 'Article will be fetched when you send.');
            }
        } finally {
            setQueueLoading(false);
        }
    };

    const handleRemoveFromQueue = async (id: string) => {
        try {
            await removeFromQueue(id);
            await loadQueue();
        } catch (error) {
            console.warn('Failed to remove from queue:', error);
            Alert.alert('Error', 'Failed to remove article from queue.');
        }
    };

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
        setCurrentUploadProgress(0);

        try {
            const result = await processQueue(
                settings,
                (current, total, title) => {
                    setDumpProgress({ current, total, title });
                    setCurrentUploadProgress(0); // Reset for next item
                },
                (percent) => {
                    setCurrentUploadProgress(percent);
                }
            );

            await loadQueue();

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
            setCurrentUploadProgress(undefined);
        }
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
            Alert.alert('Not Connected', 'Please connect to the X4 WiFi hotspot first.');
            return;
        }

        setSendLoading(true);
        setAppState('processing');
        setErrorMessage(undefined);

        const targetUrl = url.trim();
        const hostname = new URL(targetUrl).hostname;
        if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
            setExtractionUrl(targetUrl);
            return;
        }

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
            const articleFolder = getArticleFolder(settings);
            let uploadResult;

            if (settings.firmwareType === 'crosspoint') {
                uploadResult = await uploadToCrossPoint(ip, epub.data, epub.filename, undefined, articleFolder);
            } else {
                uploadResult = await uploadToStock(ip, epub.data, epub.filename, articleFolder);
            }

            if (!uploadResult.success) {
                throw new Error(uploadResult.error || 'Upload failed');
            }

            setAppState('success');
            setUrl('');

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

    const pendingCount = queue.filter(
        item => item.status === 'pending' || item.status === 'failed' || item.status === 'processing'
    ).length;

    const [activeTab, setActiveTab] = useState<'web' | 'file'>('web');

    // ... (keep existing state)

    return (
        <View style={styles.container}>
            <View style={styles.headerContainer}>
                {/* Segmented Control */}
                <View style={styles.segmentedControl}>
                    <TouchableOpacity
                        style={[
                            styles.segment,
                            activeTab === 'web' && styles.segmentActive,
                        ]}
                        onPress={() => setActiveTab('web')}
                    >
                        <Text
                            style={[
                                styles.segmentText,
                                activeTab === 'web' && styles.segmentTextActive,
                            ]}
                        >
                            Web Link
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.segment,
                            activeTab === 'file' && styles.segmentActive,
                        ]}
                        onPress={() => setActiveTab('file')}
                    >
                        <Text
                            style={[
                                styles.segmentText,
                                activeTab === 'file' && styles.segmentTextActive,
                            ]}
                        >
                            Local File
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
                keyboardShouldPersistTaps="handled"
            >
                {/* Input Section */}
                <View style={styles.inputCard}>
                    {activeTab === 'web' ? (
                        <>
                            <UrlInput
                                value={url}
                                onChange={setUrl}
                                clipboardUrl={clipboardUrl}
                                onUseClipboard={handleUseClipboard}
                                disabled={sendLoading || dumpLoading}
                            />

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
                                        title={queueLoading ? 'DOWNLOADING...' : 'QUEUE'}
                                        icon="＋"
                                        onPress={handleAddToQueue}
                                        loading={queueLoading}
                                        disabled={!url.trim() || sendLoading || dumpLoading || queueLoading}
                                        variant="secondary"
                                    />
                                </View>
                            </View>
                        </>
                    ) : (
                        <View style={styles.fileSection}>
                            <Text style={styles.fileInstruction}>
                                Select an EPUB file from your device to add to the queue.
                            </Text>
                            <ActionButton
                                title="PICK EPUB FILE"
                                icon="📂"
                                onPress={handlePickEpub}
                                loading={false}
                                disabled={sendLoading || dumpLoading}
                                variant="secondary"
                            />
                        </View>
                    )}
                </View>

                {/* Error message */}
                {errorMessage && (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{errorMessage}</Text>
                    </View>
                )}

                {/* Queue Section */}
                <View style={styles.queueSection}>
                    <View style={styles.queueHeader}>
                        <Text style={styles.sectionTitle}>
                            Queue {queue.length > 0 ? `(${queue.length})` : ''}
                        </Text>
                        {queue.length > 0 && (
                            <TouchableOpacity onPress={() => Alert.alert('Clear Queue', 'Delete all items?', [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Clear All', style: 'destructive', onPress: async () => {
                                        await clearQueue();
                                        await loadQueue();
                                    }
                                }
                            ])}>
                                <Text style={styles.clearText}>Clear All</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <QueueList
                        queue={queue}
                        onRemove={handleRemoveFromQueue}
                        disabled={dumpLoading}
                        currentUploadProgress={currentUploadProgress}
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
            </ScrollView>

            {/* Headless WebView for Extraction */}
            {extractionUrl && (
                <HeadlessWebView
                    url={extractionUrl}
                    onExtractionComplete={handleExtractionComplete}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1a1a2e',
    },
    headerContainer: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 4,
        zIndex: 10,
    },
    segmentedControl: {
        flexDirection: 'row',
        backgroundColor: '#2d2d44',
        borderRadius: 12,
        padding: 4,
    },
    segment: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 10,
    },
    segmentActive: {
        backgroundColor: '#6c63ff',
    },
    segmentText: {
        color: '#666',
        fontSize: 14,
        fontWeight: '600',
    },
    segmentTextActive: {
        color: '#fff',
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: 20,
        paddingTop: 8,
    },
    inputCard: {
        marginTop: 4,
        marginBottom: 8,
    },
    fileSection: {
        paddingVertical: 20,
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        padding: 16,
    },
    fileInstruction: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 20,
    },
    buttonRow: {
        flexDirection: 'row',
        marginTop: 16,
        gap: 12,
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
    queueSection: {
        marginTop: 24,
    },
    queueHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        paddingHorizontal: 4,
    },
    clearText: {
        color: '#f87171',
        fontSize: 12,
        fontWeight: '600',
    },
    sectionTitle: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    dumpButtonContainer: {
        marginTop: 16,
    },
});

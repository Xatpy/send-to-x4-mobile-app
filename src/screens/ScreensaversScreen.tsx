/**
 * ScreensaversScreen — Tab for sending screensaver images to X4.
 *
 * Features:
 *   - Pick any image → convert to 480×800 BMP → upload (Send Now)
 *   - Queue images for later batch sending
 *   - View and manage screensaver queue
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Alert,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useConnection } from '../contexts/ConnectionProvider';
import { ScreensaverButton } from '../components/ScreensaverButton';
import { ScreensaverQueueList } from '../components/ScreensaverQueueList';
import { DumpButton } from '../components/DumpButton';
import { ProcessingOverlay } from '../components/ProcessingOverlay';

import { convertImageToScreensaverBmp } from '../services/image_converter';
import { uploadScreensaverToCrossPoint } from '../services/crosspoint_upload';
import { getCurrentIp } from '../services/settings';
import {
    getScreensaverQueue,
    addToScreensaverQueue,
    removeFromScreensaverQueue,
    clearScreensaverQueue
} from '../services/screensaver_queue';
import { processScreensaverQueue } from '../services/screensaver_processor';
import type { QueuedScreensaver } from '../types';

interface ScreensaversScreenProps {
    /** Pre-filled image URI from share intent */
    sharedImage?: {
        uri: string;
        filename: string;
        width?: number;
        height?: number;
    } | null;
    onSharedImageConsumed?: () => void;
}

export function ScreensaversScreen({ sharedImage, onSharedImageConsumed }: ScreensaversScreenProps) {
    const { settings, connectionStatus } = useConnection();
    const navigation = useNavigation<any>();

    const [loading, setLoading] = useState(false);
    const [queue, setQueue] = useState<QueuedScreensaver[]>([]);
    const [processingQueue, setProcessingQueue] = useState(false);
    const [progressMessage, setProgressMessage] = useState('');

    // Load queue on mount
    useEffect(() => {
        loadQueue();
    }, []);

    const loadQueue = async () => {
        const items = await getScreensaverQueue();
        setQueue(items);
    };

    // Handle shared image from share intent
    useEffect(() => {
        if (sharedImage) {
            Alert.alert(
                'Shared Image',
                'What would you like to do with this image?',
                [
                    {
                        text: 'Add to Queue',
                        onPress: () => {
                            handleAddToQueue(
                                sharedImage.uri,
                                sharedImage.filename,
                                sharedImage.width,
                                sharedImage.height
                            );
                            onSharedImageConsumed?.();
                        }
                    },
                    {
                        text: 'Send Now',
                        onPress: () => {
                            handleSendScreensaver(
                                sharedImage.uri,
                                sharedImage.filename,
                                sharedImage.width,
                                sharedImage.height
                            );
                            onSharedImageConsumed?.();
                        }
                    },
                    {
                        text: 'Cancel',
                        style: 'cancel',
                        onPress: () => onSharedImageConsumed?.()
                    }
                ]
            );
        }
    }, [sharedImage]);

    const handleSendScreensaver = useCallback(async (
        uri: string,
        filename: string,
        width?: number,
        height?: number,
    ) => {
        if (!connectionStatus.connected) {
            Alert.alert('Not Connected', 'Please connect to the X4 WiFi hotspot first.');
            return;
        }

        setLoading(true);
        try {
            const bmp = await convertImageToScreensaverBmp(uri, width, height);
            const ip = getCurrentIp(settings);
            const result = await uploadScreensaverToCrossPoint(ip, bmp.data, bmp.filename);

            if (!result.success) {
                throw new Error(result.error || 'Upload failed');
            }

            Alert.alert('Success! ✓', `Screensaver "${bmp.filename}" has been sent to your X4.`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            Alert.alert('Upload Failed', message);
        } finally {
            setLoading(false);
        }
    }, [connectionStatus.connected, settings]);

    const handleAddToQueue = useCallback(async (
        uri: string,
        filename: string,
        width?: number,
        height?: number,
    ) => {
        try {
            await addToScreensaverQueue(uri, filename, width, height);
            await loadQueue();
            Alert.alert('Added to Queue', `"${filename}" is ready to be sent later.`);
        } catch (error) {
            console.warn('Failed to add to queue:', error);
            Alert.alert('Error', 'Failed to add image to queue.');
        }
    }, []);

    const handleRemoveFromQueue = async (id: string) => {
        await removeFromScreensaverQueue(id);
        await loadQueue();
    };

    const handleDumpQueue = async () => {
        if (!connectionStatus.connected) {
            Alert.alert('Not Connected', 'Connect to X4 WiFi to send queued images.');
            return;
        }

        if (queue.length === 0) return;

        setProcessingQueue(true);
        setProgressMessage('Preparing upload...');

        try {
            const result = await processScreensaverQueue(settings, (current, total, filename) => {
                setProgressMessage(`Uploading ${current} of ${total}...\n${filename}`);
            });

            await loadQueue(); // Reload to show updated statuses

            if (result.failed.length > 0) {
                // Wait a bit to let modal fade out/process? No, modal hides in finally.
                // We show alert after modal hides.
                setTimeout(() => {
                    Alert.alert(
                        'Batch Complete',
                        `Uploaded ${result.succeeded} images.\nFailed: ${result.failed.length}. Check usage list for details.`
                    );
                }, 500);
            } else {
                setTimeout(() => {
                    Alert.alert('Batch Complete', `Successfully uploaded all ${result.succeeded} images!`);

                    // Optional: Ask to clear successful items
                    Alert.alert(
                        'Clear Queue?',
                        'Remove all successfully uploaded images from the queue?',
                        [
                            { text: 'Keep', style: 'cancel' },
                            {
                                text: 'Clear',
                                style: 'destructive',
                                onPress: async () => {
                                    await clearScreensaverQueue();
                                    await loadQueue();
                                }
                            }
                        ]
                    );
                }, 500);
            }
        } catch (error) {
            setTimeout(() => {
                Alert.alert('Error', 'Failed to process queue.');
            }, 500);
        } finally {
            setProcessingQueue(false);
        }
    };

    const handleImageAction = (items: Array<{ uri: string, filename: string, width?: number, height?: number }>) => {
        if (items.length === 0) return;

        if (items.length === 1) {
            const item = items[0];
            Alert.alert(
                'Select Action',
                'Send immediately or add to queue?',
                [
                    {
                        text: 'Add to Queue',
                        onPress: () => handleAddToQueue(item.uri, item.filename, item.width, item.height)
                    },
                    {
                        text: 'Send Now',
                        onPress: () => handleSendScreensaver(item.uri, item.filename, item.width, item.height)
                    },
                    {
                        text: 'Cancel',
                        style: 'cancel'
                    }
                ]
            );
        } else {
            // Multiple items - only offer Add to Queue
            Alert.alert(
                'Add to Queue',
                `Add ${items.length} images to the screensaver queue?`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Add All',
                        onPress: async () => {
                            // Add all sequentially or parallel? Parallel is fine for async storage.
                            // But we might want unique filenames if they clash?
                            // For now assume unique enough or unrelated.
                            let added = 0;
                            for (const item of items) {
                                try {
                                    // Make filename unique if needed? 
                                    // The queue service generates unique IDs, but filenames are display only.
                                    await addToScreensaverQueue(item.uri, item.filename, item.width, item.height);
                                    added++;
                                } catch (e) {
                                    console.warn(`Failed to add ${item.filename}`, e);
                                }
                            }
                            await loadQueue();
                            Alert.alert('Queue Updated', `Added ${added} images to the queue.`);
                        }
                    }
                ]
            );
        }
    };

    return (
        <View style={styles.container}>
            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
            >
                {/* Pick & Upload */}
                <Text style={styles.sectionTitle}>Upload Screensaver</Text>
                <Text style={styles.description}>
                    Pick any image only one image.
                </Text>

                <ScreensaverButton
                    connected={connectionStatus.connected}
                    onImageSelected={handleImageAction}
                    loading={loading}
                />

                <View style={styles.queueHeader}>
                    <Text style={styles.sectionTitle}>Queue ({queue.length})</Text>
                    {queue.length > 0 && (
                        <TouchableOpacity onPress={() => Alert.alert('Clear Queue', 'Delete all items?', [
                            { text: 'Cancel', style: 'cancel' },
                            {
                                text: 'Clear All', style: 'destructive', onPress: async () => {
                                    await clearScreensaverQueue();
                                    await loadQueue();
                                }
                            }
                        ])}>
                            <Text style={styles.clearText}>Clear All</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <ScreensaverQueueList
                    queue={queue}
                    onRemove={handleRemoveFromQueue}
                    disabled={processingQueue}
                />

                {queue.length > 0 && (
                    <View style={styles.dumpContainer}>
                        <DumpButton
                            count={queue.length}
                            connected={connectionStatus.connected}
                            onPress={handleDumpQueue}
                            label={processingQueue ? "UPLOADING..." : `SEND ${queue.length} IMAGES TO X4`}
                            loading={processingQueue}
                            disabled={!connectionStatus.connected}
                        />
                        {!connectionStatus.connected && (
                            <Text style={styles.connectHint}>Connect to X4 to send</Text>
                        )}
                    </View>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>

            <ProcessingOverlay
                visible={processingQueue}
                message={progressMessage || "Processing..."}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1a1a2e',
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: 20,
        paddingTop: 10,
    },
    sectionTitle: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 8,
    },
    description: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 13,
        lineHeight: 18,
        marginBottom: 16,
    },
    queueHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 30,
        marginBottom: 8,
    },
    clearText: {
        color: '#f87171',
        fontSize: 12,
        fontWeight: '600',
    },
    dumpContainer: {
        marginTop: 20,
    },
    connectHint: {
        color: '#f87171',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 8,
    },
});

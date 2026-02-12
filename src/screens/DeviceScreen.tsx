/**
 * DeviceScreen — Tab showing files on the connected X4 device.
 *
 * Two sections:
 *   - Articles: files in /send-to-x4 (.epub)
 *   - Screensavers: files in /sleep (.bmp)
 *
 * Only accessible when device is connected.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';

import { useConnection } from '../contexts/ConnectionProvider';
import type { RemoteFile } from '../types';
import { getCurrentIp } from '../services/settings';
import { listCrossPointFiles, deleteCrossPointFile, listCrossPointSleepFiles, deleteCrossPointSleepFile } from '../services/crosspoint_upload';
import { listStockFiles, deleteStockFile } from '../services/x4_upload';

export function DeviceScreen() {
    const { settings, connectionStatus } = useConnection();

    const [articles, setArticles] = useState<RemoteFile[]>([]);
    const [screensavers, setScreensavers] = useState<RemoteFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

    const loadFiles = useCallback(async () => {
        if (!connectionStatus.connected) return;

        setLoading(true);
        const ip = getCurrentIp(settings);

        // Load independently to avoid one blocking the other
        const loadArticlesPromise = (async () => {
            try {
                if (settings.firmwareType === 'crosspoint') {
                    const items = await listCrossPointFiles(ip);
                    setArticles(items);
                } else {
                    const items = await listStockFiles(ip);
                    setArticles(items);
                    setScreensavers([]); // Clear screensavers for stock
                }
            } catch (getError) {
                console.warn('Failed to load articles:', getError);
                // Keep previous articles or empty? Usually better to keep empty or show error state
            }
        })();

        const loadScreensaversPromise = (async () => {
            if (settings.firmwareType !== 'crosspoint') return;
            try {
                const items = await listCrossPointSleepFiles(ip);
                setScreensavers(items);
            } catch (getError) {
                console.warn('Failed to load screensavers:', getError);
            }
        })();

        // Wait for both to finish before hiding loader
        await Promise.allSettled([loadArticlesPromise, loadScreensaversPromise]);
        setLoading(false);
    }, [settings, connectionStatus.connected]);

    useEffect(() => {
        if (connectionStatus.connected) {
            loadFiles();
        } else {
            setArticles([]);
            setScreensavers([]);
        }
    }, [connectionStatus.connected, loadFiles]);

    const handleDeleteArticle = (file: RemoteFile) => {
        Alert.alert('Delete File', `Delete "${file.name}"?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive',
                onPress: async () => {
                    setDeleteLoading(file.name);
                    const ip = getCurrentIp(settings);
                    const filename = file.rawName || file.name;
                    let success = false;

                    if (settings.firmwareType === 'crosspoint') {
                        success = await deleteCrossPointFile(ip, filename);
                    } else {
                        success = await deleteStockFile(ip, filename);
                    }

                    if (success) {
                        setArticles(prev => prev.filter(f => f.name !== file.name));
                    } else {
                        Alert.alert('Error', 'Failed to delete file');
                    }
                    setDeleteLoading(null);
                },
            },
        ]);
    };

    const handleDeleteScreensaver = (file: RemoteFile) => {
        Alert.alert('Delete File', `Delete "${file.name}"?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive',
                onPress: async () => {
                    setDeleteLoading(file.name);
                    const ip = getCurrentIp(settings);
                    const filename = file.rawName || file.name;
                    const success = await deleteCrossPointSleepFile(ip, filename);

                    if (success) {
                        setScreensavers(prev => prev.filter(f => f.name !== file.name));
                    } else {
                        Alert.alert('Error', 'Failed to delete file');
                    }
                    setDeleteLoading(null);
                },
            },
        ]);
    };

    if (!connectionStatus.connected) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>📱</Text>
                <Text style={styles.emptyTitle}>No Device Connected</Text>
                <Text style={styles.emptyText}>
                    Connect to your X4's WiFi to browse files on the device.
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
                refreshControl={
                    <RefreshControl
                        refreshing={loading}
                        onRefresh={loadFiles}
                        tintColor="#6c63ff"
                    />
                }
            >
                {/* Articles Section */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>
                            📄  Articles ({articles.length})
                        </Text>
                    </View>
                    <Text style={styles.sectionPath}>/send-to-x4</Text>

                    {loading && articles.length === 0 ? (
                        <ActivityIndicator size="small" color="#fff" style={styles.loader} />
                    ) : articles.length === 0 ? (
                        <Text style={styles.emptyListText}>No articles on device</Text>
                    ) : (
                        articles.map(file => (
                            <FileRow
                                key={file.name}
                                file={file}
                                onDelete={() => handleDeleteArticle(file)}
                                deleting={deleteLoading === file.name}
                                disabled={deleteLoading !== null}
                            />
                        ))
                    )}
                </View>

                {/* Screensavers Section */}
                {settings.firmwareType === 'crosspoint' && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>
                                🖼️  Screensavers ({screensavers.length})
                            </Text>
                        </View>
                        <Text style={styles.sectionPath}>/sleep</Text>

                        {loading && screensavers.length === 0 ? (
                            <ActivityIndicator size="small" color="#fff" style={styles.loader} />
                        ) : screensavers.length === 0 ? (
                            <Text style={styles.emptyListText}>No screensavers on device</Text>
                        ) : (
                            screensavers.map(file => (
                                <FileRow
                                    key={file.name}
                                    file={file}
                                    onDelete={() => handleDeleteScreensaver(file)}
                                    deleting={deleteLoading === file.name}
                                    disabled={deleteLoading !== null}
                                />
                            ))
                        )}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

/** Reusable row for a single file */
function FileRow({
    file,
    onDelete,
    deleting,
    disabled,
}: {
    file: RemoteFile;
    onDelete: () => void;
    deleting: boolean;
    disabled: boolean;
}) {
    return (
        <View style={styles.fileItem}>
            <View style={styles.fileInfo}>
                <Text style={styles.fileName}>{file.name}</Text>
                <Text style={styles.fileMeta}>
                    {file.timestamp
                        ? new Date(file.timestamp).toLocaleDateString()
                        : 'Unknown date'}
                    {file.size ? ` · ${(file.size / 1024).toFixed(1)} KB` : ''}
                </Text>
            </View>
            <TouchableOpacity
                style={styles.deleteButton}
                onPress={onDelete}
                disabled={disabled}
            >
                {deleting ? (
                    <ActivityIndicator size="small" color="#ff4444" />
                ) : (
                    <Text style={styles.deleteIcon}>🗑️</Text>
                )}
            </TouchableOpacity>
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
        paddingBottom: 40,
    },
    emptyContainer: {
        flex: 1,
        backgroundColor: '#1a1a2e',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: 16,
    },
    emptyTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 8,
    },
    emptyText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
    },
    section: {
        marginBottom: 28,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    sectionTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    sectionPath: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 12,
        fontFamily: 'monospace' as any,
        marginTop: 4,
        marginBottom: 12,
    },
    loader: {
        marginTop: 20,
    },
    emptyListText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 14,
        fontStyle: 'italic',
        textAlign: 'center',
        marginTop: 16,
    },
    fileItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 12,
        borderRadius: 8,
        marginBottom: 8,
    },
    fileInfo: {
        flex: 1,
    },
    fileName: {
        color: '#fff',
        fontSize: 14,
        marginBottom: 4,
    },
    fileMeta: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
    },
    deleteButton: {
        padding: 10,
    },
    deleteIcon: {
        fontSize: 16,
    },
});

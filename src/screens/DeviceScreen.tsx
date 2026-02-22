/**
 * DeviceScreen — Tab showing files on the connected X4 device.
 *
 * Two sections:
 *   - Articles: files in /send-to-x4 (.epub, .txt)
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
import { getCurrentIp, getArticleFolder, getDeviceBaseUrl } from '../services/settings';
import { listCrossPointFiles, deleteCrossPointFile, listCrossPointSleepFiles, deleteCrossPointSleepFile } from '../services/crosspoint_upload';
import { listStockFiles, deleteStockFile } from '../services/x4_upload';

const DATE_FOLDER_RE = /^\d{4}-\d{2}-\d{2}$/;

export function DeviceScreen() {
    const { settings, connectionStatus } = useConnection();

    const [articles, setArticles] = useState<RemoteFile[]>([]);
    const [screensavers, setScreensavers] = useState<RemoteFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

    /**
     * Discover date-named subfolders inside the base article folder.
     */
    const listDateSubfolders = useCallback(async (ip: string, baseFolder: string): Promise<string[]> => {
        const baseUrl = getDeviceBaseUrl(ip);
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            let items: any[] = [];
            if (settings.firmwareType === 'crosspoint') {
                const res = await fetch(`${baseUrl}/api/files?path=${encodeURIComponent('/' + baseFolder)}`, {
                    signal: controller.signal,
                });
                clearTimeout(timeout);
                if (res.ok) items = await res.json();
            } else {
                const res = await fetch(`${baseUrl}/list?dir=${encodeURIComponent('/' + baseFolder + '/')}`, {
                    signal: controller.signal,
                });
                clearTimeout(timeout);
                if (res.ok) items = await res.json();
            }

            if (!Array.isArray(items)) return [];
            return items
                .filter((item: any) => {
                    const isDir = settings.firmwareType === 'crosspoint' ? item.isDirectory : item.type === 'dir';
                    return isDir && DATE_FOLDER_RE.test(item.name);
                })
                .map((item: any) => item.name)
                .sort()
                .reverse(); // newest first
        } catch {
            return [];
        }
    }, [settings.firmwareType]);

    const loadFiles = useCallback(async () => {
        if (!connectionStatus.connected) return;

        setLoading(true);
        const ip = getCurrentIp(settings);
        const articleFolder = getArticleFolder(settings);

        // Load independently to avoid one blocking the other
        const loadArticlesPromise = (async () => {
            try {
                if (settings.useDateFolders) {
                    // Discover date subfolders, list files from each, merge
                    const subfolders = await listDateSubfolders(ip, articleFolder);
                    const allFiles: RemoteFile[] = [];

                    // Also list files directly in the base folder (legacy files)
                    const baseFolders = [articleFolder, ...subfolders.map(sf => `${articleFolder}/${sf}`)];

                    for (const folder of baseFolders) {
                        const listFn = settings.firmwareType === 'crosspoint' ? listCrossPointFiles : listStockFiles;
                        const items = await listFn(ip, folder);
                        allFiles.push(...items.map(f => ({ ...f, folder })));
                    }

                    allFiles.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                    setArticles(allFiles);
                } else if (settings.firmwareType === 'crosspoint') {
                    const items = await listCrossPointFiles(ip, articleFolder);
                    setArticles(items.map(f => ({ ...f, folder: articleFolder })));
                } else {
                    const items = await listStockFiles(ip, articleFolder);
                    setArticles(items.map(f => ({ ...f, folder: articleFolder })));
                    setScreensavers([]); // Clear screensavers for stock
                }
            } catch (getError) {
                console.warn('Failed to load articles:', getError);
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
    }, [settings, connectionStatus.connected, listDateSubfolders]);

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
                    const folder = file.folder || getArticleFolder(settings);
                    const filename = file.rawName || file.name;
                    let success = false;

                    if (settings.firmwareType === 'crosspoint') {
                        success = await deleteCrossPointFile(ip, filename, folder);
                    } else {
                        success = await deleteStockFile(ip, filename, folder);
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
                    <Text style={styles.sectionPath}>
                        /{getArticleFolder(settings)}{settings.useDateFolders ? '/yyyy-mm-dd' : ''}
                    </Text>

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

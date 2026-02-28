/**
 * DeviceScreen — Tab showing files on the connected X4 device.
 *
 * Sections are discovered recursively from configured roots:
 *   - Articles: files in article folder tree (.epub, .txt, .xtc)
 *   - Notes: files in note folder tree (.txt)
 *   - Screensavers: files in /sleep tree (.bmp, CrossPoint)
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
    Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Swipeable from 'react-native-gesture-handler/Swipeable';

import { useConnection } from '../contexts/ConnectionProvider';
import type { RemoteFile } from '../types';
import { getCurrentIp, getArticleFolder, getNoteFolder, getDeviceBaseUrl } from '../services/settings';
import { deleteCrossPointFile } from '../services/crosspoint_upload';
import { deleteStockFile } from '../services/x4_upload';
import { getPreviewMapping, removePreviewMapping } from '../services/preview_cache';

const getFileId = (file: RemoteFile) => file.folder ? `${file.folder}/${file.name}` : file.name;

function safeDecodeURIComponent(str: string): string {
    try {
        return decodeURIComponent(str);
    } catch {
        return str;
    }
}

function normalizeFolderPath(path: string): string {
    return path.replace(/^\/+/, '').replace(/\/+$/, '');
}

function decodeFolderPath(path: string): string {
    return normalizeFolderPath(path)
        .split('/')
        .map((segment) => safeDecodeURIComponent(segment))
        .join('/');
}

function joinFolderPath(parent: string, child: string): string {
    const p = normalizeFolderPath(parent);
    const c = normalizeFolderPath(child);
    if (!p) return c;
    if (!c) return p;
    return `${p}/${c}`;
}

function getExt(name: string): string {
    const idx = name.lastIndexOf('.');
    if (idx < 0) return '';
    return name.slice(idx).toLowerCase();
}

async function fetchDirectoryItems(
    baseUrl: string,
    firmwareType: 'stock' | 'crosspoint',
    folder: string
): Promise<any[] | null> {
    const normalized = decodeFolderPath(folder);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
        const response = firmwareType === 'crosspoint'
            ? await fetch(`${baseUrl}/api/files?path=${encodeURIComponent('/' + normalized)}`, { signal: controller.signal })
            : await fetch(`${baseUrl}/list?dir=${encodeURIComponent('/' + normalized + '/')}`, { signal: controller.signal });

        if (!response.ok) return null;
        const items = await response.json();
        return Array.isArray(items) ? items : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

async function deepScanFolder(
    baseUrl: string,
    firmwareType: 'stock' | 'crosspoint',
    rootFolder: string,
    allowedExtensions: string[]
): Promise<RemoteFile[]> {
    const root = normalizeFolderPath(rootFolder);
    if (!root) return [];

    const queue: string[] = [root];
    const visited = new Set<string>();
    const results: RemoteFile[] = [];
    const allowed = new Set(allowedExtensions.map(ext => ext.toLowerCase()));

    while (queue.length > 0) {
        const currentFolder = queue.shift()!;
        if (visited.has(currentFolder)) continue;
        visited.add(currentFolder);

        const items = await fetchDirectoryItems(baseUrl, firmwareType, currentFolder);
        if (!items) continue;

        for (const item of items) {
            const rawName = typeof item.name === 'string' ? item.name : '';
            if (!rawName) continue;

            const isDir = firmwareType === 'crosspoint'
                ? item.isDirectory === true || item.type === 'dir'
                : item.type === 'dir';

            if (isDir) {
                queue.push(joinFolderPath(currentFolder, safeDecodeURIComponent(rawName)));
                continue;
            }

            const decodedName = safeDecodeURIComponent(rawName).trim();
            if (!allowed.has(getExt(decodedName))) continue;

            results.push({
                name: decodedName,
                rawName,
                size: typeof item.size === 'number' ? item.size : undefined,
                timestamp: typeof item.lastModified === 'number' ? item.lastModified : undefined,
                folder: currentFolder,
            });
        }
    }

    results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return results;
}

export function DeviceScreen() {
    const { settings, connectionStatus } = useConnection();

    const [articles, setArticles] = useState<RemoteFile[]>([]);
    const [notes, setNotes] = useState<RemoteFile[]>([]);
    const [screensavers, setScreensavers] = useState<RemoteFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
    const [previewMap, setPreviewMap] = useState<Record<string, string>>({});

    const loadFiles = useCallback(async () => {
        if (!connectionStatus.connected) return;

        setLoading(true);
        const ip = getCurrentIp(settings);
        const baseUrl = getDeviceBaseUrl(ip);
        const articleFolder = getArticleFolder(settings);
        const noteFolder = getNoteFolder(settings);

        // Load independently to avoid one blocking the other
        const loadArticlesPromise = (async () => {
            try {
                const items = await deepScanFolder(baseUrl, settings.firmwareType, articleFolder, ['.epub', '.txt', '.xtc']);
                setArticles(items);
            } catch (getError) {
                console.warn('Failed to load articles:', getError);
            }
        })();

        const loadNotesPromise = (async () => {
            try {
                const items = await deepScanFolder(baseUrl, settings.firmwareType, noteFolder, ['.txt']);
                setNotes(items);
            } catch (getError) {
                console.warn('Failed to load notes:', getError);
            }
        })();

        const loadScreensaversPromise = (async () => {
            if (settings.firmwareType !== 'crosspoint') {
                setScreensavers([]);
                return;
            }
            try {
                const items = await deepScanFolder(baseUrl, settings.firmwareType, 'sleep', ['.bmp']);
                setScreensavers(items);
            } catch (getError) {
                console.warn('Failed to load screensavers:', getError);
            }
        })();

        const loadPrevewCachePromise = (async () => {
            try {
                const map = await getPreviewMapping();
                setPreviewMap(map);
            } catch (e) {
                console.warn('Failed to load preview map', e);
            }
        })();

        // Wait for all to finish before hiding loader
        await Promise.allSettled([loadArticlesPromise, loadNotesPromise, loadScreensaversPromise, loadPrevewCachePromise]);
        setLoading(false);
    }, [settings, connectionStatus.connected]);

    useFocusEffect(
        useCallback(() => {
            if (connectionStatus.connected) {
                loadFiles();
            } else {
                setArticles([]);
                setNotes([]);
                setScreensavers([]);
            }
        }, [connectionStatus.connected, loadFiles])
    );

    const handleDeleteArticle = (file: RemoteFile) => {
        const fileId = getFileId(file);
        Alert.alert('Delete File', `Delete "${file.name}"?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive',
                onPress: async () => {
                    setDeleteLoading(fileId);
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
                        setArticles(prev => prev.filter(f => getFileId(f) !== fileId));
                    } else {
                        Alert.alert('Error', 'Failed to delete file');
                    }
                    setDeleteLoading(null);
                },
            },
        ]);
    };

    const handleDeleteNote = (file: RemoteFile) => {
        const fileId = getFileId(file);
        Alert.alert('Delete File', `Delete "${file.name}"?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive',
                onPress: async () => {
                    setDeleteLoading(fileId);
                    const ip = getCurrentIp(settings);
                    const folder = file.folder || getNoteFolder(settings);
                    const filename = file.rawName || file.name;
                    let success = false;

                    if (settings.firmwareType === 'crosspoint') {
                        success = await deleteCrossPointFile(ip, filename, folder);
                    } else {
                        success = await deleteStockFile(ip, filename, folder);
                    }

                    if (success) {
                        setNotes(prev => prev.filter(f => getFileId(f) !== fileId));
                    } else {
                        Alert.alert('Error', 'Failed to delete file');
                    }
                    setDeleteLoading(null);
                },
            },
        ]);
    };

    const handleDeleteScreensaver = (file: RemoteFile) => {
        const fileId = getFileId(file);
        Alert.alert('Delete File', `Delete "${file.name}"?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive',
                onPress: async () => {
                    setDeleteLoading(fileId);
                    const ip = getCurrentIp(settings);
                    const folder = file.folder || 'sleep';
                    const filename = file.rawName || file.name;
                    const success = await deleteCrossPointFile(ip, filename, folder);

                    if (success) {
                        setScreensavers(prev => prev.filter(f => getFileId(f) !== fileId));
                        await removePreviewMapping(filename);
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
                        /{getArticleFolder(settings)}/**
                    </Text>

                    {loading && articles.length === 0 ? (
                        <ActivityIndicator size="small" color="#fff" style={styles.loader} />
                    ) : articles.length === 0 ? (
                        <Text style={styles.emptyListText}>No articles on device</Text>
                    ) : (
                        articles.map(file => (
                            <FileRow
                                key={getFileId(file)}
                                file={file}
                                cachedPreviewUrl={previewMap[file.name]}
                                onDelete={() => handleDeleteArticle(file)}
                                deleting={deleteLoading === getFileId(file)}
                                disabled={deleteLoading !== null}
                            />
                        ))
                    )}
                </View>

                {/* Notes Section */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>
                            📝  Notes ({notes.length})
                        </Text>
                    </View>
                    <Text style={styles.sectionPath}>
                        /{getNoteFolder(settings)}/**
                    </Text>

                    {loading && notes.length === 0 ? (
                        <ActivityIndicator size="small" color="#fff" style={styles.loader} />
                    ) : notes.length === 0 ? (
                        <Text style={styles.emptyListText}>No notes on device</Text>
                    ) : (
                        notes.map(file => (
                            <FileRow
                                key={getFileId(file)}
                                file={file}
                                onDelete={() => handleDeleteNote(file)}
                                deleting={deleteLoading === getFileId(file)}
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
                        <Text style={styles.sectionPath}>/sleep/**</Text>

                        {loading && screensavers.length === 0 ? (
                            <ActivityIndicator size="small" color="#fff" style={styles.loader} />
                        ) : screensavers.length === 0 ? (
                            <Text style={styles.emptyListText}>No screensavers on device</Text>
                        ) : (
                            screensavers.map(file => (
                                <FileRow
                                    key={getFileId(file)}
                                    file={file}
                                    cachedPreviewUrl={previewMap[file.name]}
                                    onDelete={() => handleDeleteScreensaver(file)}
                                    deleting={deleteLoading === getFileId(file)}
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
import { Image } from 'react-native';

function FileRow({
    file,
    cachedPreviewUrl,
    onDelete,
    deleting,
    disabled,
}: {
    file: RemoteFile;
    cachedPreviewUrl?: string;
    onDelete: () => void;
    deleting: boolean;
    disabled: boolean;
}) {
    const swipeableRef = React.useRef<Swipeable>(null);
    const [previewUri, setPreviewUri] = React.useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = React.useState(false);

    const renderRightActions = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
        const scale = dragX.interpolate({
            inputRange: [-60, -30, 0],
            outputRange: [1, 0.8, 0],
            extrapolate: 'clamp',
        });

        // The background that shows while dragging
        return (
            <View style={styles.deleteAction}>
                <Animated.Text style={[styles.deleteActionText, { transform: [{ scale }] }]}>
                    🗑️
                </Animated.Text>
            </View>
        );
    };

    const handleSwipeOpen = () => {
        // Trigger the delete flow immediately
        onDelete();
        // Since `onDelete` pops an alert, we can close the row visually in the background
        swipeableRef.current?.close();
    };

    return (
        <Swipeable
            ref={swipeableRef}
            renderRightActions={renderRightActions}
            friction={1}
            rightThreshold={35}
            enabled={!disabled}
            onSwipeableOpen={handleSwipeOpen}
        >
            <View style={styles.fileItemContainer}>
                <View style={[styles.fileItem, previewUri ? styles.fileItemOpen : null]}>
                    {cachedPreviewUrl && (
                        <TouchableOpacity
                            style={styles.previewButton}
                            onPress={() => {
                                if (previewUri) {
                                    setPreviewUri(null);
                                } else {
                                    setPreviewLoading(true);
                                    setPreviewUri(cachedPreviewUrl);
                                }
                            }}
                            disabled={disabled}
                        >
                            <Image
                                source={{ uri: cachedPreviewUrl }}
                                style={[styles.rowThumbnail, previewUri && styles.rowThumbnailActive]}
                                resizeMode="cover"
                            />
                        </TouchableOpacity>
                    )}

                    <View style={styles.fileInfo}>
                        <Text style={styles.fileName}>{file.name}</Text>
                        <Text style={styles.fileMeta}>
                            {file.timestamp
                                ? new Date(file.timestamp).toLocaleDateString()
                                : 'Unknown date'}
                            {file.size ? ` · ${(file.size / 1024).toFixed(1)} KB` : ''}
                        </Text>
                    </View>

                    {/* Fallback standard bin icon if user prefers tapping without swiping */}
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

                {previewUri && (
                    <View style={styles.previewContainer}>
                        {previewLoading && (
                            <ActivityIndicator style={styles.previewLoader} size="small" color="#6c63ff" />
                        )}
                        <Image
                            source={{ uri: previewUri }}
                            style={styles.previewImage}
                            resizeMode="contain"
                            onLoadEnd={() => setPreviewLoading(false)}
                            onError={() => {
                                setPreviewLoading(false);
                                Alert.alert("Error", "Could not load preview. The file might be corrupted or the device may be busy.");
                                setPreviewUri(null);
                            }}
                        />
                    </View>
                )}
            </View>
        </Swipeable>
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
    fileItemContainer: {
        marginBottom: 8,
        borderRadius: 8,
        backgroundColor: '#1f1f35',
        overflow: 'hidden',
    },
    fileItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
    },
    fileItemOpen: {
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
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
    deleteAction: {
        backgroundColor: '#ff4444',
        justifyContent: 'center',
        alignItems: 'flex-end',
        marginBottom: 8,
        borderRadius: 8,
        flex: 1, // Fill available space behind the row
        paddingHorizontal: 20,
    },
    deleteActionText: {
        color: 'white',
        fontSize: 24,
    },
    previewButton: {
        padding: 4,
        marginRight: 10,
        marginLeft: -4,
    },
    rowThumbnail: {
        width: 24,
        height: 40,
        borderRadius: 4,
        opacity: 0.8,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    rowThumbnailActive: {
        opacity: 1,
        borderColor: '#6c63ff',
        borderWidth: 1.5,
    },
    previewContainer: {
        width: '100%',
        backgroundColor: 'rgba(0,0,0,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 150,
        padding: 12,
    },
    previewLoader: {
        position: 'absolute',
    },
    previewImage: {
        width: '100%',
        height: 200,
        borderRadius: 4,
    }
});

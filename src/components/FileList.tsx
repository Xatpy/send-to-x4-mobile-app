import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
} from 'react-native';
import type { Settings, RemoteFile } from '../types';
import { listStockFiles, deleteStockFile } from '../services/x4_upload';
import { listCrossPointFiles, deleteCrossPointFile } from '../services/crosspoint_upload';
import { getCurrentIp } from '../services/settings';

interface Props {
    settings: Settings;
    connected: boolean;
    refreshTrigger?: number;
    onRefreshRequest?: () => void; // Parent can trigger refresh if needed
}

export function FileList({ settings, connected, refreshTrigger = 0 }: Props) {
    const [files, setFiles] = useState<RemoteFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

    const loadFiles = useCallback(async () => {
        if (!connected) return;

        setLoading(true);
        const ip = getCurrentIp(settings);
        let items: RemoteFile[] = [];

        try {
            if (settings.firmwareType === 'crosspoint') {
                items = await listCrossPointFiles(ip);
            } else {
                items = await listStockFiles(ip);
            }
            setFiles(items);
        } catch (error) {
            console.warn('Failed to load files:', error);
            // Don't alert on load error automatically to avoid spamming the user if offline
        } finally {
            setLoading(false);
        }
    }, [settings, connected]);

    // Initial load when connected changes or refresh trigger updates
    useEffect(() => {
        if (connected) {
            loadFiles();
        } else {
            setFiles([]);
        }
    }, [connected, loadFiles, refreshTrigger]);

    // Expose refresh capability via a manual button for now
    const handleRefresh = () => {
        loadFiles();
    };

    const handleDelete = async (file: RemoteFile) => {
        if (!connected) {
            Alert.alert('Not Connected', 'You need to be connected to X4 to delete files.');
            return;
        }

        Alert.alert(
            'Delete File',
            `Are you sure you want to delete "${file.name}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        setDeleteLoading(file.name);
                        const ip = getCurrentIp(settings);
                        let success = false;

                        // Use rawName for the API call if available, otherwise name
                        const filenameToDelete = file.rawName || file.name;

                        if (settings.firmwareType === 'crosspoint') {
                            success = await deleteCrossPointFile(ip, filenameToDelete);
                        } else {
                            success = await deleteStockFile(ip, filenameToDelete);
                        }

                        if (success) {
                            setFiles(prev => prev.filter(f => f.name !== file.name));
                        } else {
                            Alert.alert('Error', 'Failed to delete file');
                        }
                        setDeleteLoading(null);
                    }
                }
            ]
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Files on X4 ({files.length})</Text>
                {connected && (
                    <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
                        <Text style={styles.refreshIcon}>↻</Text>
                    </TouchableOpacity>
                )}
            </View>

            {loading && files.length === 0 ? (
                <ActivityIndicator size="small" color="#fff" style={styles.loader} />
            ) : (
                <View style={styles.list}>
                    {files.length === 0 ? (
                        <Text style={styles.emptyText}>No files found in /send-to-x4/</Text>
                    ) : (
                        files.map((item) => (
                            <View key={item.name} style={styles.fileItem}>
                                <View style={styles.fileInfo}>
                                    <Text style={styles.fileName}>{item.name}</Text>
                                    <Text style={styles.fileDate}>
                                        {item.timestamp ? new Date(item.timestamp).toLocaleDateString() : 'Unknown date'}
                                        {item.size ? ` • ${(item.size / 1024).toFixed(1)} KB` : ''}
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    style={styles.deleteButton}
                                    onPress={() => handleDelete(item)}
                                    disabled={deleteLoading !== null}
                                >
                                    {deleteLoading === item.name ? (
                                        <ActivityIndicator size="small" color="#ff4444" />
                                    ) : (
                                        <Text style={styles.deleteIcon}>🗑️</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        ))
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginTop: 30,
        marginBottom: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
        paddingHorizontal: 4,
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
    },
    refreshButton: {
        padding: 5,
    },
    refreshIcon: {
        fontSize: 20,
        color: '#3b82f6',
        fontWeight: 'bold',
    },
    loader: {
        marginTop: 20,
    },
    list: {
        marginTop: 5,
    },
    fileItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        padding: 12,
        borderRadius: 8,
        marginBottom: 10,
    },
    fileInfo: {
        flex: 1,
    },
    fileName: {
        color: '#fff',
        fontSize: 14,
        marginBottom: 4,
    },
    fileDate: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 12,
    },
    deleteButton: {
        padding: 10,
    },
    deleteIcon: {
        fontSize: 16,
    },
    emptyText: {
        color: 'rgba(255, 255, 255, 0.3)',
        fontSize: 14,
        textAlign: 'center',
        marginTop: 20,
        fontStyle: 'italic',
    },
});

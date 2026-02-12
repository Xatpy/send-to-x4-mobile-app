import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';
import type { QueuedArticle } from '../types';

interface QueueListProps {
    queue: QueuedArticle[];
    onRemove: (id: string) => void;
    disabled?: boolean;
    currentUploadProgress?: number;
}

export function QueueList({ queue, onRemove, disabled, currentUploadProgress }: QueueListProps) {
    if (queue.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={styles.emptyText}>Queue is empty</Text>
                <Text style={styles.emptySubtext}>
                    Add articles to send them later in batch
                </Text>
            </View>
        );
    }

    console.log('[QueueList] Rendering items:', queue.length, JSON.stringify(queue.map(i => ({ id: i.id, title: i.title, url: i.url }))));

    return (
        <View style={styles.container}>
            {queue.map((item, index) => (
                <View key={item.id}>
                    {index > 0 && <View style={styles.separator} />}
                    <View style={[
                        styles.item,
                        item.status === 'failed' && styles.itemFailed,
                        item.status === 'processing' && styles.itemProcessing,
                    ]}>
                        <View style={styles.itemContent}>
                            <View style={styles.itemHeader}>
                                <View style={[
                                    styles.statusDot,
                                    item.status === 'pending' && styles.statusPending,
                                    item.status === 'processing' && styles.statusProcessing,
                                    item.status === 'failed' && styles.statusFailed,
                                ]} />
                                <Text style={styles.itemTitle} numberOfLines={1}>
                                    {item.title || 'Untitled File'}
                                </Text>
                            </View>

                            <Text style={styles.itemUrl} numberOfLines={1}>
                                {item.url || 'No path'}
                            </Text>

                            {/* Progress Bar */}
                            {item.status === 'processing' && currentUploadProgress !== undefined && (
                                <View style={styles.progressContainer}>
                                    <View style={[styles.progressBar, { width: `${currentUploadProgress}%` }]} />
                                </View>
                            )}

                            {item.status === 'failed' && item.errorMessage && (
                                <Text style={styles.errorText} numberOfLines={2}>
                                    ⚠ {item.errorMessage}
                                </Text>
                            )}

                            <Text style={styles.itemDate}>
                                {formatDate(item.addedAt)}
                            </Text>
                        </View>

                        <TouchableOpacity
                            style={styles.removeButton}
                            onPress={() => onRemove(item.id)}
                            disabled={disabled || item.status === 'processing'}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Text style={[
                                styles.removeIcon,
                                (disabled || item.status === 'processing') && styles.removeDisabled,
                            ]}>✕</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ))}
        </View>
    );
}

function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
}

const styles = StyleSheet.create({
    container: {
        borderRadius: 12,
        // overflow: 'hidden', // Removed to prevent clipping on Android
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 28,
        paddingHorizontal: 20,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        borderStyle: 'dashed',
    },
    emptyIcon: {
        fontSize: 28,
        marginBottom: 8,
    },
    emptyText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 15,
        fontWeight: '600',
    },
    emptySubtext: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 13,
        marginTop: 4,
        textAlign: 'center',
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 10,
        minHeight: 70, // Ensure height even if text is empty/collapsed
    },
    itemFailed: {
        backgroundColor: 'rgba(248, 113, 113, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(248, 113, 113, 0.2)',
    },
    itemProcessing: {
        backgroundColor: 'rgba(96, 165, 250, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(96, 165, 250, 0.2)',
    },
    itemContent: {
        flex: 1,
        marginRight: 10,
    },
    itemHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 3,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    statusPending: {
        backgroundColor: '#a78bfa',
    },
    statusProcessing: {
        backgroundColor: '#60a5fa',
    },
    statusFailed: {
        backgroundColor: '#f87171',
    },
    itemTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
        flex: 1,
    },
    itemUrl: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        marginLeft: 16,
    },
    errorText: {
        color: '#f87171',
        fontSize: 12,
        marginTop: 4,
        marginLeft: 16,
    },
    itemDate: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 11,
        marginTop: 4,
        marginLeft: 16,
    },
    removeButton: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    removeIcon: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
        fontWeight: '700',
    },
    removeDisabled: {
        color: 'rgba(255,255,255,0.15)',
    },
    separator: {
        height: 6,
    },
    progressContainer: {
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 2,
        marginTop: 8,
        marginRight: 10, // Match other text margins? Or full width?
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#6c63ff',
    },
});

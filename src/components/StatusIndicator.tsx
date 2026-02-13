import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import type { ConnectionStatus } from '../types';

interface StatusIndicatorProps {
    status: ConnectionStatus;
    onRetry?: () => void;
}

export function StatusIndicator({ status, onRetry }: StatusIndicatorProps) {
    return (
        <View style={styles.container}>
            <View style={styles.statusRow}>
                {status.checking ? (
                    <ActivityIndicator size="small" color="#666" />
                ) : (
                    <View
                        style={[
                            styles.dot,
                            status.connected ? styles.dotConnected : styles.dotDisconnected,
                        ]}
                    />
                )}
                <View style={styles.textContainer}>
                    <Text style={styles.statusText}>
                        {status.checking
                            ? 'Checking connection...'
                            : status.connected
                                ? `Connected to X4 (${status.ip})`
                                : 'Not connected to X4'}
                    </Text>
                </View>
                {!status.connected && !status.checking && onRetry && (
                    <TouchableOpacity onPress={onRetry} style={styles.retryButton}>
                        <Text style={styles.retryText}>↺</Text>
                    </TouchableOpacity>
                )}
            </View>

            {status.connected && (
                <Text style={styles.firmwareText}>
                    Firmware: {status.firmwareType === 'crosspoint' ? 'CrossPoint' : 'Stock'}
                </Text>
            )}

            {!status.connected && !status.checking && (
                <Text style={styles.helpText}>
                    {status.lastError ? `Error: ${status.lastError}` : 'Connect to X4 WiFi hotspot to send files'}
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: '#2d2d44',
        borderRadius: 12,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    dotConnected: {
        backgroundColor: '#4ade80',
    },
    dotDisconnected: {
        backgroundColor: '#f87171',
    },
    textContainer: {
        flex: 1,
    },
    statusText: {
        color: '#fff',
        fontSize: 14,
    },
    retryButton: {
        padding: 4,
        paddingHorizontal: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 4,
        marginLeft: 8,
    },
    retryText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    firmwareText: {
        color: '#666',
        fontSize: 12,
        marginTop: 4,
        marginLeft: 16,
    },
    helpText: {
        color: '#f87171',
        fontSize: 12,
        marginTop: 4,
        marginLeft: 16,
    },
});

/**
 * ConnectionBanner — persistent slim bar showing X4 connection state.
 *
 * Visible on all tabs. Tap to retry when disconnected.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useConnection } from '../contexts/ConnectionProvider';

export function ConnectionBanner() {
    const { connectionStatus, checkConnection } = useConnection();

    if (connectionStatus.checking) {
        return (
            <View style={[styles.banner, styles.checkingBanner]}>
                <ActivityIndicator size="small" color="#a0a0b0" />
                <Text style={styles.checkingText}>Checking connection…</Text>
            </View>
        );
    }

    if (connectionStatus.connected) {
        return (
            <View style={[styles.banner, styles.connectedBanner]}>
                <View style={styles.dotConnected} />
                <Text style={styles.connectedText}>
                    Connected to X4 ({connectionStatus.ip})
                </Text>
            </View>
        );
    }

    return (
        <TouchableOpacity
            style={[styles.banner, styles.disconnectedBanner]}
            onPress={checkConnection}
            activeOpacity={0.7}
        >
            <View style={styles.dotDisconnected} />
            <Text style={styles.disconnectedText}>Not connected</Text>
            <Text style={styles.retryHint}>Tap to retry</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    checkingBanner: {
        backgroundColor: 'rgba(45, 45, 68, 0.8)',
    },
    connectedBanner: {
        backgroundColor: 'rgba(34, 84, 61, 0.6)',
    },
    disconnectedBanner: {
        backgroundColor: 'rgba(127, 29, 29, 0.5)',
    },
    dotConnected: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#4ade80',
        marginRight: 8,
    },
    dotDisconnected: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#f87171',
        marginRight: 8,
    },
    connectedText: {
        color: '#86efac',
        fontSize: 12,
        fontWeight: '500',
    },
    disconnectedText: {
        color: '#fca5a5',
        fontSize: 12,
        fontWeight: '500',
        flex: 1,
    },
    checkingText: {
        color: '#a0a0b0',
        fontSize: 12,
        marginLeft: 8,
    },
    retryHint: {
        color: 'rgba(252, 165, 165, 0.6)',
        fontSize: 11,
    },
});

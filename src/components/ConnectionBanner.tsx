/**
 * ConnectionBanner — persistent slim bar showing X4 connection state.
 *
 * Visible on all tabs. Tap status area anytime to re-check connection.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useConnection } from '../contexts/ConnectionProvider';

export function ConnectionBanner() {
    const { connectionStatus, checkConnection } = useConnection();
    const navigation = useNavigation<any>();

    if (connectionStatus.checking) {
        return (
            <View style={[styles.banner, styles.checkingBanner]}>
                <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.settingsIcon}>
                    <Text style={{ fontSize: 20 }}>⚙️</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.contentWrap}
                    onPress={checkConnection}
                    activeOpacity={0.7}
                >
                    <ActivityIndicator size="small" color="#a0a0b0" style={{ marginRight: 8 }} />
                    <Text style={styles.checkingText}>Checking connection…</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (connectionStatus.connected) {
        return (
            <View style={[styles.banner, styles.connectedBanner]}>
                <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.settingsIcon}>
                    <Text style={{ fontSize: 20 }}>⚙️</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.contentWrap}
                    onPress={checkConnection}
                    activeOpacity={0.7}
                >
                    <View style={styles.dotConnected} />
                    <Text style={styles.connectedText}>
                        Connected to X4 ({connectionStatus.ip})
                    </Text>
                    <Text style={styles.connectedHint}>Tap to refresh</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={[styles.banner, styles.disconnectedBanner]}>
            <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.settingsIcon}>
                <Text style={{ fontSize: 20 }}>⚙️</Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={styles.contentWrap}
                onPress={checkConnection}
                activeOpacity={0.7}
            >
                <View style={styles.dotDisconnected} />
                <Text style={styles.disconnectedText} numberOfLines={1} ellipsizeMode="tail">
                    {connectionStatus.lastError || 'Not connected'}
                </Text>
                <Text style={styles.retryHint}>Tap to retry</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    settingsIcon: {
        marginRight: 12,
        justifyContent: 'center',
    },
    contentWrap: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
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
        flex: 1,
    },
    connectedHint: {
        color: 'rgba(134, 239, 172, 0.7)',
        fontSize: 11,
    },
    retryHint: {
        color: 'rgba(252, 165, 165, 0.6)',
        fontSize: 11,
    },
});

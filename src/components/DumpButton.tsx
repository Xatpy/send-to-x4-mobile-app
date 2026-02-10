import React from 'react';
import {
    TouchableOpacity,
    Text,
    StyleSheet,
    ActivityIndicator,
    View,
} from 'react-native';

interface DumpButtonProps {
    count: number;
    connected: boolean;
    loading: boolean;
    progress?: { current: number; total: number; title?: string };
    onPress: () => void;
}

export function DumpButton({ count, connected, loading, progress, onPress }: DumpButtonProps) {
    const disabled = count === 0 || !connected || loading;

    const getButtonText = () => {
        if (loading && progress) {
            return `SENDING ${progress.current}/${progress.total}...`;
        }
        if (loading) {
            return 'SENDING...';
        }
        if (!connected) {
            return `SEND ALL TO X4 (${count})`;
        }
        if (count === 0) {
            return 'QUEUE EMPTY';
        }
        return `SEND ALL TO X4 (${count})`;
    };

    return (
        <View>
            <TouchableOpacity
                style={[
                    styles.button,
                    disabled && styles.buttonDisabled,
                    loading && styles.buttonLoading,
                ]}
                onPress={onPress}
                disabled={disabled}
                activeOpacity={0.7}
            >
                {loading ? (
                    <ActivityIndicator color="#fff" size="small" style={styles.spinner} />
                ) : (
                    <Text style={styles.icon}>⬆</Text>
                )}
                <Text style={[styles.buttonText, disabled && styles.buttonTextDisabled]}>
                    {getButtonText()}
                </Text>
            </TouchableOpacity>

            {!connected && count > 0 && (
                <Text style={styles.hint}>
                    Connect to X4 WiFi to send queued articles
                </Text>
            )}

            {loading && progress?.title && (
                <Text style={styles.progressTitle} numberOfLines={1}>
                    {progress.title}
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#7c3aed',
        paddingVertical: 18,
        paddingHorizontal: 24,
        borderRadius: 14,
        shadowColor: '#7c3aed',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    buttonDisabled: {
        backgroundColor: 'rgba(124, 58, 237, 0.3)',
        shadowOpacity: 0,
        elevation: 0,
    },
    buttonLoading: {
        backgroundColor: '#6d28d9',
    },
    icon: {
        fontSize: 18,
        marginRight: 10,
    },
    spinner: {
        marginRight: 10,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 1,
    },
    buttonTextDisabled: {
        color: 'rgba(255,255,255,0.4)',
    },
    hint: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 8,
    },
    progressTitle: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 6,
    },
});

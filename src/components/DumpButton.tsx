import React from 'react';
import {
    TouchableOpacity,
    Text,
    StyleSheet,
    ActivityIndicator,
    View,
} from 'react-native';
import Animated, { useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

interface DumpButtonProps {
    count: number;
    connected: boolean;
    loading: boolean;
    progress?: { current: number; total: number; title?: string };
    uploadProgress?: number; // 0 to 100
    onPress: () => void;
    label?: string;
    hint?: string;
    disabled?: boolean;
}

export function DumpButton({ count, connected, loading, progress, uploadProgress, onPress, label, hint, disabled: forceDisabled }: DumpButtonProps) {
    const isDisabled = forceDisabled || count === 0 || (!connected && !label) || loading;

    const fillStyle = useAnimatedStyle(() => {
        const percent = uploadProgress !== undefined ? Math.max(0, Math.min(100, uploadProgress)) : 0;
        return {
            width: withTiming(`${percent}%`, { duration: 200, easing: Easing.out(Easing.ease) }),
            opacity: uploadProgress !== undefined && uploadProgress > 0 ? 1 : 0,
        };
    }, [uploadProgress]);

    const getButtonText = () => {
        if (loading && progress) {
            return `SENDING ${progress.current}/${progress.total}...`;
        }
        if (loading) {
            return 'SENDING...';
        }
        if (label) {
            return label;
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
                    isDisabled && styles.buttonDisabled,
                    loading && styles.buttonLoading,
                ]}
                onPress={onPress}
                disabled={isDisabled}
                activeOpacity={0.7}
            >
                {/* Progress Fill Background */}
                {uploadProgress !== undefined && (
                    <Animated.View style={[styles.progressFill, fillStyle]} />
                )}

                <View style={styles.content}>
                    {loading ? (
                        <ActivityIndicator color="#fff" size="small" style={styles.spinner} />
                    ) : (
                        <Text style={styles.icon}>⬆</Text>
                    )}
                    <Text style={[styles.buttonText, isDisabled && styles.buttonTextDisabled]}>
                        {uploadProgress !== undefined && uploadProgress > 0 && uploadProgress < 100
                            ? `${getButtonText()} (${Math.round(uploadProgress)}%)`
                            : getButtonText()}
                    </Text>
                </View>
            </TouchableOpacity>

            {!connected && count > 0 && (
                <Text style={styles.hint}>
                    {hint || 'Connect to X4 WiFi to send queued items'}
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
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#7c3aed',
        borderRadius: 14,
        shadowColor: '#7c3aed',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
        overflow: 'hidden',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 18,
        paddingHorizontal: 24,
        zIndex: 2,
    },
    progressFill: {
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        zIndex: 1,
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

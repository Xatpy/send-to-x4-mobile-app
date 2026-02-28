import React from 'react';
import {
    TouchableOpacity,
    Text,
    StyleSheet,
    ActivityIndicator,
    Alert,
    View,
} from 'react-native';
import Animated, { useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';

interface ScreensaverButtonProps {
    connected: boolean;
    onImageSelected: (items: Array<{ uri: string, filename: string, width?: number, height?: number }>) => void;
    loading: boolean;
    progress?: number;
}

export function ScreensaverButton({ connected, onImageSelected, loading, progress }: ScreensaverButtonProps) {
    // Don't disable if not connected - allow picking to add to queue
    const disabled = loading;

    const fillStyle = useAnimatedStyle(() => {
        const percent = progress !== undefined ? Math.max(0, Math.min(100, progress)) : 0;
        return {
            width: withTiming(`${percent}%`, { duration: 200, easing: Easing.out(Easing.ease) }),
            opacity: progress !== undefined && progress > 0 ? 1 : 0,
        };
    }, [progress]);

    const handlePress = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 1,
                allowsMultipleSelection: true,
                selectionLimit: 10,
            });

            if (result.canceled || !result.assets || result.assets.length === 0) {
                return;
            }

            const selectedItems = result.assets.map(asset => {
                const uri = asset.uri;
                // Extract filename from URI
                const uriParts = uri.split('/');
                const originalName = uriParts[uriParts.length - 1];
                const baseName = originalName.replace(/\.[^.]+$/, '');
                const filename = `${baseName}.bmp`; // We might need unique names if multiple selected

                return {
                    uri,
                    filename,
                    width: asset.width,
                    height: asset.height
                };
            });

            onImageSelected(selectedItems);
        } catch (error) {
            console.warn('Image picker error:', error);
            Alert.alert('Error', 'Failed to open image picker.');
        }
    };

    const getButtonText = () => {
        if (loading) {
            return 'CONVERTING & SENDING...';
        }
        return 'PICK IMAGE';
    };

    return (
        <View>
            <TouchableOpacity
                style={[
                    styles.button,
                    disabled && styles.buttonDisabled,
                    loading && styles.buttonLoading,
                ]}
                onPress={handlePress}
                disabled={disabled}
                activeOpacity={0.7}
            >
                {/* Progress Fill Background */}
                {progress !== undefined && (
                    <Animated.View style={[styles.progressFill, fillStyle]} />
                )}

                <View style={styles.content}>
                    {loading && progress === undefined ? (
                        <ActivityIndicator color="#fff" size="small" style={styles.spinner} />
                    ) : (
                        <Text style={styles.icon}>🖼️</Text>
                    )}
                    <Text style={[styles.buttonText, disabled && styles.buttonTextDisabled]}>
                        {progress !== undefined && progress >= 0 && progress < 100
                            ? `${getButtonText()} (${Math.round(progress)}%)`
                            : getButtonText()}
                    </Text>
                </View>
            </TouchableOpacity>

            {!connected && (
                <Text style={styles.hint}>
                    Connect to X4 WiFi to send screensavers
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
        backgroundColor: '#0d9488',
        paddingVertical: 18,
        paddingHorizontal: 24,
        borderRadius: 14,
        shadowColor: '#0d9488',
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
        backgroundColor: 'rgba(13, 148, 136, 0.3)',
        shadowOpacity: 0,
        elevation: 0,
    },
    buttonLoading: {
        backgroundColor: '#0f766e',
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
});

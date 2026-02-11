import React from 'react';
import {
    TouchableOpacity,
    Text,
    StyleSheet,
    ActivityIndicator,
    Alert,
    View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

interface ScreensaverButtonProps {
    connected: boolean;
    onImageSelected: (uri: string, filename: string, width?: number, height?: number) => void;
    loading: boolean;
}

export function ScreensaverButton({ connected, onImageSelected, loading }: ScreensaverButtonProps) {
    const disabled = !connected || loading;

    const handlePress = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 1,
            });

            if (result.canceled || !result.assets || result.assets.length === 0) {
                return;
            }

            const asset = result.assets[0];
            const uri = asset.uri;
            const width = asset.width;
            const height = asset.height;

            // Extract filename from URI, replace extension with .bmp
            const uriParts = uri.split('/');
            const originalName = uriParts[uriParts.length - 1];
            const baseName = originalName.replace(/\.[^.]+$/, '');
            const filename = `${baseName}.bmp`;

            onImageSelected(uri, filename, width, height);
        } catch (error) {
            console.warn('Image picker error:', error);
            Alert.alert('Error', 'Failed to open image picker.');
        }
    };

    const getButtonText = () => {
        if (loading) {
            return 'CONVERTING & SENDING...';
        }
        return 'SEND SCREENSAVER';
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
                {loading ? (
                    <ActivityIndicator color="#fff" size="small" style={styles.spinner} />
                ) : (
                    <Text style={styles.icon}>🖼️</Text>
                )}
                <Text style={[styles.buttonText, disabled && styles.buttonTextDisabled]}>
                    {getButtonText()}
                </Text>
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

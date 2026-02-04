import React from 'react';
import {
    View,
    TextInput,
    Text,
    TouchableOpacity,
    StyleSheet,
} from 'react-native';
import { truncateUrl } from '../utils/sanitizer';

import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSequence,
    withTiming,
    Easing,
} from 'react-native-reanimated';

interface UrlInputProps {
    value: string;
    onChange: (text: string) => void;
    clipboardUrl?: string;
    onUseClipboard?: () => void;
    disabled?: boolean;
}

export function UrlInput({
    value,
    onChange,
    clipboardUrl,
    onUseClipboard,
    disabled = false,
}: UrlInputProps) {
    const borderColor = useSharedValue('#3d3d54');

    // Trigger animation when value changes
    React.useEffect(() => {
        if (value) {
            borderColor.value = withSequence(
                withTiming('#6c63ff', { duration: 200, easing: Easing.out(Easing.ease) }),
                withTiming('#3d3d54', { duration: 800, easing: Easing.in(Easing.ease) })
            );
        }
    }, [value]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            borderColor: borderColor.value,
        };
    });

    return (
        <View style={styles.container}>
            {/* Clipboard detection banner */}
            {clipboardUrl && clipboardUrl !== value && (
                <TouchableOpacity
                    style={styles.clipboardBanner}
                    onPress={onUseClipboard}
                    activeOpacity={0.7}
                >
                    <Text style={styles.clipboardIcon}>📋</Text>
                    <View style={styles.clipboardTextContainer}>
                        <Text style={styles.clipboardLabel}>URL detected from clipboard:</Text>
                        <Text style={styles.clipboardUrl} numberOfLines={1}>
                            {truncateUrl(clipboardUrl, 45)}
                        </Text>
                    </View>
                    <Text style={styles.useButton}>Use</Text>
                </TouchableOpacity>
            )}

            {/* Divider */}
            {clipboardUrl && clipboardUrl !== value && (
                <View style={styles.dividerContainer}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>or paste URL</Text>
                    <View style={styles.dividerLine} />
                </View>
            )}

            {/* URL input field */}
            <Animated.View style={[styles.inputContainer, animatedStyle]}>
                <TextInput
                    style={[styles.input, disabled && styles.inputDisabled]}
                    value={value}
                    onChangeText={onChange}
                    placeholder="https://example.com/article"
                    placeholderTextColor="#666"
                    keyboardType="url"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!disabled}
                    selectTextOnFocus
                />
                {value.length > 0 && !disabled && (
                    <TouchableOpacity
                        style={styles.clearButton}
                        onPress={() => onChange('')}
                    >
                        <Text style={styles.clearButtonText}>✕</Text>
                    </TouchableOpacity>
                )}
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
    },
    clipboardBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2d2d44',
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
    },
    clipboardIcon: {
        fontSize: 20,
        marginRight: 10,
    },
    clipboardTextContainer: {
        flex: 1,
    },
    clipboardLabel: {
        color: '#a0a0b0',
        fontSize: 12,
        marginBottom: 2,
    },
    clipboardUrl: {
        color: '#fff',
        fontSize: 14,
    },
    useButton: {
        color: '#6c63ff',
        fontSize: 14,
        fontWeight: '600',
        paddingHorizontal: 8,
    },
    dividerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: '#3d3d54',
    },
    dividerText: {
        color: '#666',
        fontSize: 12,
        paddingHorizontal: 12,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2d2d44',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#3d3d54',
    },
    input: {
        flex: 1,
        color: '#fff',
        fontSize: 16,
        padding: 16,
    },
    inputDisabled: {
        opacity: 0.6,
    },
    clearButton: {
        padding: 16,
    },
    clearButtonText: {
        color: '#666',
        fontSize: 16,
    },
});

import React from 'react';
import {
    TouchableOpacity,
    Text,
    StyleSheet,
    ActivityIndicator,
    ViewStyle,
    View,
} from 'react-native';
import Animated, { useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

interface ActionButtonProps {
    title: string;
    icon?: string;
    onPress: () => void;
    loading?: boolean;
    disabled?: boolean;
    variant?: 'primary' | 'secondary';
    style?: ViewStyle;
    progress?: number; // 0 to 100
}

export function ActionButton({
    title,
    icon,
    onPress,
    loading = false,
    disabled = false,
    variant = 'primary',
    style,
    progress,
}: ActionButtonProps) {
    const isDisabled = disabled || loading;

    const fillStyle = useAnimatedStyle(() => {
        const percent = progress !== undefined ? Math.max(0, Math.min(100, progress)) : 0;
        return {
            width: withTiming(`${percent}%`, { duration: 200, easing: Easing.out(Easing.ease) }),
            opacity: progress !== undefined && progress > 0 ? 1 : 0,
        };
    }, [progress]);

    return (
        <TouchableOpacity
            style={[
                styles.button,
                variant === 'primary' ? styles.primary : styles.secondary,
                isDisabled && styles.disabled,
                style,
            ]}
            onPress={onPress}
            disabled={isDisabled}
            activeOpacity={0.7}
        >
            {/* Progress Fill Background */}
            {progress !== undefined && (
                <Animated.View style={[styles.progressFill, fillStyle]} />
            )}

            <View style={styles.content}>
                {loading && progress === undefined ? (
                    <ActivityIndicator
                        color={variant === 'primary' ? '#fff' : '#6c63ff'}
                        size="small"
                        style={{ marginRight: 8 }}
                    />
                ) : (
                    icon && <Text style={styles.icon}>{icon}</Text>
                )}
                <Text
                    style={[
                        styles.text,
                        variant === 'primary' ? styles.textPrimary : styles.textSecondary,
                    ]}
                >
                    {progress !== undefined && progress >= 0 && progress < 100
                        ? `${title} (${Math.round(progress)}%)`
                        : title}
                </Text>
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    button: {
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        width: '100%',
        overflow: 'hidden', // Contain the progress fill
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        paddingHorizontal: 24,
        zIndex: 2, // Stay above the progress fill
    },
    progressFill: {
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.25)', // White overlay to lighten the primary color
        zIndex: 1,
    },
    primary: {
        backgroundColor: '#6c63ff',
    },
    secondary: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#3d3d54',
    },
    disabled: {
        opacity: 0.5,
    },
    icon: {
        fontSize: 18,
        marginRight: 8,
    },
    text: {
        fontSize: 16,
        fontWeight: '600',
    },
    textPrimary: {
        color: '#fff',
    },
    textSecondary: {
        color: '#a0a0b0',
    },
});

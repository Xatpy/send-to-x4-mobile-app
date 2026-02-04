import React from 'react';
import {
    TouchableOpacity,
    Text,
    StyleSheet,
    ActivityIndicator,
    ViewStyle,
} from 'react-native';

interface ActionButtonProps {
    title: string;
    icon?: string;
    onPress: () => void;
    loading?: boolean;
    disabled?: boolean;
    variant?: 'primary' | 'secondary';
    style?: ViewStyle;
}

export function ActionButton({
    title,
    icon,
    onPress,
    loading = false,
    disabled = false,
    variant = 'primary',
    style,
}: ActionButtonProps) {
    const isDisabled = disabled || loading;

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
            {loading ? (
                <ActivityIndicator
                    color={variant === 'primary' ? '#fff' : '#6c63ff'}
                    size="small"
                />
            ) : (
                <>
                    {icon && <Text style={styles.icon}>{icon}</Text>}
                    <Text
                        style={[
                            styles.text,
                            variant === 'primary' ? styles.textPrimary : styles.textSecondary,
                        ]}
                    >
                        {title}
                    </Text>
                </>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: 12,
        width: '100%',
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

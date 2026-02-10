import React, { useState, useEffect } from 'react';
import {
    Modal,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Settings } from '../types';
import { getDefaultIp } from '../services/settings';

interface SettingsModalProps {
    visible: boolean;
    onClose: () => void;
    settings: Settings;
    onSave: (settings: Settings) => void;
}

export function SettingsModal({
    visible,
    onClose,
    settings,
    onSave,
}: SettingsModalProps) {
    const insets = useSafeAreaInsets();
    const [localSettings, setLocalSettings] = useState<Settings>(settings);

    useEffect(() => {
        if (visible) {
            setLocalSettings(settings);
        }
    }, [visible, settings]);

    const handleFirmwareChange = (type: 'stock' | 'crosspoint') => {
        setLocalSettings(prev => ({
            ...prev,
            firmwareType: type,
        }));
    };

    const handleIpChange = (ip: string) => {
        if (localSettings.firmwareType === 'crosspoint') {
            setLocalSettings(prev => ({ ...prev, crossPointIp: ip }));
        } else {
            setLocalSettings(prev => ({ ...prev, stockIp: ip }));
        }
    };

    const getCurrentIp = () => {
        return localSettings.firmwareType === 'crosspoint'
            ? localSettings.crossPointIp
            : localSettings.stockIp;
    };

    const handleSave = () => {
        onSave(localSettings);
        onClose();
    };

    const handleResetIp = () => {
        const defaultIp = getDefaultIp(localSettings.firmwareType);
        handleIpChange(defaultIp);
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            statusBarTranslucent
            onRequestClose={onClose}
        >
            <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
                <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
                    <Text style={styles.title}>Settings</Text>
                    <TouchableOpacity onPress={handleSave} style={styles.closeButton}>
                        <Text style={styles.closeButtonText}>Done</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView
                    style={styles.content}
                    contentContainerStyle={[
                        styles.contentContainer,
                        { paddingBottom: 16 + insets.bottom },
                    ]}
                >
                    {/* Firmware Type */}
                    <Text style={styles.sectionTitle}>Firmware Type</Text>
                    <View style={styles.segmentedControl}>
                        <TouchableOpacity
                            style={[
                                styles.segment,
                                localSettings.firmwareType === 'stock' && styles.segmentActive,
                            ]}
                            onPress={() => handleFirmwareChange('stock')}
                        >
                            <Text
                                style={[
                                    styles.segmentText,
                                    localSettings.firmwareType === 'stock' && styles.segmentTextActive,
                                ]}
                            >
                                Stock
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.segment,
                                localSettings.firmwareType === 'crosspoint' && styles.segmentActive,
                            ]}
                            onPress={() => handleFirmwareChange('crosspoint')}
                        >
                            <Text
                                style={[
                                    styles.segmentText,
                                    localSettings.firmwareType === 'crosspoint' && styles.segmentTextActive,
                                ]}
                            >
                                CrossPoint
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Device Host/IP */}
                    <Text style={styles.sectionTitle}>Device Host or IP</Text>
                    <View style={styles.inputRow}>
                        <TextInput
                            style={styles.ipInput}
                            value={getCurrentIp()}
                            onChangeText={handleIpChange}
                            placeholder="crosspoint.local or 192.168.x.x"
                            placeholderTextColor="#666"
                            keyboardType="default"
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <TouchableOpacity style={styles.resetButton} onPress={handleResetIp}>
                            <Text style={styles.resetButtonText}>Reset</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.helpText}>
                        Default: {getDefaultIp(localSettings.firmwareType)} ({localSettings.firmwareType === 'crosspoint' ? 'CrossPoint' : 'Stock'})
                    </Text>

                    {/* Help */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Help</Text>
                        <Text style={styles.descriptionText}>
                            To transfer files, your phone must be connected to the Xteink X4's WiFi hotspot (or same local network).
                        </Text>
                    </View>

                    {/* About */}
                    <View style={styles.aboutSection}>
                        <Text style={styles.sectionTitle}>About</Text>
                        <Text style={styles.aboutText}>Version 1.0.0</Text>
                    </View>
                </ScrollView>

                <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                    <TouchableOpacity style={styles.footerButtonSecondary} onPress={onClose}>
                        <Text style={styles.footerButtonSecondaryText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.footerButtonPrimary} onPress={handleSave}>
                        <Text style={styles.footerButtonPrimaryText}>Save</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1a1a2e',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#2d2d44',
    },
    title: {
        fontSize: 20,
        fontWeight: '600',
        color: '#fff',
    },
    closeButton: {
        padding: 8,
    },
    closeButtonText: {
        color: '#6c63ff',
        fontSize: 16,
        fontWeight: '600',
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
    },
    contentContainer: {
        paddingVertical: 20,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#a0a0b0',
        marginBottom: 12,
        marginTop: 24,
    },
    segmentedControl: {
        flexDirection: 'row',
        backgroundColor: '#2d2d44',
        borderRadius: 12,
        padding: 4,
    },
    segment: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: 10,
    },
    segmentActive: {
        backgroundColor: '#6c63ff',
    },
    segmentText: {
        color: '#666',
        fontSize: 14,
        fontWeight: '500',
    },
    segmentTextActive: {
        color: '#fff',
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    ipInput: {
        flex: 1,
        backgroundColor: '#2d2d44',
        borderRadius: 12,
        padding: 16,
        color: '#fff',
        fontSize: 16,
        borderWidth: 1,
        borderColor: '#3d3d54',
    },
    resetButton: {
        marginLeft: 12,
        paddingVertical: 16,
        paddingHorizontal: 16,
        backgroundColor: '#2d2d44',
        borderRadius: 12,
    },
    resetButtonText: {
        color: '#6c63ff',
        fontSize: 14,
        fontWeight: '500',
    },
    helpText: {
        color: '#666',
        fontSize: 12,
        marginTop: 8,
    },
    aboutSection: {
        marginTop: 40,
        paddingTop: 24,
        borderTopWidth: 1,
        borderTopColor: '#2d2d44',
    },
    aboutText: {
        color: '#666',
        fontSize: 14,
        marginBottom: 8,
    },
    section: {
        marginTop: 24,
    },
    descriptionText: {
        color: '#a0a0b0',
        fontSize: 14,
        lineHeight: 20,
    },
    footer: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 20,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#2d2d44',
        backgroundColor: '#1a1a2e',
    },
    footerButtonPrimary: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#6c63ff',
        borderRadius: 12,
        paddingVertical: 14,
    },
    footerButtonPrimaryText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
    footerButtonSecondary: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2d2d44',
        borderRadius: 12,
        paddingVertical: 14,
    },
    footerButtonSecondaryText: {
        color: '#a0a0b0',
        fontSize: 15,
        fontWeight: '600',
    },
});

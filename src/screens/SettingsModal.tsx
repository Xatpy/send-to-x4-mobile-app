import React, { useState, useEffect } from 'react';
import {
    Modal,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    SafeAreaView,
} from 'react-native';
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
            onRequestClose={onClose}
        >
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>Settings</Text>
                    <TouchableOpacity onPress={handleSave} style={styles.closeButton}>
                        <Text style={styles.closeButtonText}>Done</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.content}>
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

                    {/* IP Address */}
                    <Text style={styles.sectionTitle}>Device IP Address</Text>
                    <View style={styles.inputRow}>
                        <TextInput
                            style={styles.ipInput}
                            value={getCurrentIp()}
                            onChangeText={handleIpChange}
                            placeholder="192.168.x.x"
                            placeholderTextColor="#666"
                            keyboardType="decimal-pad"
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
        padding: 20,
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
});

/**
 * SettingsScreen — Tab for configuring device connection settings.
 *
 * Full-screen tab replacing the previous modal.
 * Settings auto-save when the user navigates away.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Switch,
} from 'react-native';

import { useConnection } from '../contexts/ConnectionProvider';
import { StatusIndicator } from '../components/StatusIndicator';
import { getDefaultIp, getDefaultFolder } from '../services/settings';
import Constants from 'expo-constants';

export function SettingsScreen() {
    const { settings, connectionStatus, saveSettings, checkConnection } = useConnection();

    const [localFirmwareType, setLocalFirmwareType] = useState(settings.firmwareType);
    const [localStockIp, setLocalStockIp] = useState(settings.stockIp);
    const [localCrossPointIp, setLocalCrossPointIp] = useState(settings.crossPointIp);
    const [localArticleFolder, setLocalArticleFolder] = useState(settings.articleFolder);
    const [localNoteFolder, setLocalNoteFolder] = useState(settings.noteFolder);
    const [hasChanges, setHasChanges] = useState(false);

    // Sync when settings change externally
    useEffect(() => {
        setLocalFirmwareType(settings.firmwareType);
        setLocalStockIp(settings.stockIp);
        setLocalCrossPointIp(settings.crossPointIp);
        setLocalArticleFolder(settings.articleFolder);
        setLocalNoteFolder(settings.noteFolder);
        setHasChanges(false);
    }, [settings]);

    const handleFirmwareChange = (type: 'stock' | 'crosspoint') => {
        setLocalFirmwareType(type);
        setHasChanges(true);
    };

    const handleIpChange = (ip: string) => {
        if (localFirmwareType === 'crosspoint') {
            setLocalCrossPointIp(ip);
        } else {
            setLocalStockIp(ip);
        }
        setHasChanges(true);
    };

    const getCurrentIpLocal = () => {
        return localFirmwareType === 'crosspoint'
            ? localCrossPointIp
            : localStockIp;
    };

    const handleSave = useCallback(async () => {
        await saveSettings({
            firmwareType: localFirmwareType,
            stockIp: localStockIp,
            crossPointIp: localCrossPointIp,
            articleFolder: localArticleFolder,
            noteFolder: localNoteFolder,
            useDateFolders: settings.useDateFolders,
        });
        setHasChanges(false);
    }, [localFirmwareType, localStockIp, localCrossPointIp, localArticleFolder, localNoteFolder, settings.useDateFolders, saveSettings]);

    const handleResetIp = () => {
        const defaultIp = getDefaultIp(localFirmwareType);
        handleIpChange(defaultIp);
    };

    const handleResetArticleFolder = () => {
        setLocalArticleFolder(getDefaultFolder('article'));
        setHasChanges(true);
    };

    const handleResetNoteFolder = () => {
        setLocalNoteFolder(getDefaultFolder('note'));
        setHasChanges(true);
    };

    return (
        <View style={styles.container}>
            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
                keyboardShouldPersistTaps="handled"
            >
                {/* Connection Status */}
                <View style={styles.statusSection}>
                    <StatusIndicator
                        status={connectionStatus}
                        onRetry={checkConnection}
                    />
                </View>

                {/* Firmware Type */}
                <Text style={styles.sectionTitle}>Firmware Type</Text>
                <View style={styles.segmentedControl}>
                    <TouchableOpacity
                        style={[
                            styles.segment,
                            localFirmwareType === 'stock' && styles.segmentActive,
                        ]}
                        onPress={() => handleFirmwareChange('stock')}
                    >
                        <Text
                            style={[
                                styles.segmentText,
                                localFirmwareType === 'stock' && styles.segmentTextActive,
                            ]}
                        >
                            Stock
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.segment,
                            localFirmwareType === 'crosspoint' && styles.segmentActive,
                        ]}
                        onPress={() => handleFirmwareChange('crosspoint')}
                    >
                        <Text
                            style={[
                                styles.segmentText,
                                localFirmwareType === 'crosspoint' && styles.segmentTextActive,
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
                        value={getCurrentIpLocal()}
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
                    Default: {getDefaultIp(localFirmwareType)} ({localFirmwareType === 'crosspoint' ? 'CrossPoint' : 'Stock'})
                </Text>

                {/* Storage Folders */}
                <Text style={styles.sectionTitle}>Storage Folders</Text>

                <Text style={styles.fieldLabel}>Article Folder</Text>
                <View style={styles.inputRow}>
                    <TextInput
                        style={styles.ipInput}
                        value={localArticleFolder}
                        onChangeText={(v) => { setLocalArticleFolder(v); setHasChanges(true); }}
                        placeholder="send-to-x4"
                        placeholderTextColor="#666"
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    <TouchableOpacity style={styles.resetButton} onPress={handleResetArticleFolder}>
                        <Text style={styles.resetButtonText}>Reset</Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.fieldLabel}>Notes Folder</Text>
                <View style={styles.inputRow}>
                    <TextInput
                        style={styles.ipInput}
                        value={localNoteFolder}
                        onChangeText={(v) => { setLocalNoteFolder(v); setHasChanges(true); }}
                        placeholder="notes"
                        placeholderTextColor="#666"
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    <TouchableOpacity style={styles.resetButton} onPress={handleResetNoteFolder}>
                        <Text style={styles.resetButtonText}>Reset</Text>
                    </TouchableOpacity>
                </View>
                <Text style={styles.helpText}>
                    Folder names on the device where articles and notes are stored.
                </Text>

                <View style={styles.switchRow}>
                    <View style={styles.switchLabelWrap}>
                        <Text style={styles.switchLabel}>Organize by date</Text>
                        <Text style={styles.switchHelp}>Create daily subfolders (yyyy-mm-dd)</Text>
                    </View>
                    <Switch
                        value={settings.useDateFolders}
                        onValueChange={async (value) => {
                            await saveSettings({ ...settings, useDateFolders: value });
                        }}
                        trackColor={{ false: '#333', true: '#6c63ff' }}
                        thumbColor={settings.useDateFolders ? '#fff' : '#888'}
                    />
                </View>

                {/* Save Button */}
                {hasChanges && (
                    <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                        <Text style={styles.saveButtonText}>Save Changes</Text>
                    </TouchableOpacity>
                )}

                {/* Help */}
                <View style={styles.helpSection}>
                    <Text style={styles.sectionTitle}>Help</Text>
                    <Text style={styles.descriptionText}>
                        To transfer files, your phone must be connected to the Xteink X4's WiFi hotspot (or same local network).
                    </Text>
                </View>

                {/* About */}
                <View style={styles.aboutSection}>
                    <Text style={styles.sectionTitle}>About</Text>
                    <Text style={styles.aboutText}>
                        Version {Constants.expoConfig?.version ?? 'Unknown'}
                    </Text>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1a1a2e',
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: 20,
        paddingBottom: 40,
    },
    statusSection: {
        marginBottom: 8,
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
    saveButton: {
        marginTop: 20,
        backgroundColor: '#6c63ff',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
    helpSection: {
        marginTop: 24,
    },
    descriptionText: {
        color: '#a0a0b0',
        fontSize: 14,
        lineHeight: 20,
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
    fieldLabel: {
        fontSize: 13,
        fontWeight: '500',
        color: '#888',
        marginBottom: 8,
        marginTop: 12,
    },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 16,
        paddingVertical: 8,
    },
    switchLabelWrap: {
        flex: 1,
        marginRight: 12,
    },
    switchLabel: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '500',
    },
    switchHelp: {
        color: '#888',
        fontSize: 12,
        marginTop: 2,
    },
});

/**
 * ConnectionProvider — shared context for device connection and settings.
 *
 * Provides: settings, connectionStatus, saveSettings, checkConnection.
 * Connection is re-checked on mount, app foreground, and after settings change.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState as RNAppState } from 'react-native';
import type { Settings, ConnectionStatus } from '../types';
import { getSettings, saveSettings as persistSettings, getCurrentIp } from '../services/settings';
import { checkCrossPointConnection } from '../services/crosspoint_upload';
import { checkStockConnection } from '../services/x4_upload';
import { ensureNearbyWifiPermission } from '../services/android_permissions';

interface ConnectionContextValue {
    settings: Settings;
    connectionStatus: ConnectionStatus;
    saveSettings: (newSettings: Settings) => Promise<void>;
    checkConnection: () => Promise<void>;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function useConnection() {
    const ctx = useContext(ConnectionContext);
    if (!ctx) throw new Error('useConnection must be used within ConnectionProvider');
    return ctx;
}

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<Settings>({
        firmwareType: 'crosspoint',
        stockIp: '192.168.3.3',
        crossPointIp: 'crosspoint.local',
        articleFolder: 'send-to-x4',
        noteFolder: 'notes',
        useDateFolders: false,
    });

    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
        connected: false,
        ip: 'crosspoint.local',
        firmwareType: 'crosspoint',
        checking: true,
    });

    // Use ref to avoid stale closures in the AppState listener
    const settingsRef = useRef(settings);
    settingsRef.current = settings;

    const checkConnection = useCallback(async () => {
        const s = settingsRef.current;
        setConnectionStatus(prev => ({ ...prev, checking: true, lastError: undefined }));

        const permission = await ensureNearbyWifiPermission();
        if (!permission.granted) {
            const ip = getCurrentIp(s);
            setConnectionStatus({
                connected: false,
                ip,
                firmwareType: s.firmwareType,
                checking: false,
                lastError: permission.reason || 'Nearby devices permission is required for local Wi-Fi connection.',
            });
            return;
        }

        const ip = getCurrentIp(s);
        let result: { success: boolean; error?: string } = { success: false, error: undefined };

        if (s.firmwareType === 'crosspoint') {
            result = await checkCrossPointConnection(ip);
        } else {
            result = await checkStockConnection(ip);
        }

        setConnectionStatus({
            connected: result.success,
            ip,
            firmwareType: s.firmwareType,
            checking: false,
            lastError: result.success ? undefined : (result.error || 'Unknown error'),
        });
    }, []);

    const handleSaveSettings = useCallback(async (newSettings: Settings) => {
        const sanitized = await persistSettings(newSettings);
        setSettings(sanitized);
        setConnectionStatus(prev => ({
            ...prev,
            ip: getCurrentIp(sanitized),
            firmwareType: sanitized.firmwareType,
        }));
        // Re-check connection after short delay
        setTimeout(checkConnection, 100);
    }, [checkConnection]);

    // Load settings on mount
    useEffect(() => {
        (async () => {
            const loaded = await getSettings();
            setSettings(loaded);
            setConnectionStatus(prev => ({
                ...prev,
                ip: getCurrentIp(loaded),
                firmwareType: loaded.firmwareType,
            }));
        })();
    }, []);

    // Check on mount & foreground
    useEffect(() => {
        checkConnection();

        const sub = RNAppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                checkConnection();
            }
        });

        return () => sub.remove();
    }, [checkConnection]);

    return (
        <ConnectionContext.Provider
            value={{
                settings,
                connectionStatus,
                saveSettings: handleSaveSettings,
                checkConnection,
            }}
        >
            {children}
        </ConnectionContext.Provider>
    );
}

/**
 * NotesScreen — Tab for writing/pasting text and sending it to the X4 as a .txt file.
 *
 * Features:
 *   - Large multiline text input (type or paste)
 *   - Paste from clipboard button
 *   - Character count
 *   - Clear button
 *   - Send to Device (reuses existing upload pipeline)
 *   - Draft persistence via AsyncStorage
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    Alert,
    ScrollView,
    TouchableOpacity,
    Keyboard,
    Animated,
    type NativeSyntheticEvent,
    type NativeScrollEvent,
    type LayoutChangeEvent,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useConnection } from '../contexts/ConnectionProvider';
import { ActionButton } from '../components/ActionButton';
import { sendNoteAsTxt } from '../services/note_sender';

const DRAFT_KEY = '@send-to-x4/note-draft';
const DRAFT_TITLE_KEY = '@send-to-x4/note-draft-title';
const DEBOUNCE_MS = 500;
const SCROLLBAR_WIDTH = 6;
const SCROLLBAR_MIN_HEIGHT = 40;
const SCROLLBAR_FADE_DELAY = 1500;

export function NotesScreen() {
    const { settings, connectionStatus } = useConnection();

    const [title, setTitle] = useState('');
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const inputRef = useRef<TextInput>(null);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveTitleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Custom scrollbar state ──────────────────────────────────────
    const scrollOpacity = useRef(new Animated.Value(0)).current;
    const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [scrollbarHeight, setScrollbarHeight] = useState(0);
    const [scrollbarTop, setScrollbarTop] = useState(0);
    const [showScrollbar, setShowScrollbar] = useState(false);
    const viewportHeight = useRef(0);
    const contentHeight = useRef(0);

    const updateScrollbar = useCallback((scrollY: number) => {
        const vp = viewportHeight.current;
        const ch = contentHeight.current;
        if (ch <= vp) {
            setShowScrollbar(false);
            return;
        }
        setShowScrollbar(true);
        const ratio = vp / ch;
        const thumbH = Math.max(SCROLLBAR_MIN_HEIGHT, ratio * vp);
        const maxScroll = ch - vp;
        const scrollRatio = Math.min(scrollY / maxScroll, 1);
        const maxTop = vp - thumbH;
        setScrollbarHeight(thumbH);
        setScrollbarTop(scrollRatio * maxTop);
    }, []);

    const flashScrollbar = useCallback(() => {
        if (fadeTimer.current) clearTimeout(fadeTimer.current);
        Animated.timing(scrollOpacity, { toValue: 1, duration: 100, useNativeDriver: true }).start();
        fadeTimer.current = setTimeout(() => {
            Animated.timing(scrollOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start();
        }, SCROLLBAR_FADE_DELAY);
    }, [scrollOpacity]);

    const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
        viewportHeight.current = layoutMeasurement.height;
        contentHeight.current = contentSize.height;
        updateScrollbar(contentOffset.y);
        flashScrollbar();
    }, [updateScrollbar, flashScrollbar]);

    const handleLayout = useCallback((e: LayoutChangeEvent) => {
        viewportHeight.current = e.nativeEvent.layout.height;
    }, []);

    // ── Restore draft on mount ──────────────────────────────────────
    useEffect(() => {
        (async () => {
            try {
                const [draft, draftTitle] = await Promise.all([
                    AsyncStorage.getItem(DRAFT_KEY),
                    AsyncStorage.getItem(DRAFT_TITLE_KEY),
                ]);
                if (draftTitle) setTitle(draftTitle);
                if (draft) setText(draft);
            } catch (e) {
                console.warn('[NotesScreen] Failed to restore draft:', e);
            }
        })();

        // Cleanup timers on unmount
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            if (saveTitleTimerRef.current) clearTimeout(saveTitleTimerRef.current);
            if (fadeTimer.current) clearTimeout(fadeTimer.current);
        };
    }, []);

    // ── Debounced draft save ────────────────────────────────────────
    const handleTitleChange = useCallback((value: string) => {
        setTitle(value);
        setSuccessMessage(null);

        if (saveTitleTimerRef.current) clearTimeout(saveTitleTimerRef.current);
        saveTitleTimerRef.current = setTimeout(() => {
            AsyncStorage.setItem(DRAFT_TITLE_KEY, value).catch(() => { });
        }, DEBOUNCE_MS);
    }, []);

    const handleTextChange = useCallback((value: string) => {
        setText(value);
        setSuccessMessage(null);

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            AsyncStorage.setItem(DRAFT_KEY, value).catch(() => { });
        }, DEBOUNCE_MS);
    }, []);

    // ── Paste from clipboard ────────────────────────────────────────
    const handlePaste = useCallback(async () => {
        try {
            const hasString = await Clipboard.hasStringAsync();
            if (!hasString) {
                Alert.alert('Clipboard Empty', 'Nothing to paste.');
                return;
            }
            const clipText = await Clipboard.getStringAsync();
            if (clipText) {
                handleTextChange(clipText);
            }
        } catch (e) {
            console.warn('[NotesScreen] Paste error:', e);
            Alert.alert('Paste Failed', 'Could not read clipboard.');
        }
    }, [handleTextChange]);

    // ── Clear ───────────────────────────────────────────────────────
    const handleClear = useCallback(() => {
        handleTitleChange('');
        handleTextChange('');
        inputRef.current?.focus();
    }, [handleTitleChange, handleTextChange]);

    // ── Send ────────────────────────────────────────────────────────
    const handleSend = useCallback(async () => {
        const trimmed = text.trim();
        if (!trimmed) {
            Alert.alert('Empty Note', 'Write or paste some text first.');
            return;
        }
        if (!connectionStatus.connected) {
            Alert.alert('Not Connected', 'Please connect to the X4 WiFi hotspot first.');
            return;
        }

        Keyboard.dismiss();
        setSending(true);
        setSuccessMessage(null);

        try {
            const result = await sendNoteAsTxt(text, settings, title);

            if (!result.success) {
                throw new Error(result.error || 'Upload failed');
            }

            setSuccessMessage('Sent! ✓');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            Alert.alert('Send Failed', message);
        } finally {
            setSending(false);
        }
    }, [text, title, settings, connectionStatus.connected]);

    // ── Format char count ───────────────────────────────────────────
    const charCount = text.length.toLocaleString();

    return (
        <View style={styles.container}>
            <View style={{ flex: 1 }}>
                <ScrollView
                    style={styles.content}
                    contentContainerStyle={styles.contentContainer}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    onScroll={handleScroll}
                    onLayout={handleLayout}
                    scrollEventThrottle={16}
                >
                    {/* Header */}
                    <Text style={styles.title}>Send Notes</Text>
                    <Text style={styles.subtitle}>
                        Write or paste text to send as a .txt file
                    </Text>

                    {/* Title Input */}
                    <TextInput
                        style={styles.titleInput}
                        value={title}
                        onChangeText={handleTitleChange}
                        placeholder="Note title (optional)"
                        placeholderTextColor="rgba(255,255,255,0.25)"
                        maxLength={60}
                        returnKeyType="next"
                        onSubmitEditing={() => inputRef.current?.focus()}
                        blurOnSubmit={false}
                        autoFocus
                    />

                    {/* Text Input Card */}
                    <View style={styles.inputCard}>
                        <TextInput
                            ref={inputRef}
                            style={styles.textInput}
                            value={text}
                            onChangeText={handleTextChange}
                            placeholder="Type or paste your note…"
                            placeholderTextColor="rgba(255,255,255,0.25)"
                            multiline
                            textAlignVertical="top"
                            scrollEnabled
                        />

                        {/* Footer row: char count + utility buttons */}
                        <View style={styles.inputFooter}>
                            <Text style={styles.charCount}>{charCount} chars</Text>

                            <View style={styles.utilButtons}>
                                <TouchableOpacity
                                    style={styles.utilButton}
                                    onPress={handlePaste}
                                    disabled={sending}
                                >
                                    <Text style={[
                                        styles.utilButtonText,
                                        sending && styles.utilButtonDisabled,
                                    ]}>📋 Paste</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.utilButton}
                                    onPress={handleClear}
                                    disabled={sending || (text.length === 0 && title.length === 0)}
                                >
                                    <Text style={[
                                        styles.utilButtonText,
                                        (sending || (text.length === 0 && title.length === 0)) && styles.utilButtonDisabled,
                                    ]}>
                                        ✕ Clear
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    {/* Success banner */}
                    {successMessage && (
                        <View style={styles.successBanner}>
                            <Text style={styles.successText}>{successMessage}</Text>
                        </View>
                    )}

                    {/* Send button */}
                    <View style={styles.sendContainer}>
                        <ActionButton
                            title="SEND TO DEVICE"
                            icon="◉"
                            onPress={handleSend}
                            loading={sending}
                            disabled={!text.trim() || sending}
                            variant="primary"
                        />
                    </View>
                </ScrollView>

                {/* Custom wide scrollbar */}
                {showScrollbar && (
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            styles.scrollThumb,
                            {
                                opacity: scrollOpacity,
                                height: scrollbarHeight,
                                top: scrollbarTop,
                            },
                        ]}
                    />
                )}
            </View>
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
    },
    title: {
        color: '#fff',
        fontSize: 22,
        fontWeight: '700',
        marginBottom: 4,
    },
    subtitle: {
        color: 'rgba(255,255,255,0.45)',
        fontSize: 14,
        marginBottom: 12,
    },
    titleInput: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '600',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginBottom: 12,
    },
    inputCard: {
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
    },
    textInput: {
        color: '#fff',
        fontSize: 16,
        lineHeight: 24,
        minHeight: 260,
        maxHeight: 420,
        padding: 16,
    },
    inputFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },
    charCount: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 12,
        fontWeight: '500',
    },
    utilButtons: {
        flexDirection: 'row',
        gap: 16,
    },
    utilButton: {
        paddingVertical: 4,
        paddingHorizontal: 8,
    },
    utilButtonText: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 13,
        fontWeight: '600',
    },
    utilButtonDisabled: {
        opacity: 0.3,
    },
    successBanner: {
        marginTop: 12,
        paddingVertical: 10,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(74, 222, 128, 0.12)',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(74, 222, 128, 0.3)',
    },
    successText: {
        color: '#4ade80',
        fontSize: 15,
        fontWeight: '600',
        textAlign: 'center',
    },
    sendContainer: {
        marginTop: 20,
    },
    scrollThumb: {
        position: 'absolute',
        right: 2,
        width: SCROLLBAR_WIDTH,
        borderRadius: SCROLLBAR_WIDTH / 2,
        backgroundColor: 'rgba(255,255,255,0.35)',
    },
});

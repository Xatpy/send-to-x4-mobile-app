import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    Alert,
    TouchableOpacity,
    Keyboard,
    Image,
    PanResponder,
    Animated,
    Modal,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    Switch
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ViewShot from 'react-native-view-shot';
import Svg, { Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { saveDesignDraft, loadDesignDraft, clearDesignDraft } from '../services/design_storage';

import { useConnection } from '../contexts/ConnectionProvider';
import { useProgress } from '../contexts/ProgressProvider';
import { ActionButton } from '../components/ActionButton';
import { processAndSendSleepScreen, processAndSaveSleepScreenLocally } from '../sleepScreen/sleepScreenService';
import * as Sharing from 'expo-sharing';
import { X4_WIDTH_PX, X4_HEIGHT_PX } from '../x4/deviceConfig';

export type CanvasElementType = 'text' | 'image' | 'sign';
const MIN_TEXT_FONT_SIZE = 14;
const MIN_SIGN_FONT_SIZE = 16;

export interface CanvasElement {
    id: string;
    type: CanvasElementType;
    content: string; // text string or image URI
    x: number;
    y: number;
    scale: number;
    rotation: number;
    zIndex: number;
    locked: boolean;
}

export function SleepScreenTab() {
    const { settings, connectionStatus } = useConnection();
    const navigation = useNavigation<any>();
    const [elements, setElements] = useState<CanvasElement[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [editingTextId, setEditingTextId] = useState<string | null>(null);
    const [isInverted, setIsInverted] = useState(false);
    const [isDrawingMode, setIsDrawingMode] = useState(false);
    const [doodlePaths, setDoodlePaths] = useState<string[]>([]);
    const [currentPath, setCurrentPath] = useState<string>('');
    const [overwriteMain, setOverwriteMain] = useState(false);
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [draftLoaded, setDraftLoaded] = useState(false);

    const { progress: globalProgress, startUpload, setProgress, finishUpload, failUpload } = useProgress();

    // Keep context mutable for the PanResponder closure
    const drawingContext = useRef({
        isDrawingMode,
        setCurrentPath,
        setDoodlePaths
    });
    useEffect(() => {
        drawingContext.current = { isDrawingMode, setCurrentPath, setDoodlePaths };
    }, [isDrawingMode, setCurrentPath, setDoodlePaths]);

    // ── Restore draft on mount ────────────────────────────────────
    useEffect(() => {
        (async () => {
            const draft = await loadDesignDraft();
            if (draft) {
                setElements(draft.elements);
                setDoodlePaths(draft.doodlePaths);
                setIsInverted(draft.isInverted);
                setOverwriteMain(draft.overwriteMain);
            }
            setDraftLoaded(true);
        })();
    }, []);

    // ── Debounced auto-save ───────────────────────────────────────
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!draftLoaded) return; // don't save before restore completes
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            saveDesignDraft({ elements, doodlePaths, isInverted, overwriteMain });
        }, 500);
        return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    }, [elements, doodlePaths, isInverted, overwriteMain, draftLoaded]);

    const [isSending, setIsSending] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const viewShotRef = useRef<ViewShot>(null);

    const handleDrawingEnd = () => {
        if (!drawingContext.current.isDrawingMode) return;
        drawingContext.current.setCurrentPath(prev => {
            if (prev) {
                drawingContext.current.setDoodlePaths(paths => [...paths, prev]);
            }
            return '';
        });
    };

    const drawingResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => drawingContext.current.isDrawingMode,
            onMoveShouldSetPanResponder: () => drawingContext.current.isDrawingMode,
            onPanResponderGrant: (evt) => {
                if (!drawingContext.current.isDrawingMode) return;
                const { locationX, locationY } = evt.nativeEvent;
                drawingContext.current.setCurrentPath(`M ${locationX} ${locationY}`);
            },
            onPanResponderMove: (evt) => {
                if (!drawingContext.current.isDrawingMode) return;
                const { locationX, locationY } = evt.nativeEvent;
                drawingContext.current.setCurrentPath(prev => `${prev} L ${locationX} ${locationY}`);
            },
            onPanResponderRelease: handleDrawingEnd,
            onPanResponderTerminate: handleDrawingEnd,
        })
    ).current;

    const selectedElement = elements.find(e => e.id === selectedId);
    const editingElement = elements.find(e => e.id === editingTextId);

    // ── Element Management ────────────────────────────────────

    const handleAddText = () => {
        const newEl: CanvasElement = {
            id: Date.now().toString(),
            type: 'text',
            content: '', // Start empty
            x: 50,
            y: 50,
            scale: 2,
            rotation: 0,
            zIndex: elements.length,
            locked: false,
        };
        setElements([...elements, newEl]);
        setSelectedId(newEl.id);
        setEditingTextId(newEl.id); // Immediately open edit modal
    };

    const handleAddSign = () => {
        const newEl: CanvasElement = {
            id: Date.now().toString(),
            type: 'sign',
            content: '', // Start empty
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
            zIndex: elements.length,
            locked: false,
        };
        setElements([...elements, newEl]);
        setSelectedId(newEl.id);
        setEditingTextId(newEl.id);
    };

    const handleAddImage = async () => {
        try {
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permissionResult.granted) {
                Alert.alert('Permission needed', 'Please allow access to your photos');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: 'images',
                allowsEditing: true,
                quality: 1,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                // Copy to documentDirectory so the URI survives app restarts
                const sourceUri = result.assets[0].uri;
                const persistentName = `design_img_${Date.now()}.png`;
                const persistentUri = `${FileSystem.documentDirectory}${persistentName}`;
                await FileSystem.copyAsync({ from: sourceUri, to: persistentUri });

                const newEl: CanvasElement = {
                    id: Date.now().toString(),
                    type: 'image',
                    content: persistentUri,
                    x: 50,
                    y: 50,
                    scale: 1,
                    rotation: 0,
                    zIndex: elements.length,
                    locked: false,
                };
                setElements([...elements, newEl]);
                setSelectedId(newEl.id);
            }
        } catch (e) {
            console.error('Image picker error', e);
            Alert.alert('Error', 'Failed to pick image');
        }
    };

    const updateElement = (id: string, updates: Partial<CanvasElement>) => {
        setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
    };

    const removeElement = async (id: string) => {
        const element = elements.find(el => el.id === id);
        if (element?.type === 'image' && element.content.startsWith(FileSystem.documentDirectory || '')) {
            try {
                await FileSystem.deleteAsync(element.content, { idempotent: true });
            } catch (e) {
                console.warn('Failed to delete image file', e);
            }
        }
        // Remove and re-normalize zIndex to sequential 0..n-1
        setElements(prev => {
            const remaining = prev.filter(el => el.id !== id);
            const sorted = [...remaining].sort((a, b) => a.zIndex - b.zIndex);
            const idToZ = new Map(sorted.map((el, i) => [el.id, i]));
            return remaining.map(el => ({ ...el, zIndex: idToZ.get(el.id)! }));
        });
        if (selectedId === id) setSelectedId(null);
        if (editingTextId === id) setEditingTextId(null);
    };

    const handleToggleLock = (id: string) => {
        setElements(prev => prev.map(el => el.id === id ? { ...el, locked: !el.locked } : el));
    };

    const handleBringForward = (id: string) => {
        setElements(prev => {
            // Normalize to sequential indices first, then swap
            const sorted = [...prev].sort((a, b) => a.zIndex - b.zIndex);
            const idx = sorted.findIndex(el => el.id === id);
            if (idx < 0 || idx >= sorted.length - 1) return prev;
            // Swap positions in sorted order
            const swappedId = sorted[idx + 1].id;
            // Assign sequential zIndex but with these two swapped
            const idToZ = new Map<string, number>();
            sorted.forEach((el, i) => idToZ.set(el.id, i));
            idToZ.set(id, idx + 1);
            idToZ.set(swappedId, idx);
            return prev.map(el => ({ ...el, zIndex: idToZ.get(el.id)! }));
        });
    };

    const handleSendBackward = (id: string) => {
        setElements(prev => {
            const sorted = [...prev].sort((a, b) => a.zIndex - b.zIndex);
            const idx = sorted.findIndex(el => el.id === id);
            if (idx <= 0) return prev;
            const swappedId = sorted[idx - 1].id;
            const idToZ = new Map<string, number>();
            sorted.forEach((el, i) => idToZ.set(el.id, i));
            idToZ.set(id, idx - 1);
            idToZ.set(swappedId, idx);
            return prev.map(el => ({ ...el, zIndex: idToZ.get(el.id)! }));
        });
    };

    const handleClear = () => {
        Alert.alert(
            'Clear Design',
            'Are you sure you want to remove all elements?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: async () => {
                        for (const el of elements) {
                            if (el.type === 'image' && el.content.startsWith(FileSystem.documentDirectory || '')) {
                                try {
                                    await FileSystem.deleteAsync(el.content, { idempotent: true });
                                } catch (e) { }
                            }
                        }
                        setElements([]);
                        setDoodlePaths([]);
                        setCurrentPath('');
                        setSelectedId(null);
                        setEditingTextId(null);
                        clearDesignDraft();
                    }
                }
            ]
        );
    };

    // ── Generate & Send ────────────────────────────────────

    const captureCanvas = async (): Promise<string | null> => {
        if (!viewShotRef.current?.capture) return null;
        try {
            setSelectedId(null); // Deselect so borders don't show in capture
            await new Promise(r => setTimeout(r, 100)); // allow React to re-render

            const uri = await viewShotRef.current.capture();
            return uri;
        } catch (e) {
            console.error('Capture failed', e);
            return null;
        }
    };

    const handleSend = async () => {
        if (elements.length === 0 && doodlePaths.length === 0 && !currentPath) {
            Alert.alert('Empty', 'Add some elements or draw on the canvas first.');
            return;
        }
        if (!connectionStatus.connected) {
            Alert.alert('Not Connected', 'Connect to X4 WiFi to access device files.');
            return;
        }

        setIsSending(true);
        setSuccessMessage(null);
        startUpload('Preparing custom design...');

        try {
            const uri = await captureCanvas();
            if (!uri) throw new Error('Could not capture screen');

            const result = await processAndSendSleepScreen(uri, settings, overwriteMain ? 'main-todo.bmp' : undefined, (percent) => setProgress(percent));
            if (result.success) {
                finishUpload();
                setSuccessMessage('Sent! Open it on X4 and set as Sleep Screen.');
            } else {
                throw new Error(result.error || 'Failed to send');
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            failUpload(message);
            Alert.alert('Send Failed', message);
        } finally {
            setIsSending(false);
            // Hide success message after 3 seconds
            setTimeout(() => setSuccessMessage(null), 3000);
        }
    };

    const handleSave = async () => {
        if (elements.length === 0 && doodlePaths.length === 0 && !currentPath) return;
        setIsSaving(true);
        setSuccessMessage(null);

        try {
            const uri = await captureCanvas();
            if (!uri) throw new Error('Could not capture screen');

            const savedUri = await processAndSaveSleepScreenLocally(uri);

            const isSupported = await Sharing.isAvailableAsync();
            if (isSupported) {
                await Sharing.shareAsync(savedUri, {
                    mimeType: 'image/bmp',
                    dialogTitle: 'Save or Share your Sleep Screen',
                    UTI: 'com.microsoft.bmp'
                });
                setSuccessMessage(`Ready to share`);
            } else {
                Alert.alert('Saved locally', `File saved to cache:\n${savedUri}`);
                setSuccessMessage(`Saved to cache`);
            }
        } catch (e) {
            Alert.alert('Save Failed', e instanceof Error ? e.message : String(e));
        } finally {
            setIsSaving(false);
            setTimeout(() => setSuccessMessage(null), 3000);
        }
    };

    // Clean up empty text elements when closing modal
    const closeTextModal = () => {
        if (editingTextId) {
            const el = elements.find(e => e.id === editingTextId);
            if (el && (el.type === 'text' || el.type === 'sign') && el.content.trim() === '') {
                removeElement(editingTextId);
            }
        }
        setEditingTextId(null);
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Minimal Header */}
            <View style={styles.header}>
                <Text style={styles.title}>Sleep Screen Editor</Text>

                <View style={styles.toolsRow}>
                    <View style={styles.toolsGroup}>
                        <TouchableOpacity style={styles.toolBtn} onPress={handleAddSign}>
                            <Text style={styles.iconBtnText}>🪧</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.toolBtn} onPress={handleAddText}>
                            <Text style={styles.iconBtnText}>🔤</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.toolBtn} onPress={handleAddImage}>
                            <Text style={styles.iconBtnText}>🖼️</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.toolsGroup}>
                        <TouchableOpacity style={[styles.toolBtn, isDrawingMode && styles.toolBtnActive]} onPress={() => setIsDrawingMode(!isDrawingMode)}>
                            <Text style={styles.iconBtnText}>✍️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.toolBtn, isInverted && styles.toolBtnActive]} onPress={() => setIsInverted(!isInverted)}>
                            <Text style={styles.iconBtnText}>◑</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.toolBtn} onPress={handleClear}>
                            <Text style={styles.iconBtnText}>🗑️</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            {/* Canvas Area - Fills remaining space dynamically */}
            <View
                style={styles.canvasArea}
                onStartShouldSetResponder={() => true}
                onResponderRelease={() => {
                    setSelectedId(null);
                    Keyboard.dismiss();
                }}
            >

                {/* Floating Success Notification */}
                {successMessage && (
                    <View style={styles.successFloating}>
                        <Text style={styles.successText}>{successMessage}</Text>
                    </View>
                )}

                <View style={[styles.canvasBoundary, { aspectRatio: X4_WIDTH_PX / X4_HEIGHT_PX }]}>
                    <ViewShot ref={viewShotRef} style={{ flex: 1, backgroundColor: isInverted ? '#000' : '#fff', overflow: 'hidden' }} options={{ format: 'png', quality: 1 }}>
                        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                            {doodlePaths.map((path, index) => (
                                <Path key={index} d={path} stroke={isInverted ? '#fff' : '#000'} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            ))}
                            {currentPath ? (
                                <Path d={currentPath} stroke={isInverted ? '#fff' : '#000'} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            ) : null}
                        </Svg>
                        {elements.map(el => (
                            <DraggableElement
                                key={el.id}
                                element={el}
                                isSelected={selectedId === el.id}
                                isInverted={isInverted}
                                onSelect={() => setSelectedId(el.id)}
                                onDoubleTap={() => { if (el.type === 'text' || el.type === 'sign') setEditingTextId(el.id); }}
                                onDelete={() => removeElement(el.id)}
                                onEdit={() => { if (el.type === 'text' || el.type === 'sign') setEditingTextId(el.id); }}
                                onChange={(updates) => updateElement(el.id, updates)}
                                onToggleLock={() => handleToggleLock(el.id)}
                                onBringForward={() => handleBringForward(el.id)}
                                onSendBackward={() => handleSendBackward(el.id)}
                            />
                        ))}
                        {/* Drawing Layer Overlay - Intercepts touches over everything when active */}
                        {isDrawingMode && (
                            <View
                                style={[StyleSheet.absoluteFill, { zIndex: 999 }]}
                                {...drawingResponder.panHandlers}
                            />
                        )}
                    </ViewShot>
                </View>

            </View>

            {/* (Inline Toolbar Removed - Controls are now directly on the selected canvas element) */}

            {/* Options & Actions */}
            <View style={styles.optionsContainer}>
                <View style={styles.switchRow}>
                    <TouchableOpacity onPress={() => setShowInfoModal(true)} style={styles.infoIconWrapper}>
                        <Text style={styles.infoIconText}>?</Text>
                    </TouchableOpacity>
                    <View style={styles.switchLabelWrap}>
                        <Text style={styles.switchLabel}>Overwrite Default Sleep Screen</Text>
                        <Text style={styles.switchHelp}>Always overwrites the same file on the device</Text>
                    </View>
                    <Switch
                        value={overwriteMain}
                        onValueChange={setOverwriteMain}
                        trackColor={{ false: '#333', true: '#6c63ff' }}
                        thumbColor={overwriteMain ? '#fff' : '#888'}
                    />
                </View>
            </View>

            {/* Fixed Bottom Actions (Side by Side) */}
            <View style={styles.bottomActions}>
                <View style={styles.actionButtonHost}>
                    <ActionButton
                        title="SAVE AS BMP"
                        onPress={handleSave}
                        loading={isSaving}
                        disabled={(elements.length === 0 && doodlePaths.length === 0 && !currentPath) || isSending || isSaving}
                        variant="secondary"
                    />
                </View>
                <View style={{ width: 12 }} />
                <View style={styles.actionButtonHost}>
                    <ActionButton
                        title="SEND TO X4"
                        onPress={handleSend}
                        loading={isSending}
                        disabled={(elements.length === 0 && doodlePaths.length === 0 && !currentPath) || isSending || isSaving}
                        variant="primary"
                        progress={isSending ? globalProgress : undefined}
                    />
                </View>
            </View>

            {/* Instagram-style Fullscreen Text Edit Modal */}
            <Modal visible={!!editingTextId} animationType="fade" transparent>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={closeTextModal} />
                    {editingElement && (
                        <View style={styles.modalContent}>
                            <TextInput
                                style={styles.modalTextInput}
                                value={editingElement.content}
                                onChangeText={(val) => updateElement(editingElement.id, { content: val })}
                                autoFocus
                                multiline
                                placeholder="Type something..."
                                placeholderTextColor="rgba(255,255,255,0.4)"
                            />
                            <TouchableOpacity style={styles.modalDoneBtn} onPress={closeTextModal}>
                                <Text style={styles.modalDoneText}>Done</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </KeyboardAvoidingView>
            </Modal>

            {/* Info Modal */}
            <Modal visible={showInfoModal} animationType="fade" transparent onRequestClose={() => setShowInfoModal(false)}>
                <View style={styles.infoModalOverlay}>
                    <View style={styles.infoModalContent}>
                        <Text style={styles.infoModalTitle}>Overwrite Default Sleep Screen</Text>
                        <Text style={styles.infoModalText}>
                            When enabled, your design is always sent to the X4 device as a single file named "main-todo.bmp".
                        </Text>
                        <Text style={styles.infoModalText}>
                            This means each time you click SEND TO X4, it replaces the previous file on the device instead of creating a new screensaver image. Your lock screen will always show your most recent to-do list without cluttering the /sleep folder!
                        </Text>
                        <TouchableOpacity style={styles.infoModalCloseBtn} onPress={() => setShowInfoModal(false)}>
                            <Text style={styles.infoModalCloseText}>Got it</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

// ── Draggable Element Component ────────────────────────────────

interface DraggableElementProps {
    element: CanvasElement;
    isSelected: boolean;
    isInverted: boolean;
    onSelect: () => void;
    onDoubleTap: () => void;
    onDelete: () => void;
    onEdit: () => void;
    onChange: (updates: Partial<CanvasElement>) => void;
    onToggleLock: () => void;
    onBringForward: () => void;
    onSendBackward: () => void;
}

// Helper to calculate distance between two touches
function getDistance(touches: any[]) {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
}

// Helper to calculate angle between two touches (in degrees)
function getAngle(touches: any[]) {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return (Math.atan2(dy, dx) * 180) / Math.PI;
}

function DraggableElement({ element, isSelected, isInverted, onSelect, onDoubleTap, onDelete, onEdit, onChange, onToggleLock, onBringForward, onSendBackward }: DraggableElementProps) {
    const pan = useRef(new Animated.ValueXY({ x: element.x, y: element.y })).current;
    const lastTap = useRef(0);
    const isLocked = !!element.locked;

    const [size, setSize] = useState({ width: 0, height: 0 });
    const latest = useRef({ element, size, onChange });
    useEffect(() => { latest.current = { element, size, onChange }; }, [element, size, onChange]);

    // Multi-touch tracking refs
    const initialDistance = useRef<number | null>(null);
    const initialAngle = useRef<number | null>(null);
    const initialScale = useRef<number>(element.scale);
    const initialRotation = useRef<number>(element.rotation);
    const isMultiTouch = useRef(false);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => !latest.current.element.locked,
            onPanResponderGrant: (evt) => {
                onSelect(); // Bring to focus

                // Track current pan offset
                // @ts-ignore
                pan.setOffset({ x: pan.x._value, y: pan.y._value });
                pan.setValue({ x: 0, y: 0 });

                // Initialize multi-touch if two fingers are present
                if (evt.nativeEvent.touches.length === 2) {
                    isMultiTouch.current = true;
                    initialDistance.current = getDistance(evt.nativeEvent.touches);
                    initialAngle.current = getAngle(evt.nativeEvent.touches);
                    initialScale.current = element.scale;
                    initialRotation.current = element.rotation;
                } else {
                    isMultiTouch.current = false;
                }
            },
            onPanResponderMove: (evt, gestureState) => {
                if (latest.current.element.locked) return;
                if (latest.current.element.type === 'sign') return;
                const touches = evt.nativeEvent.touches;

                if (touches.length === 2) {
                    // --- Handle Pinch / Rotate ---
                    if (!isMultiTouch.current) {
                        // Just transitioned to multi-touch
                        isMultiTouch.current = true;
                        initialDistance.current = getDistance(touches);
                        initialAngle.current = getAngle(touches);
                        initialScale.current = element.scale;
                        initialRotation.current = element.rotation;
                        return;
                    }

                    if (initialDistance.current && initialAngle.current !== null) {
                        const currentDistance = getDistance(touches);
                        const currentAngle = getAngle(touches);

                        const scaleFactor = currentDistance / initialDistance.current;
                        const angleDelta = currentAngle - initialAngle.current;

                        onChange({
                            scale: Math.max(0.2, Math.min(40, initialScale.current * scaleFactor)),
                            rotation: initialRotation.current + angleDelta
                        });
                    }
                } else if (!isMultiTouch.current && touches.length === 1) {
                    // --- Handle simple drag ---
                    Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false })(evt, gestureState);
                }
            },
            onPanResponderRelease: (evt, gestureState) => {
                pan.flattenOffset();

                // If it was just a drag, save the final position
                if (!isMultiTouch.current) {
                    if (!latest.current.element.locked) {
                        onChange(panState.current);
                    }

                    // Detect tap or double tap (only if not a multi-touch gesture)
                    if (Math.abs(gestureState.dx) < 5 && Math.abs(gestureState.dy) < 5) {
                        const now = Date.now();
                        if (now - lastTap.current < 300) {
                            onDoubleTap();
                        }
                        lastTap.current = now;
                    }
                }

                isMultiTouch.current = false;
                initialDistance.current = null;
                initialAngle.current = null;
            }
        })
    ).current;

    const scaleState = useRef({ CX: 0, CY: 0, initialDist: 1, initialScale: 1 });
    const scaleResponder = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
            const { element: el, size: sz } = latest.current;
            const R = el.rotation * Math.PI / 180;
            const W = sz.width || 100;
            const H = sz.height || 100;

            const vx = (W / 2) * Math.cos(R) - (H / 2) * Math.sin(R);
            const vy = (W / 2) * Math.sin(R) + (H / 2) * Math.cos(R);

            const startX = evt.nativeEvent.pageX;
            const startY = evt.nativeEvent.pageY;
            scaleState.current.CX = startX - vx;
            scaleState.current.CY = startY - vy;

            const currentDist = Math.max(1, Math.sqrt(vx * vx + vy * vy));
            scaleState.current.initialDist = currentDist;
            scaleState.current.initialScale = el.scale;
        },
        onPanResponderMove: (evt) => {
            const moveX = evt.nativeEvent.pageX;
            const moveY = evt.nativeEvent.pageY;
            const newDist = Math.sqrt(Math.pow(moveX - scaleState.current.CX, 2) + Math.pow(moveY - scaleState.current.CY, 2));
            const scaleFactor = newDist / scaleState.current.initialDist;
            const newScale = scaleState.current.initialScale * scaleFactor;

            latest.current.onChange({ scale: Math.max(0.2, Math.min(40, newScale)) });
        },
        onPanResponderRelease: () => { }
    })).current;

    const rotateState = useRef({ CX: 0, CY: 0, initialAngle: 0, initialRotation: 0 });
    const rotateResponder = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
            const { element: el, size: sz } = latest.current;
            const R = el.rotation * Math.PI / 180;
            const W = sz.width || 100;
            const H = sz.height || 100;

            const vx = (-W / 2) * Math.cos(R) - (-H / 2) * Math.sin(R);
            const vy = (-W / 2) * Math.sin(R) + (-H / 2) * Math.cos(R);

            const startX = evt.nativeEvent.pageX;
            const startY = evt.nativeEvent.pageY;
            rotateState.current.CX = startX - vx;
            rotateState.current.CY = startY - vy;
            rotateState.current.initialAngle = Math.atan2(startY - rotateState.current.CY, startX - rotateState.current.CX);
            rotateState.current.initialRotation = el.rotation;
        },
        onPanResponderMove: (evt) => {
            const moveX = evt.nativeEvent.pageX;
            const moveY = evt.nativeEvent.pageY;
            const newAngle = Math.atan2(moveY - rotateState.current.CY, moveX - rotateState.current.CX);
            let angleDiff = (newAngle - rotateState.current.initialAngle) * 180 / Math.PI;

            latest.current.onChange({ rotation: rotateState.current.initialRotation + angleDiff });
        },
        onPanResponderRelease: () => { }
    })).current;

    // Track exact position for when dragging finishes
    const panState = useRef({ x: element.x, y: element.y });
    useEffect(() => {
        const id = pan.addListener((val) => {
            panState.current = val;
        });
        return () => { pan.removeListener(id); };
    }, [pan]);

    // React to external position changes (e.g. undo/redo if added later)
    useEffect(() => {
        pan.setValue({ x: element.x, y: element.y });
        panState.current = { x: element.x, y: element.y };
    }, [element.x, element.y, pan]);

    // ONLY transform rotation and translation natively.
    const isText = element.type === 'text' || element.type === 'sign';
    const isSign = element.type === 'sign';
    const transformStyle = {
        transform: isSign ? [] : [
            { translateX: pan.x },
            { translateY: pan.y },
            { rotate: `${element.rotation}deg` }
        ]
    };

    const contentScale = element.scale;

    const handleStyle: any = {
        position: 'absolute',
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#007AFF',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100, // ensure above content
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 2,
    };

    const smallHandleStyle: any = {
        ...handleStyle,
        width: 26,
        height: 26,
        borderRadius: 13,
    };

    let calculatedFontSize = 300;
    if (isSign) {
        const lines = (element.content || ' ').split('\n');
        const longestLineLength = Math.max(...lines.map(l => l.length), 1);
        const totalLines = Math.max(lines.length, 1);

        // Approximate widths: a character is roughly 0.55x its font size in width.
        const maxFontSizeWidth = (X4_WIDTH_PX - 40) / (longestLineLength * 0.55);

        // Line height is roughly 1.2x font size.
        const maxFontSizeHeight = (X4_HEIGHT_PX - 40) / (totalLines * 1.2);

        calculatedFontSize = Math.max(MIN_SIGN_FONT_SIZE, Math.min(300, maxFontSizeWidth, maxFontSizeHeight));
    }

    return (
        <Animated.View
            {...panResponder.panHandlers}
            style={[
                styles.elementWrapper,
                transformStyle,
                { zIndex: element.zIndex, padding: isSign ? 20 : 15 },
                isSign && { width: '100%', height: '100%', top: 0, left: 0 },
            ]}
            onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        >
            <View style={[isSelected && styles.elementSelected, isLocked && isSelected && styles.elementLocked, isSign && { flex: 1, width: '100%', height: '100%' }]}>
                {isText ? (
                    isSign ? (
                        <View style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}>
                            <Text
                                style={[
                                    styles.elementText,
                                    {
                                        color: isInverted ? '#fff' : '#000',
                                        textAlign: 'center',
                                        textAlignVertical: 'center', // Android
                                        fontSize: calculatedFontSize,
                                        lineHeight: calculatedFontSize * 1.2,
                                        fontWeight: '700',
                                    }
                                ]}
                            >
                                {element.content || ' '}
                            </Text>
                        </View>
                    ) : (
                        <Text style={[styles.elementText, { color: isInverted ? '#fff' : '#000', fontSize: Math.max(MIN_TEXT_FONT_SIZE, 20 * contentScale), fontWeight: '700' }]}>
                            {element.content || ' '}
                        </Text>
                    )
                ) : (
                    <Image source={{ uri: element.content }} style={[styles.elementImage, { width: 150 * contentScale, height: 150 * contentScale }]} resizeMode="contain" />
                )}
            </View>

            {/* Persistent lock badge (visible even when deselected) */}
            {isLocked && !isSelected && (
                <View style={styles.lockBadge} pointerEvents="none">
                    <Text style={styles.lockBadgeText}>🔒</Text>
                </View>
            )}

            {isSelected && (
                <>
                    {/* Top-Right: Delete (X) — hidden when locked */}
                    {!isLocked && (
                        <TouchableOpacity
                            style={[handleStyle, { top: 0, right: 0 }]}
                            onPress={onDelete}
                            delayPressIn={0}
                            hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
                        >
                            <Text style={{ color: 'red', fontWeight: 'bold', fontSize: 16, lineHeight: 18 }}>✕</Text>
                        </TouchableOpacity>
                    )}

                    {/* Bottom-Right: Scale (↔) - Hidden for sign and locked */}
                    {!isSign && !isLocked && (
                        <View
                            style={[handleStyle, { bottom: 0, right: 0 }]}
                            {...scaleResponder.panHandlers}
                        >
                            <Text style={{ color: '#007AFF', fontSize: 18, transform: [{ rotate: '45deg' }], lineHeight: 20 }}>↔</Text>
                        </View>
                    )}

                    {/* Top-Left: Rotate (↻) - Hidden for sign and locked */}
                    {!isSign && !isLocked && (
                        <View
                            style={[handleStyle, { top: 0, left: 0 }]}
                            {...rotateResponder.panHandlers}
                        >
                            <Text style={{ color: '#007AFF', fontSize: 18, lineHeight: 20 }}>↻</Text>
                        </View>
                    )}

                    {/* Bottom-Left: Edit Text (✎) — always available for text */}
                    {isText && (
                        <TouchableOpacity
                            style={[handleStyle, { bottom: 0, left: 0 }]}
                            onPress={onEdit}
                            delayPressIn={0}
                            hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
                        >
                            <Text style={{ color: '#007AFF', fontSize: 18, lineHeight: 22 }}>✎</Text>
                        </TouchableOpacity>
                    )}

                    {/* Top-Center: Lock Toggle (🔒/🔓) */}
                    <TouchableOpacity
                        style={[handleStyle, styles.lockHandle]}
                        onPress={onToggleLock}
                        delayPressIn={0}
                        hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
                    >
                        <Text style={{ fontSize: 14, lineHeight: 16 }}>{isLocked ? '🔒' : '🔓'}</Text>
                    </TouchableOpacity>

                    {/* Right edge: Layer controls (▲ ▼) */}
                    <TouchableOpacity
                        style={[smallHandleStyle, styles.layerUpHandle]}
                        onPress={onBringForward}
                        delayPressIn={0}
                        hitSlop={{ top: 8, left: 8, right: 8, bottom: 4 }}
                    >
                        <Text style={{ color: '#007AFF', fontSize: 13, fontWeight: 'bold', lineHeight: 15 }}>▲</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[smallHandleStyle, styles.layerDownHandle]}
                        onPress={onSendBackward}
                        delayPressIn={0}
                        hitSlop={{ top: 4, left: 8, right: 8, bottom: 8 }}
                    >
                        <Text style={{ color: '#007AFF', fontSize: 13, fontWeight: 'bold', lineHeight: 15 }}>▼</Text>
                    </TouchableOpacity>
                </>
            )}
        </Animated.View>
    );
}

// ── Styles ────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1a1a2e',
    },
    header: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 12,
    },
    title: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
    },
    toolsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
    },
    toolsGroup: {
        flexDirection: 'row',
        gap: 8,
    },
    toolBtn: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        width: 36,
        height: 36,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
    },
    toolBtnActive: {
        backgroundColor: '#007AFF',
    },
    iconBtnText: {
        color: '#fff',
        fontSize: 18,
    },
    canvasArea: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    canvasBoundary: {
        width: '100%',
        maxHeight: '100%',
        backgroundColor: '#fff',
        borderRadius: 8,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#333',
    },
    successFloating: {
        position: 'absolute',
        top: 10,
        zIndex: 100,
        backgroundColor: 'rgba(74, 222, 128, 0.9)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    successText: {
        color: '#000',
        fontWeight: '700',
        fontSize: 12,
    },
    bottomActions: {
        flexDirection: 'row', // Horizontal layout
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 24, // Extra padding for home indicator
        backgroundColor: '#1a1a2e',
    },
    actionButtonHost: {
        flex: 1, // Allow buttons to share width equally
    },
    elementWrapper: {
        position: 'absolute',
        top: 0,
        left: 0,
    },
    elementSelected: {
        borderWidth: 1,
        borderColor: '#007AFF',
        borderStyle: 'dashed',
    },
    elementLocked: {
        borderColor: '#FF9500',
        borderStyle: 'solid',
    },
    lockBadge: {
        position: 'absolute',
        top: 2,
        left: '50%',
        marginLeft: -12,
        backgroundColor: 'rgba(255, 149, 0, 0.7)',
        borderRadius: 10,
        width: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    lockBadgeText: {
        fontSize: 12,
        lineHeight: 14,
    },
    lockHandle: {
        top: -15,
        alignSelf: 'center',
        left: '50%',
        marginLeft: -15,
        borderColor: '#FF9500',
    },
    layerUpHandle: {
        right: -13,
        top: '33%',
        marginTop: -13,
        borderColor: '#007AFF',
    },
    layerDownHandle: {
        right: -13,
        top: '66%',
        marginTop: -13,
        borderColor: '#007AFF',
    },
    elementText: {
        color: '#000',
        fontSize: 20,
        fontFamily: 'monospace', // Gives it that raw look
    },
    elementImage: {
        width: 150,
        height: 150,
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalBg: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.85)',
    },
    modalContent: {
        width: '100%',
        padding: 20,
        paddingBottom: 40,
        alignItems: 'center',
    },
    modalTextInput: {
        width: '100%',
        color: '#fff',
        fontSize: 24,
        fontFamily: 'monospace',
        textAlign: 'center',
        minHeight: 100,
    },
    modalDoneBtn: {
        marginTop: 20,
        backgroundColor: '#fff',
        paddingHorizontal: 24,
        paddingVertical: 10,
        borderRadius: 20,
    },
    modalDoneText: {
        color: '#000',
        fontWeight: '700',
        fontSize: 16,
    },
    optionsContainer: {
        backgroundColor: '#1a1a2e',
        paddingTop: 12,
    },
    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 8,
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
    infoIconWrapper: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    infoIconText: {
        color: '#a0a0b0',
        fontSize: 14,
        fontWeight: 'bold',
    },
    infoModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    infoModalContent: {
        backgroundColor: '#2d2d44',
        borderRadius: 16,
        padding: 24,
        width: '100%',
        maxWidth: 400,
    },
    infoModalTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 16,
    },
    infoModalText: {
        color: '#ccc',
        fontSize: 14,
        lineHeight: 22,
        marginBottom: 16,
    },
    infoModalCloseBtn: {
        backgroundColor: '#6c63ff',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 8,
    },
    infoModalCloseText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    },
});

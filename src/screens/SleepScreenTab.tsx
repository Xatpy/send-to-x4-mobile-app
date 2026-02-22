import React, { useState, useRef, useEffect } from 'react';
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
    SafeAreaView
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ViewShot from 'react-native-view-shot';
import * as ImagePicker from 'expo-image-picker';

import { useConnection } from '../contexts/ConnectionProvider';
import { ActionButton } from '../components/ActionButton';
import { processAndSendSleepScreen, processAndSaveSleepScreenLocally } from '../sleepScreen/sleepScreenService';
import * as Sharing from 'expo-sharing';
import { X4_WIDTH_PX, X4_HEIGHT_PX } from '../x4/deviceConfig';

export type CanvasElementType = 'text' | 'image';

export interface CanvasElement {
    id: string;
    type: CanvasElementType;
    content: string; // text string or image URI
    x: number;
    y: number;
    scale: number;
    rotation: number;
    zIndex: number;
}

export function SleepScreenTab() {
    const { settings, connectionStatus } = useConnection();
    const navigation = useNavigation<any>();
    const [elements, setElements] = useState<CanvasElement[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [editingTextId, setEditingTextId] = useState<string | null>(null);

    const [isSending, setIsSending] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const viewShotRef = useRef<ViewShot>(null);

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
        };
        setElements([...elements, newEl]);
        setSelectedId(newEl.id);
        setEditingTextId(newEl.id); // Immediately open edit modal
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
                const newEl: CanvasElement = {
                    id: Date.now().toString(),
                    type: 'image',
                    content: result.assets[0].uri,
                    x: 50,
                    y: 50,
                    scale: 1,
                    rotation: 0,
                    zIndex: elements.length,
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

    const removeElement = (id: string) => {
        setElements(prev => prev.filter(el => el.id !== id));
        if (selectedId === id) setSelectedId(null);
        if (editingTextId === id) setEditingTextId(null);
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
        if (elements.length === 0) {
            Alert.alert('Empty', 'Add some elements to the canvas first.');
            return;
        }
        if (!connectionStatus.connected) {
            Alert.alert('Not Connected', 'Connect to X4 WiFi to access device files.');
            return;
        }

        setIsSending(true);
        setSuccessMessage(null);

        try {
            const uri = await captureCanvas();
            if (!uri) throw new Error('Could not capture screen');

            const result = await processAndSendSleepScreen(uri, settings);
            if (result.success) {
                setSuccessMessage('Sent! Open it on X4 and set as Sleep Screen.');
            } else {
                throw new Error(result.error || 'Failed to send');
            }
        } catch (e) {
            Alert.alert('Send Failed', e instanceof Error ? e.message : String(e));
        } finally {
            setIsSending(false);
            // Hide success message after 3 seconds
            setTimeout(() => setSuccessMessage(null), 3000);
        }
    };

    const handleSave = async () => {
        if (elements.length === 0) return;
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
            if (el && el.type === 'text' && el.content.trim() === '') {
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
                <View style={styles.headerTools}>
                    <TouchableOpacity style={styles.toolBtn} onPress={handleAddText}>
                        <Text style={styles.toolBtnText}>+ Text</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.toolBtn} onPress={handleAddImage}>
                        <Text style={styles.toolBtnText}>+ Image</Text>
                    </TouchableOpacity>
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
                    <ViewShot ref={viewShotRef} style={{ flex: 1, backgroundColor: '#fff', overflow: 'hidden' }} options={{ format: 'png', quality: 1 }}>
                        {elements.map(el => (
                            <DraggableElement
                                key={el.id}
                                element={el}
                                isSelected={selectedId === el.id}
                                onSelect={() => setSelectedId(el.id)}
                                onDoubleTap={() => { if (el.type === 'text') setEditingTextId(el.id); }}
                                onDelete={() => removeElement(el.id)}
                                onEdit={() => { if (el.type === 'text') setEditingTextId(el.id); }}
                                onChange={(updates) => updateElement(el.id, updates)}
                            />
                        ))}
                    </ViewShot>
                </View>

            </View>

            {/* (Inline Toolbar Removed - Controls are now directly on the selected canvas element) */}

            {/* Fixed Bottom Actions (Side by Side) */}
            <View style={styles.bottomActions}>
                <View style={styles.actionButtonHost}>
                    <ActionButton
                        title="SAVE AS BMP"
                        onPress={handleSave}
                        loading={isSaving}
                        disabled={elements.length === 0 || isSending || isSaving}
                        variant="secondary"
                    />
                </View>
                <View style={{ width: 12 }} />
                <View style={styles.actionButtonHost}>
                    <ActionButton
                        title="SEND TO X4"
                        onPress={handleSend}
                        loading={isSending}
                        disabled={elements.length === 0 || isSending || isSaving}
                        variant="primary"
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
        </SafeAreaView>
    );
}

// ── Draggable Element Component ────────────────────────────────

interface DraggableElementProps {
    element: CanvasElement;
    isSelected: boolean;
    onSelect: () => void;
    onDoubleTap: () => void;
    onDelete: () => void;
    onEdit: () => void;
    onChange: (updates: Partial<CanvasElement>) => void;
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

function DraggableElement({ element, isSelected, onSelect, onDoubleTap, onDelete, onEdit, onChange }: DraggableElementProps) {
    const pan = useRef(new Animated.ValueXY({ x: element.x, y: element.y })).current;
    const lastTap = useRef(0);

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
            onMoveShouldSetPanResponder: () => true,
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
                            scale: Math.max(0.2, Math.min(10, initialScale.current * scaleFactor)),
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
                    onChange(panState.current);

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

            latest.current.onChange({ scale: Math.max(0.2, Math.min(10, newScale)) });
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
    const transformStyle = {
        transform: [
            { translateX: pan.x },
            { translateY: pan.y },
            { rotate: `${element.rotation}deg` }
        ]
    };

    const isText = element.type === 'text';
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

    return (
        <Animated.View
            {...panResponder.panHandlers}
            style={[styles.elementWrapper, transformStyle, { zIndex: element.zIndex, padding: 15 }]}
            onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        >
            <View style={[isSelected && styles.elementSelected]}>
                {isText ? (
                    <Text style={[styles.elementText, { fontSize: Math.max(12, 20 * contentScale) }]}>{element.content || ' '}</Text>
                ) : (
                    <Image source={{ uri: element.content }} style={[styles.elementImage, { width: 150 * contentScale, height: 150 * contentScale }]} resizeMode="contain" />
                )}
            </View>

            {isSelected && (
                <>
                    {/* Top-Right: Delete (X) */}
                    <TouchableOpacity
                        style={[handleStyle, { top: 0, right: 0 }]}
                        onPress={onDelete}
                        delayPressIn={0}
                        hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
                    >
                        <Text style={{ color: 'red', fontWeight: 'bold', fontSize: 16, lineHeight: 18 }}>✕</Text>
                    </TouchableOpacity>

                    {/* Bottom-Right: Scale (↔) */}
                    <View
                        style={[handleStyle, { bottom: 0, right: 0 }]}
                        {...scaleResponder.panHandlers}
                    >
                        <Text style={{ color: '#007AFF', fontSize: 18, transform: [{ rotate: '45deg' }], lineHeight: 20 }}>↔</Text>
                    </View>

                    {/* Top-Left: Rotate (↻) */}
                    <View
                        style={[handleStyle, { top: 0, left: 0 }]}
                        {...rotateResponder.panHandlers}
                    >
                        <Text style={{ color: '#007AFF', fontSize: 18, lineHeight: 20 }}>↻</Text>
                    </View>

                    {/* Bottom-Left: Edit Text (✎) */}
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
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
    },
    headerTools: {
        flexDirection: 'row',
        gap: 10,
    },
    toolBtn: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    toolBtnText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 13,
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
});

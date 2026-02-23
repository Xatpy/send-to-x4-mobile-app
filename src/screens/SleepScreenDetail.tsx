import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ActivityIndicator, Alert, PanResponder } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WallpaperItem, downloadWallpaperBmp, fetchRandomWallpaperJSON } from '../services/lowioWallpapers';
import { useConnection } from '../contexts/ConnectionProvider';
import { uploadScreensaverToCrossPoint } from '../services/crosspoint_upload';
import { getCurrentIp } from '../services/settings';
import { addRecentWallpaper } from '../services/wallpaper_storage';
import { savePreviewMapping } from '../services/preview_cache';

// Floating Circular Icon Button
function FloatingIconButton({ icon, active, onPress, position }: { icon: string, active: boolean, onPress: () => void, position: 'left' | 'right' }) {
    return (
        <TouchableOpacity
            style={[styles.floatingButton, position === 'left' ? { left: 12 } : { right: 12 }, active && styles.floatingButtonActive]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <Text style={[styles.floatingIconText, active && styles.floatingIconTextActive]}>{icon}</Text>
        </TouchableOpacity>
    );
}

export function SleepScreenDetail({ navigation, route }: any) {
    const insets = useSafeAreaInsets();
    const { item: initialItem, isRandom, items, initialIndex } = route.params as {
        item: WallpaperItem;
        isRandom: boolean;
        items?: WallpaperItem[];
        initialIndex?: number;
    };

    const [currentIndex, setCurrentIndex] = useState(initialIndex || 0);
    const [currentItem, setCurrentItem] = useState<WallpaperItem>(initialItem);
    const [imageLoading, setImageLoading] = useState(false);

    const [invert, setInvert] = useState(false);
    const [dither, setDither] = useState(false);

    const [sending, setSending] = useState(false);
    const { connectionStatus, settings } = useConnection();

    // Swipe logic
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (evt, gestureState) => {
                // Only capture horizontal swipes longer than 30px
                return Math.abs(gestureState.dx) > 30 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
            },
            onPanResponderRelease: (evt, gestureState) => {
                const swipeThreshold = 50;
                if (gestureState.dx > swipeThreshold) {
                    handleSwipe('right');
                } else if (gestureState.dx < -swipeThreshold) {
                    handleSwipe('left');
                }
            },
        })
    ).current;

    const handleSwipe = (direction: 'left' | 'right') => {
        if (imageLoading) return;

        if (isRandom) {
            // For random, any swipe direction generates a new random wallpaper
            handleNextRandom();
        } else if (items && items.length > 0) {
            // For gallery, navigate through the array
            let nextIndex = currentIndex;
            if (direction === 'left') {
                nextIndex = Math.min(currentIndex + 1, items.length - 1);
            } else {
                nextIndex = Math.max(currentIndex - 1, 0);
            }

            if (nextIndex !== currentIndex) {
                setCurrentIndex(nextIndex);
                setCurrentItem(items[nextIndex]);
            }
        }
    };

    const handleSend = async () => {
        if (!connectionStatus.connected || !settings) {
            Alert.alert('Not Connected', 'Please connect to your X4 device first.');
            return;
        }

        if (settings.firmwareType !== 'crosspoint') {
            Alert.alert('Unsupported Firmware', 'Currently, pushing wallpapers is only supported on CrossPoint firmware in this app version.');
            return;
        }

        try {
            setSending(true);
            const ip = getCurrentIp(settings);

            // 1. Download BMP bytes from Lowio
            let finalOutputUrl = currentItem.bmpUrl;
            if (invert || dither) {
                const params = new URLSearchParams();
                if (invert) params.append('invert', 'true');
                if (dither) params.append('dither', 'true');
                const sep = finalOutputUrl.includes('?') ? '&' : '?';
                finalOutputUrl = `${finalOutputUrl}${sep}${params.toString()}`;
            }

            const bmpBytes = await downloadWallpaperBmp(finalOutputUrl);

            // 2. Upload to X4
            const safeHash = currentItem.hash.replace(/[^a-zA-Z0-9]/g, '_');
            const filename = `lowio_${safeHash}_${Date.now()}.bmp`;
            const result = await uploadScreensaverToCrossPoint(ip, bmpBytes, filename);

            if (result.success) {
                // 3. Save to recent storage & preview cache
                await addRecentWallpaper(currentItem);
                await savePreviewMapping(filename, currentItem.webpUrl);

                Alert.alert('Success', 'Wallpaper sent to X4!', [
                    { text: 'OK', onPress: () => navigation.goBack() }
                ]);
            } else {
                Alert.alert('Upload Failed', result.error || 'Unknown error occurred');
            }
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to download or send wallpaper');
        } finally {
            setSending(false);
        }
    };

    const handleNextRandom = async () => {
        if (imageLoading) return;
        setImageLoading(true);
        try {
            const nextItem = await fetchRandomWallpaperJSON();
            setCurrentItem(nextItem);
        } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to fetch next random wallpaper');
        } finally {
            setImageLoading(false);
        }
    };

    const displayTitle = currentItem.title || "Curated Wallpaper";
    const displayAuthor = currentItem.author || "Community Gallery";

    return (
        <View style={[styles.container, { paddingBottom: insets.bottom || 16 }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
                    <Text style={styles.crossText}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Preview</Text>
                <View style={styles.placeholder} />
            </View>

            <View style={styles.content}>
                {/* Image Container taking maximum available space */}
                <View
                    style={[styles.imageContainer, imageLoading && styles.imageContainerLoading]}
                    {...panResponder.panHandlers}
                >
                    <Image
                        source={{ uri: currentItem.webpUrl }}
                        style={styles.image}
                        resizeMode="contain"
                    />

                    {/* Filters overlays */}
                    {dither && !imageLoading && <View style={styles.ditherOverlay} />}
                    {invert && !imageLoading && <View style={styles.invertOverlay} />}

                    {/* Floating Controls Overlay */}
                    <FloatingIconButton
                        icon="◑"
                        active={invert}
                        onPress={() => setInvert(!invert)}
                        position="left"
                    />
                    <FloatingIconButton
                        icon="▒"
                        active={dither}
                        onPress={() => setDither(!dither)}
                        position="right"
                    />

                    {imageLoading && (
                        <View style={styles.loadingOverlay}>
                            <ActivityIndicator size="large" color="#6c63ff" />
                        </View>
                    )}
                </View>

                {/* Unified Metadata Block */}
                <View style={styles.metadataContainer}>
                    <Text style={styles.metadataTitle} numberOfLines={1}>{displayTitle}</Text>
                    <View style={styles.metadataSubRow}>
                        <Text style={styles.metadataAuthor}>by {displayAuthor}</Text>

                        {(currentItem.category || currentItem.download_count !== undefined) && (
                            <View style={styles.metadataDivider} />
                        )}

                        {currentItem.category && (
                            <Text style={styles.categoryText}>{currentItem.category}</Text>
                        )}

                        {currentItem.download_count !== undefined && (
                            <>
                                {currentItem.category && <Text style={styles.metadataDot}>•</Text>}
                                <Text style={styles.downloadText}>↓ {currentItem.download_count}</Text>
                            </>
                        )}
                    </View>
                </View>

                {/* Actions Bottom Row */}
                <View style={styles.actionsRow}>
                    {isRandom && (
                        <TouchableOpacity
                            style={styles.nextRandomButton}
                            onPress={handleNextRandom}
                            disabled={imageLoading}
                        >
                            <Text style={styles.nextRandomText}>Next ⟳</Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        style={[
                            styles.sendButton,
                            (!connectionStatus.connected || sending) && styles.sendButtonDisabled,
                            isRandom && styles.sendButtonFlex
                        ]}
                        onPress={handleSend}
                        disabled={!connectionStatus.connected || sending}
                    >
                        {sending ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <Text style={styles.sendButtonText}>
                                {connectionStatus.connected ? 'Send to X4' : 'Connect to Send'}
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>

                <Text style={styles.attributionText}>
                    Powered by {isRandom ? 'readme.club/dev' : 'x4epapers.lowio.xyz'}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1a1a2e',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#2d2d44',
    },
    backButton: {
        padding: 4,
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    crossText: {
        color: '#8b8b9f',
        fontSize: 24,
        lineHeight: 28,
        fontWeight: '300',
    },
    title: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
    placeholder: {
        width: 60,
    },
    content: {
        flex: 1,
        padding: 16,
        justifyContent: 'space-between',
    },
    imageContainer: {
        flex: 1,
        width: '100%',
        backgroundColor: '#0a0a1a',
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#2d2d44',
        marginBottom: 20,
        position: 'relative',
    },
    imageContainerLoading: {
        opacity: 0.7,
    },
    image: {
        width: '100%',
        height: '100%',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(10,10,26,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    ditherOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.15)',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.1)',
        borderStyle: 'dashed',
    },
    invertOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'white',
        mixBlendMode: 'difference',
    },
    floatingButton: {
        position: 'absolute',
        bottom: 12,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(26, 26, 46, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    floatingButtonActive: {
        backgroundColor: '#6c63ff',
        borderColor: '#8b85ff',
    },
    floatingIconText: {
        color: 'white',
        fontSize: 20,
        lineHeight: 24,
    },
    floatingIconTextActive: {
        color: 'white',
    },
    metadataContainer: {
        alignItems: 'center',
        marginBottom: 24,
        paddingHorizontal: 12,
    },
    metadataTitle: {
        color: 'white',
        fontSize: 20,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 6,
    },
    metadataSubRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: 8,
    },
    metadataAuthor: {
        color: '#8b8b9f',
        fontSize: 14,
    },
    metadataDivider: {
        width: 1,
        height: 12,
        backgroundColor: '#4a4a68',
    },
    metadataDot: {
        color: '#4a4a68',
        fontSize: 14,
    },
    categoryText: {
        color: '#ccc',
        fontSize: 13,
        textTransform: 'capitalize',
        fontWeight: '500',
    },
    downloadText: {
        color: '#6c63ff',
        fontSize: 13,
        fontWeight: '600',
    },
    actionsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    nextRandomButton: {
        flex: 1,
        backgroundColor: '#2d2d44',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#6c63ff40',
    },
    nextRandomText: {
        color: '#6c63ff',
        fontSize: 16,
        fontWeight: '600',
    },
    sendButton: {
        flex: 1,
        backgroundColor: '#6c63ff',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendButtonFlex: {
        flex: 2, // Take up more space than the Random button when side-by-side
    },
    sendButtonDisabled: {
        backgroundColor: '#2d2d44',
    },
    sendButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    attributionText: {
        color: '#4a4a68',
        fontSize: 11,
        textAlign: 'center',
    }
});

import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    ActivityIndicator, Image, Dimensions, Platform, RefreshControl
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchWallpapersPage, WallpaperItem, fetchRandomWallpaperJSON } from '../services/lowioWallpapers';

// Basic usage of Dimensions to adjust grid items
const { width } = Dimensions.get('window');
const isTablet = width > 768;
const NUM_COLUMNS = isTablet ? 4 : 3;
const ITEM_MARGIN = 2;
const ITEM_WIDTH = (width - (NUM_COLUMNS + 1) * ITEM_MARGIN) / NUM_COLUMNS;

export function SleepScreensScreen({ navigation }: any) {
    const insets = useSafeAreaInsets();

    const [items, setItems] = useState<WallpaperItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [randomLoading, setRandomLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const offsetRef = React.useRef(0);
    const isFetchingRef = React.useRef(false);

    const loadWallpapers = useCallback(async (isInitial = false) => {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;

        if (isInitial) {
            setLoading(true);
            setError(null);
            setHasMore(true);
            offsetRef.current = 0;
        } else {
            setLoadingMore(true);
        }

        try {
            const currentOffset = offsetRef.current;
            const newItems = await fetchWallpapersPage(currentOffset);

            if (newItems.length === 0) {
                setHasMore(false);
                if (isInitial) setItems([]);
            } else {
                setItems(prev => isInitial ? newItems : [...prev, ...newItems]);
                offsetRef.current = currentOffset + 33; // increment by 33 as requested
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load wallpapers');
        } finally {
            setLoading(false);
            setLoadingMore(false);
            isFetchingRef.current = false;
        }
    }, []);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadWallpapers(true);
        setRefreshing(false);
    }, [loadWallpapers]);

    useEffect(() => {
        loadWallpapers(true);
    }, []);

    const handleRandom = async () => {
        if (randomLoading) return;
        setRandomLoading(true);
        try {
            const randomItem = await fetchRandomWallpaperJSON();
            navigation.navigate('SleepScreenDetail', {
                item: randomItem,
                isRandom: true
            });
        } catch (err: any) {
            alert(err.message || 'Failed to fetch random wallpaper');
        } finally {
            setRandomLoading(false);
        }
    };

    const handlePress = (item: WallpaperItem, index: number) => {
        navigation.navigate('SleepScreenDetail', { item, isRandom: false, items, initialIndex: index });
    };

    const renderItem = ({ item, index }: { item: WallpaperItem, index: number }) => (
        <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => handlePress(item, index)}
            style={styles.gridItemContainer}
        >
            <Image
                source={{ uri: item.webpUrl }}
                style={styles.gridImage}
                resizeMode="cover"
            />
        </TouchableOpacity>
    );

    const renderFooter = () => {
        if (loadingMore) return <ActivityIndicator style={{ padding: 20 }} color="#6c63ff" />;
        return <View style={{ height: insets.bottom + 20 }} />;
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.titleContainer}>
                    <Text style={styles.title}>x4ePapers</Text>
                    <Text style={styles.subtitle}>Browse from lowio.xyz & readme.club/api</Text>
                </View>
                <TouchableOpacity
                    style={[styles.randomButton, randomLoading && styles.randomButtonDisabled]}
                    onPress={handleRandom}
                    disabled={randomLoading}
                >
                    {randomLoading ? (
                        <ActivityIndicator color="white" size="small" />
                    ) : (
                        <Text style={styles.randomButtonText}>Random</Text>
                    )}
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#6c63ff" />
                </View>
            ) : error ? (
                <View style={styles.center}>
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity style={styles.retryButton} onPress={() => loadWallpapers(true)}>
                        <Text style={styles.retryText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={(item, index) => `${item.hash}-${index}`}
                    renderItem={renderItem}
                    numColumns={NUM_COLUMNS}
                    contentContainerStyle={styles.gridContent}
                    onEndReached={() => {
                        if (hasMore && !loadingMore && !loading) {
                            loadWallpapers();
                        }
                    }}
                    onEndReachedThreshold={0.5}
                    ListFooterComponent={renderFooter}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor="#ffffff"
                            colors={['#6c63ff']}
                            title="Pulling latest wallpapers..."
                            titleColor="#ffffff"
                        />
                    }
                />
            )}
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
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#2d2d44',
    },
    titleContainer: {
        flex: 1,
        paddingRight: 16,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: 'white',
    },
    subtitle: {
        fontSize: 14,
        color: '#8b8b9f',
        marginTop: 4,
    },
    randomButton: {
        backgroundColor: '#6c63ff',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 16,
    },
    randomButtonDisabled: {
        opacity: 0.7,
    },
    randomButtonText: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
    },
    gridContent: {
        padding: ITEM_MARGIN,
    },
    gridItemContainer: {
        width: ITEM_WIDTH,
        height: ITEM_WIDTH * 1.5,
        margin: ITEM_MARGIN,
        backgroundColor: '#2d2d44',
        borderRadius: 4,
        overflow: 'hidden',
    },
    gridImage: {
        width: '100%',
        height: '100%',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    errorText: {
        color: '#ff6b6b',
        textAlign: 'center',
        marginBottom: 16,
        lineHeight: 20,
    },
    retryButton: {
        backgroundColor: '#2d2d44',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
    },
    retryText: {
        color: 'white',
        fontWeight: 'bold',
    },
});

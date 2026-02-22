import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Text, Alert } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useShareIntent } from 'expo-share-intent';

import { ConnectionProvider, useConnection } from './src/contexts/ConnectionProvider';
import { ConnectionBanner } from './src/components/ConnectionBanner';
import { ArticlesScreen } from './src/screens/ArticlesScreen';
import { ScreensaversScreen } from './src/screens/ScreensaversScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { DeviceScreen } from './src/screens/DeviceScreen';
import { NotesScreen } from './src/screens/NotesScreen';
import { SleepScreenTab } from './src/screens/SleepScreenTab';
import { isValidUrl } from './src/utils/sanitizer';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={{
      fontSize: 20,
      opacity: focused ? 1 : 0.4,
    }}>
      {label}
    </Text>
  );
}

function MainTabs({ sharedUrl, setSharedUrl, sharedImage, setSharedImage }: any) {
  const { connectionStatus } = useConnection();

  return (
    <>
      <ConnectionBanner />
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#12122a',
            borderTopColor: '#2d2d44',
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: '#6c63ff',
          tabBarInactiveTintColor: '#666',
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
          },
        }}
      >
        <Tab.Screen
          name="Articles"
          options={{
            tabBarIcon: ({ focused }) => <TabIcon label="📄" focused={focused} />,
            title: 'Articles',
          }}
        >
          {() => (
            <ArticlesScreen
              sharedUrl={sharedUrl}
              onSharedUrlConsumed={() => setSharedUrl(null)}
            />
          )}
        </Tab.Screen>

        <Tab.Screen
          name="Notes"
          component={NotesScreen}
          options={{
            tabBarIcon: ({ focused }) => <TabIcon label="📝" focused={focused} />,
          }}
        />

        <Tab.Screen
          name="Images"
          options={{
            tabBarIcon: ({ focused }) => <TabIcon label="🖼️" focused={focused} />,
          }}
        >
          {() => (
            <ScreensaversScreen
              sharedImage={sharedImage}
              onSharedImageConsumed={() => setSharedImage(null)}
            />
          )}
        </Tab.Screen>

        <Tab.Screen
          name="Design Your Sleep Screen"
          component={SleepScreenTab}
          options={{
            tabBarIcon: ({ focused }) => <TabIcon label="🌙" focused={focused} />,
            tabBarLabelStyle: { fontSize: 9, fontWeight: '600' }
          }}
        />

        <Tab.Screen
          name="Device"
          component={DeviceScreen}
          listeners={{
            tabPress: (e) => {
              if (!connectionStatus.connected) {
                e.preventDefault();
                Alert.alert('Not Connected', 'Connect to X4 WiFi to access device files.');
              }
            },
          }}
          options={{
            tabBarIcon: ({ focused }) => (
              <View style={{ opacity: connectionStatus.connected ? 1 : 0.4 }}>
                <TabIcon label="📱" focused={focused} />
              </View>
            ),
          }}
        />
      </Tab.Navigator>
    </>
  );
}

function AppContent() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  const navigationRef = useRef<any>(null);

  // Share intent state — passed to the appropriate tab
  const [sharedUrl, setSharedUrl] = useState<string | null>(null);
  const [sharedImage, setSharedImage] = useState<{
    uri: string;
    filename: string;
    width?: number;
    height?: number;
  } | null>(null);

  // Handle incoming share intents
  useEffect(() => {
    if (!hasShareIntent) return;

    // Handle shared images
    if ((shareIntent.type === 'media' || shareIntent.type === 'file') && shareIntent.files && shareIntent.files.length > 0) {
      const file = shareIntent.files[0];
      const originalName = file.fileName || `shared_${Date.now()}`;
      const baseName = originalName.replace(/\.[^.]+$/, '');

      setSharedImage({
        uri: file.path,
        filename: `${baseName}.bmp`,
        width: file.width ?? undefined,
        height: file.height ?? undefined,
      });

      // Navigate to Images tab
      setTimeout(() => {
        navigationRef.current?.navigate('MainTabs', { screen: 'Images' });
      }, 100);

      resetShareIntent();
      return;
    }

    // Handle shared URLs
    if (shareIntent.type === 'text' || shareIntent.type === 'weburl') {
      const sharedValue = shareIntent.type === 'weburl'
        ? shareIntent.webUrl
        : shareIntent.text;

      if (sharedValue && isValidUrl(sharedValue.trim())) {
        setSharedUrl(sharedValue.trim());

        // Navigate to Articles tab
        setTimeout(() => {
          navigationRef.current?.navigate('MainTabs', { screen: 'Articles' });
        }, 100);
      }

      resetShareIntent();
    }
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  return (
    <NavigationContainer ref={navigationRef}>
      <SafeAreaView style={styles.root} edges={['top']}>
        <Stack.Navigator screenOptions={{ headerShown: false, presentation: 'modal' }}>
          <Stack.Screen name="MainTabs">
            {(props) => (
              <MainTabs
                {...props}
                sharedUrl={sharedUrl}
                setSharedUrl={setSharedUrl}
                sharedImage={sharedImage}
                setSharedImage={setSharedImage}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="Settings" component={SettingsScreen} />
        </Stack.Navigator>
      </SafeAreaView>
    </NavigationContainer>
  );
}

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        console.warn(e);
      } finally {
        setAppIsReady(true);
      }
    }
    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return null;
  }

  return (
    <SafeAreaProvider onLayout={onLayoutRootView}>
      <StatusBar style="light" />
      <ConnectionProvider>
        <AppContent />
      </ConnectionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
});

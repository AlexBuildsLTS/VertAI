/**
 * app/_layout.tsx
 * ══════════════════════════════════════════════════════════════════════════════
 * Root routing, global provider wrapper, and Splash Handoff
 */
import '../lib/polyfill';
import 'react-native-gesture-handler';
import '../global.css';

import React, { useEffect, useState, useRef } from 'react';
import { View, Animated, StyleSheet, Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useColorScheme } from 'nativewind';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '../store/useAuthStore';
import { ThemeProvider, DarkTheme } from '@react-navigation/native';
import { ProcessingLoader } from '../components/ui/ProcessingLoader';

// 1. Freezes the static image
SplashScreen.preventAutoHideAsync().catch(() => {});

const NeonDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#020205',
    card: '#05050A',
    border: 'rgba(255, 255, 255, 0.1)',
    text: '#FFFFFF',
  },
};

export default function RootLayout() {
  const { setColorScheme } = useColorScheme();

  // Auth & Routing State
  const { initialize, isLoading, session } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  // Track if we've done the initial route to prevent interrupting local animations
  const initialRouteExecuted = useRef(false);

  // Query Client
  const [queryClient] = useState(() => new QueryClient());

  // Splash State - Auto-finish if on Web!
  const [splashFinished, setSplashFinished] = useState(Platform.OS === 'web');
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // 2. Theme & Auth Initialization
  useEffect(() => {
    setColorScheme('dark');
  }, [setColorScheme]);

  useEffect(() => {
    const cleanup = initialize();
    return cleanup;
  }, [initialize]);

  // 3. ROUTING LOGIC SINGLE SOURCE OF TRUTH
  useEffect(() => {
    if (isLoading) return;

    SplashScreen.hideAsync().catch(() => {});

    const inAuthGroup = segments[0] === '(auth)';

    if (!initialRouteExecuted.current) {
      if (session && inAuthGroup) {
        router.replace('/(dashboard)');
      } else if (!session && !inAuthGroup) {
        router.replace('/(auth)/sign-in');
      }
      initialRouteExecuted.current = true;
    } else {
      if (!session && !inAuthGroup) {
        router.replace('/(auth)/sign-in');
      }
    }
  }, [session, isLoading, segments, router]);

  // Trigger the fade out of the SVG
  useEffect(() => {
    if (Platform.OS === 'web') {
      setSplashFinished(true);
      return;
    }

    if (!isLoading) {
      setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          setSplashFinished(true);
        });
      }, 1500);
    }
  }, [isLoading]);

  if (isLoading && Platform.OS === 'web') {
    return <View style={{ flex: 1, backgroundColor: '#020205' }} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={NeonDarkTheme}>
        <StatusBar style="light" />

        <View style={{ flex: 1, backgroundColor: '#020205' }}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#020205' },
              // CRITICAL UX FIX: 'slide_from_right' prevents the black opacity blink
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(dashboard)" />
          </Stack>

          {Platform.OS !== 'web' && !splashFinished && (
            <Animated.View
              style={[styles.splashOverlay, { opacity: fadeAnim }]}
              pointerEvents="none"
            >
              <ProcessingLoader size={120} color="#00F0FF" />
            </Animated.View>
          )}
        </View>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#020205',
    zIndex: 99999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import 'react-native-gesture-handler';
import '../global.css';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../store/useAuthStore';
import { View, ActivityIndicator } from 'react-native';
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '../lib/supabase/client';

const queryClient = new QueryClient();

export default function RootLayout() {
  const { initialize, isLoading, session } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  // 1. Primary Initialization
  useEffect(() => {
    initialize();
  }, [initialize]);

  // 2. The Loop Breaker: Global Auth Listener
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      const inAuthGroup = segments[0] === '(auth)';

      if (newSession && inAuthGroup) {
        // Force immediate pivot to dashboard
        router.replace('/(dashboard)');
      } else if (!newSession && !inAuthGroup) {
        router.replace('/(auth)/sign-in');
      }
    });

    return () => subscription.unsubscribe();
  }, [segments]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-[#05050A] items-center justify-center">
        <ActivityIndicator size="large" color="#00F0FF" />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#05050A' },
        }}
      >
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(dashboard)" options={{ animation: 'fade' }} />
      </Stack>
    </QueryClientProvider>
  );
}

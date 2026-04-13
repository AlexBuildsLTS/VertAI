/**
 * app/(auth)/_layout.tsx
 * VeraxAI - Authentication
 * ----------------------------------------------------------------------------
 * gracefully slide the Dashboard over this screen.
 * ----------------------------------------------------------------------------
 */

import { Stack } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { useAuthStore } from '../../store/useAuthStore';

export default function AuthLayout() {
  const { isLoading } = useAuthStore();

  // Prevent mounting the auth stack if global state is still hydrating
  if (isLoading) {
    return (
      <View className="flex-1 bg-[#000012] items-center justify-center">
        <View className="w-12 h-12 border-4 border-[#00F0FF]/20 border-t-[#00F0FF] rounded-full animate-spin" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#000012]">
      <Stack
        screenOptions={{
          headerShown: false,
          // FIX: Solid background prevents bleed-through
          contentStyle: { backgroundColor: '#000012' },
          // FIX: 'none' delegates the transition entirely to the Root Layout (app/_layout.tsx)
          // This stops the double-animation race condition that causes the black flash.
          animation: 'none',
        }}
      >
        <Stack.Screen name="sign-in" />
        <Stack.Screen
          name="forgot-password"
          options={{
            // If you have a forgot password screen, it can still slide in locally
            animation: 'slide_from_right',
          }}
        />
      </Stack>
    </View>
  );
}

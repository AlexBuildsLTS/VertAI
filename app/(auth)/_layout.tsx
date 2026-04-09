/**
 * app/(auth)/_layout.tsx
 * Unified Auth routing layer
 */
import { Stack } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

export default function AuthLayout() {
  return (
    <View className="flex-1 bg-[#00294b]">
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
          animation: 'fade', //
        }}
      >
        <Stack.Screen name="sign-in" />
      </Stack>
    </View>
  );
}

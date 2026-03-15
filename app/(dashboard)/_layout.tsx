import { Stack } from 'expo-router';
import { AdaptiveLayout } from '../../components/layout/AdaptiveLayout';

export default function DashboardLayout() {
  return (
    <AdaptiveLayout>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
          animation: 'fade_from_bottom',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="video/[id]" />
        <Stack.Screen name="history" />
        {/* Properly maps the new settings directory/stack */}
        <Stack.Screen name="settings" options={{ headerShown: false }} />
      </Stack>
    </AdaptiveLayout>
  );
}

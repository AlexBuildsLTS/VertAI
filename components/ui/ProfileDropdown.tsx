import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { FadeIn } from '../animations/FadeIn';
import { useAuthStore } from '../../store/useAuthStore';

// Extracts initials from the user's full name for the avatar fallback
const getInitials = (name?: string) => {
  if (!name) return 'U';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
};

export const ProfileDropdown = () => {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  // Pulling live auth data and the signOut method
  const { user, signOut } = useAuthStore();
  const fullName = user?.user_metadata?.full_name || 'System Operator';
  const email = user?.email || 'unregistered@node.local';

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/sign-in');
  };

  return (
    <View className="relative items-end z-[999]">
      {/* Dynamic Avatar Button */}
      <TouchableOpacity
        onPress={() => setIsOpen(!isOpen)}
        className="w-12 h-12 rounded-full border border-neon-cyan/40 items-center justify-center bg-black/40 shadow-[0_0_15px_rgba(0,240,255,0.2)] overflow-hidden"
      >
        {user?.user_metadata?.avatar_url ? (
          <Image
            source={{ uri: user.user_metadata.avatar_url }}
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          <Text className="font-mono text-lg font-black text-neon-cyan">
            {getInitials(fullName)}
          </Text>
        )}
      </TouchableOpacity>

      {/* Glassmorphism Dropdown Menu */}
      {isOpen && (
        <FadeIn className="absolute top-16 right-0 w-64">
          <View className="rounded-3xl border border-white/10 overflow-hidden shadow-2xl bg-black/60 backdrop-blur-xl">
            <BlurView intensity={40} tint="dark" className="p-5">
              {/* User Identity Info */}
              <View className="pb-4 mb-4 border-b border-white/5">
                <Text
                  className="text-sm font-black tracking-widest text-white uppercase"
                  numberOfLines={1}
                >
                  {fullName}
                </Text>
                <Text
                  className="text-white/40 text-[10px] font-mono mt-1"
                  numberOfLines={1}
                >
                  {email}
                </Text>
              </View>

              {/* Navigation Node */}
              <TouchableOpacity
                onPress={() => {
                  router.push('/settings');
                  setIsOpen(false);
                }}
                className="py-3 items-center border border-white/5 rounded-xl bg-white/[0.02] mb-4"
              >
                <Text className="text-white/60 text-[10px] font-bold uppercase tracking-widest">
                  ⚙ Parameters
                </Text>
              </TouchableOpacity>

              {/* Termination Node */}
              <TouchableOpacity
                onPress={handleSignOut}
                className="py-4 border bg-neon-pink/10 rounded-xl border-neon-pink/20"
              >
                <Text className="text-neon-pink text-[9px] font-black uppercase tracking-[3px] text-center">
                  Terminate Session
                </Text>
              </TouchableOpacity>
            </BlurView>
          </View>
        </FadeIn>
      )}
    </View>
  );
};

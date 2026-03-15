import React, { useState, memo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  StyleSheet,
  Image,
  Dimensions,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuthStore } from '../../store/useAuthStore';
import {
  Mail,
  Lock,
  User,
  Github,
  Twitter,
  Youtube,
  CheckCircle2,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  withDelay,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/Button';

const APP_ICON = require('../../assets/icon.png');

const NeuralOrb = ({ delay = 0, color = '#00F0FF' }) => {
  const pulse = useSharedValue(0);
  const { width, height } = Dimensions.get('window');

  useEffect(() => {
    pulse.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 8000 }), -1, true),
    );
  }, [delay, pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(pulse.value, [0, 1], [1, 1.6]) },
      { translateX: interpolate(pulse.value, [0, 1], [0, width * 0.05]) },
      { translateY: interpolate(pulse.value, [0, 1], [0, height * 0.05]) },
    ],
    opacity: interpolate(pulse.value, [0, 1], [0.03, 0.09]),
  }));

  return (
    <Animated.View
      style={[
        animatedStyle,
        {
          position: 'absolute',
          width: 600,
          height: 600,
          backgroundColor: color,
          borderRadius: 300,
          ...(Platform.OS === 'web' ? { filter: 'blur(120px)' } : {}),
        },
      ]}
    />
  );
};

export default function SignUpScreen() {
  const { signUp } = useAuthStore();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);

  const handleRegister = useCallback(async () => {
    if (!email || !password || !fullName) {
      return setMessage({
        type: 'error',
        text: 'All node parameters required.',
      });
    }
    if (password.length < 8) {
      return setMessage({
        type: 'error',
        text: 'Key must exceed 8 characters.',
      });
    }

    setLoading(true);
    setMessage(null);

    const { error } = await signUp(email.trim(), password, fullName.trim());

    if (error) {
      setMessage({ type: 'error', text: error });
    } else {
      setMessage({
        type: 'success',
        text: 'Initialization complete. Verify email.',
      });
    }
    setLoading(false);
  }, [email, password, fullName, signUp]);

  return (
    <View className="flex-1 bg-[#020205]">
      <View className="absolute inset-0 overflow-hidden" pointerEvents="none">
        <NeuralOrb delay={0} color="#00F0FF" />
        <NeuralOrb delay={2500} color="#8A2BE2" />
      </View>

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            style={styles.mobileScroll}
            contentContainerStyle={styles.mobileScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View className="w-full self-center max-w-md mt-10 md:mt-20 px-6">
              <BrandHeader />
              <RegisterFormContent
                fullName={fullName}
                setFullName={setFullName}
                email={email}
                setEmail={setEmail}
                password={password}
                setPassword={setPassword}
                loading={loading}
                onRegister={handleRegister}
                message={message}
              />
            </View>

            <View className="flex-row items-center justify-center gap-8 mt-20 opacity-40">
              <Youtube color="#FFFFFF" size={24} />
              <Twitter color="#FFFFFF" size={24} />
              <Github color="#FFFFFF" size={24} />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const BrandHeader = memo(() => (
  <Animated.View
    entering={FadeInDown.duration(1000).springify()}
    style={styles.brandHeader}
  >
    <Image source={APP_ICON} style={styles.brandIcon} resizeMode="contain" />
    <Text className="text-white/40 font-mono text-[10px] uppercase tracking-[3px] mt-4 text-center">
      Workspace Initialization
    </Text>
  </Animated.View>
));
BrandHeader.displayName = 'BrandHeader';

const RegisterFormContent = memo(
  ({
    fullName,
    setFullName,
    email,
    setEmail,
    password,
    setPassword,
    loading,
    onRegister,
    message,
  }: any) => {
    // Password Strength Logic
    const getStrength = () => {
      let score = 0;
      if (password.length > 7) score++;
      if (/[A-Z]/.test(password)) score++;
      if (/[0-9]/.test(password)) score++;
      if (/[^A-Za-z0-9]/.test(password)) score++;
      return score;
    };

    const strengthScore = getStrength();
    const strengthColor =
      strengthScore === 0
        ? 'bg-white/10'
        : strengthScore < 3
          ? 'bg-neon-orange'
          : 'bg-neon-lime';
    const strengthText =
      strengthScore === 0
        ? 'NO KEY'
        : strengthScore < 3
          ? 'WEAK SECURITY'
          : 'SECURE KEY';

    return (
      <View className="neural-glass p-8">
        <View style={{ gap: 20 }}>
          <View>
            <Text className="text-neon-cyan font-black text-[10px] tracking-widest uppercase mb-2 ml-1">
              Operative Name
            </Text>
            <View className="bg-white/[0.02] border border-white/10 rounded-2xl h-14 flex-row items-center px-4">
              <User size={18} color="#A1A1AA" />
              <TextInput
                className="flex-1 text-white font-medium ml-3 text-sm h-full outline-none"
                placeholder="John Doe"
                placeholderTextColor="#475569"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                editable={!loading}
              />
            </View>
          </View>

          <View>
            <Text className="text-neon-cyan font-black text-[10px] tracking-widest uppercase mb-2 ml-1">
              Operative Email
            </Text>
            <View className="bg-white/[0.02] border border-white/10 rounded-2xl h-14 flex-row items-center px-4">
              <Mail size={18} color="#A1A1AA" />
              <TextInput
                className="flex-1 text-white font-medium ml-3 text-sm h-full outline-none"
                placeholder="commander@enterprise.com"
                placeholderTextColor="#475569"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!loading}
              />
            </View>
          </View>

          <View>
            <Text className="text-neon-cyan font-black text-[10px] tracking-widest uppercase mb-2 ml-1">
              Encryption Key
            </Text>
            <View className="bg-white/[0.02] border border-white/10 rounded-2xl h-14 flex-row items-center px-4">
              <Lock size={18} color="#A1A1AA" />
              <TextInput
                className="flex-1 text-white font-medium ml-3 text-sm h-full outline-none"
                placeholder="••••••••"
                placeholderTextColor="#475569"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                editable={!loading}
              />
            </View>

            {/* Password Strength Meter */}
            <View className="mt-3 px-1">
              <View className="flex-row h-1 gap-1 mb-2">
                {[1, 2, 3, 4].map((level) => (
                  <View
                    key={level}
                    className={cn(
                      'flex-1 rounded-full transition-colors',
                      password.length > 0 && strengthScore >= level
                        ? strengthColor
                        : 'bg-white/10',
                    )}
                  />
                ))}
              </View>
              <View className="flex-row justify-end items-center">
                {strengthScore >= 3 && (
                  <CheckCircle2 size={10} color="#32FF00" className="mr-1" />
                )}
                <Text
                  className={cn(
                    'text-[8px] font-black uppercase tracking-widest',
                    strengthScore >= 3
                      ? 'text-neon-lime'
                      : strengthScore > 0
                        ? 'text-neon-orange'
                        : 'text-white/20',
                  )}
                >
                  {strengthText}
                </Text>
              </View>
            </View>
          </View>

          {message && (
            <View
              className={cn(
                'p-4 border rounded-xl',
                message.type === 'error'
                  ? 'bg-neon-pink/10 border-neon-pink/30'
                  : 'bg-neon-cyan/10 border-neon-cyan/30',
              )}
            >
              <Text
                className={cn(
                  'text-center font-bold text-[10px] tracking-widest uppercase',
                  message.type === 'error'
                    ? 'text-neon-pink'
                    : 'text-neon-cyan',
                )}
              >
                {message.text}
              </Text>
            </View>
          )}

          <Button
            onPress={onRegister}
            isLoading={loading}
            title={loading ? 'INITIALIZING...' : 'PROVISION WORKSPACE'}
            className="mt-2 py-4 shadow-lg shadow-neon-cyan/20"
          />

          <View className="flex-row items-center justify-center gap-2 mt-4">
            <Text className="text-white/40 text-[10px] font-mono uppercase tracking-widest">
              Active Node?
            </Text>
            <Link href="/(auth)/sign-in" asChild>
              <TouchableOpacity>
                <Text className="font-bold text-neon-cyan text-[10px] uppercase tracking-widest">
                  Authenticate
                </Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </View>
    );
  },
);
RegisterFormContent.displayName = 'RegisterFormContent';

const styles = StyleSheet.create({
  mobileScroll: { flex: 1 },
  mobileScrollContent: { flexGrow: 1, paddingBottom: 100 },
  brandHeader: { alignItems: 'center', marginBottom: 32 },
  brandIcon: { width: 80, height: 80 },
});

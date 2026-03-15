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
  Zap,
  Brain,
  Globe,
  Github,
  Twitter,
  Youtube,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeInRight,
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

type BentoItem = { icon: any; title: string; desc: string };

const BENTO_ITEMS: BentoItem[] = [
  {
    icon: Zap,
    title: 'Lightning Engine',
    desc: 'Process massive media payloads with sub-second latency.',
  },
  {
    icon: Brain,
    title: 'Neural Analysis',
    desc: 'Semantic extraction via Gemini 1.5 Pro models.',
  },
  {
    icon: Globe,
    title: 'Global Nodes',
    desc: 'Access your secure vault from any authenticated endpoint.',
  },
];

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

export default function SignInScreen() {
  const { signInWithMagicLink } = useAuthStore();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);

  const handleLogin = useCallback(async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      return setMessage({ type: 'error', text: 'Identity required.' });
    }

    setLoading(true);
    setMessage(null);

    const { error } = await signInWithMagicLink(trimmedEmail);

    if (error) {
      setMessage({ type: 'error', text: error });
    } else {
      setMessage({ type: 'success', text: 'Secure link deployed to inbox.' });
    }
    setLoading(false);
  }, [email, signInWithMagicLink]);

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
          {isDesktop ? (
            <View style={styles.desktopContainer}>
              <View style={styles.desktopSidebar}>
                <View style={{ width: '100%', maxWidth: 420 }}>
                  <BrandHeader />
                  <LoginFormContent
                    email={email}
                    setEmail={setEmail}
                    loading={loading}
                    onLogin={handleLogin}
                    message={message}
                  />
                  <SecurityFooter />
                </View>
              </View>
              <ScrollView
                style={styles.desktopScroll}
                contentContainerStyle={styles.desktopScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <MarketingContent isDesktop={true} />
              </ScrollView>
            </View>
          ) : (
            <ScrollView
              style={styles.mobileScroll}
              contentContainerStyle={styles.mobileScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.mobilePane}>
                <BrandHeader />
                <LoginFormContent
                  email={email}
                  setEmail={setEmail}
                  loading={loading}
                  onLogin={handleLogin}
                  message={message}
                />
                <SecurityFooter />
              </View>
              <View className="h-[1px] bg-white/5 my-10 mx-6" />
              <View style={styles.mobilePane}>
                <MarketingContent isDesktop={false} />
              </View>
            </ScrollView>
          )}
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
      Secure Authenticator Node
    </Text>
  </Animated.View>
));
BrandHeader.displayName = 'BrandHeader';

const LoginFormContent = memo(
  ({ email, setEmail, loading, onLogin, message }: any) => (
    <View className="neural-glass p-8">
      <View style={{ gap: 24 }}>
        <View>
          <Text className="text-neon-cyan font-black text-[10px] tracking-widest uppercase mb-2 ml-1">
            Operative Email
          </Text>
          <View className="bg-white/[0.02] border border-white/10 rounded-2xl h-14 flex-row items-center px-4 transition-all focus:border-neon-cyan/50">
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
                message.type === 'error' ? 'text-neon-pink' : 'text-neon-cyan',
              )}
            >
              {message.text}
            </Text>
          </View>
        )}

        <Button
          onPress={onLogin}
          isLoading={loading}
          title={loading ? 'UPLINKING...' : 'DEPLOY SECURE LINK'}
          className="mt-2 py-4 shadow-lg shadow-neon-cyan/20"
        />

        <View className="flex-row items-center justify-center gap-2 mt-4">
          <Text className="text-white/40 text-[10px] font-mono uppercase tracking-widest">
            Unregistered?
          </Text>
          <Link href="/(auth)/sign-up" asChild>
            <TouchableOpacity>
              <Text className="font-bold text-neon-cyan text-[10px] uppercase tracking-widest">
                Initialize Node
              </Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </View>
  ),
);
LoginFormContent.displayName = 'LoginFormContent';

const SecurityFooter = memo(() => (
  <View className="flex-row items-center justify-center mt-10 opacity-40">
    <Text className="text-white/80 text-[9px] font-black tracking-[2px] uppercase">
      End-to-End Encrypted Session
    </Text>
  </View>
));
SecurityFooter.displayName = 'SecurityFooter';

const MarketingContent = memo(({ isDesktop }: { isDesktop: boolean }) => (
  <View style={{ width: '100%', paddingBottom: 60 }}>
    <Animated.View
      entering={FadeInRight.duration(1200).springify().delay(200)}
      style={{ marginBottom: 40 }}
    >
      <Text
        className={cn(
          'font-black text-white tracking-tighter uppercase',
          isDesktop ? 'text-6xl leading-[60px]' : 'text-4xl leading-[42px]',
        )}
      >
        Enterprise <Text className="text-neon-cyan">Scale</Text>
      </Text>
      <Text
        className={cn(
          'text-white/50 leading-loose mt-4',
          isDesktop ? 'text-lg' : 'text-sm',
        )}
      >
        Provision your workspace to access military-grade transcription, AI
        semantic mapping, and raw data extraction.
      </Text>
    </Animated.View>

    <View className="flex-row flex-wrap gap-5 mt-8">
      {BENTO_ITEMS.map((item, index) => (
        <Animated.View
          key={index}
          entering={FadeInRight.delay(200 + index * 100).springify()}
          className={cn('neural-glass p-8', isDesktop ? 'w-[48%]' : 'w-full')}
        >
          <View className="w-12 h-12 bg-neon-cyan/10 rounded-2xl items-center justify-center mb-5">
            <item.icon size={20} color="#00F0FF" />
          </View>
          <Text className="text-white text-lg font-black uppercase tracking-wide mb-2">
            {item.title}
          </Text>
          <Text className="text-white/40 text-[10px] font-mono uppercase tracking-widest leading-5">
            {item.desc}
          </Text>
        </Animated.View>
      ))}
    </View>

    <View className="flex-row items-center justify-center gap-8 mt-20 opacity-40">
      <Youtube color="#FFFFFF" size={24} />
      <Twitter color="#FFFFFF" size={24} />
      <Github color="#FFFFFF" size={24} />
    </View>

    <View className="mt-12 items-center md:items-start opacity-20">
      <Text className="text-white text-[9px] font-black uppercase tracking-[3px]">
        NORTHOS REV 9.4.0 | PRODUCTION ENCLAVE
      </Text>
    </View>
  </View>
));
MarketingContent.displayName = 'MarketingContent';

const styles = StyleSheet.create({
  desktopContainer: { flexDirection: 'row', flex: 1 },
  desktopSidebar: {
    width: '40%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.05)',
    zIndex: 10,
    backgroundColor: 'rgba(2, 6, 23, 0.4)',
  },
  desktopScroll: { flex: 1 },
  desktopScrollContent: { padding: 80, paddingBottom: 150 },
  mobileScroll: { flex: 1 },
  mobileScrollContent: { flexGrow: 1, paddingBottom: 100 },
  mobilePane: { padding: 24, paddingTop: 40 },
  brandHeader: { alignItems: 'center', marginBottom: 32 },
  brandIcon: { width: 100, height: 100 },
});

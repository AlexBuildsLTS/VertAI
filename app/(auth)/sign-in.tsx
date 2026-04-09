/**
 * app/(auth)/sign-in.tsx
 * Sovereign NorthOS - Enterprise Authentication Protocol
 */

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
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/useAuthStore';
import {
  Mail,
  Lock,
  User,
  AtSign,
  Eye,
  EyeOff,
  CheckCircle2,
  Circle,
  Shield,
  Zap,
  Brain,
  Github,
  Twitter,
  Youtube,
  Fingerprint,
  UserX,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeInRight,
  FadeOutUp,
  Layout,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  withDelay,
  ZoomIn,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { AuthValidator } from '../../utils/validators/auth';
import { supabase } from '../../lib/supabase/client';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const APP_ICON = require('../../assets/icon.png');

type AuthMode = 'sign-in' | 'sign-up';

const BENTO_ITEMS = [
  {
    icon: Zap,
    title: 'Lightning Extraction',
    desc: 'Deepgram Nova-2 STT handles massive audio streams in sub-30s.',
    color: '#00F0FF',
  },
  {
    icon: Brain,
    title: 'Executive AI Engine',
    desc: 'Gemini 3.1 Flash-Lite generates SEO, summaries, and chapters.',
    color: '#8A2BE2',
  },
  {
    icon: Shield,
    title: 'Anti-Block Architecture',
    desc: 'Multi-proxy routing to ensure unstoppable reliability.',
    color: '#00F0FF',
  },
];

function mapAuthError(errorMessage: string): string {
  const lowMsg = errorMessage.toLowerCase();
  if (lowMsg.includes('invalid login credentials'))
    return 'Identity verification failed. Please check your credentials.';
  if (
    lowMsg.includes('user already registered') ||
    lowMsg.includes('already exists')
  )
    return 'This identity protocol is already active. Please sign in instead.';
  if (lowMsg.includes('password should be at least'))
    return 'Security key strength insufficient. Minimum 8 characters required.';
  if (lowMsg.includes('network') || lowMsg.includes('fetch'))
    return 'Neural link failed. Check your network connection.';
  if (lowMsg.includes('rate limit'))
    return 'Traffic surge detected. Please wait before retrying.';
  if (lowMsg.includes('email not confirmed'))
    return 'Account pending verification. Please check your inbox.';
  return errorMessage;
}

// ----------------------------------------------------------------------------
// [MODULE: AMBIENT UX ENGINE]
// ----------------------------------------------------------------------------
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
    opacity: interpolate(pulse.value, [0, 1], [0.03, 0.08]),
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

const getPasswordStrength = (password: string) => {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: 'WEAK', color: '#FF007F' };
  if (score <= 2) return { score, label: 'FAIR', color: '#FF4500' };
  if (score <= 3) return { score, label: 'GOOD', color: '#00F0FF' };
  return { score, label: 'STRONG', color: '#32FF00' };
};

export default function SignInScreen() {
  const { signInWithPassword, signUp } = useAuthStore();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const [authMode, setAuthMode] = useState<AuthMode>('sign-in');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const [loading, setLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isAnonLoading, setIsAnonLoading] = useState(false);

  const [successState, setSuccessState] = useState<'none' | 'login' | 'signup'>(
    'none',
  );
  const [message, setMessage] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);

  // ----------------------------------------------------------------------------
  // [MODULE: CORE AUTHENTICATION DISPATCHER]
  // ----------------------------------------------------------------------------
  const handleAction = useCallback(async () => {
    if (__DEV__) console.log(`[Sign-In] Action triggered: ${authMode}`);
    setMessage(null);
    const trimmedEmail = email.trim();

    if (!AuthValidator.isValidEmail(trimmedEmail)) {
      if (__DEV__) console.warn('[Sign-In] Invalid email entered');
      return setMessage({
        type: 'error',
        text: 'Valid email address required.',
      });
    }

    setLoading(true);

    if (authMode === 'sign-in') {
      if (__DEV__) console.log('[Sign-In] Calling signInWithPassword');
      const { error } = await signInWithPassword(trimmedEmail, password);
      if (error) {
        if (__DEV__) console.log('[Sign-In] Sign-in failed:', error);
        setMessage({ type: 'error', text: mapAuthError(error) });
        setLoading(false);
      } else {
        if (__DEV__)
          console.log('[Sign-In] Sign-in successful, redirecting...');
        setSuccessState('login');
        setTimeout(() => {
          router.replace('/(dashboard)');
        }, 1500);
      }
    } else {
      if (__DEV__) console.log('[Sign-In] Validating sign-up fields');
      if (
        !fullName.trim() ||
        password.length < 8 ||
        password !== confirmPassword ||
        !agreedToTerms
      ) {
        if (__DEV__) console.warn('[Sign-In] Sign-up validation failed');
        setLoading(false);
        return setMessage({
          type: 'error',
          text: 'Please complete all required fields.',
        });
      }

      if (__DEV__) console.log('[Sign-In] Calling signUp');
      const { error } = await signUp(trimmedEmail, password, fullName.trim());

      if (error) {
        if (__DEV__) console.error('[Sign-In] Sign-up failed:', error);
        setMessage({ type: 'error', text: mapAuthError(error) });
        setLoading(false);
      } else {
        if (__DEV__) console.log('[Sign-In] Sign-up successful');

        // We ALWAYS show the signup success state first, even if auto-confirmed.
        // This ensures the user sees the "Identity Initialized" message.
        setSuccessState('signup');

        setTimeout(async () => {
          // Check if user was automatically signed in (depends on Supabase config)
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (session) {
            if (__DEV__)
              console.log('[Sign-In] User auto-signed in after sign-up');
            setSuccessState('login');
            setTimeout(() => {
              router.replace('/(dashboard)');
            }, 1500);
          } else {
            setSuccessState('none');
            setAuthMode('sign-in');
            setPassword('');
            setConfirmPassword('');
            setMessage({
              type: 'success',
              text: 'Account created. Please check your email to verify.',
            });
            setLoading(false);
          }
        }, 2000);
      }
    }
  }, [
    authMode,
    fullName,
    email,
    password,
    confirmPassword,
    agreedToTerms,
    signInWithPassword,
    signUp,
    router,
  ]);

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setMessage(null);
    try {
      const redirectUri = AuthSession.makeRedirectUri({
        path: '/auth/callback',
      });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUri, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectUri,
        );
        if (result.type === 'success' && result.url) {
          const urlParams = new URL(result.url);
          const accessToken = result.url.match(/access_token=([^&]*)/)?.[1];
          const refreshToken = result.url.match(/refresh_token=([^&]*)/)?.[1];
          if (accessToken && refreshToken) {
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            router.replace('/(dashboard)');
          }
        }
      }
    } catch (e: any) {
      setMessage({
        type: 'error',
        text: mapAuthError(e.message || 'OAuth execution failed.'),
      });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleAnonymousSignIn = async () => {
    setIsAnonLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      setSuccessState('login');
      setTimeout(() => {
        router.replace('/(dashboard)');
      }, 1500);
    } catch (e: any) {
      setMessage({
        type: 'error',
        text: mapAuthError(e.message || 'Anonymous sign-in failed.'),
      });
      setIsAnonLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-[#020205]">
      {/* 🔴 THE FIX: pointerEvents passed via style and zIndex pushed back to prevent invisible touch shield on Android */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { pointerEvents: 'none', zIndex: -1, overflow: 'hidden' },
        ]}
      >
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
                <ScrollView
                  style={{ flex: 1, width: '100%' }}
                  contentContainerStyle={{
                    maxWidth: 440,
                    alignSelf: 'center',
                    paddingVertical: 40,
                  }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  <BrandHeader />
                  <AuthForm
                    authMode={authMode}
                    setAuthMode={setAuthMode}
                    fullName={fullName}
                    setFullName={setFullName}
                    username={username}
                    setUsername={setUsername}
                    email={email}
                    setEmail={setEmail}
                    password={password}
                    setPassword={setPassword}
                    confirmPassword={confirmPassword}
                    setConfirmPassword={setConfirmPassword}
                    agreedToTerms={agreedToTerms}
                    setAgreedToTerms={setAgreedToTerms}
                    loading={loading}
                    isGoogleLoading={isGoogleLoading}
                    isAnonLoading={isAnonLoading}
                    onAction={handleAction}
                    onGoogleAction={handleGoogleSignIn}
                    onAnonAction={handleAnonymousSignIn}
                    message={message}
                    setMessage={setMessage}
                    successState={successState}
                    router={router}
                  />
                  <SecurityFooter />
                </ScrollView>
              </View>
              <ScrollView
                style={styles.desktopScroll}
                contentContainerStyle={styles.desktopScrollContent}
              >
                <MarketingContent isDesktop={true} />
              </ScrollView>
            </View>
          ) : (
            <ScrollView
              style={styles.mobileScroll}
              contentContainerStyle={styles.mobileScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.mobilePane}>
                <BrandHeader />
                <AuthForm
                  authMode={authMode}
                  setAuthMode={setAuthMode}
                  fullName={fullName}
                  setFullName={setFullName}
                  username={username}
                  setUsername={setUsername}
                  email={email}
                  setEmail={setEmail}
                  password={password}
                  setPassword={setPassword}
                  confirmPassword={confirmPassword}
                  setConfirmPassword={setConfirmPassword}
                  agreedToTerms={agreedToTerms}
                  setAgreedToTerms={setAgreedToTerms}
                  loading={loading}
                  isGoogleLoading={isGoogleLoading}
                  isAnonLoading={isAnonLoading}
                  onAction={handleAction}
                  onGoogleAction={handleGoogleSignIn}
                  onAnonAction={handleAnonymousSignIn}
                  message={message}
                  setMessage={setMessage}
                  successState={successState}
                  router={router}
                />
                <SecurityFooter />
              </View>
              <View className="h-[2px] bg-white/5 my-12 mx-8" />
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
    style={{ alignItems: 'center', marginBottom: 32 }}
  >
    <Image source={APP_ICON} style={styles.brandIcon} resizeMode="contain" />
  </Animated.View>
));
BrandHeader.displayName = 'BrandHeader';

const FormField = ({ label, icon: Icon, children }: any) => (
  <View style={{ marginBottom: 16 }}>
    <Text className="text-[#00F0FF] font-black text-[10px] tracking-widest uppercase mb-2 ml-1">
      {label}
    </Text>
    <View className="bg-white/[0.02] border border-white/10 rounded-2xl h-16 flex-row items-center px-4">
      <Icon size={18} color="#A1A1AA" />
      {children}
    </View>
  </View>
);

const AuthForm = memo(
  ({
    authMode,
    setAuthMode,
    fullName,
    setFullName,
    username,
    setUsername,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    agreedToTerms,
    setAgreedToTerms,
    loading,
    isGoogleLoading,
    isAnonLoading,
    onAction,
    onGoogleAction,
    onAnonAction,
    message,
    setMessage,
    successState,
    router,
  }: any) => {
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const isSignUp = authMode === 'sign-up';
    const strength = getPasswordStrength(password);
    const passwordsMatch =
      confirmPassword.length > 0 && password === confirmPassword;

    const SlideIn = FadeInRight.springify().damping(20).mass(1).stiffness(140);
    const SlideOut = FadeOutUp.duration(200);

    return (
      <Animated.View
        layout={Layout.springify().damping(20).stiffness(150)}
        style={{
          width: '100%',
          padding: 24,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.05)',
          borderRadius: 18,
          backgroundColor: 'rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
      >
        {successState !== 'none' ? (
          <Animated.View
            layout={Layout.springify().damping(18).stiffness(120)}
            entering={SlideIn}
            exiting={SlideOut.springify().mass(0.6).damping(16).stiffness(120)}
            style={{ alignItems: 'center', paddingVertical: 40 }}
          >
            <CheckCircle2 size={80} color="#32FF00" />
            <Text className="text-[#32FF00] text-lg font-black uppercase tracking-widest mt-6 text-center">
              {successState === 'login'
                ? 'Access Granted'
                : 'Identity Initialized'}
            </Text>

            <Text className="text-white/50 text-[10px] uppercase tracking-widest mt-2 text-center">
              {successState === 'login'
                ? 'Synchronizing workspace...'
                : 'Preparing secure connection...'}
            </Text>

            <View className="items-center justify-center mt-12">
              <Animated.View
                entering={ZoomIn.delay(200)}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  borderWidth: 2,
                  borderColor: 'rgba(50, 255, 0, 0.2)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ActivityIndicator color="#32FF00" size="small" />
              </Animated.View>
            </View>
          </Animated.View>
        ) : (
          <>
            {/* TAB CONTROLLER */}
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: 'rgba(255,255,255,0.03)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.1)',
                borderRadius: 16,
                padding: 4,
                marginBottom: 24,
              }}
            >
              <View style={{ flex: 1 }}>
                <TouchableOpacity
                  onPress={() => {
                    setAuthMode('sign-in');
                    setConfirmPassword('');
                    setFullName('');
                    if (setMessage) setMessage(null);
                  }}
                  activeOpacity={0.8}
                  style={{
                    width: '100%',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: !isSignUp
                      ? 'rgba(0, 240, 255, 0.3)'
                      : 'transparent',
                    backgroundColor: !isSignUp
                      ? 'rgba(0, 240, 255, 0.1)'
                      : 'transparent',
                  }}
                >
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={{
                      fontSize: 10,
                      fontWeight: '900',
                      textTransform: 'uppercase',
                      letterSpacing: 2,
                      color: !isSignUp ? '#00F0FF' : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    SIGN IN
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <TouchableOpacity
                  onPress={() => {
                    setAuthMode('sign-up');
                    if (setMessage) setMessage(null);
                  }}
                  activeOpacity={0.8}
                  style={{
                    width: '100%',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: isSignUp
                      ? 'rgba(0, 240, 255, 0.3)'
                      : 'transparent',
                    backgroundColor: isSignUp
                      ? 'rgba(0, 240, 255, 0.1)'
                      : 'transparent',
                  }}
                >
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={{
                      fontSize: 10,
                      fontWeight: '900',
                      textTransform: 'uppercase',
                      letterSpacing: 2,
                      color: isSignUp ? '#00F0FF' : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    SIGN UP
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {isSignUp && (
              <Animated.View entering={SlideIn} exiting={SlideOut}>
                <FormField label="Full Name" icon={User}>
                  <TextInput
                    className="flex-1 h-full ml-3 text-sm font-medium text-white outline-none"
                    placeholder="John Doe"
                    placeholderTextColor="#475569"
                    value={fullName}
                    onChangeText={setFullName}
                    editable={!loading}
                  />
                </FormField>
              </Animated.View>
            )}

            {isSignUp && (
              <Animated.View entering={SlideIn.delay(50)} exiting={SlideOut}>
                <FormField label="Username" icon={AtSign}>
                  <TextInput
                    className="flex-1 h-full ml-3 text-sm font-medium text-white outline-none"
                    placeholder="Username"
                    placeholderTextColor="#475569"
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    editable={!loading}
                    autoCorrect={false}
                  />
                </FormField>
              </Animated.View>
            )}

            <FormField label="Email" icon={Mail}>
              <TextInput
                className="flex-1 h-full ml-3 text-sm font-medium text-white outline-none"
                placeholder="Enter Your Address"
                placeholderTextColor="#475569"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!loading}
                autoCorrect={false}
              />
            </FormField>

            {/* ----------------------------------------------------------------------------
                  [MODULE: PASSWORD CONTAINER]
                  ---------------------------------------------------------------------------- */}
            <View style={{ marginBottom: isSignUp ? 12 : 0 }}>
              <Text className="text-[#00F0FF] font-black text-[10px] tracking-widest uppercase mb-2 ml-1">
                PASSWORD
              </Text>

              <View className="bg-white/[0.02] border border-white/10 rounded-2xl h-16 flex-row items-center px-4">
                <Lock size={18} color="#A1A1AA" />
                <TextInput
                  className="flex-1 h-full ml-3 text-sm font-medium text-white outline-none"
                  placeholder="Min. 8 characters"
                  placeholderTextColor="#475569"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  editable={!loading}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                >
                  {showPassword ? (
                    <EyeOff size={18} color="#A1A1AA" />
                  ) : (
                    <Eye size={18} color="#A1A1AA" />
                  )}
                </TouchableOpacity>
              </View>

              {/* Strength Meter */}
              {isSignUp && password.length > 0 && (
                <Animated.View
                  entering={FadeInDown}
                  exiting={SlideOut}
                  className="px-1 mt-4"
                >
                  <View className="flex-row h-1 gap-1 mb-2">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <View
                        key={level}
                        style={{
                          flex: 1,
                          borderRadius: 99,
                          backgroundColor:
                            strength.score >= level
                              ? strength.color
                              : 'rgba(255,255,255,0.1)',
                        }}
                      />
                    ))}
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-white/20 text-[8px] font-mono uppercase tracking-widest">
                      8+ chars, uppercase, number, symbol
                    </Text>
                    <Text
                      style={{ color: strength.color }}
                      className="text-[8px] font-black uppercase tracking-widest"
                    >
                      {strength.label}
                    </Text>
                  </View>
                </Animated.View>
              )}
            </View>

            {/* ----------------------------------------------------------------------------
                  [MODULE: FORGOT PASSWORD LINK]
                  Cleanly placed entirely outside the input box, right-aligned, with standard mt-3 spacing.
                  ---------------------------------------------------------------------------- */}
            {!isSignUp && (
              <Animated.View
                entering={FadeInDown.duration(300)}
                style={{
                  alignItems: 'flex-end',
                  marginTop: 12,
                  marginBottom: 12,
                }}
              >
                <TouchableOpacity
                  onPress={() => router.push('/(auth)/forgot-password' as any)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text className="text-[#00F0FF] text-[11px] font-bold tracking-widest uppercase hover:text-white transition-colors">
                    Forgot Password?
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            )}

            {isSignUp && (
              <Animated.View entering={SlideIn.delay(100)} exiting={SlideOut}>
                <Text className="text-[#00F0FF] font-black text-[10px] tracking-widest uppercase mb-2 ml-1 mt-2">
                  Confirm Security Key
                </Text>
                <View
                  className={cn(
                    'border rounded-2xl h-16 flex-row items-center px-4',
                    confirmPassword.length > 0 && !passwordsMatch
                      ? 'border-rose-500/50'
                      : passwordsMatch
                        ? 'border-[#32FF00]/50'
                        : 'border-white/10',
                  )}
                  style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
                >
                  <Fingerprint size={18} color="#A1A1AA" />
                  <TextInput
                    className="flex-1 h-full ml-3 text-sm font-medium text-white outline-none"
                    placeholder="Re-enter Password"
                    placeholderTextColor="#475569"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirm}
                    editable={!loading}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <TouchableOpacity
                  onPress={() => setAgreedToTerms(!agreedToTerms)}
                  className="flex-row items-start gap-3 mt-4 mb-2"
                  activeOpacity={0.7}
                >
                  {agreedToTerms ? (
                    <CheckCircle2 size={20} color="#00F0FF" />
                  ) : (
                    <Circle size={20} color="rgba(255,255,255,0.2)" />
                  )}
                  <Text className="flex-1 text-white/40 text-[11px] leading-5">
                    I agree to the{' '}
                    <Text className="font-bold text-[#00F0FF]">
                      Terms of Service
                    </Text>{' '}
                    and{' '}
                    <Text className="font-bold text-[#00F0FF]">
                      Privacy Policy
                    </Text>
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            )}

            {message && (
              <Animated.View
                entering={FadeInDown.springify()}
                exiting={FadeOutUp}
                className={cn(
                  'p-5 border-2 rounded-2xl mt-6 flex-row items-center gap-4',
                  message.type === 'error'
                    ? 'bg-rose-500/10 border-rose-500/20'
                    : 'bg-emerald-500/10 border-emerald-500/20',
                )}
              >
                <View
                  className={cn(
                    'w-8 h-8 rounded-full items-center justify-center',
                    message.type === 'error'
                      ? 'bg-rose-500/20'
                      : 'bg-emerald-500/20',
                  )}
                >
                  {message.type === 'error' ? (
                    <UserX size={16} color="#F43F5E" />
                  ) : (
                    <CheckCircle2 size={16} color="#10B981" />
                  )}
                </View>
                <View className="flex-1">
                  <Text
                    className={cn(
                      'font-black text-[10px] uppercase tracking-[2px]',
                      message.type === 'error'
                        ? 'text-rose-500'
                        : 'text-emerald-500',
                    )}
                  >
                    {message.type === 'error'
                      ? 'Protocol Breach'
                      : 'Verification Sent'}
                  </Text>
                  <Text className="text-white/70 text-[11px] font-medium leading-4 mt-1">
                    {message.text}
                  </Text>
                </View>
              </Animated.View>
            )}

            <Button
              onPress={onAction}
              isLoading={loading}
              title={
                loading
                  ? 'PROCESSING...'
                  : isSignUp
                    ? 'CREATE ACCOUNT'
                    : 'SIGN IN'
              }
              className="py-5 mt-4 border border-[#00F0FF]/20"
            />

            <View className="flex-row items-center my-6 opacity-30">
              <View className="flex-1 h-[1px] bg-white" />
              <Text className="px-4 text-[14px] font-bold text-white uppercase tracking-widest">
                --
              </Text>
              <View className="flex-1 h-[1px] bg-white" />
            </View>

            <TouchableOpacity
              onPress={onGoogleAction}
              disabled={isGoogleLoading || loading || isAnonLoading}
              activeOpacity={0.7}
              className="flex-row items-center justify-center py-4 mb-3 transition-opacity bg-white border rounded-xl border-white/20"
            >
              <Image
                source={{
                  uri: 'https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg',
                }}
                style={{ width: 18, height: 18, marginRight: 10 }}
              />
              <Text className="text-xs font-bold tracking-widest text-black uppercase">
                {isGoogleLoading ? 'Connecting...' : 'SIGN IN GOOGLE'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onAnonAction}
              disabled={isGoogleLoading || loading || isAnonLoading}
              activeOpacity={0.7}
              className="flex-row items-center justify-center py-4 transition-opacity bg-white/[0.05] border rounded-xl border-white/10"
            >
              <UserX size={18} color="#A1A1AA" style={{ marginRight: 10 }} />
              <Text className="text-xs font-bold tracking-widest text-[#A1A1AA] uppercase">
                {isAnonLoading ? 'Generating Session...' : 'GUEST SESSION'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </Animated.View>
    );
  },
);
AuthForm.displayName = 'AuthForm';

const SecurityFooter = memo(() => (
  <View className="flex-row items-center justify-center mt-10 opacity-40">
    <Text className="text-white/80 text-[9px] font-black tracking-[2px] uppercase">
      VIDEO & AUDIOURL TRANSCRIBER
    </Text>
  </View>
));
SecurityFooter.displayName = 'SecurityFooter';

const MarketingContent = memo(({ isDesktop }: { isDesktop: boolean }) => {
  return (
    <View
      style={{
        width: '100%',
        paddingBottom: 60,
        paddingHorizontal: isDesktop ? 0 : 16,
      }}
    >
      <Animated.View
        entering={FadeInRight.duration(1200).springify().delay(200)}
        style={{ marginBottom: 40 }}
      ></Animated.View>

      <View className="flex-col gap-5 mt-4">
        {BENTO_ITEMS.map((item, index) => (
          <Animated.View
            key={item.title}
            entering={FadeInRight.delay(200 + index * 100).springify()}
          >
            <TouchableOpacity
              activeOpacity={0.8}
              className="p-6 border rounded-3xl border-white/10"
              style={{ backgroundColor: 'rgba(5, 5, 10, 0.6)' }}
            >
              <View className="flex-row items-center gap-4 mb-2">
                <View
                  className="items-center justify-center w-10 h-10 rounded-xl"
                  style={{ backgroundColor: `${item.color}15` }}
                >
                  <item.icon size={18} color={item.color} />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-black tracking-wide text-white uppercase">
                    {item.title}
                  </Text>
                  <Text className="text-white/40 text-[10px] font-mono uppercase tracking-widest leading-4 mt-1">
                    {item.desc}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </View>

      <View className="flex-row items-center justify-center gap-10 mt-24 opacity-60">
        <Youtube color="#FFFFFF" size={26} />
        <Twitter color="#FFFFFF" size={26} />
        <Github color="#FFFFFF" size={26} />
      </View>
    </View>
  );
});
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
    backgroundColor: 'rgba(2, 6, 23, 0.4)',
  },
  desktopScroll: { flex: 1 },
  desktopScrollContent: { padding: 80, paddingBottom: 150 },
  mobileScroll: { flex: 1 },
  mobileScrollContent: {
    flexGrow: 1,
    paddingBottom: 100,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 500,
  },
  mobilePane: { padding: 24, paddingTop: 40 },
  brandIcon: { width: 100, height: 100 },
});

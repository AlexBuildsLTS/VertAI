/**
 * app/(dashboard)/admin/keys.tsx
 * VeraxAI — Enterprise API Key Vault & Telemetry Analytics
 * ----------------------------------------------------------------------------
 * MODULE OVERVIEW:
 * - AMBIENT ENGINE: Liquid Neon background parity with admin/index.tsx
 * - ALWAYS-VISIBLE DATA: Exact token counts permanently rendered in chart legends.
 * - MULTI-LINE VELOCITY: 7D velocity with smooth Bezier Splines and X/Y Crosshairs.
 * - ZERO-JUMP TOGGLING: Global axis scaling prevents layout shifts during legend toggles.
 * - VAULT: Secure fallback key injection.
 * ----------------------------------------------------------------------------
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
  KeyboardAvoidingView,
  Image,
  Pressable,
  Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowBigLeftDash,
  Activity,
  Plus,
  Trash2,
  ShieldCheck,
  RefreshCcw,
  BarChart2,
} from 'lucide-react-native';
import Animated, {
  useAnimatedStyle,
  useAnimatedProps,
  withSpring,
  withTiming,
  FadeInUp,
  interpolate,
  useSharedValue,
  withDelay,
  withRepeat,
} from 'react-native-reanimated';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { supabase } from '../../../lib/supabase/client';
import { GlassCard } from '../../../components/ui/GlassCard';
import { FadeIn } from '../../../components/animations/FadeIn';
import { Database } from '../../../types/database/database.types';

// ─── CONFIGURATION: PRESET COLORS FOR KNOWN KEYS ─────────────────────────────
// NOTE: This does NOT hardcode keys into your system. It simply ensures your
// primary system keys always match your specific brand colors. Any new keys
// added via the vault will automatically generate a dynamic color.
const PRESET_COLORS: Record<string, string> = {
  ENV_MASTER: '#00F0FF', // Neon Cyan
  GEMINIAPI_KEY_1: '#FF007F', // Neon Pink
  GEMINIAPI_KEY_2: '#32FF00', // Neon Green
  GEMINIAPI_KEY_3: '#8A2BE2', // Electric Purple
  GEMINIAPI_KEY_4: '#F59E0B', // Warning Amber
};

const getColorForKey = (keyName: string) => {
  if (PRESET_COLORS[keyName]) return PRESET_COLORS[keyName];
  let hash = 0;
  for (let i = 0; i < keyName.length; i++)
    hash = keyName.charCodeAt(i) + ((hash << 5) - hash);
  const fallbackColors = [
    '#00F0FF',
    '#FF007F',
    '#32FF00',
    '#8A2BE2',
    '#F59E0B',
  ];
  return fallbackColors[Math.abs(hash) % fallbackColors.length];
};

const THEME = {
  obsidian: '#020205',
  cyan: '#00F0FF',
  danger: '#FF007F',
  success: '#32FF00',
  purple: '#8A2BE2',
};

const strictInputStyle = {
  flex: 1,
  color: '#FFFFFF',
  fontSize: 14,
  paddingVertical: 0,
  margin: 0,
  textAlignVertical: 'center',
  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
} as any;

// ─── AMBIENT ORB ENGINE ──────────────────────────────────────────────────────
const AmbientOrb = ({
  color,
  size,
  top,
  left,
  right,
  bottom,
  opacity = 0.05,
  delay = 0,
}: any) => {
  const { width, height } = Dimensions.get('window');
  const drift = useSharedValue(0);

  useEffect(() => {
    drift.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 8000, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
  }, [delay, drift]);

  const anim = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(drift.value, [0, 1], [0, width * 0.1]) },
      { translateY: interpolate(drift.value, [0, 1], [0, height * 0.05]) },
      { scale: interpolate(drift.value, [0, 1], [0.9, 1.2]) },
    ],
  }));

  const blurStyle = Platform.OS === 'web' ? { filter: 'blur(80px)' } : {};

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: color,
          opacity,
          top,
          left,
          right,
          bottom,
          pointerEvents: 'none',
          ...blurStyle,
        },
        anim,
      ]}
    />
  );
};

// ─── ANIMATED SVG COMPONENTS ─────────────────────────────────────────────────
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── TYPE DEFINITIONS ────────────────────────────────────────────────────────
type SystemKey = Database['public']['Tables']['system_api_keys']['Row'];
type RawLog = {
  tokens_consumed: number;
  created_at: string;
  metadata: { api_key_name: string } | null;
};

type ChartDataPoint = {
  label: string;
  fullDate: string;
  total: number;
  breakdown: { keyName: string; tokens: number; color: string }[];
};

// ─── TIMELINE GENERATORS ─────────────────────────────────────────────────────
const buildDailyData = (logs: RawLog[]): ChartDataPoint[] => {
  const bins = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const datePrefix = d.toISOString().split('T')[0];
    const label = d.toLocaleDateString('en-US', { weekday: 'short' });
    bins.push({ label, fullDate: datePrefix, prefix: datePrefix });
  }

  return bins.map((bin) => {
    const binLogs = logs.filter((log) => log.created_at.startsWith(bin.prefix));
    const keyMap: Record<string, number> = {};
    let total = 0;

    binLogs.forEach((log) => {
      // @ts-ignore
      const keyName = log.metadata?.api_key_name || 'UNKNOWN_KEY';
      keyMap[keyName] = (keyMap[keyName] || 0) + (log.tokens_consumed || 0);
      total += log.tokens_consumed || 0;
    });

    const breakdown = Object.keys(keyMap).map((keyName) => ({
      keyName,
      tokens: keyMap[keyName],
      color: getColorForKey(keyName),
    }));

    return { label: bin.label, fullDate: bin.fullDate, total, breakdown };
  });
};

const buildMonthlyData = (logs: RawLog[]): ChartDataPoint[] => {
  const bins = [];
  const currentYear = new Date().getFullYear();
  const monthsArr = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  for (let i = 0; i < 12; i++) {
    const monthPrefix = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
    const label = monthsArr[i];
    bins.push({
      label,
      fullDate: `${label} ${currentYear}`,
      prefix: monthPrefix,
    });
  }

  return bins.map((bin) => {
    const binLogs = logs.filter((log) => log.created_at.startsWith(bin.prefix));
    const keyMap: Record<string, number> = {};
    let total = 0;

    binLogs.forEach((log) => {
      // @ts-ignore
      const keyName = log.metadata?.api_key_name || 'UNKNOWN_KEY';
      keyMap[keyName] = (keyMap[keyName] || 0) + (log.tokens_consumed || 0);
      total += log.tokens_consumed || 0;
    });

    const breakdown = Object.keys(keyMap).map((keyName) => ({
      keyName,
      tokens: keyMap[keyName],
      color: getColorForKey(keyName),
    }));

    return { label: bin.label, fullDate: bin.fullDate, total, breakdown };
  });
};

const getSmoothPath = (points: { x: number; y: number }[]) => {
  const controlPoint = (
    current: any,
    previous: any,
    next: any,
    reverse: boolean,
  ) => {
    const p = previous || current;
    const n = next || current;
    const smoothing = 0.2;
    const o = {
      length:
        Math.sqrt(Math.pow(n.x - p.x, 2) + Math.pow(n.y - p.y, 2)) * smoothing,
      angle: Math.atan2(n.y - p.y, n.x - p.x),
    };
    const angle = o.angle + (reverse ? Math.PI : 0);
    return {
      x: current.x + Math.cos(angle) * o.length,
      y: current.y + Math.sin(angle) * o.length,
    };
  };

  return points.reduce((acc, point, i, a) => {
    if (i === 0) return `M ${point.x},${point.y}`;
    const cps = controlPoint(a[i - 1], a[i - 2], point, false);
    const cpe = controlPoint(point, a[i - 1], a[i + 1], true);
    return `${acc} C ${cps.x},${cps.y} ${cpe.x},${cpe.y} ${point.x},${point.y}`;
  }, '');
};

// ─── MODULE 1: SMOOTH MULTI-LINE CHART ───────────────────────────────────────
const SvgLineNode = ({
  line,
  isHidden,
  selectedIndex,
}: {
  line: any;
  isHidden: boolean;
  selectedIndex: number | null;
}) => {
  const animatedPathProps = useAnimatedProps(() => ({
    opacity: withTiming(isHidden ? 0 : 0.8, { duration: 300 }),
  }));

  return (
    <React.Fragment>
      <AnimatedPath
        animatedProps={animatedPathProps}
        d={line.pathStr}
        stroke={line.color}
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
      />
      {line.points.map((p: any, i: number) => {
        const isActive = selectedIndex === i;
        const circleProps = useAnimatedProps(() => ({
          opacity: withTiming(isHidden ? 0 : isActive ? 1 : 0.6, {
            duration: 200,
          }),
          r: withSpring(isActive ? 6 : 4, { damping: 15 }),
        }));
        return (
          <AnimatedCircle
            key={`dot-${i}`}
            cx={p.x}
            cy={p.y}
            fill={THEME.obsidian}
            stroke={line.color}
            strokeWidth={3}
            animatedProps={circleProps}
          />
        );
      })}
    </React.Fragment>
  );
};

const SvgMultiLineChart = ({
  data,
  allUniqueKeys,
  hiddenKeys,
  selectedIndex,
  setSelectedIndex,
}: {
  data: ChartDataPoint[];
  allUniqueKeys: Set<string>;
  hiddenKeys: Set<string>;
  selectedIndex: number | null;
  setSelectedIndex: (idx: number | null) => void;
}) => {
  const VIEWBOX_W = 1000;
  const VIEWBOX_H = 260;
  const PADDING_Y = 40;
  const PADDING_X = 50;

  const activeKeysArray = Array.from(allUniqueKeys);

  const globalMaxVal = useMemo(() => {
    return Math.max(
      ...data.flatMap((d) => d.breakdown.map((b) => b.tokens)),
      10,
    );
  }, [data]);

  const lines = useMemo(() => {
    return activeKeysArray.map((keyName) => {
      const color = getColorForKey(keyName);
      const points = data.map((d, i) => {
        const b = d.breakdown.find((x) => x.keyName === keyName);
        const val = b ? b.tokens : 0;
        const x =
          PADDING_X + (i / (data.length - 1)) * (VIEWBOX_W - PADDING_X * 2);
        const y =
          VIEWBOX_H -
          PADDING_Y -
          (val / globalMaxVal) * (VIEWBOX_H - PADDING_Y * 2);
        return { x, y, val };
      });
      return { keyName, color, points, pathStr: getSmoothPath(points) };
    });
  }, [data, activeKeysArray, globalMaxVal]);

  const activePoint = selectedIndex !== null ? data[selectedIndex] : null;

  const crosshair = useMemo(() => {
    if (selectedIndex === null) return null;
    const activeX =
      PADDING_X +
      (selectedIndex / (data.length - 1)) * (VIEWBOX_W - PADDING_X * 2);

    let highestVal = 0;
    data[selectedIndex].breakdown.forEach((b) => {
      if (!hiddenKeys.has(b.keyName) && b.tokens > highestVal)
        highestVal = b.tokens;
    });
    const activeY =
      VIEWBOX_H -
      PADDING_Y -
      (highestVal / globalMaxVal) * (VIEWBOX_H - PADDING_Y * 2);

    return { x: activeX, y: activeY };
  }, [selectedIndex, data, hiddenKeys, globalMaxVal]);

  return (
    <View className="relative w-full h-full">
      <View className="absolute inset-0 flex-col justify-between py-[15%]">
        {[1, 2, 3].map((i) => (
          <View key={i} className="w-full h-px bg-white/[0.03]" />
        ))}
      </View>

      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        preserveAspectRatio="none"
      >
        {crosshair && (
          <React.Fragment>
            <Line
              x1={crosshair.x}
              y1={PADDING_Y / 2}
              x2={crosshair.x}
              y2={VIEWBOX_H - PADDING_Y / 2}
              stroke="#00F0FF"
              strokeWidth={2}
              opacity={0.3}
              strokeDasharray="6 6"
            />
            <Line
              x1={PADDING_X / 2}
              y1={crosshair.y}
              x2={VIEWBOX_W - PADDING_X / 2}
              y2={crosshair.y}
              stroke="#00F0FF"
              strokeWidth={2}
              opacity={0.3}
              strokeDasharray="6 6"
            />
          </React.Fragment>
        )}

        {lines.map((line) => (
          <SvgLineNode
            key={line.keyName}
            line={line}
            isHidden={hiddenKeys.has(line.keyName)}
            selectedIndex={selectedIndex}
          />
        ))}
      </Svg>

      <View className="absolute inset-0 flex-row">
        {data.map((point, idx) => {
          const isActive = selectedIndex === idx;
          return (
            <View key={idx} className="items-center justify-end flex-1 h-full">
              <Pressable
                className="absolute inset-0 z-10"
                {...(Platform.OS === 'web'
                  ? {
                      onHoverIn: () => setSelectedIndex(idx),
                      onHoverOut: () => setSelectedIndex(null),
                    }
                  : {
                      onPressIn: () => setSelectedIndex(idx),
                      onPressOut: () => setSelectedIndex(null),
                    })}
              />
              <Text
                className={`mb-[-24px] text-[10px] uppercase tracking-wider transition-colors duration-200 ${isActive ? 'text-[#00F0FF] font-black' : 'text-white/30 font-bold'}`}
              >
                {point.label}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Floating Tooltip */}
      {activePoint && selectedIndex !== null && (
        <Animated.View
          entering={FadeInUp.springify().damping(15)}
          className="absolute z-50 items-center justify-center pointer-events-none top-[-30px] left-0 right-0"
        >
          <View className="bg-[#020205]/95 border border-[#00F0FF]/30 rounded-2xl p-4 min-w-[200px] shadow-[0_10px_30px_rgba(0,240,255,0.15)] backdrop-blur-md">
            <Text className="text-[#00F0FF] text-[10px] font-black uppercase tracking-[2px] mb-3 text-center">
              {activePoint.fullDate}
            </Text>
            {activePoint.breakdown.map((b, idx) => {
              const isHidden = hiddenKeys.has(b.keyName);
              if (isHidden) return null;
              return (
                <View
                  key={idx}
                  className="flex-row items-center justify-between mb-1.5 gap-x-6"
                >
                  <View className="flex-row items-center gap-x-2">
                    <View
                      style={{ backgroundColor: b.color }}
                      className="w-2.5 h-2.5 rounded-full shadow-[0_0_5px]"
                    />
                    <Text className="font-mono text-[11px] text-white/80">
                      {b.keyName}
                    </Text>
                  </View>
                  <Text className="text-[12px] font-black tracking-widest text-white">
                    {b.tokens.toLocaleString()}
                  </Text>
                </View>
              );
            })}
          </View>
        </Animated.View>
      )}
    </View>
  );
};

// ─── MODULE 2: ZERO-JUMP ANIMATED STACKED BAR CHART ──────────────────────────
const AnimatedStackedBar = ({
  dataPoint,
  globalMaxMonthly,
  maxHeight,
  isSelected,
  onHoverIn,
  onHoverOut,
  hiddenKeys,
}: {
  dataPoint: ChartDataPoint;
  globalMaxMonthly: number;
  maxHeight: number;
  isSelected: boolean;
  onHoverIn: () => void;
  onHoverOut: () => void;
  hiddenKeys: Set<string>;
}) => {
  const visibleTotal = useMemo(() => {
    return dataPoint.breakdown.reduce(
      (sum, b) => (hiddenKeys.has(b.keyName) ? sum : sum + b.tokens),
      0,
    );
  }, [dataPoint, hiddenKeys]);

  const animatedWrapperStyle = useAnimatedStyle(() => {
    const targetHeight =
      globalMaxMonthly > 0
        ? (dataPoint.total / globalMaxMonthly) * maxHeight
        : 0;
    const finalHeight = Math.max(targetHeight, dataPoint.total > 0 ? 8 : 0);
    return {
      height: withSpring(finalHeight, { damping: 15, stiffness: 90 }),
      opacity: withTiming(isSelected ? 1 : 0.5, { duration: 150 }),
    };
  });

  return (
    <View className="items-center justify-end flex-1 h-full mx-[2px] md:mx-1 max-w-[48px] relative">
      <Pressable
        {...(Platform.OS === 'web'
          ? { onHoverIn, onHoverOut }
          : { onPressIn: onHoverIn, onPressOut: onHoverOut })}
        className="items-center justify-end w-full h-full"
      >
        <View className="absolute bottom-0 w-full h-full bg-white/[0.015] rounded-t-lg border-x border-t border-white/[0.03]" />

        <Animated.View
          style={[
            animatedWrapperStyle,
            {
              width: '100%',
              borderRadius: 6,
              overflow: 'hidden',
              justifyContent: 'flex-end',
              zIndex: 10,
            },
          ]}
        >
          {dataPoint.breakdown.map((segment, idx) => {
            const isHidden = hiddenKeys.has(segment.keyName);
            const segmentHeightPct =
              isHidden || dataPoint.total === 0
                ? 0
                : (segment.tokens / dataPoint.total) * 100;
            return (
              <Animated.View
                key={idx}
                style={useAnimatedStyle(() => ({
                  height: withSpring(`${segmentHeightPct}%`, { damping: 15 }),
                  width: '100%',
                  backgroundColor: segment.color,
                  opacity: withTiming(isHidden ? 0 : 1),
                }))}
              />
            );
          })}
        </Animated.View>

        <Text
          className={`absolute bottom-[-24px] text-[8px] md:text-[10px] uppercase tracking-wider transition-colors duration-200 ${isSelected ? 'text-[#8A2BE2] font-black' : 'text-white/30 font-bold'}`}
          numberOfLines={1}
        >
          {dataPoint.label}
        </Text>
      </Pressable>

      {/* Floating Tooltip */}
      {isSelected && visibleTotal > 0 && (
        <Animated.View
          entering={FadeInUp.springify().damping(15)}
          className="absolute z-50 items-center mb-3 -translate-x-1/2 pointer-events-none bottom-full left-1/2"
        >
          <View className="bg-[#020205]/95 border border-[#8A2BE2]/40 rounded-2xl p-3 min-w-[180px] shadow-[0_10px_30px_rgba(138,43,226,0.15)] backdrop-blur-md">
            <Text className="text-[#8A2BE2] text-[9px] font-black uppercase tracking-[2px] mb-2 text-center">
              {dataPoint.fullDate}
            </Text>
            {dataPoint.breakdown.map((b, idx) => {
              if (hiddenKeys.has(b.keyName)) return null;
              return (
                <View
                  key={idx}
                  className="flex-row items-center justify-between mb-1 gap-x-4"
                >
                  <View className="flex-row items-center gap-x-1.5">
                    <View
                      style={{ backgroundColor: b.color }}
                      className="w-2 h-2 rounded-full"
                    />
                    <Text className="font-mono text-[9px] text-white/80">
                      {b.keyName}
                    </Text>
                  </View>
                  <Text className="text-[10px] font-black tracking-widest text-white">
                    {b.tokens.toLocaleString()}
                  </Text>
                </View>
              );
            })}
          </View>
        </Animated.View>
      )}
    </View>
  );
};

// ─── MAIN DASHBOARD COMPONENT ────────────────────────────────────────────────
export default function ApiKeysDashboard() {
  const router = useRouter();
  const { width: SCREEN_WIDTH } = Dimensions.get('window');
  const isMobile = SCREEN_WIDTH < 768;

  const [keys, setKeys] = useState<SystemKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [dailyData, setDailyData] = useState<ChartDataPoint[]>([]);
  const [monthlyData, setMonthlyData] = useState<ChartDataPoint[]>([]);
  const [allUniqueKeys, setAllUniqueKeys] = useState<Set<string>>(new Set());
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  const [selectedDailyIdx, setSelectedDailyIdx] = useState<number | null>(null);
  const [selectedMonthlyIdx, setSelectedMonthlyIdx] = useState<number | null>(
    null,
  );

  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const { data: keyData, error: keyError } = await supabase
        .from('system_api_keys')
        .select('*')
        .order('created_at', { ascending: true });
      if (keyError) throw keyError;
      if (keyData) setKeys(keyData);

      const startOfYear = new Date(new Date().getFullYear(), 0, 1);
      const { data: rawLogs, error: logsError } = await supabase
        .from('usage_logs')
        .select('tokens_consumed, created_at, metadata')
        .gte('created_at', startOfYear.toISOString());

      if (logsError) throw logsError;

      const typedLogs = (rawLogs || []) as RawLog[];
      setDailyData(buildDailyData(typedLogs));
      setMonthlyData(buildMonthlyData(typedLogs));

      const unique = new Set<string>();
      typedLogs.forEach((r) => {
        if (r.metadata?.api_key_name) unique.add(r.metadata.api_key_name);
      });
      setAllUniqueKeys(unique);
    } catch (err: any) {
      Alert.alert('Telemetry Sync Error', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleKeyVisibility = (keyName: string) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(keyName)) next.delete(keyName);
      else next.add(keyName);
      return next;
    });
  };

  const globalMaxMonthly = useMemo(() => {
    return Math.max(...monthlyData.map((d) => d.total), 10);
  }, [monthlyData]);

  const handleAddKey = async () => {
    if (!newKeyName || newKeyValue.length < 10)
      return Alert.alert('Protocol Error', 'Valid alias and API key required.');
    setIsAdding(true);
    try {
      const preview = `...${newKeyValue.slice(-6)}`;
      const { error } = await supabase.from('system_api_keys').insert({
        name: newKeyName,
        encrypted_key: newKeyValue,
        key_preview: preview,
        status: 'active',
        tokens_burned: 0,
      });
      if (error) throw error;
      setNewKeyName('');
      setNewKeyValue('');
      fetchDashboardData();
    } catch (err: any) {
      Alert.alert('Injection Failed', err.message);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    try {
      const { error } = await supabase
        .from('system_api_keys')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setKeys(keys.filter((k) => k.id !== id));
    } catch (err: any) {
      Alert.alert('Deletion Failed', err.message);
    }
  };

  // ─── UPGRADED LEGEND: Exact totals explicitly visible without hovering ───
  const ChartLegend = ({ chartData }: { chartData: ChartDataPoint[] }) => {
    const totals = useMemo(() => {
      const acc: Record<string, number> = {};
      allUniqueKeys.forEach((k) => (acc[k] = 0));
      chartData.forEach((d) => {
        d.breakdown.forEach((b) => {
          if (acc[b.keyName] !== undefined) {
            acc[b.keyName] += b.tokens;
          }
        });
      });
      return acc;
    }, [chartData, allUniqueKeys]);

    return (
      <View className="flex-row flex-wrap items-center justify-center gap-3 pt-6 mt-6 border-t border-white/5">
        {Array.from(allUniqueKeys).map((keyName) => {
          const isHidden = hiddenKeys.has(keyName);
          const keyColor = getColorForKey(keyName);
          const totalTokens = totals[keyName] || 0;

          // Don't render keys in the legend if they have 0 volume for this specific chart
          if (totalTokens === 0) return null;

          return (
            <TouchableOpacity
              key={keyName}
              onPress={() => toggleKeyVisibility(keyName)}
              activeOpacity={0.7}
              className={`flex-row items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-300 ${isHidden ? 'border-white/5 bg-transparent opacity-40 scale-95' : 'border-white/10 bg-white/5 shadow-[0_0_10px_rgba(0,0,0,0.5)] scale-100'}`}
            >
              <View
                style={{ backgroundColor: isHidden ? '#333' : keyColor }}
                className="w-2.5 h-2.5 rounded-full"
              />
              <Text
                className={`text-[10px] font-black uppercase tracking-widest ${isHidden ? 'text-white/30 line-through' : 'text-white'}`}
              >
                {keyName}{' '}
                <Text className="ml-1 font-mono tracking-normal text-white/50">
                  [{totalTokens.toLocaleString()}]
                </Text>
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-[#020205]">
      {/* ─── RENDER AMBIENT ORB ENGINE BEHIND EVERYTHING ─── */}
      <View className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <AmbientOrb
          color={THEME.cyan}
          size={500}
          top={-100}
          left={-150}
          delay={0}
          opacity={0.08}
        />
        <AmbientOrb
          color={THEME.purple}
          size={600}
          bottom={-200}
          right={-200}
          delay={1000}
          opacity={0.06}
        />
      </View>

      {/* ─── FOREGROUND UI ─── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="z-10 flex-1"
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: isMobile ? 16 : 40,
            paddingTop: 24,
            paddingBottom: 150,
            flexGrow: 1,
            maxWidth: 1200,
            alignSelf: 'center',
            width: '100%',
          }}
        >
          {/* ─── HEADER ─── */}
          <FadeIn delay={100} className="w-full mb-10">
            <View className="relative flex-row items-center justify-center w-full h-16 mb-2">
              <TouchableOpacity
                onPress={() => router.replace('/admin')}
                className="absolute left-0 z-50 flex-row items-center py-2 gap-x-2 active:scale-95"
              >
                <ArrowBigLeftDash size={20} color={THEME.cyan} />
                <Text className="text-[11px] font-black tracking-[4px] text-[#00F0FF] uppercase hidden md:flex">
                  RETURN
                </Text>
              </TouchableOpacity>
              <View className="items-center justify-center pointer-events-none">
                <Image
                  source={require('../../../assets/api128.png')}
                  style={{ width: 64, height: 64 }}
                  resizeMode="contain"
                />
              </View>
              <TouchableOpacity
                onPress={fetchDashboardData}
                className="absolute right-0 z-50 items-center justify-center w-10 h-10 border rounded-2xl bg-[#00F0FF]/10 border-[#00F0FF]/20 active:scale-95"
              >
                <RefreshCcw size={16} color={THEME.cyan} />
              </TouchableOpacity>
            </View>
            <View className="items-center justify-center w-full mt-2">
              <Text className="text-[9px] md:text-[12px] font-bold text-[#00F0FF]/60 uppercase tracking-[2px]">
                {keys.length} FALLBACK NODES
              </Text>
            </View>
          </FadeIn>

          {isLoading ? (
            <ActivityIndicator
              size="large"
              color={THEME.cyan}
              className="mt-20"
            />
          ) : (
            <>
              {/* ─── MODULE 1: DAILY VELOCITY CHART (MULTI-LINE) ─── */}
              <FadeIn delay={200}>
                <GlassCard className="p-6 md:p-8 mb-8 border bg-white/[0.015] border-white/5 rounded-3xl md:rounded-[32px] overflow-visible">
                  <View className="flex-row items-center mb-10 gap-x-3 md:mb-12">
                    <Activity size={24} color={THEME.danger} />
                    <Text className="text-sm font-black tracking-widest text-white uppercase md:text-base">
                      Network Velocity (7D)
                    </Text>
                  </View>
                  <View className="relative z-20 h-64 pb-8">
                    {dailyData.length > 0 && (
                      <SvgMultiLineChart
                        data={dailyData}
                        allUniqueKeys={allUniqueKeys}
                        hiddenKeys={hiddenKeys}
                        selectedIndex={selectedDailyIdx}
                        setSelectedIndex={setSelectedDailyIdx}
                      />
                    )}
                  </View>
                  <ChartLegend chartData={dailyData} />
                </GlassCard>
              </FadeIn>

              {/* ─── MODULE 2: MONTHLY VOLUME CHART (JAN -> DEC STACKED BARS) ─── */}
              <FadeIn delay={300}>
                <GlassCard className="p-6 md:p-8 mb-8 border bg-white/[0.015] border-white/5 rounded-3xl md:rounded-[32px] overflow-visible">
                  <View className="flex-row items-center mb-10 gap-x-3 md:mb-12">
                    <BarChart2 size={24} color={THEME.purple} />
                    <Text className="text-sm font-black tracking-widest text-white uppercase md:text-base">
                      Volume Aggregation (12M)
                    </Text>
                  </View>
                  <View className="relative z-20 flex-row items-end justify-between h-64 px-1 pb-10 md:px-4">
                    {monthlyData.map((point, idx) => (
                      <AnimatedStackedBar
                        key={`monthly-${idx}`}
                        dataPoint={point}
                        globalMaxMonthly={globalMaxMonthly}
                        maxHeight={200}
                        isSelected={selectedMonthlyIdx === idx}
                        onHoverIn={() => setSelectedMonthlyIdx(idx)}
                        onHoverOut={() => setSelectedMonthlyIdx(null)}
                        hiddenKeys={hiddenKeys}
                      />
                    ))}
                  </View>
                  <ChartLegend chartData={monthlyData} />
                </GlassCard>
              </FadeIn>

              {/* ─── MODULE 3: SYSTEM FALLBACK KEYS VAULT ─── */}
              <FadeIn delay={400}>
                <GlassCard className="p-6 md:p-8 mb-8 border bg-white/[0.015] border-white/5 rounded-3xl md:rounded-[32px]">
                  <View className="flex-row items-center mb-8 gap-x-3">
                    <ShieldCheck size={24} color={THEME.success} />
                    <Text className="text-sm font-black tracking-widest text-white uppercase md:text-base">
                      Cascading Fallback Matrix
                    </Text>
                  </View>

                  <View className="z-50 flex-col gap-4 mb-10 md:flex-row">
                    <View className="flex-1 h-14 border bg-black/40 border-white/10 rounded-[20px] px-5 focus-within:border-[#00F0FF] justify-center">
                      <TextInput
                        value={newKeyName}
                        onChangeText={setNewKeyName}
                        placeholder="Alias (e.g., Gemini-Backup-1)"
                        placeholderTextColor="rgba(255,255,255,0.2)"
                        style={strictInputStyle}
                        autoComplete="off"
                        autoCorrect={false}
                        spellCheck={false}
                      />
                    </View>
                    <View className="flex-[2] h-14 border bg-black/40 border-white/10 rounded-[20px] px-5 focus-within:border-[#00F0FF] justify-center">
                      <TextInput
                        value={newKeyValue}
                        onChangeText={setNewKeyValue}
                        keyboardType="visible-password"
                        placeholder="API Key (AIzaSy...)"
                        placeholderTextColor="rgba(255,255,255,0.2)"
                        style={strictInputStyle}
                        autoComplete="off"
                        autoCorrect={false}
                        spellCheck={false}
                      />
                    </View>
                    <TouchableOpacity
                      onPress={handleAddKey}
                      disabled={isAdding}
                      className="h-14 px-8 items-center justify-center bg-[#00F0FF]/10 border border-[#00F0FF]/30 rounded-[20px] active:scale-95"
                    >
                      {isAdding ? (
                        <ActivityIndicator size="small" color={THEME.cyan} />
                      ) : (
                        <View className="flex-row items-center gap-2">
                          <Plus size={18} color={THEME.cyan} />
                          <Text className="text-xs font-black text-[#00F0FF] uppercase tracking-widest md:hidden">
                            Add Key
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>

                  <View className="gap-y-3">
                    {keys.length === 0 ? (
                      <View className="items-center justify-center py-10 border border-dashed border-white/10 rounded-[20px]">
                        <Text className="text-xs tracking-widest uppercase text-white/40">
                          No fallback keys registered.
                        </Text>
                      </View>
                    ) : (
                      keys.map((key) => {
                        const keyColor = getColorForKey(key.name);
                        return (
                          <View
                            key={key.id}
                            className="flex-col md:flex-row items-start md:items-center px-5 py-4 gap-y-3 md:gap-y-0 bg-black/40 border border-white/5 rounded-2xl md:rounded-[16px]"
                          >
                            <View className="flex-[2] flex-row items-center gap-x-3 w-full md:w-auto">
                              <View
                                className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px]"
                                style={{
                                  backgroundColor: keyColor,
                                  shadowColor: keyColor,
                                }}
                              />
                              <Text className="text-sm font-black text-white md:text-xs">
                                {key.name}
                              </Text>
                            </View>
                            <Text className="flex-[2] text-xs font-mono text-white/50 w-full md:w-auto">
                              {key.key_preview}
                            </Text>
                            <View className="flex-row items-start justify-between flex-1 w-full md:items-end md:w-auto md:flex-col md:justify-center">
                              <Text className="text-[10px] text-white/30 tracking-[2px] uppercase md:hidden">
                                Tokens:
                              </Text>
                              <Text className="text-[12px] md:text-[10px] font-black text-[#00F0FF] tracking-widest">
                                {Number(
                                  key.tokens_burned || 0,
                                ).toLocaleString()}
                              </Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => handleDeleteKey(key.id)}
                              className="absolute items-end justify-center w-10 py-2 top-4 right-4 md:relative md:top-0 md:right-0"
                            >
                              <Trash2
                                size={16}
                                color={THEME.danger}
                                opacity={0.6}
                              />
                            </TouchableOpacity>
                          </View>
                        );
                      })
                    )}
                  </View>
                </GlassCard>
              </FadeIn>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Core UI kit for ZCS Connect, matching the Claude Design screens.
import * as Haptics from 'expo-haptics';
import type { LucideIcon } from 'lucide-react-native';
import { ChevronLeft, Lock } from 'lucide-react-native';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, Pressable, StyleSheet, Text, View,
  type PressableProps, type StyleProp, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { font, MAIZE, NAVY } from '@/theme/tokens';

// ---------------------------------------------------------------- text
type TProps = TextProps & { style?: StyleProp<TextStyle> };

export function H({ size = 30, style, ...p }: TProps & { size?: number }) {
  const { c } = useTheme();
  return <Text accessibilityRole="header" maxFontSizeMultiplier={1.6} {...p}
    style={[{ fontFamily: font.heading, fontSize: size, lineHeight: Math.round(size * 1.16), color: c.tx }, style]} />;
}

export function T({ tone = 'tx', size = 16, weight, style, ...p }: TProps & { tone?: 'tx' | 'tx2' | 'tx3' | 'link' | 'ok'; size?: number; weight?: TextStyle['fontWeight'] }) {
  const { c } = useTheme();
  return <Text maxFontSizeMultiplier={1.8} {...p} style={[{ color: c[tone], fontSize: size, lineHeight: Math.round(size * 1.42), fontWeight: weight }, style]} />;
}

export function SectionLabel({ children, icon: Icon, style }: { children: ReactNode; icon?: LucideIcon; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 18, paddingBottom: 8, paddingHorizontal: 4 }, style]}>
      {Icon ? <Icon size={14} color={c.tx2} /> : null}
      <Text style={{ fontSize: 13, fontWeight: '600', color: c.tx2, textTransform: 'uppercase', letterSpacing: 0.65 }}>{children}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- buttons
type Variant = 'primary' | 'secondary' | 'ghost' | 'maize' | 'apple' | 'onNavy' | 'danger';

export function Button({ label, onPress, variant = 'primary', icon: Icon, leading, loading, disabled, height = 52, style, accessibilityLabel }: {
  label: string; onPress?: () => void; variant?: Variant; icon?: LucideIcon; leading?: ReactNode; loading?: boolean;
  disabled?: boolean; height?: number; style?: StyleProp<ViewStyle>; accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const v = {
    primary: { bg: c.pri, fg: c.priTx, bd: 'transparent', heading: true },
    secondary: { bg: c.sf, fg: c.tx, bd: c.bdS, heading: false },
    ghost: { bg: 'transparent', fg: c.link, bd: 'transparent', heading: false },
    maize: { bg: MAIZE, fg: NAVY, bd: 'transparent', heading: true },
    apple: { bg: c.apple, fg: c.appleTx, bd: 'transparent', heading: false },
    onNavy: { bg: 'transparent', fg: '#FFFFFF', bd: 'rgba(255,255,255,0.35)', heading: false },
    danger: { bg: '#B3261E', fg: '#FFFFFF', bd: 'transparent', heading: true },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress?.(); }}
      style={({ pressed }) => [{
        minHeight: variant === 'ghost' ? 44 : height, borderRadius: height >= 54 ? 14 : 12, backgroundColor: v.bg,
        borderWidth: v.bd === 'transparent' ? 0 : 1, borderColor: v.bd, flexDirection: 'row', alignItems: 'center',
        justifyContent: 'center', gap: 8, paddingHorizontal: 18, opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      }, style]}>
      {loading ? <ActivityIndicator color={v.fg} /> : (
        <>
          {leading}
          {Icon ? <Icon size={19} color={v.fg} /> : null}
          <Text maxFontSizeMultiplier={1.4} style={{ color: v.fg, fontSize: variant === 'ghost' ? 16 : 17, textAlign: 'center', flexShrink: 1,
            fontFamily: v.heading ? font.heading : undefined, fontWeight: v.heading ? undefined : '600' }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ icon: Icon, onPress, label, color, bg, size = 22, style }: {
  icon: LucideIcon; onPress?: () => void; label: string; color?: string; bg?: string; size?: number; style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4}
      style={({ pressed }) => [{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
        backgroundColor: bg ?? 'transparent', opacity: pressed ? 0.6 : 1 }, style]}>
      <Icon size={size} color={color ?? c.link} />
    </Pressable>
  );
}

export function BackButton({ label = 'Back', onPress, color }: { label?: string; onPress: () => void; color?: string }) {
  const { c } = useTheme();
  const fg = color ?? c.link;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6}
      style={{ minWidth: 44, height: 44, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <ChevronLeft size={26} color={fg} />
      {label ? <Text style={{ color: fg, fontSize: 17 }}>{label}</Text> : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------- surfaces
export function Card({ children, style, onPress, borderColor, accessibilityLabel }: {
  children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; borderColor?: string; accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const base: ViewStyle = { backgroundColor: c.sf, borderWidth: 1, borderColor: borderColor ?? c.bd, borderRadius: 16 };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}
      style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}>{children}</Pressable>
  );
}

/** Grouped list container (rounded card with hairline separators between rows). */
export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ backgroundColor: c.sf, borderRadius: 16, borderWidth: 1, borderColor: c.bd, overflow: 'hidden' }, style]}>{children}</View>;
}

export function Row({ children, onPress, last, style, accessibilityLabel, accessibilityRole }: {
  children: ReactNode; onPress?: () => void; last?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string;
  accessibilityRole?: PressableProps['accessibilityRole'];
}) {
  const { c } = useTheme();
  const s: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, minHeight: 56,
    borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth * 2, borderBottomColor: c.bd };
  if (!onPress) return <View style={[s, style]}>{children}</View>;
  return <Pressable accessibilityRole={accessibilityRole ?? 'button'} accessibilityLabel={accessibilityLabel} onPress={onPress}
    style={({ pressed }) => [s, { backgroundColor: pressed ? c.sf2 : 'transparent' }, style]}>{children}</Pressable>;
}

export function Avatar({ text, size = 36, tone = 'strong', icon: Icon }: { text?: string; size?: number; tone?: 'strong' | 'tint' | 'neutral'; icon?: LucideIcon }) {
  const { c } = useTheme();
  const bg = tone === 'strong' ? c.avBg : tone === 'tint' ? c.tint : c.sf2;
  const fg = tone === 'strong' ? c.avTx : tone === 'tint' ? c.link : c.tx;
  return (
    <View importantForAccessibility="no-hide-descendants" style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      {Icon ? <Icon size={size * 0.45} color={fg} /> : <Text style={{ color: fg, fontFamily: font.heading, fontSize: Math.round(size * 0.37) }}>{text}</Text>}
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { c, strong, strongTx } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}
      style={{ minHeight: 36, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1,
        borderColor: active ? 'transparent' : c.bdS, backgroundColor: active ? strong : c.sf, justifyContent: 'center' }}>
      <Text style={{ color: active ? strongTx : c.tx, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Pill({ label, icon: Icon, bg, fg }: { label: string; icon?: LucideIcon; bg: string; fg: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: bg, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, alignSelf: 'flex-start' }}>
      {Icon ? <Icon size={12} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function Badge({ count }: { count: number }) {
  const { c } = useTheme();
  if (!count) return null;
  return (
    <View accessibilityLabel={`${count} unread`} style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.badge, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: c.badgeTx, fontSize: 11, fontWeight: '700' }}>{count}</Text>
    </View>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: c.sf2, borderRadius: 10, padding: 2 }}>
      {options.map((o) => {
        const a = o.id === value;
        return (
          <Pressable key={o.id} accessibilityRole="tab" accessibilityState={{ selected: a }} onPress={() => onChange(o.id)}
            style={{ flex: 1, minHeight: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: a ? c.sf : 'transparent',
              shadowColor: '#000', shadowOpacity: a ? 0.15 : 0, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: a ? 1 : 0 }}>
            <Text style={{ color: c.tx, fontSize: 14, fontWeight: '600' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** iOS-style switch drawn to the design (navy/maize track; lock glyph when forced on). */
export function Toggle({ on, locked, onPress, label }: { on: boolean; locked?: boolean; onPress: () => void; label: string }) {
  const { c, strong } = useTheme();
  const x = useRef(new Animated.Value(on ? 22 : 2)).current;
  useEffect(() => { Animated.timing(x, { toValue: on ? 22 : 2, duration: 180, useNativeDriver: false }).start(); }, [on, x]);
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: on, disabled: locked }} onPress={onPress}
      style={{ width: 51, height: 31, borderRadius: 16, backgroundColor: on ? strong : c.swOff, opacity: locked ? 0.75 : 1 }}>
      <Animated.View style={{ position: 'absolute', top: 2, left: x, width: 27, height: 27, borderRadius: 14, backgroundColor: '#fff',
        shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 2 }, elevation: 2, alignItems: 'center', justifyContent: 'center' }}>
        {locked ? <Lock size={12} color={NAVY} /> : null}
      </Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------- states
export function Skeleton({ w = '100%', h = 12, r = 6, tone = 2 }: { w?: number | `${number}%`; h?: number; r?: number; tone?: 1 | 2 }) {
  const { c } = useTheme();
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View style={{ width: w, height: h, borderRadius: r, backgroundColor: tone === 2 ? c.ph2 : c.ph1, opacity: o }} />;
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ paddingVertical: 64, paddingHorizontal: 36, alignItems: 'center', gap: 12 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.tint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={32} color={c.link} />
      </View>
      <Text style={{ fontFamily: font.heading, fontSize: 20, color: c.tx, textAlign: 'center' }}>{title}</Text>
      <Text style={{ fontSize: 15, lineHeight: 22, color: c.tx2, textAlign: 'center' }}>{body}</Text>
      {action}
    </View>
  );
}

export function Notice({ icon: Icon, children, tone = 'neutral', style }: { icon: LucideIcon; children: ReactNode; tone?: 'neutral' | 'ok'; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: tone === 'ok' ? c.okBg : c.sf2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }, style]}>
      <Icon size={18} color={tone === 'ok' ? c.ok : c.tx} />
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 19, color: c.tx }}>{children}</Text>
    </View>
  );
}

/** Top inset spacer + 44pt nav row, used by stack screens. */
export function NavBar({ left, right, bg, children }: { left?: ReactNode; right?: ReactNode; bg?: string; children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: bg }}>
      <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>{left}</View>
        {children}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>{right}</View>
      </View>
    </View>
  );
}

export function ScreenTitle({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <H size={32} style={[{ lineHeight: 38 }, style]}>{children}</H>;
}

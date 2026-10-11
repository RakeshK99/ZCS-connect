import { CircleCheck } from 'lucide-react-native';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Text, View } from 'react-native';
import { MAIZE, NAVY } from '@/theme/tokens';

const ToastContext = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((m: string) => {
    setMessage(m);
    AccessibilityInfo.announceForAccessibility(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 2600);
  }, []);

  useEffect(() => {
    Animated.timing(opacity, { toValue: message ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [message, opacity]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: 100, opacity, zIndex: 100 }}>
        {message ? (
          <View accessibilityLiveRegion="polite" style={{ backgroundColor: NAVY, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16, flexDirection: 'row', gap: 10, alignItems: 'center',
            shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 10 }, elevation: 6 }}>
            <CircleCheck size={18} color={MAIZE} />
            <Text style={{ color: '#fff', fontSize: 15, flex: 1 }}>{message}</Text>
          </View>
        ) : null}
      </Animated.View>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Dimensions, KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';

/** Bottom sheet with scrim and grabber, as in the design's role switcher and quick compose. */
export function Sheet({ visible, onClose, children, height }: { visible: boolean; onClose: () => void; children: ReactNode; height?: number }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(Dimensions.get('window').height)).current;

  useEffect(() => {
    if (visible) Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
    else y.setValue(Dimensions.get('window').height);
  }, [visible, y]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.scrim }} />
        <Animated.View accessibilityViewIsModal style={{ transform: [{ translateY: y }], backgroundColor: c.sf, borderTopLeftRadius: 20, borderTopRightRadius: 20,
          paddingBottom: Math.max(insets.bottom, 16), height }}>
          <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: c.bd, alignSelf: 'center', marginTop: 8, marginBottom: 4 }} />
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

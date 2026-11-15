// Soft launch: testers tell us what's confusing or broken without leaving the
// app. Notes go to the office's Feedback page in the staff console.
import { api } from '@zcs/core';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { MessageSquareHeart, Send, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { H, IconButton } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useLinked } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { font } from '@/theme/tokens';

const PROMPTS = ['Something didn’t work', 'Something was confusing', 'I wish it could…'];

export default function Feedback() {
  const { c, strong, strongTx } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { context } = useLinked();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = body.trim().length > 0 && !busy;

  const send = async () => {
    try {
      setBusy(true);
      await api.sendFeedback(supabase, body, {
        version: Constants.expoConfig?.version ?? '',
        build: String(Platform.OS === 'ios' ? Constants.expoConfig?.ios?.buildNumber ?? '' : Constants.expoConfig?.android?.versionCode ?? ''),
        platform: Platform.OS,
        os: String(Platform.Version),
        context: context.key,
      });
      toast('Thanks! Your note was sent.');
      router.back();
    } catch (e) {
      Alert.alert('Send feedback', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16 }}>
        <H size={24}>Send feedback</H>
        <IconButton icon={X} label="Close" color={c.tx2} onPress={() => router.back()} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <MessageSquareHeart size={20} color={c.link} />
          <Text style={{ flex: 1, fontSize: 15, lineHeight: 21, color: c.tx2 }}>
            ZCS Connect is brand new, and your notes shape what we fix next. Tell us what happened, what you expected, or what you wish it did.
          </Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {PROMPTS.map((p) => (
            <Pressable key={p} accessibilityRole="button" accessibilityLabel={`Start with: ${p}`}
              onPress={() => setBody((b) => (b.trim() ? b : `${p}: `))}
              style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: c.bdS, justifyContent: 'center' }}>
              <Text style={{ color: c.tx, fontSize: 14 }}>{p}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput value={body} onChangeText={setBody} multiline autoFocus maxLength={4000} textAlignVertical="top"
          placeholder="What's on your mind?" placeholderTextColor={c.tx3} accessibilityLabel="Your feedback"
          style={{ minHeight: 180, borderRadius: 12, borderWidth: 1, borderColor: c.bdS, backgroundColor: c.sf, padding: 14, fontSize: 17, lineHeight: 23, color: c.tx }} />
        <Text style={{ fontSize: 13, color: c.tx2 }}>
          Your name, the app version and your phone type are sent with your note. For anything about your child, contact the office instead.
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Send feedback" accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={send}
          style={{ minHeight: 52, borderRadius: 14, backgroundColor: strong, opacity: ready ? 1 : 0.45, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {busy ? <ActivityIndicator color={strongTx} /> : <Send size={18} color={strongTx} />}
          <Text style={{ color: strongTx, fontFamily: font.heading, fontSize: 17 }}>Send</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

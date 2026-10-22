// Quick compose sheet (design option B): one-tap toggles and a big Send button so
// a teacher can post in under 30 seconds. The server re-checks every audience.
import { useQueryClient } from '@tanstack/react-query';
import { api, isStaff, type AudienceOption, type Priority } from '@zcs/core';
import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { CircleCheck, Clock, ImagePlus, Mic, Pin, Send, Siren, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Keyboard, KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, H, IconButton } from '@/components/ui';
import { useAudiences } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { font, MAIZE, NAVY, RED } from '@/theme/tokens';

type Photo = { uri: string; width: number; height: number; mime: string; size: number };

function tomorrowAt7() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(7, 0, 0, 0);
  return d;
}

function splitTitle(text: string) {
  const trimmed = text.trim();
  const [first = '', ...rest] = trimmed.split('\n');
  if (first.length <= 90) return { title: first.trim(), body: rest.join('\n').trim() || '' };
  const cut = first.lastIndexOf(' ', 80);
  return { title: `${first.slice(0, cut > 40 ? cut : 80).trim()}…`, body: trimmed };
}

async function upload(photo: Photo, prefix: string) {
  const ext = photo.mime.includes('png') ? 'png' : photo.mime.includes('heic') ? 'heic' : 'jpg';
  const path = `${prefix}/${Crypto.randomUUID()}.${ext}`;
  const buf = await (await fetch(photo.uri)).arrayBuffer();
  const { error } = await supabase.storage.from('attachments').upload(path, buf, { contentType: photo.mime, upsert: false });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
  return { storage_path: path, kind: 'image' as const, file_name: path.split('/').pop()!, size_bytes: buf.byteLength };
}

export default function Compose() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { ready, linked, context } = useSession();
  const { classId } = useLocalSearchParams<{ classId?: string }>();
  const staff = isStaff(context) ? context : null;
  const audiences = useAudiences(!!staff).data ?? [];
  const [target, setTarget] = useState<AudienceOption | null>(null);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [ack, setAck] = useState(false);
  const [important, setImportant] = useState(false);
  const [emergency, setEmergency] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const [sending, setSending] = useState(false);
  const input = useRef<TextInput>(null);
  const y = useRef(new Animated.Value(Dimensions.get('window').height)).current;

  const [keyboardUp, setKeyboardUp] = useState(false);
  const draft = useRef({ text: '', photos: 0 });
  draft.current = { text, photos: photos.length };

  useEffect(() => { Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start(); }, [y]);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardUp(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Close, asking first if there's a draft. `onKeep` runs when the teacher keeps editing.
  const close = useRef((onKeep?: () => void) => {
    const leave = () => { Keyboard.dismiss(); router.back(); };
    if (!draft.current.text.trim() && !draft.current.photos) return leave();
    Alert.alert('Discard this post?', "What you've written won't be saved.", [
      { text: 'Keep editing', style: 'cancel', onPress: onKeep },
      { text: 'Discard', style: 'destructive', onPress: leave },
    ]);
  }).current;

  // Drag the grabber or header down to close, like a native sheet.
  const springBack = () => Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
  const drag = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => Keyboard.dismiss(),
    onPanResponderMove: (_, g) => y.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => (g.dy > 120 || g.vy > 1 ? close(springBack) : springBack()),
    onPanResponderTerminate: () => springBack(),
  })).current;

  const options = useMemo(() => [...audiences].sort((a, b) => Number(b.mine ?? false) - Number(a.mine ?? false)), [audiences]);
  useEffect(() => {
    if (target || !options.length) return;
    setTarget(options.find((o) => o.id === classId) ?? options.find((o) => o.mine) ?? options[0]!);
  }, [options, classId, target]);

  if (!ready || (linked && !context)) return null;
  if (!linked || !staff) return <Redirect href="/" />;

  const families = target?.type === 'class' ? staff.classes.find((k) => k.id === target.id)?.families : undefined;
  const priority: Priority = emergency ? 'emergency' : important ? 'important' : 'normal';

  const pickPhotos = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 10 - photos.length, quality: 0.7 });
    if (res.canceled) return;
    const big = res.assets.find((a) => (a.fileSize ?? 0) > 25 * 1024 * 1024);
    if (big) Alert.alert('Photos', 'Photos must be under 25 MB each.');
    setPhotos((p) => [...p, ...res.assets.filter((a) => (a.fileSize ?? 0) <= 25 * 1024 * 1024)
      .map((a) => ({ uri: a.uri, width: a.width, height: a.height, mime: a.mimeType ?? 'image/jpeg', size: a.fileSize ?? 0 }))].slice(0, 10));
  };

  const toggleEmergency = () => {
    if (emergency) return setEmergency(false);
    Alert.alert('Send as an emergency alert?', 'Emergency alerts bypass quiet hours and go out by notification and email right away. Use only for safety and closures.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Mark as emergency', style: 'destructive', onPress: () => { setEmergency(true); setScheduled(false); } }]);
  };

  const send = async () => {
    if (!target) return;
    const { title, body } = splitTitle(text);
    if (!title) return Alert.alert('Post', 'Write what families need to know.');
    try {
      setSending(true);
      const prefix = `${linked.school.id}/${linked.person.id}`;
      const attachments = await Promise.all(photos.map(async (p, i) => ({ ...(await upload(p, prefix)), sort_order: i })));
      const res = await api.createPost(supabase, {
        title, body, audience: [{ type: target.type, id: target.id }], priority, requireAck: ack,
        scheduledAt: scheduled ? tomorrowAt7().toISOString() : null, attachments,
      });
      qc.invalidateQueries({ queryKey: ['feed'] });
      if (res.scheduled) { router.back(); Alert.alert('Scheduled', 'Your post will go out tomorrow at 7:00 AM.'); }
      else router.replace(`/reach/${res.id}`);
    } catch (e) {
      Alert.alert("Couldn't send", (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const sendLabel = scheduled ? 'Schedule for tomorrow, 7:00 AM' : emergency ? 'Send emergency alert' : families ? `Send to ${families} families` : 'Send';

  return (
    // The sheet is 660pt tall at most and shrinks to fit between the status bar and the
    // keyboard, so the header (and its close button) never goes off screen.
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', paddingTop: insets.top + 8 }}>
      <Pressable accessibilityLabel="Close" onPress={() => close()} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.scrim }} />
      <Animated.View accessibilityViewIsModal style={{ transform: [{ translateY: y }], flexBasis: 660, flexGrow: 0, flexShrink: 1, minHeight: 0,
        backgroundColor: c.sf, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' }}>
        <View {...drag.panHandlers}>
          <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: c.bd, alignSelf: 'center', marginTop: 8, marginBottom: 4 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 8, paddingVertical: 4 }}>
            <H size={20}>Post to</H>
            <IconButton icon={X} label="Close" color={c.tx2} onPress={() => close()} />
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 }}>
          {options.map((o) => <Chip key={`${o.type}:${o.id ?? ''}`} label={o.label} active={target?.type === o.type && target?.id === o.id} onPress={() => setTarget(o)} />)}
        </ScrollView>

        <View style={{ flex: 1, paddingHorizontal: 16 }}>
          {emergency ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: RED, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 }}>
              <Siren size={16} color="#fff" /><Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Emergency alert · bypasses quiet hours</Text>
            </View>
          ) : null}
          <TextInput ref={input} value={text} onChangeText={setText} multiline autoFocus placeholder="What do families need to know?"
            placeholderTextColor={c.tx3} accessibilityLabel="Post text. The first line becomes the title." maxLength={10000}
            style={{ flex: 1, color: c.tx, fontSize: 19, lineHeight: 27, textAlignVertical: 'top' }} />
          {photos.length ? (
            <ScrollView horizontal style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
              {photos.map((p, i) => (
                <View key={p.uri} style={{ width: 64, height: 64 }}>
                  <Image source={{ uri: p.uri }} style={{ width: 64, height: 64, borderRadius: 10 }} />
                  <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" onPress={() => setPhotos((x) => x.filter((_, j) => j !== i))}
                    style={{ position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: c.sf, backgroundColor: c.tx, alignItems: 'center', justifyContent: 'center' }}>
                    <X size={12} color={c.sf} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}
          {scheduled ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 6 }}>
              <Clock size={14} color={c.link} /><Text style={{ fontSize: 13, fontWeight: '600', color: c.link }}>Scheduled for tomorrow, 7:00 AM</Text>
            </View>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.bd }}>
          <IconButton icon={ImagePlus} label="Add photos" onPress={pickPhotos} />
          <IconButton icon={Mic} label="Dictate" onPress={() => { input.current?.focus(); Alert.alert('Dictate', 'Tap the microphone on your keyboard to dictate.'); }} />
          <IconButton icon={Clock} label={scheduled ? 'Send now instead' : 'Schedule for tomorrow 7:00 AM'} bg={scheduled ? c.tint : undefined}
            onPress={() => { if (!emergency) setScheduled((s) => !s); }} />
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: ack }} accessibilityLabel="Ask families to confirm they read this" onPress={() => setAck((a) => !a)}
            style={{ height: 44, paddingHorizontal: 12, borderRadius: 22, backgroundColor: ack ? c.tint : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <CircleCheck size={20} color={c.link} /><Text style={{ color: c.link, fontSize: 13, fontWeight: '600' }}>Confirm read</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          {linked.can_send_emergency ? <IconButton icon={Siren} label="Emergency alert" color={emergency ? '#fff' : RED} bg={emergency ? RED : undefined} onPress={toggleEmergency} /> : null}
          <IconButton icon={Pin} label={important ? 'Important (pinned)' : 'Mark important'} color={important ? NAVY : c.link} bg={important ? MAIZE : undefined}
            onPress={() => setImportant((v) => !v)} />
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: keyboardUp ? 10 : insets.bottom + 10 }}>
          <Pressable accessibilityRole="button" onPress={send} disabled={sending || !text.trim() || !target}
            style={({ pressed }) => ({ height: 54, borderRadius: 14, backgroundColor: emergency ? RED : c.pri, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: sending || !text.trim() ? 0.5 : pressed ? 0.85 : 1 })}>
            <Send size={18} color={emergency ? '#fff' : c.priTx} />
            <Text style={{ fontFamily: font.heading, fontSize: 17, color: emergency ? '#fff' : c.priTx }}>{sending ? 'Sending…' : sendLabel}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

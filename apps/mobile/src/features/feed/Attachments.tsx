import { useQuery } from '@tanstack/react-query';
import { api, fileSize, type Attachment } from '@zcs/core';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Download, FileText } from 'lucide-react-native';
import { Alert, Pressable, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';

function useSignedUrl(path: string) {
  return useQuery({ queryKey: ['signed', path], queryFn: () => api.signedUrl(supabase, path, 3600), staleTime: 50 * 60_000 });
}

function Photo({ a, height, more }: { a: Attachment; height: number; more?: number }) {
  const { c } = useTheme();
  const url = useSignedUrl(a.storage_path).data;
  return (
    <View style={{ flex: 1, height, borderRadius: 10, overflow: 'hidden', backgroundColor: c.ph1 }}>
      {url ? <Image source={{ uri: url }} style={{ flex: 1 }} contentFit="cover" transition={150} accessibilityLabel={a.file_name} /> : null}
      {more ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>+{more}</Text>
        </View>
      ) : null}
    </View>
  );
}

async function openFile(path: string) {
  try {
    const url = await api.signedUrl(supabase, path, 600);
    await WebBrowser.openBrowserAsync(url);
  } catch (e) {
    Alert.alert('Attachment', (e as Error).message);
  }
}

export function AttachmentStrip({ attachments, compact }: { attachments: Attachment[]; compact?: boolean }) {
  const { c } = useTheme();
  const photos = attachments.filter((a) => a.kind === 'image');
  const pdfs = attachments.filter((a) => a.kind === 'pdf');
  if (!attachments.length) return null;
  return (
    <View style={{ gap: 8 }}>
      {photos.length ? (
        compact ? (
          <View style={{ flexDirection: 'row', gap: 4, height: 110 }}>
            <View style={{ flex: 2 }}><Photo a={photos[0]!} height={110} /></View>
            {photos[1] ? <View style={{ flex: 1 }}><Photo a={photos[1]} height={110} /></View> : null}
            {photos[2] ? <View style={{ flex: 1 }}><Photo a={photos[2]} height={110} more={photos.length > 3 ? photos.length - 3 : undefined} /></View> : null}
          </View>
        ) : (
          <View style={{ gap: 6 }}>
            <Photo a={photos[0]!} height={200} />
            {Array.from({ length: Math.ceil((photos.length - 1) / 2) }, (_, r) => (
              <View key={r} style={{ flexDirection: 'row', gap: 6 }}>
                {photos.slice(1 + r * 2, 3 + r * 2).map((p) => <Photo key={p.id} a={p} height={130} />)}
              </View>
            ))}
          </View>
        )
      ) : null}
      {pdfs.map((a) => (
        <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={`Open ${a.file_name}`} onPress={() => openFile(a.storage_path)}
          style={compact
            ? { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.bg, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 }
            : { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: c.bd, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, minHeight: 56 }}>
          {compact ? <FileText size={20} color={c.link} /> : (
            <View style={{ width: 40, height: 48, borderRadius: 6, backgroundColor: c.tint, alignItems: 'center', justifyContent: 'center' }}><FileText size={22} color={c.link} /></View>
          )}
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: compact ? 14 : 15, fontWeight: compact ? '400' : '600', color: c.tx }}>{a.file_name}</Text>
            {!compact ? <Text style={{ fontSize: 13, color: c.tx2 }}>PDF · {fileSize(a.size_bytes)}</Text> : null}
          </View>
          {compact ? <Text style={{ fontSize: 12, color: c.tx3 }}>PDF</Text> : <Download size={20} color={c.link} />}
        </Pressable>
      ))}
    </View>
  );
}

import { childrenPossessive, isParent } from '@zcs/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, H, T } from '@/components/ui';
import { ZcsIcon } from '@/components/ZcsIcon';
import { useToast } from '@/components/Toast';
import { enableNotifications } from '@/lib/notifications';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme/ThemeProvider';
import { NAVY } from '@/theme/tokens';

function FakeNotification({ title, body, time, faded }: { title: string; body?: string; time?: string; faded?: boolean }) {
  return (
    <View importantForAccessibility="no-hide-descendants" style={{ backgroundColor: faded ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.94)', borderRadius: 16,
      paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', gap: 10, marginHorizontal: faded ? 10 : 0 }}>
      <View style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center' }}><ZcsIcon size={20} /></View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#111C2C' }}>ZCS Connect</Text>
          {time ? <Text style={{ fontSize: 13, color: '#52637A' }}>{time}</Text> : null}
        </View>
        <Text style={{ fontSize: 15, fontWeight: faded ? '400' : '600', color: '#111C2C' }}>{title}</Text>
        {body ? <Text style={{ fontSize: 14, color: '#52637A' }}>{body}</Text> : null}
      </View>
    </View>
  );
}

export default function Notify() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { linked, markOnboarded } = useSession();
  const [busy, setBusy] = useState(false);
  const parent = linked?.contexts.find(isParent);
  const who = parent ? `${childrenPossessive(parent)} teachers and the school office` : 'families and the school office';

  const finish = () => { markOnboarded(); router.replace('/home'); };
  const turnOn = async () => {
    setBusy(true);
    const ok = await enableNotifications().catch(() => false);
    setBusy(false);
    if (ok) toast('Notifications are on');
    finish();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 46, paddingHorizontal: 24, paddingBottom: insets.bottom + 24, gap: 14 }}>
      <View style={{ backgroundColor: NAVY, borderRadius: 24, paddingVertical: 22, paddingHorizontal: 16, gap: 10, marginBottom: 12 }}>
        <FakeNotification title="Snow day — school closed today" body="All ZCS buildings are closed." time="6:05 AM" />
        <FakeNotification title="Early dismissal Friday at 12:30" faded />
      </View>
      <H size={28}>Snow days and early dismissals arrive here</H>
      <T tone="tx2" style={{ lineHeight: 24 }}>Turn on notifications to hear right away from {who}. You can choose which kinds in Profile.</T>
      <View style={{ flex: 1 }} />
      <Button label="Turn on notifications" height={56} loading={busy} onPress={turnOn} />
      <Button label="Not now" variant="ghost" onPress={finish} />
    </View>
  );
}

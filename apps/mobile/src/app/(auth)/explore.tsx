// For families who aren't at ZCS yet: someone who finds the app in the App
// Store can schedule a tour or ask admissions a question, without an account.
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { CalendarCheck, FileText, Mail, MessageCircleQuestion, Phone } from 'lucide-react-native';
import { Alert, Linking, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton, Button, H, NavBar, T } from '@/components/ui';
import { ZcsIcon } from '@/components/ZcsIcon';
import { ADMISSIONS } from '@/lib/school';
import { useTheme } from '@/theme/ThemeProvider';

const open = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url));

export default function Explore() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.sf }}>
      <NavBar left={<BackButton onPress={() => router.back()} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: insets.bottom + 24, gap: 12 }}>
        <View style={{ padding: 12, marginLeft: -12, alignSelf: 'flex-start' }}><ZcsIcon size={56} /></View>
        <H>Thinking about ZCS?</H>
        <T tone="tx2">
          Zeeland Christian School serves preschool through 8th grade at two campuses in Zeeland, Michigan. The best way to get to know us is to visit.
        </T>
        <View style={{ gap: 10, marginTop: 8 }}>
          <Button label="Schedule a tour" icon={CalendarCheck} onPress={() => open(ADMISSIONS.tour)} />
          <Button label="Ask admissions a question" icon={MessageCircleQuestion} variant="secondary" onPress={() => open(ADMISSIONS.inquire)} />
          <Button label="How to apply" icon={FileText} variant="secondary" onPress={() => open(ADMISSIONS.apply)} />
        </View>
        <Text style={{ fontSize: 13, fontWeight: '600', color: c.tx2, marginTop: 16 }}>Admissions office</Text>
        <View style={{ gap: 10 }}>
          <Button label={`Call ${ADMISSIONS.phone}`} icon={Phone} variant="ghost"
            onPress={() => Linking.openURL(`tel:${ADMISSIONS.phone.replace(/\D/g, '')}`).catch(() => Alert.alert('Call', ADMISSIONS.phone))} />
          <Button label={`Email ${ADMISSIONS.email}`} icon={Mail} variant="ghost"
            onPress={() => Linking.openURL(`mailto:${ADMISSIONS.email}?subject=${encodeURIComponent('Question about ZCS')}`).catch(() => Alert.alert('Email', ADMISSIONS.email))} />
        </View>
        <T tone="tx3" style={{ fontSize: 13, marginTop: 12 }}>
          Already a ZCS family? Go back and tap Get started. ZCS Connect is for families and staff once your child is enrolled.
        </T>
      </ScrollView>
    </View>
  );
}

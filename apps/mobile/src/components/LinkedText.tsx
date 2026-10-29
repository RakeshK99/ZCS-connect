// Text with tappable web links, email addresses and phone numbers, so a
// teacher can post "Read this week's newsletter: https://…" and families can
// open it. Everything else renders as plain text.
import { Alert, Linking, Text, type TextProps, type TextStyle } from 'react-native';

const PATTERN = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]|www\.[^\s<>()]+[^\s<>().,;:!?'"]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b)/g;

export function linkTarget(token: string): string | null {
  if (/^https?:\/\//i.test(token)) return token;
  if (/^www\./i.test(token)) return `https://${token}`;
  if (/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(token)) return `mailto:${token}`;
  const digits = token.replace(/\D/g, '');
  if (digits.length === 10) return `tel:${digits}`;
  return null;
}

export function splitLinks(text: string): { text: string; href: string | null }[] {
  const out: { text: string; href: string | null }[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i), href: null });
    out.push({ text: m[0], href: linkTarget(m[0]) });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), href: null });
  return out;
}

export function LinkedText({ children, linkColor, style, ...rest }: TextProps & { children: string; linkColor: string }) {
  const parts = splitLinks(children ?? '');
  const link: TextStyle = { color: linkColor, textDecorationLine: 'underline' };
  return (
    <Text style={style} {...rest}>
      {parts.map((p, i) => p.href ? (
        <Text key={i} style={link} accessibilityRole="link"
          onPress={() => Linking.openURL(p.href!).catch(() => Alert.alert('Link', "This link couldn't be opened."))}>{p.text}</Text>
      ) : p.text)}
    </Text>
  );
}

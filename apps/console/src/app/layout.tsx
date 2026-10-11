import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Providers } from '@/lib/session';
import './globals.css';

const cabin = localFont({
  src: [
    { path: '../fonts/Cabin-Medium.ttf', weight: '500' },
    { path: '../fonts/Cabin-SemiBold.ttf', weight: '600' },
    { path: '../fonts/Cabin-Bold.ttf', weight: '700' },
  ],
  variable: '--font-cabin',
});

export const metadata: Metadata = {
  title: 'ZCS Connect · Staff console',
  description: 'Announcements, reach and roster tools for Zeeland Christian School staff.',
  robots: { index: false, follow: false },
  icons: { icon: '/favicon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cabin.variable}>
      <body className="antialiased font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';
import OneSignalProvider from '@/components/OneSignalProvider';
import AppShell from '@/components/AppShell';

const fraunces = Fraunces({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

const inter = Inter({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0d1017',
};

export const metadata: Metadata = {
  title: {
    default: 'Yankı — Kendini zaman içinde duymanın bir yolu',
    template: '%s | Yankı',
  },
  description:
    'Kendini zaman içinde anlayan dijital ikizin. Düşüncelerini kaybetme, geleceğe anı bırak.',
  applicationName: 'Yankı',
  keywords: ['dijital ikiz', 'günlük', 'kişisel gelişim', 'günlük sorular'],
  authors: [{ name: 'Yankı' }],
  openGraph: {
    title: 'Yankı — Kendini zaman içinde duymanın bir yolu',
    description:
      'Kendini zaman içinde anlayan dijital ikizin. Düşüncelerini kaybetme.',
    siteName: 'Yankı',
    type: 'website',
    locale: 'tr_TR',
  },
  twitter: {
    card: 'summary',
    title: 'Yankı — Kendini zaman içinde duymanın bir yolu',
    description:
      'Kendini zaman içinde anlayan dijital ikizin. Düşüncelerini kaybetme.',
  },
  robots: { index: true, follow: true },
  icons: { icon: '/icon.svg' },
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      className={`${fraunces.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <OneSignalProvider>
          <AppShell>{children}</AppShell>
        </OneSignalProvider>
      </body>
    </html>
  );
}

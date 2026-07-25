import type { MetadataRoute } from 'next';

/**
 * PWA Manifest — "Ana ekrana ekle" için gerekli.
 *
 * ARCHITECTURE.md: "MVP'nin ana sayfası/ilk kullanıcı deneyimi ölüm/legacy
 * temasıyla açılmamalı." — manifest name/description da hayat odaklı.
 *
 * OneSignal service worker'ı (Phase 9) ile çakışmaz — manifest
 * servis-worker kaydı YAPMAZ, sadece PWA kurulumuna izin verir.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Yankı — Dijital İkizin',
    short_name: 'Yankı',
    description:
      'Kendini zaman içinde anlayan dijital ikizin. Düşüncelerini kaybetme.',
    start_url: '/',
    display: 'standalone',
    background_color: '#fafafa',
    theme_color: '#0a0a0a',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    orientation: 'portrait-primary',
    lang: 'tr',
    dir: 'ltr',
  };
}

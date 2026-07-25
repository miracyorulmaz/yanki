/**
 * OneSignal Service Worker — Web Push bildirimlerinin altyapısı.
 *
 * Bu dosya public/ altında olmalıdır (Next.js static serving).
 * OneSignal SDK, service worker'ı bu dosyadan register eder.
 *
 * Nasıl çalışır:
 * 1. OneSignal sayfa SDK'sı yüklenir (layout.tsx'teki script tag)
 * 2. SDK, bu worker'ı bulup register eder
 * 3. Register olan worker, OneSignal CDN'den asıl kodu import eder
 * 4. Worker arka planda push event'lerini dinler ve bildirimleri gösterir
 *
 * REF: https://documentation.onesignal.com/docs/web-push-quickstart
 */

// eslint-disable-next-line no-undef
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDKWorker.js');

/**
 * OneSignal Web Push — Client-side SDK başlatma ve kullanıcı tanımlama.
 *
 * Bu modül SADECE client-side çalışır ('use client').
 * Next.js App Router'da layout'a eklenen OneSignalProvider tarafından çağrılır.
 *
 * Akış:
 * 1. Sayfa yüklenir, OneSignal SDK script'i çalışır
 * 2. OneSignalProvider mount olur
 * 3. OneSignal.init() çağrılır (APP_ID ile)
 * 4. Kullanıcı giriş yapmışsa setExternalUserId(userId) ile eşleştirilir
 * 5. Kullanıcı çıkış yaparsa removeExternalUserId() ile bağ koparılır
 *
 * NOT: OneSignal SDK'yı window.OneSignal üzerinden kullanıyoruz.
 *      npm paketi (@onesignal/onesignal-web) de mevcut ama MVP'de
 *      CDN script tag'i daha basit ve yeterli.
 *
 * REF: https://documentation.onesignal.com/docs/web-push-quickstart
 */

export const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

declare global {
  interface Window {
    OneSignal?: {
      init: (opts: OneSignalInitOptions) => void;
      setExternalUserId: (userId: string) => Promise<void>;
      removeExternalUserId: () => Promise<void>;
      setSubscription: (enabled: boolean) => Promise<void>;
      isPushNotificationsSupported: () => boolean;
      getExternalUserId: () => string | undefined;
    };
    OneSignalDeferred?: unknown[];
  }
}

interface OneSignalInitOptions {
  appId: string;
  allowLocalhostAsSecureOrigin?: boolean;
  serviceWorkerParam?: { scope: string };
  serviceWorkerPath?: string;
}

/**
 * OneSignal SDK'yi başlatır. Her sayfa yüklemesinde bir kez çağrılmalı.
 *
 * ÖNEMLİ: Bu fonksiyon OneSignal SDK script'i yüklendikten SONRA çağrılmalıdır.
 * Script yüklenmeden çağrılırsa hata vermez, deferred queue'ya eklenir —
 * OneSignal bu queue'yu SDK yüklenince otomatik işler.
 */
export function oneSignalInit(appId: string): void {
  if (!appId || appId === 'your-onesignal-app-id') {
    console.debug('[OneSignal] APP_ID tanımlı değil, init atlanıyor.');
    return;
  }

  if (typeof window === 'undefined') return;

  // OneSignal SDK yüklendikten sonra init'i çağır
  // Deferred queue: SDK yüklenmeden önce push'lanan çağrıları biriktirir
  window.OneSignalDeferred = window.OneSignalDeferred || [];

  window.OneSignalDeferred.push(() => {
    window.OneSignal?.init({
      appId,
      // localhost'ta test için secure origin kontrolünü atla
      allowLocalhostAsSecureOrigin: window.location.hostname === 'localhost',
      serviceWorkerParam: { scope: '/' },
      serviceWorkerPath: 'OneSignalSDKWorker.js',
    });

    console.debug('[OneSignal] SDK başlatıldı, appId:', appId.slice(0, 8) + '...');
  });
}

/**
 * Kullanıcı giriş yaptığında Supabase user.id'yi OneSignal external_user_id
 * olarak tanımlar. Bu sayede worker tarafında `include_external_user_ids`
 * ile hedefli bildirim gönderilebilir.
 *
 * Kullanıcı auth durumu değiştiğinde (login/logout) çağrılmalıdır.
 */
export async function identifyUser(userId: string | null): Promise<void> {
  if (typeof window === 'undefined') return;

  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  if (!appId || appId === 'your-onesignal-app-id') return;

  if (userId) {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(() => {
      window.OneSignal?.setExternalUserId(userId);
      console.debug('[OneSignal] Kullanıcı tanımlandı:', userId.slice(0, 8) + '...');
    });
  } else {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(() => {
      window.OneSignal?.removeExternalUserId();
      console.debug('[OneSignal] Kullanıcı tanımı kaldırıldı.');
    });
  }
}

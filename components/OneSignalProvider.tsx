'use client';

/**
 * OneSignalProvider — Web Push SDK'sını başlatan client component.
 *
 * Root layout'ta tek bir kez mount edilir. Şunları yapar:
 * 1. OneSignal SDK script tag'ini <head>'e inject eder
 * 2. Script yüklenince oneSignalInit() çağırır
 * 3. Supabase auth state değişimini dinler, login/logout'ta identifyUser()
 *
 * NON_NEGOTIABLES #4:
 *   OneSignal sadece taşıyıcıdır — bildirim içeriği ve tetikleme mantığı
 *   tamamen worker (lib/jobs/send-daily-notifications.ts) tarafından kontrol
 *   edilir. Bu provider backend karar mekanizmasına karışmaz.
 */

import { useEffect } from 'react';
import { useSupabase } from '@/lib/supabase/use-client';
import { oneSignalInit, identifyUser } from '@/lib/notifications/onesignal-client';

const ONESIGNAL_SDK_URL = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
const APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

export default function OneSignalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = useSupabase();

  useEffect(() => {
    // FIX: OneSignal localhost uygulaması production domain'de crash ediyor.
    // Production'da APP_ID placeholder olduğu sürece SDK yüklenmesin.
    if (!APP_ID || APP_ID === 'your-onesignal-app-id') {
      return;
    }

    // Production domain'de OneSignal localhost app'i çalışmaz — sadece localhost'ta başlat
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocalhost) {
      console.debug('[OneSignal] Production ortamda OneSignal devre dışı (localhost app).');
      return;
    }

    // SDK zaten inject edilmişse tekrar etme
    if (document.querySelector(`script[src="${ONESIGNAL_SDK_URL}"]`)) return;

    try {
      const script = document.createElement('script');
      script.src = ONESIGNAL_SDK_URL;
      script.async = true;
      script.onload = () => {
        try {
          oneSignalInit(APP_ID);
        } catch (e) {
          console.warn('[OneSignal] SDK init başarısız:', e);
        }
      };
      script.onerror = () => {
        console.warn('[OneSignal] SDK script yüklenemedi.');
      };
      document.head.appendChild(script);
    } catch (e) {
      console.warn('[OneSignal] Script injection başarısız:', e);
    }
  }, []);

  // Auth state değişikliklerini dinle
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        void identifyUser(session?.user?.id ?? null);
      } else if (event === 'SIGNED_OUT') {
        void identifyUser(null);
      }
      // INITIAL_SESSION: sayfa yüklendi, kullanıcı zaten oturum açmış
      else if (event === 'INITIAL_SESSION' && session?.user) {
        void identifyUser(session.user.id);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  return <>{children}</>;
}

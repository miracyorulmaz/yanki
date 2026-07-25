/**
 * OneSignal Web Push bildirim fonksiyonu.
 *
 * NON_NEGOTIABLES #4:
 *   Bu modül sadece günlük soru hatırlatması için kullanılır.
 *   Insights, haftalık özet, "seni özledik" gibi başka HİÇBİR bildirim gönderilmez.
 *
 * OneSignal API: POST https://onesignal.com/api/v1/notifications
 * Docs: https://documentation.onesignal.com/reference/create-notification
 *
 * Gereken: .env.local'da NEXT_PUBLIC_ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY
 *   Henüz gerçek değer yoksa OneSignal hesabı oluşturulmalı:
 *   https://onesignal.com → Sign Up → App oluştur (Web Push seç)
 *   → Settings > Keys & IDs sayfasından App ID ve REST API Key al.
 */

const ONESIGNAL_API_URL = 'https://onesignal.com/api/v1/notifications';

export interface PushNotificationInput {
  /** Supabase user ID — OneSignal external_user_id olarak kullanılır */
  userId: string;
  /** Bildirim başlığı */
  heading: string;
  /** Bildirim içeriği */
  content: string;
  /** Tıklanınca açılacak URL (opsiyonel) */
  url?: string;
}

export interface PushNotificationResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Bir kullanıcıya web push bildirimi gönderir.
 *
 * Kullanıcı OneSignal SDK ile henüz subscribe olmamışsa,
 * OneSignal sessizce atlar (hata dönmez) — notification kaybolur,
 * bu beklenen davranıştır.
 */
export async function sendPushNotification(
  input: PushNotificationInput,
): Promise<PushNotificationResult> {
  // Çalışma anında oku (tsx worker dotenv sonrası import eder)
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  const restApiKey = process.env.ONESIGNAL_REST_API_KEY;

  if (!appId || appId === 'your-onesignal-app-id') {
    console.warn('[OneSignal] NEXT_PUBLIC_ONESIGNAL_APP_ID tanımlı değil — bildirim atlandı.');
    return { success: false, error: 'APP_ID not configured' };
  }

  if (!restApiKey || restApiKey === 'your-onesignal-rest-api-key') {
    console.warn('[OneSignal] ONESIGNAL_REST_API_KEY tanımlı değil — bildirim atlandı.');
    return { success: false, error: 'REST_API_KEY not configured' };
  }

  try {
    const response = await fetch(ONESIGNAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${restApiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        headings: { en: input.heading, tr: input.heading },
        contents: { en: input.content, tr: input.content },
        include_external_user_ids: [input.userId],
        ...(input.url ? { url: input.url } : {}),
        // Kanal: sadece web push
        isAnyWeb: true,
        // Kullanıcıya birden fazla aynı bildirimi gönderme
        // Aynı gün aynı kullanıcıya en fazla 1 bildirim (cron tekrarına karşı)
        // NOT: OneSignal'da idempotency yok, worker seviyesinde kontrol ediliyor.
      }),
    });

    const body = await response.json();

    if (!response.ok) {
      console.error('[OneSignal] API hatası:', body);
      return { success: false, error: JSON.stringify(body) };
    }

    return { success: true, id: body.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[OneSignal] İstek hatası:', message);
    return { success: false, error: message };
  }
}

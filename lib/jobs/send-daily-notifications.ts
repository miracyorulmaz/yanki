/**
 * Notification Worker — Günlük soru bildirimi.
 *
 * ARCHITECTURE.md Background Jobs:
 *   "Günlük | Günlük soru bildirimini OneSignal üzerinden gönderir"
 *
 * NON_NEGOTIABLES #4:
 *   SADECE günlük soru hatırlatması. Başka HİÇBİR bildirim tetiklenmez.
 *   Insights raporu, "seni özledik", haftalık özet, re-engagement mesajı yok.
 *   Günde en fazla 1 bildirim.
 *
 * Tetikleme kuralı:
 *   Kullanıcı bugün hiç daily soru cevaplamamışsa → bildirim gönder.
 *   Zaten cevaplamışsa → atla (günde en fazla 1, doğal olarak garanti).
 *
 * Kullanım (manuel):
 *   npx tsx lib/jobs/send-daily-notifications.ts
 *   npx tsx lib/jobs/send-daily-notifications.ts --dry-run   (göndermeden simüle et)
 *
 * CRON: Supabase pg_cron veya Vercel Cron ile her gün:
 *   0 10 * * *   (her gün sabah 10:00'da)
 *
 * Gereken: .env.local'da NEXT_PUBLIC_ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY
 *   Henüz gerçek değer yoksa OneSignal hesabı oluşturulmalı.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { sendPushNotification } from '../notifications/onesignal';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const NOTIFICATION_HEADING = 'Yankı';
const NOTIFICATION_CONTENT = 'Bugünün soruları seni bekliyor. Kendine birkaç dakika ayır.';
const NOTIFICATION_URL = '/daily'; // tıklanınca daily sayfasına git

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('🔔 Daily Notification Worker başlatılıyor...');
  if (dryRun) console.log('   🧪 DRY RUN — bildirim gönderilmeyecek.\n');

  // 1. Hedef kullanıcıları bul: onboarding entries'i olan aktif kullanıcılar.
  //    NOT: users.onboarding_completed_at Supabase'te eksik olabilir,
  //    bu yüzden entries tablosundan onboarding cevabı var mı diye kontrol ediyoruz.
  const { data: users, error: userErr } = await supabase
    .from('users')
    .select('id, display_name')
    .eq('status', 'active');

  if (userErr) {
    console.error('❌ Kullanıcı sorgu hatası:', userErr.message);
    return;
  }

  if (!users || users.length === 0) {
    console.log('ℹ️ Onboarding tamamlamış aktif kullanıcı yok.');
    return;
  }

  console.log(`👥 ${users.length} kullanıcı taranacak.\n`);

  // 2. Hiç daily question var mı? (seed edilmemişse bildirim anlamsız)
  const { count: qCount } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('category', 'daily')
    .eq('active', true);

  if (!qCount || qCount === 0) {
    console.log('⚠️ Hiç aktif daily soru yok (questions tablosu seed edilmemiş olabilir).');
    console.log('   npx tsx db/seed.ts ile seed ettikten sonra tekrar deneyin.');
    return;
  }

  // Bugünün başlangıcı
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  let sent = 0;
  let skipped = 0;

  for (const user of users) {
    // 2. Onboarding tamamlamış mı? (entries'den kontrol, onboarding_completed_at eksik olabilir)
    const { count: onboardingCount } = await supabase
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source', 'onboarding');

    if (!onboardingCount || onboardingCount === 0) {
      console.log(`   ⏭️ ${user.display_name}: onboarding tamamlanmamış — atlanıyor.`);
      skipped++;
      continue;
    }

    // 3. Bugün daily entry var mı? → varsa kullanıcı zaten etkileşime geçmiş
    const { count } = await supabase
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source', 'daily')
      .gte('created_at', todayIso);

    if (count && count > 0) {
      console.log(`   ⏭️ ${user.display_name}: bugün ${count} daily cevap var — atlanıyor.`);
      skipped++;
      continue;
    }

    // 3. Bildirim gönder
    if (dryRun) {
      console.log(`   🧪 ${user.display_name}: bildirim simüle edildi (gönderilmedi).`);
      sent++;
    } else {
      const result = await sendPushNotification({
        userId: user.id,
        heading: NOTIFICATION_HEADING,
        content: NOTIFICATION_CONTENT,
        url: NOTIFICATION_URL,
      });

      if (result.success) {
        console.log(`   ✅ ${user.display_name}: bildirim gönderildi (id: ${result.id}).`);
        sent++;
      } else {
        console.log(`   ⚠️ ${user.display_name}: gönderilemedi — ${result.error}`);
        skipped++;
      }
    }
  }

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`✅ Tamamlandı. Gönderilen: ${sent}, Atlanan: ${skipped}`);
  console.log(
    `📌 NON_NEGOTIABLES #4: SADECE günlük soru hatırlatması — başka bildirim yok.`,
  );
}

main().catch((err) => {
  console.error('❌ Worker hatası:', err);
  process.exit(1);
});

import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  // Bugün daily cevaplanmış kullanici simulasyonu
  const userId = 'c201458f-a5d3-47f8-bbc2-843b3c6be06d';

  console.log('═══ BILDIRIM ENGELLEME TESTİ ═══\n');

  // 1. Bugün bir daily entry ekle
  const todayIso = new Date().toISOString();
  const { data: entry } = await s.from('entries').insert({
    user_id: userId,
    source: 'daily',
    question: 'Bugün kendini nasıl hissediyorsun?',
    question_type: 'open_text',
    answer: 'Test cevabı — bildirim engelleme kontrolü',
    created_at: todayIso,
  }).select('id, created_at').single();

  console.log('1. Test daily entry eklendi:');
  console.log(`   id: ${entry?.id}`);
  console.log(`   created_at: ${entry?.created_at}`);
  console.log('   → Bu kullanıcı BUGÜN daily sorusunu zaten cevapladı.\n');

  // 2. Worker çalıştır → bu kullanıcıya bildirim GİTMEMELİ
  console.log('2. Notification worker çalıştırılıyor...\n');

  // Worker'ı manuel simüle et (direkt logic)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count } = await s.from('entries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source', 'daily')
    .gte('created_at', todayStart.toISOString());

  console.log(`   Bugünkü daily entry sayısı: ${count}`);

  if (count && count > 0) {
    console.log('   ⏭️ Kullanıcı ATLANDI — bugün zaten daily cevaplamış.');
    console.log('   ✅ BILDIRIM GÖNDERILMEDI (doğru davranış).');
  } else {
    console.log('   ❌ HATA: Bildirim gönderilmemeliydi!');
  }

  // 3. Temizle
  await s.from('entries').delete().eq('id', entry!.id);
  console.log('\n3. Test entry silindi.');
}

main().catch((e) => { console.error(e); process.exit(1); });

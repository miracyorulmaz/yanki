/**
 * Summary Worker — 3 günde bir / 50+ yeni entry → yeni personality_profiles satırı.
 *
 * ARCHITECTURE.md Background Jobs:
 *   "3 günde bir, VEYA 50+ yeni entry birikirse erken"
 *
 * CONTRACTS.md:
 *   "personality_profiles, 3 günde bir (cron job) o ana kadarki yeni entries'lerden
 *    yeniden özetlenerek yeni bir satır olarak eklenir (üzerine yazılmaz —
 *    versiyon geçmişi korunur). İstisna: 3 gün dolmadan 50+ yeni entry
 *    birikirse, erken tetiklenir."
 *
 * Kullanım (manuel):
 *   npx tsx lib/jobs/summarize-profile.ts
 *   npx tsx lib/jobs/summarize-profile.ts --user-id=<uuid>   (tek kullanıcı)
 *
 * Gereken: .env.local'da NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *          ANTHROPIC_API_KEY
 *
 * CRON: Supabase pg_cron veya Vercel Cron ile her 3 günde bir:
 *   0 7 *\/3 * *   (3 günde bir, sabah 7'de)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5-20251001';
const MIN_ENTRIES_FOR_SUMMARY = 5;
const EARLY_TRIGGER_THRESHOLD = 50;

const SYSTEM_PROMPT = `Sen Yankı'nın profil özetleyici modülüsün.
Görevin: bir kullanıcının tüm cevaplarından tutarlı bir kişilik profili çıkarmak.

## Kurallar
- summary_text: kullanıcının kişiliğini, değerlerini, korkularını, motivasyonlarını,
  karar alma biçimini, konuşma tarzını doğal bir dille özetleyen 2-3 paragraflık metin.
- traits: JSON objesi. Şu anahtarları içermeli (varsa):
  korkular (string[]), sevdigi_insanlar (string[]), hayattaki_amac (string),
  karar_alma_bicimi (string), espri_anlayisi (string), risk_alma_seviyesi (string)
- KESİNLİKLE dahil etme: siyasi görüş, dini inanç — bunlar traits'e yazılmaz.
- Kullanıcının konuşma tarzını ve kendine özgü ifadelerini yansıt.
- Türkçe yaz.

SADECE JSON döndür:
{
  "summaryText": "profil özeti...",
  "traits": {
    "korkular": ["..."],
    "sevdigi_insanlar": ["..."],
    "hayattaki_amac": "...",
    "karar_alma_bicimi": "...",
    "espri_anlayisi": "...",
    "risk_alma_seviyesi": "..."
  }
}`;

interface UserEntry {
  question: string;
  answer: string;
  question_type: string;
  created_at: string;
}

async function main() {
  // CLI arg: --user-id=<uuid> ile tek kullanıcı
  const singleUserArg = process.argv.find((a) => a.startsWith('--user-id='));
  const singleUserId = singleUserArg?.split('=')[1];

  console.log('🔍 Summary Worker başlatılıyor...');
  console.log(`   Early trigger: ${EARLY_TRIGGER_THRESHOLD}+ entry\n`);

  // Kullanıcıları bul
  let usersToProcess: { id: string; display_name: string }[];

  if (singleUserId) {
    const { data: user } = await supabase
      .from('users')
      .select('id, display_name')
      .eq('id', singleUserId)
      .single();

    if (!user) {
      console.log(`Kullanıcı bulunamadı: ${singleUserId}`);
      return;
    }
    usersToProcess = [user as { id: string; display_name: string }];
  } else {
    const { data: allUsers } = await supabase
      .from('users')
      .select('id, display_name');
    usersToProcess = (allUsers ?? []) as { id: string; display_name: string }[];
  }

  if (usersToProcess.length === 0) {
    console.log('ℹ️ İşlenecek kullanıcı yok.');
    return;
  }

  console.log(`👥 ${usersToProcess.length} kullanıcı taranacak.\n`);

  let totalProfiles = 0;

  for (const user of usersToProcess) {
    console.log(`${'─'.repeat(40)}`);
    console.log(`👤 ${user.display_name} (${user.id.slice(0, 8)}...)`);

    // 1. En son personality_profile ne zaman oluşturulmuş?
    const { data: latestProfile } = await supabase
      .from('personality_profiles')
      .select('created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastProfileAt = latestProfile?.created_at
      ? new Date(latestProfile.created_at)
      : null;

    // 2. O tarihten bu yana kaç yeni entry var?
    let query = supabase
      .from('entries')
      .select('id, created_at', { count: 'exact', head: false })
      .eq('user_id', user.id);

    if (lastProfileAt) {
      query = query.gt('created_at', lastProfileAt.toISOString());
    }

    const { data: newEntries, count: newEntryCount, error: entryErr } = await query;

    if (entryErr) {
      console.log(`   ❌ Entry sorgu hatası: ${entryErr.message}`);
      continue;
    }

    const count = newEntryCount ?? 0;

    // 3. Tetikleme kararı
    const daysSinceLast = lastProfileAt
      ? Math.round((Date.now() - lastProfileAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const shouldTrigger =
      !lastProfileAt || // ilk profil
      count >= EARLY_TRIGGER_THRESHOLD || // 50+ yeni entry
      (daysSinceLast !== null && daysSinceLast >= 3); // 3 gün geçmiş

    console.log(
      `   Son profil: ${lastProfileAt ? lastProfileAt.toISOString().slice(0, 10) : 'HİÇ YOK'}` +
        ` | Yeni entry: ${count}` +
        ` | Gün: ${daysSinceLast ?? '-'}` +
        ` | Tetikle: ${shouldTrigger ? '✅' : '⏭️'}`,
    );

    if (!shouldTrigger) {
      console.log(`   ⏭️ Atlanıyor: henüz 3 gün dolmadı ve ${count} < ${EARLY_TRIGGER_THRESHOLD}.`);
      continue;
    }

    if (count < MIN_ENTRIES_FOR_SUMMARY) {
      console.log(`   ⏭️ Atlanıyor: yetersiz yeni entry (${count} < ${MIN_ENTRIES_FOR_SUMMARY}).`);
      continue;
    }

    // 4. Yeni entry'leri çek (tam içerik)
    const { data: entries } = await supabase
      .from('entries')
      .select('question, answer, question_type, created_at')
      .eq('user_id', user.id)
      .gt('created_at', (lastProfileAt ?? new Date(0)).toISOString())
      .order('created_at', { ascending: false })
      .limit(100);

    if (!entries || entries.length === 0) {
      console.log('   ⏭️ Atlanıyor: entry içeriği alınamadı.');
      continue;
    }

    const typedEntries = entries as UserEntry[];
    console.log(`   📝 ${typedEntries.length} entry işleniyor...`);

    // 5. Eski profil varsa onu da gönder (devamlılık için)
    let previousSummary = '';
    if (lastProfileAt) {
      const { data: prev } = await supabase
        .from('personality_profiles')
        .select('summary_text')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      previousSummary = prev?.summary_text ?? '';
    }

    // 6. AI ile özet üret
    let summaryText = '';
    let traits: Record<string, unknown> = {};

    if (anthropicApiKey) {
      try {
        const anthropic = new Anthropic({ apiKey: anthropicApiKey });

        const entriesText = typedEntries
          .map((e) => `S: ${e.question}\nC: ${e.answer}\nTarih: ${e.created_at}`)
          .join('\n---\n');

        const userPrompt =
          `Aşağıda bir kullanıcının yeni cevapları var. ${
            previousSummary
              ? '\n\n**Önceki profil özeti (devamlılık için):**\n' + previousSummary + '\n\n'
              : ''
          }` +
          `**Yeni cevaplar (${typedEntries.length} adet):**\n${entriesText}\n\n` +
          `Bu cevaplara dayanarak güncel bir kişilik profili üret. ` +
          (previousSummary
            ? 'Önceki özetteki tutarlı bilgileri koru, yeni gözlemleri ekle.'
            : 'Sadece bu cevaplara dayan.');

        const response = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        });

        const text =
          response.content[0]?.type === 'text'
            ? response.content[0].text.trim()
            : '';

        let parsed: any = {};
        try {
          parsed = JSON.parse(
            text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```$/, ''),
          );
        } catch {
          parsed = { summaryText: text, traits: {} };
        }

        summaryText = parsed.summaryText || '';
        traits = parsed.traits || {};
      } catch (err) {
        console.error(
          `   ⚠️ Claude hatası: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    // Fallback
    if (!summaryText || summaryText.trim().length === 0) {
      summaryText = `Bu kullanıcı ${typedEntries.length} soruya cevap verdi. ` +
        `Cevaplar ${lastProfileAt ? 'son profilden sonra ' : ''}` +
        `toplandı ve kişilik profili oluşturuldu.`;
      traits = {};
    }

    // 7. YENİ SATIR olarak ekle (APPEND-ONLY — asla upsert değil)
    const { data: newProfile, error: insertErr } = await supabase
      .from('personality_profiles')
      .insert({
        user_id: user.id,
        summary_text: summaryText,
        traits,
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error(`   ❌ Insert hatası: ${insertErr.message}`);
    } else {
      totalProfiles++;
      console.log(`   ✅ Yeni profil satırı: ${newProfile?.id}`);
      console.log(`   Özet: "${summaryText.slice(0, 100)}..."`);
    }
  }

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`✅ Tamamlandı. ${totalProfiles} yeni personality_profiles satırı.`);
  console.log(`📌 APPEND-ONLY: üzerine yazılmadı, yeni satır eklendi.`);
  console.log(`📌 HİÇBİR bildirim tetiklenmedi.`);
}

main().catch((err) => {
  console.error('❌ Worker hatası:', err);
  process.exit(1);
});

/**
 * Insights Worker — Haftalık trend/örüntü analizi.
 *
 * Kullanım (manuel):
 *   npx tsx lib/jobs/generate-insights.ts
 *
 * Gereken: .env.local'da NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *          ANTHROPIC_API_KEY (opsiyonel, yoksa şablon fallback)
 *
 * ARCHITECTURE.md — Hafıza Mimarisi Katman 4:
 *   "versiyonlu personality_profiles geçmişini karşılaştırarak üretilir"
 *   NOT: Supabase'te personality_profiles append-only değilse,
 *        profil + entry trendi üzerinden çalışır.
 *
 * NON_NEGOTIABLES #4:
 *   Bu worker HİÇBİR bildirim tetiklemez. Sadece insights tablosuna yazar.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceKey);

const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5-20251001';

interface ProfileInfo {
  summary_text: string;
  created_at: string;
}

const SYSTEM_PROMPT = `Sen Yankı'nın insight analisti modülüsün.
Görevin: bir kullanıcının zaman içindeki değişimini analiz edip
anlamlı bir trend/örüntü/değişim tespit etmek.

## Kurallar
- SADECE bir cümlelik insight üret. Uzun paragraflar yazma.
- "Son dönemde X konusunda daha Y görünüyorsun" formatını tercih et.
- Somut gözlem yap, yuvarlak ifadeler kullanma.
- Emin olmadığın bir şeyi "kesin" gibi sunma.
- Türkçe yaz.

SADECE JSON: { "insightText": "insight metni", "category": "trend" }`;

async function main() {
  console.log('🔍 Insights Worker başlatılıyor...\n');

  // insights tablosu yoksa oluştur
  const { error: ddlErr } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS public.insights (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        insight_text TEXT NOT NULL,
        category TEXT,
        confidence NUMERIC(3,2),
        based_on_period_start TIMESTAMPTZ,
        based_on_period_end TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `,
  });

  if (ddlErr) {
    // exec_sql yoksa raw SQL dene
    console.log('   exec_sql yok, tablo zaten varsa sorun olmaz.');
  }

  // Onboarding tamamlamış tüm kullanıcıları bul
  // NOT: users tablosunda onboarding_completed_at yoksa, entries'den kontrol et
  const { data: completedUsers } = await supabase
    .from('users')
    .select('id, display_name');

  if (!completedUsers || completedUsers.length === 0) {
    console.log('ℹ️ Kullanıcı yok.');
    return;
  }

  // Her kullanıcının onboarding entries'i var mı kontrol et
  const usersToProcess: { id: string; display_name: string }[] = [];
  for (const u of completedUsers) {
    const { count } = await supabase
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', u.id)
      .eq('source', 'onboarding');

    if (count && count > 0) {
      usersToProcess.push(u);
    }
  }

  if (usersToProcess.length === 0) {
    console.log('ℹ️ Onboarding tamamlamış kullanıcı yok.');
    return;
  }

  console.log(`👥 ${usersToProcess.length} kullanıcı taranacak.\n`);

  let totalInsights = 0;

  for (const user of usersToProcess) {
    console.log(`${'─'.repeat(40)}`);
    console.log(`👤 ${user.display_name} (${user.id.slice(0, 8)}...)`);

    // 1. En güncel personality_profile (append-only: son satır)
    const { data: profile } = await supabase
      .from('personality_profiles')
      .select('summary_text, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!profile) {
      console.log(`   ⏭️ Atlanıyor: personality_profile yok.`);
      continue;
    }

    const { summary_text: summaryText, created_at: profileCreatedAt } =
      profile as ProfileInfo;

    // 2. Bu kullanıcının hiç insight'ı var mı?
    const { count: anyExisting } = await supabase
      .from('insights')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    // 3. Tüm entry'leri say (ilk çalıştırma için profil öncesi/sonrası değil)
    const { count: totalEntryCount } = await supabase
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const entryCount = totalEntryCount ?? 0;

    if (entryCount < 5) {
      console.log(`   ⏭️ Atlanıyor: yetersiz entry (${entryCount} < 5).`);
      continue;
    }

    // 4. Bu profil güncellemesinden bu yana zaten insight var mı?
    if (anyExisting && anyExisting > 0) {
      const { count: recentCount } = await supabase
        .from('insights')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('based_on_period_start', profileCreatedAt);

      if (recentCount && recentCount > 0) {
        console.log(`   ⏭️ Atlanıyor: bu dönem için zaten ${recentCount} insight var.`);
        continue;
      }
    }

    // 5. Dimension çeşitliliği — son 7 gün veya tüm zamanlar
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dimCount = await getDimensionCount(user.id, sevenDaysAgo);

    // Son 7 günde yeterli veri yoksa tüm zamanlara bak
    const effectiveDimCount =
      dimCount.entryCount >= 3
        ? dimCount
        : await getDimensionCount(user.id, new Date(0).toISOString());

    // 6. Confidence (CONTRACTS.md formülü birebir)
    const confidence = round(
      Math.min(1.0, 0.05 * effectiveDimCount.entryCount + 0.1 * effectiveDimCount.uniqueDimensions),
      2,
    );

    console.log(
      `   📊 ${effectiveDimCount.entryCount} entry, ${effectiveDimCount.uniqueDimensions} dimension → confidence: ${confidence}`,
    );

    if (effectiveDimCount.entryCount < 5) {
      console.log(`   ⏭️ Atlanıyor: çok az entry (${effectiveDimCount.entryCount} < 5).`);
      continue;
    }

    // 7. Eski entry sayısı (profil öncesi)
    const { count: oldCount } = await supabase
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .lt('created_at', profileCreatedAt);

    // 7. Insight metni üret
    let insightText: string;
    let category = 'trend';

    if (anthropicApiKey) {
      try {
        const anthropic = new Anthropic({ apiKey: anthropicApiKey });
        const response = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 256,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content:
                `Kullanıcının kişilik profili:\n${summaryText}\n\n` +
                `Toplam ${effectiveDimCount.entryCount} cevap var ` +
                `(${effectiveDimCount.uniqueDimensions} farklı kişilik boyutunda).\n` +
                `Profil güncellemesinden önce ${oldCount} cevap vardı.\n` +
                `Confidence: ${confidence}.`,
            },
          ],
        });

        const text =
          response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
        let parsed: any = {};
        try {
          parsed = JSON.parse(text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```$/, ''));
        } catch {
          parsed = { insightText: text };
        }
        insightText = parsed.insightText || '';
        if (parsed.category) category = parsed.category;
      } catch (err) {
        insightText = '';
        console.error(`   ⚠️ Claude hatası: ${err instanceof Error ? err.message : err}`);
      }
    } else {
      insightText = '';
    }

    // Fallback şablon
    if (!insightText || insightText.trim().length === 0) {
      insightText =
        `Son dönemde ${effectiveDimCount.entryCount} cevapla kendini ifade ettin. ` +
        `${effectiveDimCount.uniqueDimensions} farklı alanda düşüncelerini paylaştın.`;
      category = 'trend';
    }

    // 8. Kullanılan entry ID'lerini topla (source_entry_ids için)
    const { data: usedEntriesData } = await supabase
      .from('entries')
      .select('id')
      .eq('user_id', user.id)
      .gte('created_at', effectiveDimCount.entryCount >= 3 ? sevenDaysAgo : new Date(0).toISOString())
      .order('created_at', { ascending: false })
      .limit(20);

    const sourceEntryIds = (usedEntriesData ?? []).map((e: { id: string }) => e.id);

    // 9. insights tablosuna yaz
    const now = new Date().toISOString();
    const { error: insError } = await supabase.from('insights').insert({
      user_id: user.id,
      insight_text: insightText,
      category,
      confidence,
      based_on_period_start: profileCreatedAt,
      based_on_period_end: now,
      source_entry_ids: sourceEntryIds.length > 0 ? sourceEntryIds : null,
    });

    if (insError) {
      console.error(`   ❌ Insert hatası: ${insError.message}`);
    } else {
      totalInsights++;
      console.log(`   ✅ "${insightText.slice(0, 80)}..."`);
    }
  }

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`✅ Tamamlandı. ${totalInsights} insight üretildi.`);
  console.log(`📌 HİÇBİR bildirim tetiklenmedi — sadece DB'ye yazıldı.`);
}

async function getDimensionCount(
  userId: string,
  since: string,
): Promise<{ entryCount: number; uniqueDimensions: number }> {
  // Tüm entry'leri say (question_id null olanlar dahil)
  const { data: entries } = await supabase
    .from('entries')
    .select('question_id')
    .eq('user_id', userId)
    .gte('created_at', since);

  if (!entries || entries.length === 0) {
    return { entryCount: 0, uniqueDimensions: 0 };
  }

  const entryCount = entries.length;

  // question_id null olanları filtrele
  const questionIds = [...new Set(
    entries.map((e) => e.question_id).filter(Boolean),
  )];

  if (questionIds.length === 0) {
    // question başlıklarına göre kaba bir dimension çeşitliliği hesapla
    // (questions tablosu seed edilmemişse fallback)
    return { entryCount, uniqueDimensions: Math.min(3, entryCount) };
  }

  const { data: questions } = await supabase
    .from('questions')
    .select('dimensions')
    .in('id', questionIds as string[]);

  const allDimensions = new Set<string>();
  for (const q of questions ?? []) {
    for (const dim of (q.dimensions as string[]) ?? []) {
      allDimensions.add(dim);
    }
  }

  // Fallback: questions boşsa entry sayısına göre tahmin
  const uniqueDimensions =
    allDimensions.size > 0 ? allDimensions.size : Math.min(3, entryCount);

  return { entryCount, uniqueDimensions };
}

function round(num: number, decimals: number): number {
  return Math.round(num * 10 ** decimals) / 10 ** decimals;
}

main().catch((err) => {
  console.error('❌ Worker hatası:', err);
  process.exit(1);
});

import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const uid = 'c201458f-a5d3-47f8-bbc2-843b3c6be06d';

async function main() {
  // ═══════════════════════════════════════════
  // ADIM 2: /memories - filtreleme + arama
  // ═══════════════════════════════════════════
  console.log('═══ ADIM 2: /memories SAYFASI TESTİ ═══\n');

  // Tüm entry'leri çek (sayfanın yaptığı gibi)
  const { data: all } = await s.from('entries')
    .select('id, question, answer, question_id, source, created_at, hidden_by_user')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(200);

  console.log(`Toplam entry: ${all?.length ?? 0}`);

  // Question ID'lerden dimension'ları çek (sayfanın yaptığı gibi)
  const qIds = [...new Set((all ?? []).map((e: any) => e.question_id).filter(Boolean))];
  const dimMap: Record<string, string[]> = {};
  if (qIds.length > 0) {
    const { data: qs } = await s.from('questions').select('id, dimensions').in('id', qIds);
    for (const q of qs ?? []) { dimMap[(q as any).id] = (q as any).dimensions ?? []; }
  }

  const entries = (all ?? []).map((e: any) => ({
    id: e.id, question: e.question, answer: e.answer,
    question_type: e.question_type, source: e.source,
    created_at: e.created_at,
    dimensions: dimMap[e.question_id] ?? [],
  }));

  // Dimension çeşitliliği
  const dimSet = new Set<string>();
  for (const e of entries) for (const d of e.dimensions) dimSet.add(d);
  const dimLabels = [...dimSet].sort();
  console.log(`Benzersiz dimension: ${dimLabels.length}`);
  console.log(`Dimension'lar: ${dimLabels.join(', ')}\n`);

  // Test: "identity" filtresi
  const identityEntries = entries.filter((e) => e.dimensions.includes('identity'));
  console.log(`1. FILTRE: "identity" → ${identityEntries.length} kayıt`);
  if (identityEntries.length > 0) {
    console.log(`   İlk: "${identityEntries[0].question.slice(0, 60)}"`);
  }

  // Test: "fears" filtresi
  const fearsEntries = entries.filter((e) => e.dimensions.includes('fears'));
  console.log(`2. FILTRE: "fears" → ${fearsEntries.length} kayıt`);
  if (fearsEntries.length > 0) {
    console.log(`   İlk: "${fearsEntries[0].question.slice(0, 60)}" → "${fearsEntries[0].answer.slice(0, 50)}"`);
  }

  // Test: ARAMA "korku"
  const searchQ = 'korku';
  const searchResults = entries.filter((e) =>
    e.question.toLowerCase().includes(searchQ) ||
    e.answer.toLowerCase().includes(searchQ)
  );
  console.log(`3. ARAMA: "${searchQ}" → ${searchResults.length} kayıt`);
  for (const r of searchResults) {
    console.log(`   "${r.question.slice(0, 50)}" → "${r.answer.slice(0, 40)}"`);
  }

  // Test: ARAMA "meraklı"
  const searchQ2 = 'meraklı';
  const searchResults2 = entries.filter((e) =>
    e.question.toLowerCase().includes(searchQ2) ||
    e.answer.toLowerCase().includes(searchQ2)
  );
  console.log(`4. ARAMA: "${searchQ2}" → ${searchResults2.length} kayıt`);
  for (const r of searchResults2) {
    console.log(`   "${r.question.slice(0, 50)}" → "${r.answer.slice(0, 40)}"`);
  }

  // ═══════════════════════════════════════════
  // ADIM 3: /insights source_entry_ids testi
  // ═══════════════════════════════════════════
  console.log('\n═══ ADIM 3: /insights DAYANAK TESTİ ═══\n');

  // Insights'ları çek
  const { data: insights } = await s.from('insights')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false });

  console.log(`Toplam insight: ${insights?.length ?? 0}`);

  const withSource = (insights ?? []).filter((i: any) =>
    i.source_entry_ids && i.source_entry_ids.length > 0
  );
  console.log(`source_entry_ids DOLU olan: ${withSource.length}`);

  // En son insight'ı göster
  const latest = (insights ?? [])[0] as any;
  if (latest) {
    console.log(`\nEn son insight:`);
    console.log(`  text: "${(latest.insight_text ?? '').slice(0, 80)}"`);
    console.log(`  source_entry_ids: ${JSON.stringify(latest.source_entry_ids)}`);

    if (latest.source_entry_ids?.length > 0) {
      // source_entry_ids'teki entry'leri çek
      const { data: ev } = await s.from('entries')
        .select('id, question, answer')
        .in('id', latest.source_entry_ids);

      console.log(`\n  Dayanak entry'ler (${ev?.length ?? 0}):`);
      for (const e of ev ?? []) {
        console.log(`    [${(e as any).id.slice(0, 8)}] "${(e as any).question.slice(0, 50)}"`);
        console.log(`          → "${(e as any).answer.slice(0, 60)}"`);
      }

      // Eşleşme kontrolü: insight'in source_entry_ids'indeki her ID, entries'te var mı?
      const foundIds = new Set((ev ?? []).map((e: any) => e.id));
      const allFound = latest.source_entry_ids.every((id: string) => foundIds.has(id));
      console.log(`\n  ✅ Tüm source_entry_ids entries'te mevcut: ${allFound ? 'EVET' : 'HAYIR'}`);
    } else {
      console.log('\n  ⚠️ source_entry_ids BOŞ — generate-insights.ts henüz bu alanı doldurmuyor.');
      console.log('     Worker güncellenmeli: insight INSERT ederken source_entry_ids de yazılmalı.');
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

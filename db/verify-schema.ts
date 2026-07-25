/**
 * Supabase gerçek tablo yapısı doğrulama script'i.
 * Adım 1-3: personality_profiles, insights, RLS durumu.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  // ──────────────────────────────────────────────
  // ADIM 1: personality_profiles GERÇEK kolonları
  // ──────────────────────────────────────────────
  console.log('═══ ADIM 1: personality_profiles KOLONLARI ═══');

  const { data: ppRow, error: ppErr } = await supabase
    .from('personality_profiles')
    .select('*')
    .limit(1);

  if (ppErr) {
    console.log(`personality_profiles HATA: ${ppErr.message}`);
  } else if (ppRow && ppRow.length > 0) {
    const r = ppRow[0];
    console.log('GERÇEK kolonlar:', Object.keys(r).join(', '));
    console.log('  id:', r.id, '| tip:', typeof r.id);
    console.log('  user_id:', r.user_id, '| tip:', typeof r.user_id);
    console.log('  created_at var mi:', 'created_at' in r, r.created_at);
    console.log('  updated_at var mi:', 'updated_at' in r, r.updated_at);
    console.log('  summary_text var mi:', 'summary_text' in r);
    console.log('  traits var mi:', 'traits' in r);
  } else {
    console.log('personality_profiles VAR ama BOS (0 satir).');
    // Bos tablo - insert + select ile kolon isimlerini ogren
    console.log('   -> test insert yapiliyor...');
    const { error: insErr } = await supabase.from('personality_profiles').insert({
      user_id: '00000000-0000-0000-0000-000000000000',
      summary_text: 'test',
    });
    console.log('   insert sonucu:', insErr ? insErr.message : 'BASARILI');
    // Users tablosunun bos olmasi lazim, FK hatasi verir.
    // Direkt select deneyelim
  }

  // ──────────────────────────────────────────────
  // ADIM 2: insights GERÇEK kolonları
  // ──────────────────────────────────────────────
  console.log('\n═══ ADIM 2: insights KOLONLARI ═══');

  const { data: insRow, error: insErr2 } = await supabase
    .from('insights')
    .select('*')
    .limit(1);

  if (insErr2) {
    console.log(`insights HATA: ${insErr2.message}`);
  } else if (insRow && insRow.length > 0) {
    const r = insRow[0];
    console.log('GERÇEK kolonlar:', Object.keys(r).join(', '));
    console.log('  id:', r.id);
    console.log('  user_id:', r.user_id);
    console.log('  insight_text var mi:', 'insight_text' in r);
    console.log('  category var mi:', 'category' in r);
    console.log('  confidence var mi:', 'confidence' in r);
    console.log('  based_on_period_start var mi:', 'based_on_period_start' in r, r.based_on_period_start);
    console.log('  based_on_period_end var mi:', 'based_on_period_end' in r, r.based_on_period_end);
    console.log('  created_at var mi:', 'created_at' in r, r.created_at);
  } else {
    console.log('insights VAR ama BOS (0 satir) veya YOK.');
  }

  // ──────────────────────────────────────────────
  // ADIM 3: TUM 9 TABLO ve RLS durumu
  // ──────────────────────────────────────────────
  console.log('\n═══ ADIM 3: TUM TABLOLAR ═══');

  const allTables = [
    'users', 'questions', 'personality_profiles', 'insights',
    'entries', 'entry_embeddings', 'friendships', 'conversations',
    'yanki_access_grants',
  ];

  for (const t of allTables) {
    const { count, error } = await supabase
      .from(t)
      .select('id', { count: 'exact', head: true });
    if (error) {
      console.log(`TABLO ${t}: HATA - ${error.code}: ${error.message}`);
    } else {
      console.log(`TABLO ${t}: MEVCUT, satir: ${count ?? '?'}`);
    }
  }

  console.log('\n═══ RLS SQL SORGUSU ═══');
  console.log('Asagidaki SQL Supabase SQL Editor da calistirilmali:');
  console.log("SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';");
}

main().catch(console.error);

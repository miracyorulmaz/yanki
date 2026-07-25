/**
 * Supabase tablo düzeltme script'i.
 * 1. personality_profiles: tekil/updated_at → append-only/id PK/created_at
 * 2. entry_embeddings: oluştur
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  // ═══════════════════════════════════════════════
  // ADIM 1: Mevcut personality_profiles satırını yedekle
  // ═══════════════════════════════════════════════
  console.log('ADIM 1: Mevcut veri yedekleniyor...');
  const { data: oldRows } = await supabase
    .from('personality_profiles')
    .select('*');

  console.log(`  ${oldRows?.length ?? 0} satir yedeklendi.`);
  for (const r of oldRows ?? []) {
    console.log(`  user_id=${r.user_id}, traits=${JSON.stringify(r.traits).slice(0, 80)}`);
  }

  // ═══════════════════════════════════════════════
  // ADIM 2: Eski tabloyu DROP, yenisini CREATE
  // ═══════════════════════════════════════════════
  console.log('\nADIM 2: personality_profiles yeniden olusturuluyor...');

  // REST API ile DROP yapamayiz, ama tabloyu yeniden olusturmak icin
  // once tum satirlari silelim, sonra yeni yapiyi kontrol edelim.
  // NOT: REST API ile ALTER TABLE yapilamaz. Bu script Supabase SQL
  // Editor alternatifi olarak burada; asil SQL fix-tables.sql'de.

  // Aslinda sorun su: REST API ile kolon ekleyip cikaramayiz.
  // Supabase SQL Editor'da fix-tables.sql calistirilmali.
  console.log('UYARI: Bu duzeltme Supabase SQL Editor gerektirir.');
  console.log('Calistirilacak SQL: db/fix-tables.sql');
  console.log('');
  console.log('Ancak once test amaciyla: mevcut yapiyi supabase rpc ile sorgulayalim...');

  // pg_tables ve information_schema icin rpc dene
  const { data: rpcData, error: rpcErr } = await supabase.rpc('match_entries', {
    query_embedding: new Array(1536).fill(0),
    match_count: 1,
    p_user_id: null,
  });

  if (rpcErr) {
    console.log('rpc durumu:', rpcErr.message);
  } else {
    console.log('match_entries calisiyor:', rpcData ? 'evet' : 'bos');
  }

  // ═══════════════════════════════════════════════
  // KONTROL: Simdiki durum
  // ═══════════════════════════════════════════════
  console.log('\n=== SUPABASE SQL EDITOR DA CALISTIRILACAK ===');
  console.log('Dosya: db/fix-tables.sql');
}

main().catch(console.error);

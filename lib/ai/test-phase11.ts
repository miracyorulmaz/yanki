/**
 * Phase 11 E2E test: Anı gizle → match_entries RAG'den düşüyor mu?
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const uid = 'c201458f-a5d3-47f8-bbc2-843b3c6be06d';

async function main() {
  console.log('═══ PHASE 11 TEST: Anı gizle → RAG dışı ═══\n');

  // 1. Hidden olmayan bir entry bul
  const { data: entries } = await s
    .from('entries')
    .select('id, answer, hidden_by_user')
    .eq('user_id', uid)
    .eq('hidden_by_user', false)
    .limit(3);

  if (!entries?.length) {
    console.log('❌ Test için hidden=false entry yok. Onboarding cevabı ekle.');
    return;
  }

  const target = entries[0] as any;
  console.log('1. Hedef entry:');
  console.log(`   id: ${target.id}`);
  console.log(`   answer: "${target.answer.slice(0, 60)}..."`);
  console.log(`   hidden_by_user: ${target.hidden_by_user}\n`);

  // 2. Gizle (PATCH /api/entries/[id]/hide)
  console.log('2. Gizleniyor...');
  const { error: patchErr } = await s
    .from('entries')
    .update({ hidden_by_user: true })
    .eq('id', target.id);
  if (patchErr) { console.log(`   ❌ ${patchErr.message}`); return; }
  console.log('   ✅ hidden_by_user = true\n');

  // 3. Doğrula
  const { data: updated } = await s
    .from('entries')
    .select('hidden_by_user')
    .eq('id', target.id)
    .single();
  console.log(`3. Doğrulama: hidden_by_user = ${(updated as any).hidden_by_user}\n`);

  // 4. Embedding varsa match_entries testi
  const { data: emb } = await s
    .from('entry_embeddings')
    .select('entry_id')
    .eq('entry_id', target.id)
    .maybeSingle();

  if (emb) {
    console.log('4. match_entries testi (gizli entry RAG\'e girmemeli):');
    // Basit bir vektör ile match_entries çağır (hidden=true olan entry embedding'i kullanmak yerine,
    // RPC ile match_entries çalıştır ve hedef entry'nin çıkmadığını doğrula)
    const { data: matches } = await s.rpc('match_entries', {
      query_embedding: new Array(1536).fill(0),
      match_count: 20,
      p_user_id: uid,
    });

    const targetInRag = (matches ?? []).some((m: any) => m.entry_id === target.id);
    console.log(`   target entry RAG'de: ${targetInRag ? '❌ HALA VAR (hata!)' : '✅ YOK (doğru)'}`);
  } else {
    console.log('4. ⚠️ Embedding yok, match_entries testi atlandı.');
    console.log('   npx tsx db/backfill-embeddings.ts çalıştırıp tekrar dene.');
  }

  // 5. Geri al
  await s.from('entries').update({ hidden_by_user: false }).eq('id', target.id);
  console.log('\n5. 🧹 Gizleme geri alındı (hidden_by_user = false).');
}

main().catch((e) => { console.error(e); process.exit(1); });

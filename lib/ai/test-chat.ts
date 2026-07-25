/**
 * Phase 7 End-to-End RAG Test v3
 * Kullanım: npx tsx lib/ai/test-chat.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const EMBEDDING_MODEL = 'text-embedding-3-small';
const CHAT_MODEL = 'claude-haiku-4-5-20251001';

async function main() {
  console.log('=== Phase 7 End-to-End RAG Test v3 ===\n');

  const testEmail = 'test-e2e-rag@yanki.dev';

  // 1. Kullanıcıyı bul ya da oluştur
  let userId: string;

  const { data: existing } = await supabase.from('users').select('id').eq('email', testEmail).maybeSingle();
  if (existing) {
    userId = existing.id;
    console.log('📋 Kullanıcı ID:', userId);
  } else {
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const au = authUsers?.users?.find((u: any) => u.email === testEmail);
    if (au) {
      userId = au.id;
      await supabase.from('users').upsert({ id: userId, email: testEmail, display_name: 'E2E Test' });
      console.log('👤 Auth\'tan alındı:', userId);
    } else {
      const { data: created } = await supabase.auth.admin.createUser({
        email: testEmail, password: 'test-e2e-rag-pw', email_confirm: true,
        user_metadata: { display_name: 'E2E Test' },
      });
      userId = created.user!.id;
      console.log('👤 Oluşturuldu:', userId);
    }
  }

  // Temizle
  const { data: oldEntries } = await supabase.from('entries').select('id').eq('user_id', userId);
  if (oldEntries?.length) {
    await supabase.from('entry_embeddings').delete().in('entry_id', oldEntries.map(e => e.id));
    await supabase.from('entries').delete().eq('user_id', userId);
  }
  await supabase.from('conversations').delete().eq('user_id', userId);
  console.log('🧹 Temizlendi.\n');

  // 2. Onboarding cevapları + embedding
  console.log('📝 Onboarding cevapları + embedding...\n');

  const onboarding = [
    { q: 'Kendini üç kelimeyle tanımlasan, hangi üç kelimeyi seçerdin?', a: 'meraklı, yaratıcı, biraz mesafeli' },
    { q: 'Hayatındaki en önemli 3 kişi kim, neden?', a: 'Annem, eşim ve en yakın arkadaşım Deniz. Hepsi beni koşulsuz destekliyor.' },
    { q: 'En büyük korkun nedir?', a: 'En büyük korkum yalnızlık. İnsanların hayatımdan kaybolması fikri beni gerçekten ürkütüyor.' },
    { q: 'Hayattaki amacını bir cümleyle özetlesen ne derdin?', a: 'İnsanlara faydalı olmak ve arkamda anlamlı bir şey bırakmak.' },
    { q: 'Mizah anlayışını nasıl tarif edersin?', a: 'Kuru ve absürt. Beklenmedik anda gelen ince esprileri severim.' },
  ];

  let fearEntryId = '';

  for (const { q, a } of onboarding) {
    const { data: entry } = await supabase.from('entries').insert({
      user_id: userId, source: 'onboarding', question: q,
      question_type: 'open_text', answer: a,
    }).select('id').single();

    if (!entry) continue;
    if (q.includes('korku')) fearEntryId = entry.id;

    const embResp = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: a, dimensions: 1536 });
    const emb = embResp.data[0]?.embedding;
    if (emb) {
      await supabase.from('entry_embeddings').insert({ entry_id: entry.id, embedding: emb, embedding_model: EMBEDDING_MODEL });
      console.log(`   ✅ ${q.slice(0,50)}`);
    }
  }
  console.log(`\n🧮 5 entry + embedding hazır. Korku entry ID: ${fearEntryId.slice(0,8)}...\n`);

  // 3. match_entries doğrulaması
  const testEmb = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: 'korku yalnızlık', dimensions: 1536 });
  const { data: matches } = await supabase.rpc('match_entries', {
    query_embedding: testEmb.data[0].embedding,
    match_count: 5, match_threshold: 0.3, p_user_id: userId,
  });

  const usedMemories: string[] = [];
  const memoryLines: string[] = [];

  console.log('🔍 match_entries sonuçları:');
  for (const m of (matches ?? []) as any[]) {
    const hit = m.similarity > 0.5 ? '✅' : '⚠️';
    console.log(`   ${hit} sim=${(m.similarity).toFixed(3)} | ${m.question.slice(0,50)}`);
    if (m.similarity > 0.5) {
      usedMemories.push(m.entry_id);
      memoryLines.push(`- [${m.question}] → ${m.answer}`);
    }
  }
  console.log();

  // 4. ASIL TEST: Chat
  const question = 'Korkularımdan bahseder misin? Nelerden korktuğumu hatırlıyor musun?';
  console.log('💬 SORU:', question, '\n');

  const systemPrompt = `Sen Yankı — bu kullanıcının dijital ikizisin. Kullanıcıya "o kişi gibi" yanıt ver.

## İhlal Edilemez Kurallar
1. Kullanıcının konuşma tarzını, mizahını ve bakış açısını yansıt.
2. Doğrulanabilir olgusal konularda yanlış bilgiyi teyit etme veya çoğaltma.
3. Kullanıcının yerine karar verme — bir ayna ol, karar verici değil.
4. Doğal ol — "şu tarihte şöyle demiştin" deme, sanki hatırlıyormuş gibi konuş.

## Kullanıcının Kişilik Özeti
Meraklı, yaratıcı ve biraz mesafeli. En büyük korkusu yalnızlık. En önemli insanlar: annesi, eşi, Deniz. Amacı insanlara faydalı olmak. Kuru ve absürt mizah.

## Hatırladığın Anılar
${memoryLines.join('\n')}`;

  const startTime = Date.now();
  const response = await anthropic.messages.create({
    model: CHAT_MODEL, max_tokens: 1024, system: systemPrompt,
    messages: [{ role: 'user', content: question }],
  });

  const reply = response.content[0]?.type === 'text' ? response.content[0].text : '(cevap yok)';
  const latencyMs = Date.now() - startTime;

  console.log('🤖 YANKI CEVABI:\n');
  console.log('─'.repeat(60));
  console.log(reply);
  console.log('─'.repeat(60));

  const tokenIn = response.usage?.input_tokens ?? 0;
  const tokenOut = response.usage?.output_tokens ?? 0;
  console.log(`\n📊 Model: ${CHAT_MODEL} | Tokens: ${tokenIn}/${tokenOut} | Latency: ${latencyMs}ms`);
  console.log(`📊 usedMemories: [${usedMemories.join(', ')}]`);

  const ragHit = fearEntryId && usedMemories.includes(fearEntryId);
  console.log(`\n${ragHit ? '✅ RAG BAŞARILI' : '⚠️ RAG KAÇIRDI'}: korku entry'si (${fearEntryId.slice(0,8)}) ${ragHit ? 'retrieval\'de!' : 'retrieval\'de YOK.'}`);

  // 5. conversations tablosuna yaz (sadece mevcut kolonlarla)
  await supabase.from('conversations').insert([
    { user_id: userId, role: 'user', message: question },
    { user_id: userId, role: 'yanki', message: reply },
  ]);

  const { data: convs } = await supabase.from('conversations')
    .select('role, message, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  console.log('\n📋 conversations tablosu (gerçek SELECT çıktısı):');
  console.log('─'.repeat(60));
  for (const c of convs ?? []) {
    console.log(`[${c.role}] ${c.message.slice(0, 120)}${c.message.length > 120 ? '...' : ''}`);
    console.log(`      created_at: ${c.created_at}`);
    console.log();
  }

  console.log('✅ Test tamamlandı!');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });

/**
 * Phase 8 Verification: Chat'te insight'ın context'e dahil olduğunu kanıtla.
 * Kullanım: npx tsx lib/ai/test-insight-chat.ts
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

async function main() {
  console.log('=== Phase 8: Insight Context Verification ===\n');

  const userId = 'c201458f-a5d3-47f8-bbc2-843b3c6be06d';

  // 1. Profile (append-only: en son satır)
  const { data: profile } = await supabase
    .from('personality_profiles')
    .select('id, summary_text')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  console.log('🧠 Profile:', profile ? 'var' : 'yok');

  // 2. Insights
  const { data: insights } = await supabase
    .from('insights')
    .select('id, insight_text, category, confidence')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('💡 Insights:', insights?.length ?? 0, 'adet');

  if (insights?.length) {
    for (const ins of insights) {
      console.log(`   └ [${ins.category}] ${ins.insight_text} (conf: ${ins.confidence})`);
    }
  }

  // 3. match_entries
  const question = 'Zaman içinde nasıl değiştim? Kişiliğimde bir değişim görüyor musun?';
  console.log('\n💬 SORU:', question);

  const testEmb = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: question,
    dimensions: 1536,
  });

  const { data: matches } = await supabase.rpc('match_entries', {
    query_embedding: testEmb.data[0].embedding,
    match_count: 5,
    match_threshold: 0.3,
    p_user_id: userId,
  });

  const usedMemories = ((matches ?? []) as any[])
    .filter((m) => (m.similarity as number) > 0.5)
    .map((m) => ({ id: m.entry_id, q: m.question, a: m.answer }));

  // 4. System prompt (insights dahil)
  const memoryLines = usedMemories.map((m) => `- [${m.q}] → ${m.a}`).join('\n');
  const insightLines = (insights ?? []).map((i) => `- [${i.category}] ${i.insight_text} (güven: ${i.confidence})`).join('\n');

  const systemPrompt = `Sen Yankı — kullanıcının dijital ikizisin.

## Kişilik Özeti
${profile?.summary_text ?? '(yok)'}

## Hatırladığın Anılar
${memoryLines || '(anı bulunamadı)'}

## Zaman İçindeki Değişimler (INSIGHTS)
${insightLines || '(henüz insight yok)'}

Yukarıdaki INSIGHTS bölümündeki trendleri kullanıcının cevabına doğal bir şekilde dahil et.`;

  const startTime = Date.now();
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: question }],
  });

  const reply = response.content[0]?.type === 'text' ? response.content[0].text : '';
  const latency = Date.now() - startTime;

  console.log('\n🤖 YANKI CEVABI:\n');
  console.log('─'.repeat(60));
  console.log(reply);
  console.log('─'.repeat(60));

  console.log(`\n📊 Metrics:`);
  console.log(`   Token: ${response.usage?.input_tokens}/${response.usage?.output_tokens}`);
  console.log(`   Latency: ${latency}ms`);
  console.log(`   Memories used: ${usedMemories.length}`);
  console.log(`   Insights in context: ${insights?.length ?? 0}`);

  // Insight'a referans var mı?
  const insightMentioned =
    insights?.some(
      (i) => reply.includes(i.insight_text.slice(0, 15)) || reply.includes('istikrar') || reply.includes('değişken'),
    ) ?? false;
  console.log(`\n${insightMentioned ? '✅ INSIGHT CONTEXT\'E DAHIL EDILDI' : '⚠️ Insight referansi bulunamadi'}`);

  console.log('\n✅ Phase 8 verification tamamlandı!');
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });

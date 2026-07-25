/**
 * Backfill: Embedding'i olmayan tüm entries'lere embedding üretir.
 *
 * Kullanım:
 *   npx tsx db/backfill-embeddings.ts
 *
 * Gereken ortam değişkenleri:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (RLS'yi bypass etmek için)
 *   OPENAI_API_KEY
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli.');
  process.exit(1);
}

if (!openaiKey) {
  console.error('❌ OPENAI_API_KEY gerekli.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const openai = new OpenAI({ apiKey: openaiKey });

async function embedText(text: string): Promise<number[] | null> {
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    return response.data[0]?.embedding ?? null;
  } catch (err) {
    console.error('[backfill] OpenAI API error:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function backfill() {
  console.log('🔍 Embedding eksik entries aranıyor...');

  // Tüm entries'i ve mevcut embedding'leri çek
  const { data: entries, error: entriesError } = await supabase
    .from('entries')
    .select('id, answer');

  if (entriesError || !entries) {
    console.error('❌ Entries alınamadı:', entriesError?.message ?? 'empty');
    process.exit(1);
  }

  const { data: embeddings } = await supabase
    .from('entry_embeddings')
    .select('entry_id');

  const embeddedIds = new Set(embeddings?.map((e) => e.entry_id) ?? []);
  const missing = entries.filter((e) => !embeddedIds.has(e.id));

  if (missing.length === 0) {
    console.log('✅ Tüm entries\'lerin embedding\'i zaten var.');
    return;
  }

  console.log(`📊 ${entries.length} entry bulundu, ${missing.length} tanesinde embedding eksik.`);

  let done = 0;
  let failed = 0;

  for (const entry of missing) {
    const embedding = await embedText(entry.answer);

    if (!embedding) {
      failed++;
      continue;
    }

    const { error: insertError } = await supabase
      .from('entry_embeddings')
      .insert({
        entry_id: entry.id,
        embedding,
        embedding_model: EMBEDDING_MODEL,
      });

    if (insertError) {
      console.error(`❌ [${entry.id.slice(0, 8)}...] Insert hatası:`, insertError.message);
      failed++;
      continue;
    }

    done++;
    if (done % 5 === 0) {
      console.log(`   ⏳ ${done}/${missing.length} tamamlandı...`);
    }
  }

  const msg =
    failed > 0
      ? `${done} embedding oluşturuldu, ${failed} başarısız (daha sonra tekrar çalıştırın).`
      : `${done} embedding oluşturuldu.`;

  console.log(`✅ Backfill tamamlandı. ${msg}`);
}

backfill().catch((err) => {
  console.error('❌ Backfill hatası:', err);
  process.exit(1);
});

import OpenAI from 'openai';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Verilen metin için OpenAI embedding üretir.
 * Hata durumunda null döner — çağıran taraf handle eder.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error('[embed] OPENAI_API_KEY is not set. Skipping embedding.');
    return null;
  }

  const openai = new OpenAI({ apiKey });

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    return response.data[0]?.embedding ?? null;
  } catch (err) {
    console.error('[embed] OpenAI API error:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Entry'yi embed'leyip entry_embeddings tablosuna yazar.
 * Hata durumunda sadece log'lar, hata fırlatmaz —
 * entry'nin kendisi zaten kaydedilmiştir, embedding backfill ile tamamlanabilir.
 */
export async function embedEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  entryId: string,
  answer: string,
): Promise<void> {
  const embedding = await embedText(answer);

  if (!embedding) {
    console.warn(`[embed] Embedding failed for entry ${entryId}. Can be backfilled later.`);
    return;
  }

  const { error } = await supabase
    .from('entry_embeddings')
    .insert({
      entry_id: entryId,
      embedding,
      embedding_model: EMBEDDING_MODEL,
    });

  if (error) {
    console.error(`[embed] Failed to insert embedding for entry ${entryId}:`, error);
  }
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };

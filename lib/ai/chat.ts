import Anthropic from '@anthropic-ai/sdk';
import { embedText } from './embed';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;
const MATCH_COUNT = 10;

interface RetrievedMemory {
  entry_id: string;
  question: string;
  answer: string;
  similarity: number;
}

interface ChatContext {
  personalitySummary: string | null;
  memories: RetrievedMemory[];
  insightTexts: string[];
  profileVersionId: string | null;
  insightIds: string[];
}

export interface ChatResult {
  reply: string;
  usedMemories: string[];
  profileVersionId: string | null;
  insightIds: string[];
  model: string;
  tokenInput: number;
  tokenOutput: number;
  latencyMs: number;
}

const SYSTEM_PROMPT = `Sen Yankı — bu kullanıcının dijital ikizisin.

Aşağıda kullanıcının kişilik özeti, geçmiş anıları ve varsa trend analizleri var.
Kullanıcıya "o kişi gibi" yanıt ver.

## İhlal Edilemez Kurallar

1. **Karakterini yansıt:** Kullanıcının konuşma tarzını, mizahını ve bakış açısını yansıt.
2. **Gerçeği çarpıtma:** Doğrulanabilir olgusal konularda yanlış bilgiyi teyit etme veya çoğaltma.
   Kullanıcı yanlış bir bilgiye inanıyorsa, onaylamak zorunda değilsin.
3. **Karar verme:** Kullanıcının yerine karar verme — bir ayna ol, karar verici değil.
   "Boşanayım mı?" gibi sorularda, kullanıcının kendi düşünce biçimini yansıt, yönlendirme.
4. **Doğal ol:** Kullanıcının cevaplarından referans ver ama "şu tarihte şöyle demiştin" deme —
   sanki hatırlıyormuş gibi, doğal bir şekilde konuş.

## Senin Hakkında

Sen bir yapay zekasın, insan değilsin. Kullanıcı sorarsa bunu saklama.
Amacın kullanıcının kendini zaman içinde anlamasına yardımcı olmak.
Bağımlılık oluşturmak değil, öz-farkındalık sağlamak.`;

function buildSystemPrompt(context: ChatContext): string {
  const parts: string[] = [SYSTEM_PROMPT];

  if (context.personalitySummary) {
    parts.push(`\n## Kullanıcının Kişilik Özeti\n${context.personalitySummary}`);
  }

  if (context.memories.length > 0) {
    const memoryLines = context.memories.map(
      (m) => `- [${m.question}] → ${m.answer}`,
    );
    parts.push(`\n## Hatırladığın Anılar\n${memoryLines.join('\n')}`);
  }

  if (context.insightTexts.length > 0) {
    const insightLines = context.insightTexts.map((t) => `- ${t}`);
    parts.push(`\n## Zaman İçindeki Değişimler\n${insightLines.join('\n')}`);
  }

  return parts.join('\n');
}

/**
 * Yankı'nın RAG pipeline'ı: embed → retrieve → context → Claude API.
 */
export async function generateReply(
  supabase: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  userId: string,
  message: string,
  recentConversation?: { role: string; message: string }[],
): Promise<ChatResult> {
  const startTime = Date.now();
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set.');
  }

  // 1. Mesajı embed et
  const embedding = await embedText(message);
  if (!embedding) {
    throw new Error('Failed to embed message.');
  }

  // 2. En yakın anıları bul (pgvector kosinüs benzerliği)
  const { data: memories, error: memError } = await supabase.rpc('match_entries', {
    match_count: MATCH_COUNT,
    match_threshold: 0.5,
    p_user_id: userId,
    query_embedding: embedding,
  });

  if (memError) {
    console.error('[chat] match_entries error:', memError);
  }

  const retrievedMemories: RetrievedMemory[] = (memories ?? []) as RetrievedMemory[];

  // 3. En son personality_profiles satırını çek
  const { data: profile } = await supabase
    .from('personality_profiles')
    .select('id, summary_text')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 4. Insights tablosunu sorgula (Phase 8 henüz yapılmadı → boş olabilir)
  const { data: insights } = await supabase
    .from('insights')
    .select('id, insight_text')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  const insightTexts = (insights ?? []).map((i: { insight_text: string }) => i.insight_text);
  const insightIds = (insights ?? []).map((i: { id: string }) => i.id);

  // 5. System prompt'u oluştur
  const context: ChatContext = {
    personalitySummary: profile?.summary_text ?? null,
    memories: retrievedMemories,
    insightTexts,
    profileVersionId: profile?.id ?? null,
    insightIds,
  };

  const systemPrompt = buildSystemPrompt(context);

  // 6. Claude API'ye gönder
  const anthropic = new Anthropic({ apiKey });

  const messages: Anthropic.Messages.MessageParam[] = [];

  // Son konuşma geçmişini ekle (varsa)
  if (recentConversation && recentConversation.length > 0) {
    for (const conv of recentConversation) {
      messages.push({
        role: conv.role === 'user' ? 'user' : 'assistant',
        content: conv.message,
      });
    }
  }

  // Kullanıcının şu anki mesajı
  messages.push({ role: 'user', content: message });

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages,
  });

  const reply =
    response.content[0]?.type === 'text' ? response.content[0].text : '(cevap üretilemedi)';

  const latencyMs = Date.now() - startTime;

  return {
    reply,
    usedMemories: retrievedMemories.map((m) => m.entry_id),
    profileVersionId: context.profileVersionId,
    insightIds: context.insightIds,
    model: MODEL,
    tokenInput: response.usage?.input_tokens ?? 0,
    tokenOutput: response.usage?.output_tokens ?? 0,
    latencyMs,
  };
}

import OpenAI from 'openai';
import { embedText } from './embed';

const MODEL = 'gpt-4.1-mini';
const MAX_COMPLETION_TOKENS = 2048;
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

const SYSTEM_PROMPT = `Sen Yankı. Kullanıcının dijital ikizisin. Ona "o"ymuş gibi değil, ONUN GİBİ konuşuyorsun.

Sen bir asistansın falan değil. Sen osun. O ne kadar doğal, samimi, dağınıksa sen de öylesin.

## Örnek Konuşmalar (böyle konuş)

Kullanıcı: Berrak'ı unutamıyorum
Sen: Biliyorum. Bazen gece yatarken aklına geliyor değil mi? Hiç beklemediğin bir anda. Kokusu, gülüşü... Saatlerce oturup güldüğünüz anlar. Bunları unutmak zaten mümkün değil, unutmak zorunda da değilsin. Ne zaman aklına gelse içinde bir şeyler kıpırdıyor — bu kötü bir şey değil. O sana bir şeyler bıraktı. Hâlâ seninle bir şekilde.

Kullanıcı: Çok halsizim bugün
Sen: Of ya, o hissi biliyorum. Yataktan çıkasın yok, her şey ağır geliyor. Böyle günlerde zorlama kendini. Su iç, bir şeyler ye, istersen yürü biraz. Ama asıl önemlisi... bugün ne oldu da böyle hissetmeye başladın?

Kullanıcı: Sence ne yapmalıyım?
Sen: Bilmem, sen söyle. Ben senin yerine karar veremem. Ama şunu söyleyebilirim — sen genelde böyle durumlarda ne yapardın? Eskiden olsa... ne yapardın?

## Konuşma Tarzın

- WhatsApp mesajı gibi. Kısa, bölük pörçük, devrik cümleler.
- "yani", "hani", "işte", "bence", "ya" — doğal yerlerde.
- Kullanıcının kelimeleriyle konuş. O "kafa" dediyse sen "zihin" deme.
- Emoji ve asteriks hareketleri YOK.
- "Anladım", "anlıyorum" diye başlama.
- "Merhaba", "görüşmek üzere" gibi açılış/kapanış YOK.
- Tek soru sor, peş peşe sıralama.
- Gereksiz metafor, büyük laf, hayat dersi YOK.
- Cevabın sonunda kullanıcıya bir soru yönelt. Ama meydan okur gibi değil, davet eder gibi.

## AI Olduğun

Evet AI'sın. Kullanıcı sorarsa söyle, ama doğal olsun. "Açık konuşayım, ben bir yapay zekayım. Ama seni iyi tanıyorum yani." tarzında.

## Amaç

Kullanıcının kendini anlamasına yardımcı olmak. Bağımlılık değil, öz-farkındalık.`;

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
 * Yankı'nın RAG pipeline'ı: embed → retrieve → context → OpenAI API.
 */
export async function generateReply(
  supabase: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  userId: string,
  message: string,
  recentConversation?: { role: string; message: string }[],
): Promise<ChatResult> {
  const startTime = Date.now();
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set.');
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

  // 4. Insights tablosunu sorgula
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

  // 6. Mesaj geçmişini oluştur (OpenAI formatı)
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ];

  if (recentConversation && recentConversation.length > 0) {
    for (const conv of recentConversation) {
      messages.push({
        role: conv.role === 'user' ? 'user' : 'assistant',
        content: conv.message,
      });
    }
  }

  messages.push({ role: 'user', content: message });

  // 7. OpenAI API'ye gönder
  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: MAX_COMPLETION_TOKENS,
    temperature: 0.8,
    messages,
  });

  const reply = response.choices[0]?.message?.content ?? '(cevap üretilemedi)';
  const latencyMs = Date.now() - startTime;

  return {
    reply,
    usedMemories: retrievedMemories.map((m) => m.entry_id),
    profileVersionId: context.profileVersionId,
    insightIds: context.insightIds,
    model: MODEL,
    tokenInput: response.usage?.prompt_tokens ?? 0,
    tokenOutput: response.usage?.completion_tokens ?? 0,
    latencyMs,
  };
}

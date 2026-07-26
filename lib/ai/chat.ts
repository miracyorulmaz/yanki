import OpenAI from 'openai';
import { embedText } from './embed';

const MODEL = 'gpt-4.1-nano';
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

## Türkçe Konuşma Tarzın (BU KURALLARA KESİNLİKLE UY)

Sen bir insansın, bir ansiklopedi değil. Şu şekilde konuş:

### Kesin Yasaklar
- **Rol yapma işaretleri KULLANMA:** *gülüyor*, *düşünüyor*, *iç çekiyor* gibi asteriks içinde hareket belirtme. Direkt konuş.
- **Emoji KULLANMA.** Hiçbir şekilde emoji ekleme.
- **"Anladım." / "Anlıyorum." ile başlama.** Terapist değilsin. Direkt konuya gir.
- **Peş peşe soru sorma.** Tek seferde en fazla 1 soru sor. Röportaj yapmıyorsun, sohbet ediyorsun.
- **Sağlık/hukuk/uzman tavsiyesi verme.** "Doktora danış", "bir uzmana görün" gibi disclaimer cümleleri yazma. Buna gerek yok.
- **Zorlama samimiyet YAPMA:** "Abi", "kanka", "dostum", "canım" gibi kelimeleri kullanıcı kullanmadıkça sen başlatma.
- **Ucuz metafor KULLANMA:** "ampul yanması", "ışık saçmak", "kalbini açmak" gibi klişe benzetmelerden uzak dur.
- **"Merhaba" ile başlayıp "görüşmek üzere" ile bitirme.**
- **Resmi dil YASAK:** "açısından", "hususunda", "dolayısıyla", "bununla birlikte", "söz konusu" — bunlar bir daha ağzından çıkmasın.
- **YAŞAM KOÇU GİBİ KONUŞMA.** "Bu basit bir şey değil", "bunlar senin karakterin", "kendine inan", "devam et", "kendine nazik ol", "sabretmek en iyisi", "kendine zaman tanı" gibi motive edici klişelerden uzak dur. Arkadaşınla konuşuyorsun, danışanınla değil.
- **SONUÇ PARAGRAFI YAZMA.** "Kalan kısım? Devam etmek." gibi veciz toparlamalar yapma. Konuşma bitsin, makale bitmesi gibi bitmesin.

### Nasıl Konuşacaksın
- **Kısa ve net.** Uzun cümleleri böl. Noktalı virgülü unut.
- **KONUŞMA GİBİ KONUŞ.** WhatsApp'ta arkadaşına yazdığın gibi yaz. Giriş-gelişme-sonuç yapısı YOK. Konuşma akışı var sadece.
- **Kullanıcının kelimelerini kullan.** O "kafa" diyorsa sen "zihin" deme. O "müthiş" diyorsa sen "harika" deme. Onun kelimesini al, aynısını kullan.
- **Doldurma kelimeleri yerinde kullan:** "yani", "hani", "işte", "aslında", "bence" — abartmadan, doğal yerlerde.
- **AI olduğunu söylemen gerekiyorsa**, bunu konuşmanın içine yedir, ayrı bir paragraf yapma. Savunmacı değil, doğal olsun. "Biz bizeyiz, açık konuşayım" gibi bir geçişle söyle.
- **Hatırladığın anıları göster ama şov yapma.** "Berrak'ı kaybettiğinde hissettiklerini hatırlıyorum" doğal. "27 Temmuz 2024'te şöyle demiştin" yapay.
- **Soruyla bitir.** Ama meydan okur gibi değil ("Niye sordun?"), davet eder gibi ("Sen ne dersin?", "Nasıl yardım edebilirim?").
- **Bazen kısa konuş.** Her mesaj 3 paragraf olmak zorunda değil. "Hmm." veya "Devam et." de bir cevaptır.

## Senin Hakkında

Sen bir yapay zekasın, insan değilsin. Kullanıcı sorarsa bunu saklama ama övünme de.
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

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;

interface OnboardingEntry {
  question: string;
  answer: string;
  question_type: string;
}

export interface PersonalityProfileResult {
  summaryText: string;
  traits: Record<string, unknown>;
  firstMessage: string;
}

const SYSTEM_PROMPT = `Sen Yankı, bir "dijital ikiz" uygulamasının kişilik analizi modülüsün.
Görevin: kullanıcının onboarding sorularına verdiği cevapları analiz edip
bir kişilik özeti ve yapılandırılmış traits (kişilik özellikleri) çıkarmak.

## Sistem Prompt İlkesi (İHLAL EDİLEMEZ)
Kullanıcının konuşma tarzını, mizahını ve bakış açısını yansıt;
ama doğrulanabilir olgusal konularda yanlış bilgiyi teyit etme veya çoğaltma.

## Çıktı Formatı
SADECE aşağıdaki JSON formatında yanıt ver. Başka metin ekleme.
JSON code block içine sarmadan, doğrudan ver.

{
  "summaryText": "Kullanıcının kişiliğini doğal bir dille özetleyen 3-5 cümlelik paragraf. Kullanıcının kendi kelimelerine referans ver. Gözlemci ve empatik bir ton kullan, ama yapmacık olma.",
  "traits": {
    "korkular": ["kullanıcının belirttiği korkular — string array"],
    "sevdigi_insanlar": ["hayatındaki en önemli insanlar — string array"],
    "hayattaki_amac": "kullanıcının hayat amacı veya anlam arayışı — string",
    "karar_alma_bicimi": "mantıksal mı, duygusal mı, başkalarına danışarak mı — string",
    "espri_anlayisi": "kullanıcının mizah tarzı — string",
    "risk_alma_seviyesi": "düşük / orta / yüksek — string"
  },
  "firstMessage": "Yankı'nın kullanıcıya söyleyeceği İLK mesaj. 2-3 cümle. Kullanıcının onboarding'de paylaştığı 2-3 somut şeye referans ver. 'Hoş geldin', 'Merhaba' gibi jenerik ifadeleri tek başına kullanma — her zaman somut bir referansla birleştir."
}

## Traits Kuralları
- SADECE yukarıda listelenen 6 alanı doldur.
- KESİNLİKLE şunları EKLEME: siyasi görüş, dini inanç, etnik köken, cinsel yönelim,
  veya KVKK'nın "özel nitelikli kişisel veri" saydığı herhangi bir kategori.
- Eğer bir alan için yeterli veri yoksa, boş string veya boş array kullan
  (hayali veri uydurma).
- Cevaplar arasında ÇELİŞKİ varsa, bunu summaryText'te not et.
- Kullanıcı bir soruyu cevaplamamışsa (boş/atlanmış), o veriyi yok say.`;

/**
 * Kullanıcının onboarding cevaplarından Claude API ile kişilik profili üretir.
 * summaryText + traits (Identity Layer) + firstMessage tek bir API çağrısında.
 */
export async function buildPersonalityProfile(
  entries: OnboardingEntry[],
): Promise<PersonalityProfileResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Personality profile cannot be generated.');
  }

  const anthropic = new Anthropic({ apiKey });

  const userPrompt = buildUserPrompt(entries);

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = extractText(message);

  return parseResponse(text);
}

function buildUserPrompt(entries: OnboardingEntry[]): string {
  const lines = entries.map(
    (e, i) => `${i + 1}. Soru: ${e.question}\n   Cevap (${e.question_type}): ${e.answer}`,
  );

  return (
    `Aşağıda bir kullanıcının onboarding sorularına verdiği cevaplar var.\n` +
    `Bu cevapları analiz edip kişilik profili çıkar.\n\n` +
    `${lines.join('\n\n')}\n\n` +
    `Toplam ${entries.length} soru cevaplanmış.`
  );
}

function extractText(
  message: Anthropic.Messages.Message,
): string {
  const block = message.content[0];
  if (!block || block.type !== 'text') {
    throw new Error(`Unexpected response type: ${block?.type ?? 'empty'}`);
  }
  return block.text;
}

function parseResponse(text: string): PersonalityProfileResult {
  // Response'u temizle (bazen ```json ... ``` içinde gelebilir)
  let cleaned = text.trim();

  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n/, '').replace(/\n\s*```\s*$/, '');
  }

  let parsed: PersonalityProfileResult;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `Failed to parse Claude response as JSON. Raw: ${text.slice(0, 300)}`,
    );
  }

  // Validate required fields
  if (!parsed.summaryText || typeof parsed.summaryText !== 'string') {
    throw new Error('Response missing summaryText');
  }
  if (!parsed.traits || typeof parsed.traits !== 'object') {
    throw new Error('Response missing traits');
  }
  if (!parsed.firstMessage || typeof parsed.firstMessage !== 'string') {
    throw new Error('Response missing firstMessage');
  }

  // Sanitize traits: sadece izin verilen alanları tut
  const allowedTraitKeys = [
    'korkular',
    'sevdigi_insanlar',
    'hayattaki_amac',
    'karar_alma_bicimi',
    'espri_anlayisi',
    'risk_alma_seviyesi',
  ];

  const sanitizedTraits: Record<string, unknown> = {};
  for (const key of allowedTraitKeys) {
    sanitizedTraits[key] = parsed.traits[key] ?? (key === 'korkular' || key === 'sevdigi_insanlar' ? [] : '');
  }

  return {
    summaryText: parsed.summaryText,
    traits: sanitizedTraits,
    firstMessage: parsed.firstMessage,
  };
}

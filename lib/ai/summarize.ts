import OpenAI from 'openai';

const MODEL = 'gpt-5.6-luna';
const MAX_COMPLETION_TOKENS = 1024;

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
    "korkular": ["korku 1", "korku 2"],
    "sevdigi_insanlar": ["kişi 1", "kişi 2"],
    "hayattaki_amac": "kullanıcının hayat amacı veya anlam arayışı — string",
    "karar_alma_bicimi": "mantıksal mı, duygusal mı, başkalarına danışarak mı — string",
    "espri_anlayisi": "kullanıcının mizah tarzı — string",
    "risk_alma_seviyesi": "düşük / orta / yüksek — string"
  },
  "firstMessage": "Yankı'nın kullanıcıya söyleyeceği İLK mesaj. 2-3 cümle. Kullanıcının onboarding'de paylaştığı 2-3 somut şeye referans ver. WhatsApp mesajı gibi doğal olsun. 'Hoş geldin', 'Merhaba' gibi jenerik ifadeleri tek başına kullanma — her zaman somut bir referansla birleştir."
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
 * Kullanıcının onboarding cevaplarından OpenAI API ile kişilik profili üretir.
 * summaryText + traits (Identity Layer) + firstMessage tek bir API çağrısında.
 */
export async function buildPersonalityProfile(
  entries: OnboardingEntry[],
): Promise<PersonalityProfileResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set. Personality profile cannot be generated.');
  }

  const openai = new OpenAI({ apiKey });

  const userPrompt = buildUserPrompt(entries);

  const response = await openai.chat.completions.create({
    model: MODEL,
    max_completion_tokens: MAX_COMPLETION_TOKENS,
    temperature: 1,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  const text = response.choices[0]?.message?.content ?? '';
  if (!text) {
    throw new Error('Empty response from OpenAI');
  }

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
      `Failed to parse response as JSON. Raw: ${text.slice(0, 300)}`,
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

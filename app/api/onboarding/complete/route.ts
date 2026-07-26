import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildPersonalityProfile } from '@/lib/ai/summarize';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Adım 1: Eksik/zorunlu onboarding sorusu var mı kontrol et
  // weight >= 0.85 olan sorular atlanabilir, diğerleri zorunlu
  const { data: allOnboardingQuestions, error: qError } = await supabase
    .from('questions')
    .select('id, text, weight')
    .eq('category', 'onboarding')
    .eq('active', true);

  if (qError) {
    return NextResponse.json({ error: qError.message }, { status: 500 });
  }

  const { data: answeredEntries, error: eError } = await supabase
    .from('entries')
    .select('question_id')
    .eq('user_id', user.id)
    .eq('source', 'onboarding');

  if (eError) {
    return NextResponse.json({ error: eError.message }, { status: 500 });
  }

  const answeredIds = new Set(answeredEntries.map((e) => e.question_id));
  const missingRequired = allOnboardingQuestions.filter(
    (q) => !answeredIds.has(q.id) && (q.weight === null || q.weight < 0.85),
  );

  if (missingRequired.length > 0) {
    return NextResponse.json(
      {
        error: 'Eksik zorunlu sorular var.',
        missingQuestions: missingRequired.map((q) => ({ id: q.id, text: q.text })),
      },
      { status: 400 },
    );
  }

  // Adım 2: Tüm onboarding entries'leri getir
  const { data: allEntries, error: allErr } = await supabase
    .from('entries')
    .select('question, answer, question_type')
    .eq('user_id', user.id)
    .eq('source', 'onboarding');

  if (allErr) {
    return NextResponse.json({ error: allErr.message }, { status: 500 });
  }

  if (!allEntries || allEntries.length === 0) {
    return NextResponse.json({ error: 'Hiç onboarding cevabı bulunamadı.' }, { status: 400 });
  }

  // Adım 3: Claude API ile kişilik profili üret
  let summaryText: string;
  let traits: Record<string, unknown>;
  let firstMessage: string;

  try {
    const result = await buildPersonalityProfile(allEntries);
    summaryText = result.summaryText;
    traits = result.traits;
    firstMessage = result.firstMessage;
  } catch (err) {
    console.error('Personality profile generation failed:', err);
    return NextResponse.json(
      { error: 'Kişilik profili oluşturulamadı. Lütfen tekrar deneyin.' },
      { status: 500 },
    );
  }

  // Adım 4: personality_profiles satırı oluştur
  const { data: profile, error: pError } = await supabase
    .from('personality_profiles')
    .insert({
      user_id: user.id,
      summary_text: summaryText,
      traits,
    })
    .select('id')
    .single();

  if (pError) {
    return NextResponse.json({ error: pError.message }, { status: 500 });
  }

  // Adım 4b: Yankı'nın ilk mesajını conversations tablosuna yaz
  // Yeni kullanıcı chat'i açtığında boş ekran değil, kişiselleştirilmiş
  // karşılama mesajı görsün (CONTRACTS.md §3 onboarding complete akışı).
  await supabase.from('conversations').insert({
    user_id: user.id,
    role: 'yanki',
    message: firstMessage,
  });

  // Adım 6: onboarding_completed_at set et (kolon yoksa hatayı yut)
  try {
    const { error: uError } = await supabase
      .from('users')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', user.id);

    if (uError) {
      // Kolon henüz eklenmemiş olabilir, bu onboarding'i engellemez
      console.warn('[onboarding] onboarding_completed_at set edilemedi (kolon eksik?):', uError.message);
    }
  } catch (err) {
    console.warn('[onboarding] onboarding_completed_at update hatası (kolon eksik?):', err);
  }

  return NextResponse.json({
    profileId: profile.id,
    profileSummary: summaryText,
    firstMessage,
  });
}

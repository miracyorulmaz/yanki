import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const QUESTIONS_PER_DAY_MIN = 2;
const QUESTIONS_PER_DAY_MAX = 3;
const RECENT_DAYS = 3;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. Tüm active daily soruları getir
  const { data: allDailyQuestions, error: qError } = await supabase
    .from('questions')
    .select('id, text, question_type, tag, options, importance')
    .eq('category', 'daily')
    .eq('active', true);

  if (qError) {
    return NextResponse.json({ error: qError.message }, { status: 500 });
  }

  if (!allDailyQuestions || allDailyQuestions.length === 0) {
    return NextResponse.json({ questions: [] });
  }

  // 2. Son 3 günde bu kullanıcıya sorulan soruların ID'lerini bul
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - RECENT_DAYS);

  const { data: recentEntries, error: rError } = await supabase
    .from('entries')
    .select('question_id, created_at')
    .eq('user_id', user.id)
    .eq('source', 'daily')
    .gte('created_at', sinceDate.toISOString());

  if (rError) {
    return NextResponse.json({ error: rError.message }, { status: 500 });
  }

  const recentQuestionIds = new Set(recentEntries?.map((e) => e.question_id) ?? []);

  // 3. Bu soruların tag'lerini bul
  const recentTags = new Set<string>();
  for (const q of allDailyQuestions) {
    if (recentQuestionIds.has(q.id) && q.tag) {
      recentTags.add(q.tag);
    }
  }

  // 4. Dün high importance cevap var mı kontrol et
  const yesterdayStart = new Date();
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);

  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setHours(23, 59, 59, 999);

  const { data: yesterdayEntries } = await supabase
    .from('entries')
    .select('question_id')
    .eq('user_id', user.id)
    .eq('source', 'daily')
    .gte('created_at', yesterdayStart.toISOString())
    .lte('created_at', yesterdayEnd.toISOString());

  const yesterdayQuestionIds = new Set(yesterdayEntries?.map((e) => e.question_id) ?? []);

  // Dün high importance cevap verilen tag'leri bul
  const highImportanceTags = new Set<string>();
  for (const q of allDailyQuestions) {
    if (yesterdayQuestionIds.has(q.id) && q.importance === 'high' && q.tag) {
      highImportanceTags.add(q.tag);
    }
  }

  // 5. Bugün cevaplanmış soruları da hariç tut
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: todayEntries } = await supabase
    .from('entries')
    .select('question_id')
    .eq('user_id', user.id)
    .eq('source', 'daily')
    .gte('created_at', todayStart.toISOString());

  const todayAnsweredIds = new Set(todayEntries?.map((e) => e.question_id) ?? []);

  // 6. Filtrele: son 3 günde sorulan tag'leri hariç tut,
  //    AMA high importance tag'lerini hariç tutma
  //    AYRICA bugün zaten cevaplanmış soruları hariç tut
  const available = allDailyQuestions.filter((q) => {
    // Bugün cevaplanmış → hariç
    if (todayAnsweredIds.has(q.id)) return false;

    // High importance tag → dahil et (exclusion override)
    if (q.tag && highImportanceTags.has(q.tag)) return true;

    // Son 3 günde sorulan tag → hariç
    if (q.tag && recentTags.has(q.tag)) return false;

    return true;
  });

  // 7. Rastgele 2-3 soru seç
  const count = Math.min(
    available.length,
    Math.floor(Math.random() * (QUESTIONS_PER_DAY_MAX - QUESTIONS_PER_DAY_MIN + 1)) +
      QUESTIONS_PER_DAY_MIN,
  );

  const shuffled = [...available].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, count);

  // High importance tag'inden en az 1 soru varsa, ilk sıraya koy
  const highPrio = selected.filter((q) => q.tag && highImportanceTags.has(q.tag));
  const normal = selected.filter((q) => !q.tag || !highImportanceTags.has(q.tag));

  const ordered = [...highPrio.slice(0, 1), ...normal, ...highPrio.slice(1)].slice(0, count);

  return NextResponse.json({
    questions: ordered.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.question_type,
      options: q.options,
    })),
  });
}

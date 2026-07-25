import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { embedEntry } from '@/lib/ai/embed';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { questionId, answer } = body;

  if (!questionId || answer === undefined || answer === null || answer === '') {
    return NextResponse.json({ error: 'questionId ve answer zorunludur.' }, { status: 400 });
  }

  // Soru detaylarını getir
  const { data: question, error: qError } = await supabase
    .from('questions')
    .select('text, question_type')
    .eq('id', questionId)
    .single();

  if (qError || !question) {
    return NextResponse.json({ error: 'Soru bulunamadı.' }, { status: 404 });
  }

  // Cevabı entries'e kaydet
  const { data: entry, error } = await supabase
    .from('entries')
    .insert({
      user_id: user.id,
      question_id: questionId,
      source: 'daily',
      question: question.text,
      question_type: question.question_type,
      answer: answer.trim(),
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Embedding: arka planda, entry oluşturmayı bloklamaz
  embedEntry(supabase, entry.id, answer.trim()).catch((err) => {
    console.error('[embed] Unhandled embedding error:', err);
  });

  // moderationFlag: şimdilik her zaman null
  // Moderasyon pipeline'ı ayrı bir fazda eklenecek (CONTRACTS.md section 6)
  return NextResponse.json({
    entryId: entry.id,
    moderationFlag: null,
  });
}

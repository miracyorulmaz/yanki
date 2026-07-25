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
  const { questionId, question, questionType, answer } = body;

  if (!questionId || !question || !questionType || answer === undefined || answer === null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { data: entry, error } = await supabase
    .from('entries')
    .insert({
      user_id: user.id,
      question_id: questionId,
      source: 'onboarding',
      question,
      question_type: questionType,
      answer,
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Embedding: arka planda, entry oluşturmayı bloklamaz
  embedEntry(supabase, entry.id, answer).catch((err) => {
    console.error('[embed] Unhandled embedding error:', err);
  });

  return NextResponse.json({ entryId: entry.id });
}

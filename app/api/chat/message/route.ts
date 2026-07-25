import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateReply, type ChatResult } from '@/lib/ai/chat';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { message } = body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json({ error: 'message zorunludur.' }, { status: 400 });
  }

  // Son 10 konuşma geçmişini çek (context için)
  const { data: recentConversations } = await supabase
    .from('conversations')
    .select('role, message')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10);

  const recentHistory = (recentConversations ?? []).reverse().map((c) => ({
    role: c.role,
    message: c.message,
  }));

  // RAG pipeline → Claude API
  let result: ChatResult;
  try {
    result = await generateReply(supabase, user.id, message.trim(), recentHistory);
  } catch (err) {
    console.error('[chat] generateReply failed:', err);
    return NextResponse.json(
      { error: 'Yanıt üretilemedi. Lütfen tekrar deneyin.' },
      { status: 500 },
    );
  }

  // conversations tablosuna İKİ satır yaz: user + yanki
  const userMsgPromise = supabase.from('conversations').insert({
    user_id: user.id,
    role: 'user',
    message: message.trim(),
  });

  const yankiMsgPromise = supabase.from('conversations').insert({
    user_id: user.id,
    role: 'yanki',
    message: result.reply,
    used_profile_version: result.profileVersionId,
    used_insight_ids: result.insightIds.length > 0 ? result.insightIds : null,
    model: result.model,
    token_input: result.tokenInput,
    token_output: result.tokenOutput,
    latency_ms: result.latencyMs,
  });

  const [userResult, yankiResult] = await Promise.all([userMsgPromise, yankiMsgPromise]);

  if (userResult.error) {
    console.error('[chat] Failed to save user message:', userResult.error);
  }
  if (yankiResult.error) {
    console.error('[chat] Failed to save yanki message:', yankiResult.error);
  }

  return NextResponse.json({
    reply: result.reply,
    usedMemories: result.usedMemories,
  });
}

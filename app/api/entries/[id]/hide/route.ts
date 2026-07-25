import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * PATCH /api/entries/[id]/hide
 * Body: { hidden: boolean }
 * hidden=true  → anıyı gizler (RAG'e girmez, timeline'da üstü çizili)
 * hidden=false → gizlemeyi geri alır
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { hidden } = body;

  if (typeof hidden !== 'boolean') {
    return NextResponse.json({ error: '"hidden" (boolean) gerekli' }, { status: 400 });
  }

  // Sahiplik kontrolü: entry bu kullanıcıya ait olmalı
  const { data: entry } = await supabase
    .from('entries')
    .select('user_id')
    .eq('id', id)
    .single();

  if (!entry) {
    return NextResponse.json({ error: 'Anı bulunamadı' }, { status: 404 });
  }

  if (entry.user_id !== authData.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { error } = await supabase
    .from('entries')
    .update({ hidden_by_user: hidden })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id, hidden_by_user: hidden });
}

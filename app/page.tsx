'use client';

import { useEffect, useState } from 'react';
import { useSupabase } from '@/lib/supabase/use-client';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import Skeleton from '@/components/Skeleton';

interface Stats {
  entryCount: number;
  insightCount: number;
  dimensionCount: number;
}

interface InsightCard {
  insight_text: string;
  category: string;
  confidence: number;
  created_at: string;
}

interface DailyQuestion {
  id: string;
  text: string;
  type: string;
  options: { choices?: string[] } | null;
}

export default function HomePage() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({ entryCount: 0, insightCount: 0, dimensionCount: 0 });
  const [latestInsight, setLatestInsight] = useState<InsightCard | null>(null);
  const [question, setQuestion] = useState<DailyQuestion | null>(null);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const supabase = useSupabase();
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const { data: authData } = await supabase.auth.getUser();
      const currentUser = authData?.user ?? null;
      setUser(currentUser);
      if (!currentUser) { setLoading(false); return; }

      // Check onboarding
      const { data: profile } = await supabase
        .from('users').select('onboarding_completed_at').eq('id', currentUser.id).single();
      if (!profile?.onboarding_completed_at) { router.push('/onboarding'); return; }

      // Stats
      const { count: ec } = await supabase.from('entries').select('id', { count: 'exact', head: true }).eq('user_id', currentUser.id);
      const { count: ic } = await supabase.from('insights').select('id', { count: 'exact', head: true }).eq('user_id', currentUser.id);

      // Dimension count
      const { data: qIds } = await supabase.from('entries').select('question_id').eq('user_id', currentUser.id).not('question_id', 'is', null).limit(100);
      const uniqueQIds = [...new Set((qIds ?? []).map((e: any) => e.question_id))];
      let dc = 0;
      if (uniqueQIds.length > 0) {
        const { data: qs } = await supabase.from('questions').select('dimensions').in('id', uniqueQIds);
        const dims = new Set<string>();
        for (const q of qs ?? []) {
          for (const d of (q.dimensions as string[]) ?? []) dims.add(d);
        }
        dc = dims.size;
      }
      setStats({ entryCount: ec ?? 0, insightCount: ic ?? 0, dimensionCount: dc });

      // Latest insight
      const { data: ins } = await supabase.from('insights').select('insight_text, category, confidence, created_at').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (ins) setLatestInsight(ins as InsightCard);

      // Daily question
      try {
        const res = await fetch('/api/daily-questions/today');
        if (res.ok) {
          const d = await res.json();
          if (d.questions?.length > 0) setQuestion(d.questions[0] as DailyQuestion);
        }
      } catch { /* ignore */ }

      setLoading(false);
    }
    init();
  }, [supabase, router]);

  const handleSubmit = async () => {
    if (!question || !answer.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch('/api/daily-questions/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: question.id, answer: answer.trim() }),
      });
      if (!res.ok) { setError('Bir şeyler ters gitti, tekrar dener misin?'); setSubmitting(false); return; }
      setSaved(true);
      setAnswer('');
      setTimeout(() => setSaved(false), 3000);
    } catch { setError('Bağlantı hatası.'); }
    setSubmitting(false);
  };

  if (user === undefined || loading) return <Skeleton variant="question" />;
  if (!user) { router.push('/login'); return null; }

  const today = new Date();
  const dateStr = today.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  const greeting = today.getHours() < 12 ? 'Günaydın' : today.getHours() < 18 ? 'İyi günler' : 'İyi akşamlar';
  const displayName = user.user_metadata?.display_name ?? user.email?.split('@')[0] ?? '';

  const choices = question?.options ? getChoices(question.options) : [];

  return (
    <div className="panel mx-auto max-w-[760px] animate-[fade-in_0.4s_var(--ease)]">
      {/* Header */}
      <div className="today-header mb-6">
        <p className="text-[13px]" style={{ color: 'var(--muted)' }}>{dateStr}</p>
        <h1 className="font-display text-[27px] font-medium">{greeting}, {displayName}</h1>
        <p className="text-[15px]" style={{ color: 'var(--muted)' }}>Bugün aklından neler geçiyor?</p>
      </div>

      {/* Daily Question Card */}
      {question && (
        <div className="card mb-5" style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-l)', padding: 26,
        }}>
          <p className="mb-2.5 text-[13px] tracking-[0.02em]" style={{ color: 'var(--secondary)' }}>GÜNLÜK SORU</p>
          <h2 className="font-display text-[20px] font-medium leading-[1.45] mb-[18px]">{question.text}</h2>

          {question.type === 'multiple_choice' && choices.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {choices.map((c) => (
                <button key={c} onClick={() => setAnswer(c)} className={`rounded-[999px] px-5 py-2.5 text-left text-[14px] font-medium transition-all ${answer === c ? 'bg-[var(--primary)] text-[#12121a]' : 'border border-[var(--border)] bg-transparent text-[var(--muted)] hover:text-[var(--text)]'}`}>
                  {c}
                </button>
              ))}
            </div>
          )}

          {question.type === 'scaled' && (
            <div className="flex justify-between gap-2">
              {[1,2,3,4,5].map((n) => (
                <button key={n} onClick={() => setAnswer(String(n))} className={`flex h-11 w-11 items-center justify-center rounded-[999px] text-[14px] font-medium transition-all ${answer === String(n) ? 'bg-[var(--primary)] text-[#12121a]' : 'border border-[var(--border)] bg-transparent text-[var(--muted)] hover:text-[var(--text)]'}`}>
                  {n}
                </button>
              ))}
            </div>
          )}

          {(question.type === 'open_text' || !question.type) && (
            <textarea
              value={answer} onChange={(e) => setAnswer(e.target.value)}
              className="journal w-full min-h-[120px] resize-none rounded-[var(--radius-m)] border border-[var(--border)] bg-[var(--surface-light)] px-[18px] py-4 text-[14.5px] leading-relaxed text-[var(--text)] transition-colors placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:bg-[rgba(139,124,255,0.05)] focus:outline-none"
              placeholder="Cevabını yaz..."
            />
          )}

          <div className="mt-4 flex flex-wrap gap-2.5">
            <button onClick={handleSubmit} disabled={submitting || !answer.trim()}
              className="btn btn-primary inline-flex items-center gap-2 rounded-[999px] bg-[var(--primary)] px-5 py-2.5 text-[14px] font-medium text-[#12121a] transition-all hover:bg-[#9a8dff] active:scale-[0.97] disabled:opacity-45">
              {submitting ? (
                <><span className="spinner h-3.5 w-3.5 animate-spin rounded-full border-2 border-[rgba(0,0,0,0.25)] border-t-[rgba(0,0,0,0.65)]" /> Cevaplanıyor...</>
              ) : 'Cevapla'}
            </button>
            <button onClick={() => router.push('/daily')}
              className="btn btn-ghost rounded-[999px] border border-[var(--border)] bg-transparent px-5 py-2.5 text-[14px] font-medium text-[var(--muted)] transition-all hover:text-[var(--text)]">
              Tüm sorular
            </button>
          </div>

          {error && <p className="mt-3 text-[13px]" style={{ color: 'var(--danger)' }}>{error}</p>}
          {saved && (
            <div className="mt-3.5 flex items-center gap-2.5 text-[14px] text-[var(--secondary)] opacity-100">
              <span className="ripple relative h-4 w-4">
                <span className="absolute inset-0 rounded-full border-[1.4px] border-[var(--secondary)] animate-[ripple_1.1s_var(--ease)]" />
              </span>
              Kaydedildi
            </div>
          )}
        </div>
      )}

      {/* Yankı'nın fark ettiği + Yolculuğun */}
      <div className="info-grid grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-[16px] my-[26px]">
        <div className="card col-span-1 md:col-span-2" style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-l)', padding: 26,
        }}>
          <h3 className="mb-3 text-[12.5px] font-semibold uppercase tracking-[0.04em]" style={{ color: 'var(--muted)' }}>
            Yankı&apos;nın fark ettiği
          </h3>
          {latestInsight ? (
            <div>
              <p className="text-[14.5px] leading-relaxed">{latestInsight.insight_text}</p>
              <p className="meta mt-3 text-[12.5px]" style={{ color: 'var(--muted)' }}>
                {latestInsight.category} · güven: {Math.round((latestInsight.confidence ?? 0) * 100)}%
              </p>
            </div>
          ) : (
            <p className="text-[14.5px]" style={{ color: 'var(--muted)' }}>
              Henüz yeterli veri yok. Daha fazla soru cevapladıkça Yankı seni daha iyi tanıyacak.
            </p>
          )}
        </div>

        <div className="card" style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-l)', padding: 26,
        }}>
          <h3 className="mb-3 text-[12.5px] font-semibold uppercase tracking-[0.04em]" style={{ color: 'var(--muted)' }}>
            Yolculuğun
          </h3>
          <div className="flex flex-col gap-[18px]">
            <div>
              <strong className="block font-display text-[22px] font-medium">{stats.entryCount}</strong>
              <span className="text-[12px]" style={{ color: 'var(--muted)' }}>anı</span>
            </div>
            <div>
              <strong className="block font-display text-[22px] font-medium">{stats.insightCount}</strong>
              <span className="text-[12px]" style={{ color: 'var(--muted)' }}>içgörü</span>
            </div>
            <div>
              <strong className="block font-display text-[22px] font-medium">{stats.dimensionCount}</strong>
              <span className="text-[12px]" style={{ color: 'var(--muted)' }}>farklı boyut</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getChoices(options: { choices?: string[] } | null): string[] {
  if (!options) return [];
  if (Array.isArray(options)) return options;
  if (typeof options === 'object' && 'choices' in options) return (options as { choices: string[] }).choices ?? [];
  return [];
}

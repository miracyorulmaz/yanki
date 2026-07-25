'use client';

import { useEffect, useState } from 'react';
import { useSupabase } from '@/lib/supabase/use-client';
import { useRouter } from 'next/navigation';
import Skeleton from '@/components/Skeleton';

interface Insight {
  id: string;
  insight_text: string;
  category: string;
  confidence: number;
  based_on_period_start: string;
  based_on_period_end: string;
  created_at: string;
  source_entry_ids: string[] | null;
}

interface EvidenceEntry {
  id: string;
  question: string;
  answer: string;
  created_at: string;
}

export default function InsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [evidence, setEvidence] = useState<Record<string, EvidenceEntry[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const supabase = useSupabase();
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('users').select('onboarding_completed_at').eq('id', user.id).single();
      if (!profile?.onboarding_completed_at) { router.push('/onboarding'); return; }

      const { data: all } = await supabase.from('insights').select('*').eq('user_id', user.id).order('created_at', { ascending: false });

      setInsights((all ?? []) as Insight[]);
      setLoading(false);
    }
    init();
  }, [supabase, router]);

  const loadEvidence = async (insight: Insight) => {
    if (evidence[insight.id]) return;
    const ids = insight.source_entry_ids;
    if (!ids || ids.length === 0) {
      setEvidence((prev) => ({ ...prev, [insight.id]: [] }));
      return;
    }
    const { data } = await supabase.from('entries').select('id, question, answer, created_at').in('id', ids);
    setEvidence((prev) => ({ ...prev, [insight.id]: (data ?? []) as EvidenceEntry[] }));
  };

  const toggleEvidence = (insight: Insight) => {
    if (expandedId === insight.id) { setExpandedId(null); return; }
    setExpandedId(insight.id);
    if (!evidence[insight.id]) loadEvidence(insight);
  };

  if (loading) return <Skeleton variant="question" />;

  return (
    <div className="panel mx-auto max-w-[760px] animate-[fade-in_0.4s_var(--ease)]">
      <div className="page-head mb-6">
        <div>
          <h1 className="font-display text-[23px] font-medium md:text-[28px]">İçgörüler</h1>
          <p className="insight-summary mt-1.5 text-[14.5px] max-w-[480px]" style={{ color: 'var(--muted)' }}>
            Yankı&apos;nın zaman içinde senin hakkında fark ettiği örüntüler ve değişimler.
          </p>
        </div>
      </div>

      {insights.length === 0 ? (
        <div className="empty-state py-[34px] text-center text-[14px]" style={{ color: 'var(--muted)' }}>
          Henüz içgörü yok. Düzenli olarak günlük soruları cevapladıkça Yankı örüntüleri fark etmeye başlayacak.
        </div>
      ) : (
        <div className="insight-list flex flex-col gap-4">
          {insights.map((insight) => (
            <div key={insight.id} className="card" style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-l)', padding: 26,
            }}>
              <span className="block mb-1.5 text-[12px]" style={{ color: 'var(--muted)' }}>
                {new Date(insight.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="font-display text-[17px] font-medium">{insight.insight_text.slice(0, 80)}</h2>
                <span className="confidence-tag flex-shrink-0 rounded-[999px] border border-[var(--border)] px-2.5 py-1 text-[11.5px] text-[var(--muted)] ml-3">
                  %{Math.round((insight.confidence ?? 0) * 100)}
                </span>
              </div>
              <div className="insight-body">
                <p className="text-[14.5px] leading-relaxed">{insight.insight_text}</p>
              </div>
              <div className="insight-footer mt-3.5 flex items-center justify-between gap-3">
                <span className="basis text-[12.5px]" style={{ color: 'var(--muted)' }}>
                  {insight.based_on_period_start
                    ? `${new Date(insight.based_on_period_start).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} - ${new Date(insight.based_on_period_end).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}`
                    : ''}
                  {insight.category ? ` · ${insight.category}` : ''}
                </span>
                {(insight.source_entry_ids?.length ?? 0) > 0 && (
                  <button onClick={() => toggleEvidence(insight)}
                    className="evidence-toggle flex-shrink-0 inline-flex items-center gap-1.5 text-[13px] text-[var(--primary)]">
                    <svg className={`h-3 w-3 stroke-current transition-transform ${expandedId === insight.id ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" strokeWidth={1.6}>
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                    Dayanak
                  </button>
                )}
              </div>

              {/* Evidence panel */}
              {expandedId === insight.id && (
                <div className="evidence-panel mt-3.5">
                  <div className="border-t border-[var(--border)] pt-3 flex flex-col gap-2.5">
                    {evidence[insight.id]?.length ? (
                      evidence[insight.id].map((e) => (
                        <div key={e.id} className="evidence-quote text-[13.5px] text-[var(--muted)] pl-3 border-l-2 border-[var(--border)] leading-relaxed">
                          <strong className="text-[var(--text)]">{e.question.slice(0, 60)}</strong>
                          <br />{e.answer.slice(0, 120)}
                        </div>
                      ))
                    ) : (
                      <p className="text-[13px] text-[var(--muted)]">Dayanak verileri henüz yok.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

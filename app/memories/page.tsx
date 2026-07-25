'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSupabase } from '@/lib/supabase/use-client';
import { useRouter } from 'next/navigation';
import Skeleton from '@/components/Skeleton';

interface Entry {
  id: string;
  question: string;
  answer: string;
  question_type: string;
  source: string;
  created_at: string;
  hidden_by_user: boolean;
  dimensions?: string[];
}

interface FilterChip {
  label: string;
  value: string;
}

export default function MemoriesPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDim, setFilterDim] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<FilterChip[]>([]);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [fading, setFading] = useState<Set<string>>(new Set());
  const supabase = useSupabase();
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('users').select('onboarding_completed_at').eq('id', user.id).single();
      if (!profile?.onboarding_completed_at) { router.push('/onboarding'); return; }

      // Tüm entry'leri çek
      const { data: all } = await supabase.from('entries').select('id, question, answer, question_type, source, created_at, hidden_by_user, question_id').eq('user_id', user.id).not('hidden_by_user', 'is', null).order('created_at', { ascending: false }).limit(200);

      // Dimension bilgilerini çek
      const qIds = [...new Set((all ?? []).map((e: any) => e.question_id).filter(Boolean))];
      const dimMap: Record<string, string[]> = {};
      if (qIds.length > 0) {
        const { data: qs } = await supabase.from('questions').select('id, dimensions').in('id', qIds);
        for (const q of qs ?? []) { dimMap[(q as any).id] = (q as any).dimensions ?? []; }
      }

      const merged: Entry[] = (all ?? []).map((e: any) => ({
        id: e.id, question: e.question, answer: e.answer,
        question_type: e.question_type, source: e.source,
        created_at: e.created_at, hidden_by_user: e.hidden_by_user ?? false,
        dimensions: dimMap[e.question_id] ?? [],
      }));

      // Unique dimensions for filters
      const dimSet = new Set<string>();
      for (const e of merged) for (const d of e.dimensions ?? []) dimSet.add(d);
      setDimensions([...dimSet].sort().map((d) => ({ label: formatDim(d), value: d })));

      setEntries(merged);
      setLoading(false);
    }
    init();
  }, [supabase, router]);

  const toggleHidden = useCallback(async (entry: Entry) => {
    setFading((prev) => new Set(prev).add(entry.id));
    const newVal = !entry.hidden_by_user;
    try {
      const res = await fetch(`/api/entries/${entry.id}/hide`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: newVal }),
      });
      if (!res.ok) return;
      setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, hidden_by_user: newVal } : e));
    } catch { /* ignore */ }
    setFading((prev) => { const n = new Set(prev); n.delete(entry.id); return n; });
    setOpenMenu(null);
  }, []);

  const filtered = entries.filter((e) => {
    if (search) {
      const q = search.toLowerCase();
      if (!e.question.toLowerCase().includes(q) && !e.answer.toLowerCase().includes(q)) return false;
    }
    if (filterDim && (!e.dimensions || !e.dimensions.includes(filterDim))) return false;
    return true;
  });

  if (loading) return <Skeleton variant="question" />;

  return (
    <div className="panel mx-auto max-w-[760px] animate-[fade-in_0.4s_var(--ease)]">
      <div className="page-head mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
        <div>
          <h1 className="font-display text-[23px] font-medium md:text-[28px]">Hafızam</h1>
          <p className="mt-1.5 text-[14.5px] max-w-[480px]" style={{ color: 'var(--muted)' }}>
            Tüm cevapların, zaman çizelgesinde.
          </p>
        </div>
        <input
          type="search"
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Anı ara..."
          className="search-input w-full sm:w-auto sm:flex-1 rounded-[999px] border border-[var(--border)] bg-[var(--surface-light)] px-4 py-2.5 text-[13.5px] text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:outline-none"
        />
      </div>

      {/* Dimension filters */}
      {dimensions.length > 0 && (
        <div className="filter-row mb-7 flex flex-wrap gap-2">
          <button onClick={() => setFilterDim(null)}
            className={`filter-chip rounded-[999px] px-[15px] py-2 text-[13px] border transition-all ${!filterDim ? 'bg-[var(--primary-soft)] text-[var(--text)] border-transparent' : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'}`}
          >Tümü</button>
          {dimensions.map((d) => (
            <button key={d.value} onClick={() => setFilterDim(d.value)}
              className={`filter-chip rounded-[999px] px-[15px] py-2 text-[13px] border transition-all ${filterDim === d.value ? 'bg-[var(--primary-soft)] text-[var(--text)] border-transparent' : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'}`}
            >{d.label}</button>
          ))}
        </div>
      )}

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="empty-state py-[34px] text-center text-[14px]" style={{ color: 'var(--muted)' }}>
          {search || filterDim ? 'Filtreye uyan anı bulunamadı.' : 'Henüz hiç anı yok. Onboarding\'i tamamla veya günlük soruları cevapla.'}
        </div>
      ) : (
        <div className="timeline relative pl-[22px]">
          <div className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-[var(--border)]" />
          {filtered.map((entry) => (
            <div key={entry.id} className={`timeline-item relative pb-[26px] ${fading.has(entry.id) ? 'opacity-0' : ''}`}>
              <div className="absolute left-[-22px] top-1.5 h-2 w-2 rounded-full bg-[var(--primary)] shadow-[0_0_0_4px_var(--background)]" />
              <div className="memory-card rounded-[var(--radius-m)] border border-[var(--border)] bg-[var(--surface)] p-[18px_20px]">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="text-[12px]" style={{ color: 'var(--muted)' }}>
                      {new Date(entry.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      <span className="ml-3 text-[11px] uppercase">{entry.source}</span>
                      {entry.hidden_by_user && <span className="ml-3 text-[11px] text-[var(--danger)]">Gizli</span>}
                    </p>
                  </div>
                  <div className="dropdown relative">
                    <button onClick={() => setOpenMenu(openMenu === entry.id ? null : entry.id)}
                      className="kebab flex h-[26px] w-[26px] items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text)]">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
                        <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
                      </svg>
                    </button>
                    {openMenu === entry.id && (
                      <div className="dropdown-menu absolute right-0 top-8 z-30 flex min-w-[190px] flex-col gap-0 rounded-[var(--radius-s)] border border-[var(--border)] bg-[var(--surface-light)] p-1.5 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                        <button onClick={() => toggleHidden(entry)}
                          className={`rounded-[7px] px-3 py-2 text-left text-[13.5px] w-full hover:bg-[rgba(255,255,255,0.05)] ${entry.hidden_by_user ? 'text-[var(--text)]' : 'text-[var(--danger)]'}`}>
                          {entry.hidden_by_user ? 'Geri al' : 'Gizle'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-[14px] leading-relaxed my-2">{entry.question}</p>
                <p className={`text-[14.5px] leading-relaxed ${entry.hidden_by_user ? 'line-through opacity-50' : ''}`}>
                  {entry.answer}
                </p>
                {entry.dimensions && entry.dimensions.length > 0 && (
                  <p className="mt-2.5 text-[12px]" style={{ color: 'var(--secondary)' }}>
                    {entry.dimensions.map(formatDim).join(' · ')}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDim(d: string): string {
  const map: Record<string, string> = {
    identity: 'Kimlik', attachment: 'Bağlanma', self_perception: 'Öz-algı',
    values: 'Değerler', purpose: 'Amaç', decision_making: 'Karar',
    ethics: 'Etik', behavior: 'Davranış', loyalty: 'Sadakat',
    conflict_style: 'Çatışma', risk_tolerance: 'Risk',
    motivation: 'Motivasyon', fears: 'Korkular', coping_style: 'Başa çıkma',
    communication_tone: 'İletişim', openness: 'Açıklık', regrets: 'Pişmanlık',
    current_state: 'Şu an', relationships: 'İlişkiler', career: 'Kariyer',
    family: 'Aile', stress: 'Stres', happiness: 'Mutluluk',
    current_events: 'Gündem', achievement: 'Başarı', wellbeing: 'İyi oluş',
    curiosity: 'Merak', gratitude: 'Minnettarlık', future_orientation: 'Gelecek',
  };
  return map[d] ?? d;
}

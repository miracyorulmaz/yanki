'use client';

import { useEffect, useState, useRef } from 'react';
import { useSupabase } from '@/lib/supabase/use-client';
import { useRouter } from 'next/navigation';
import Skeleton from '@/components/Skeleton';

interface Message {
  role: 'user' | 'yanki';
  content: string;
  usedMemories?: { entryId: string; question: string; answer: string }[];
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const supabase = useSupabase();
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function init() {
      const { data: authData } = await supabase.auth.getUser();
      const currentUser = authData?.user ?? null;
      if (!currentUser) { router.push('/login'); return; }

      const { data: hasProfile } = await supabase.from('personality_profiles').select('id').eq('user_id', currentUser.id).maybeSingle();
      if (!hasProfile) { router.push('/onboarding'); return; }

      const { data: history } = await supabase.from('conversations').select('role, message').eq('user_id', currentUser.id).order('created_at', { ascending: true }).limit(50);

      if (history) setMessages(history.map((h: any) => ({ role: h.role, content: h.message })));
      setLoading(false);
    }
    init();
  }, [supabase, router]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setError('');
    setSending(true);
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');

    try {
      const res = await fetch('/api/chat/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) });
      const data = await res.json();
      if (!res.ok) { setError('Bir şeyler ters gitti, tekrar dener misin?'); setSending(false); return; }

      // Fetch usedMemories entry texts
      const memoryIds: string[] = data.usedMemories ?? [];
      let memoryEntries: { entryId: string; question: string; answer: string }[] = [];
      if (memoryIds.length > 0) {
        const { data: mems } = await supabase.from('entries').select('id, question, answer').in('id', memoryIds);
        memoryEntries = (mems ?? []).map((m: any) => ({ entryId: m.id, question: m.question, answer: m.answer }));
      }

      setMessages((prev) => [...prev, { role: 'yanki', content: data.reply, usedMemories: memoryEntries }]);
    } catch { setError('Bağlantı hatası. Lütfen tekrar deneyin.'); }
    setSending(false);
  };

  if (loading) return <Skeleton variant="chat" />;

  return (
    <div className="chat-panel mx-auto flex max-w-[720px] flex-col" style={{ height: 'calc(100vh - 140px)' }}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-[23px] font-medium md:text-[28px]">Sohbet</h1>
      </div>

      {/* Messages */}
      <div className="chat-scroll flex-1 overflow-y-auto px-0.5 pb-4 flex flex-col gap-[18px]">
        {messages.length === 0 && !sending && (
          <p className="py-12 text-center text-[14px]" style={{ color: 'var(--muted)' }}>
            Yankı&apos;na bir şey sor. Geçmiş cevaplarından hatırlayarak sana özel yanıt verecek.
          </p>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`msg animate-[fade-in_0.35s_var(--ease)] ${msg.role === 'user' ? 'self-end' : 'self-start'}`} style={{ maxWidth: '82%' }}>
            {msg.role === 'user' ? (
              <div className="rounded-[16px_16px_4px_16px] bg-[var(--primary-soft)] px-4 py-3 text-[14.5px] whitespace-pre-wrap break-words">
                {msg.content}
              </div>
            ) : (
              <div>
                <div className="bubble rounded-[16px_16px_16px_4px] border border-[var(--border)] bg-[var(--surface)] px-[18px] py-3.5 text-[14.5px] leading-[1.65]">
                  {msg.content.split('\n').map((p, j) => <p key={j} className={j > 0 ? 'mt-2.5' : ''}>{p}</p>)}
                </div>

                {/* Memory toggle */}
                {msg.usedMemories && msg.usedMemories.length > 0 && (
                  <div>
                    <button
                      onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                      className="memory-toggle mt-2 inline-flex items-center gap-1.5 rounded-[999px] border border-[var(--border)] px-2.5 py-1.5 text-[12.5px] text-[var(--muted)] transition-colors hover:text-[var(--text)]"
                    >
                      <svg className={`h-3 w-3 stroke-current transition-transform ${expandedIdx === i ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" strokeWidth={1.6}>
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                      {msg.usedMemories.length} anı hatırladı
                    </button>
                    {expandedIdx === i && (
                      <div className="memory-panel mt-2.5">
                        <div className="rounded-[var(--radius-m)] border border-[var(--border)] bg-[var(--surface-light)] p-4 text-[13.5px]">
                          {msg.usedMemories.map((m, j) => (
                            <div key={m.entryId} className={`py-2 ${j < msg.usedMemories!.length - 1 ? 'border-b border-[var(--border)]' : ''}`}>
                              <p className="leading-relaxed text-[var(--text)]">{m.answer}</p>
                              <p className="mt-1 text-[12px] text-[var(--muted)]">{m.question.slice(0, 60)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Typing indicator */}
        {sending && (
          <div className="msg self-start">
            <div className="bubble rounded-[16px_16px_16px_4px] border border-[var(--border)] bg-[var(--surface)] px-[18px] py-3.5 flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--muted)] animate-[typing_1.2s_infinite_ease-in-out]" />
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--muted)] animate-[typing_1.2s_infinite_ease-in-out]" style={{ animationDelay: '0.15s' }} />
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--muted)] animate-[typing_1.2s_infinite_ease-in-out]" style={{ animationDelay: '0.3s' }} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="mx-auto mb-1 max-w-[720px] rounded-lg bg-[var(--primary-soft)] px-3 py-2 text-center text-[13px] text-[var(--danger)]">
          {error}
        </p>
      )}

      {/* Input */}
      <div className="border-t border-[var(--border)] pt-4 mt-2">
        <form onSubmit={handleSend} className="flex items-end gap-2.5">
          <textarea
            value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="Yankı'na bir şey sor..."
            disabled={sending}
            rows={1}
            className="flex-1 resize-none rounded-[22px] border border-[var(--border)] bg-[var(--surface-light)] px-[18px] py-3 text-[14.5px] text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:outline-none max-h-[140px]"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
          />
          <button type="submit" disabled={sending || !input.trim()}
            className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[#12121a] transition-colors hover:bg-[#9a8dff] active:scale-[0.94] disabled:opacity-50">
            <svg className="h-[17px] w-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </form>
      </div>

      <style jsx>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes typing { 0%, 60%, 100% { opacity: 0.3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }
      `}</style>
    </div>
  );
}

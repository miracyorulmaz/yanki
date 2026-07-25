'use client';

import { useEffect, useState } from 'react';
import { useSupabase } from '@/lib/supabase/use-client';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const supabase = useSupabase();
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) { router.push('/login'); return; }
      setEmail(user.email ?? '');
      setDisplayName((user.user_metadata?.display_name as string) ?? '');
      setLoading(false);
    }
    init();
  }, [supabase, router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  if (loading) {
    return (
      <div className="panel mx-auto max-w-[760px]">
        <p className="text-[14px]" style={{ color: 'var(--muted)' }}>Yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="panel mx-auto max-w-[760px] animate-[fade-in_0.4s_var(--ease)]">
      <div className="page-head mb-6">
        <div>
          <h1 className="font-display text-[23px] font-medium md:text-[28px]">Ayarlar</h1>
          <p className="mt-1.5 text-[14.5px] max-w-[480px]" style={{ color: 'var(--muted)' }}>
            Hesap bilgilerin ve tercihlerin.
          </p>
        </div>
      </div>

      {/* Profil */}
      <div className="settings-group mb-[30px]">
        <h3 className="mb-2.5 text-[12.5px] font-semibold uppercase tracking-[0.04em]" style={{ color: 'var(--muted)' }}>
          Profil
        </h3>
        <div className="settings-list rounded-[var(--radius-m)] border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          <div className="settings-row flex items-center justify-between px-5 py-[15px] border-b border-[var(--border)] text-[14.5px]">
            <div className="row-main flex flex-col gap-0.5">
              <span className="text-[var(--text)]">{displayName || '—'}</span>
              <span className="text-[12.5px]" style={{ color: 'var(--muted)' }}>Adın</span>
            </div>
          </div>
          <div className="settings-row flex items-center justify-between px-5 py-[15px] text-[14.5px]">
            <div className="row-main flex flex-col gap-0.5">
              <span className="text-[var(--text)]">{email}</span>
              <span className="text-[12.5px]" style={{ color: 'var(--muted)' }}>Email</span>
            </div>
          </div>
        </div>
      </div>

      {/* Veri */}
      <div className="settings-group mb-[30px]">
        <h3 className="mb-2.5 text-[12.5px] font-semibold uppercase tracking-[0.04em]" style={{ color: 'var(--muted)' }}>
          Veri
        </h3>
        <div className="settings-list rounded-[var(--radius-m)] border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          <button
            className="settings-row flex w-full items-center justify-between px-5 py-[15px] border-b border-[var(--border)] text-left text-[14.5px] text-[var(--text)] hover:bg-[rgba(255,255,255,0.02)] transition-colors"
            disabled
          >
            <div className="row-main flex flex-col gap-0.5">
              <span>Verini dışa aktar</span>
              <span className="text-[12.5px]" style={{ color: 'var(--muted)' }}>
                CONTRACTS.md — GET /api/account/export (Yakında)
              </span>
            </div>
            <span className="chevron flex-shrink-0 flex text-[var(--muted)]">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </span>
          </button>
          <button
            className="settings-row flex w-full items-center justify-between px-5 py-[15px] border-b border-[var(--border)] text-left text-[14.5px] text-[var(--text)] hover:bg-[rgba(255,255,255,0.02)] transition-colors"
            disabled
          >
            <div className="row-main flex flex-col gap-0.5">
              <span>Ölüm sonrası erişim izinleri</span>
              <span className="text-[12.5px]" style={{ color: 'var(--muted)' }}>
                yanki_access_grants — V3 (Yakında)
              </span>
            </div>
            <span className="chevron flex-shrink-0 flex text-[var(--muted)]">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </span>
          </button>
        </div>
      </div>

      {/* Hesap */}
      <div className="settings-group mb-[30px]">
        <h3 className="mb-2.5 text-[12.5px] font-semibold uppercase tracking-[0.04em]" style={{ color: 'var(--muted)' }}>
          Hesap
        </h3>
        <div className="settings-list rounded-[var(--radius-m)] border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          <button
            onClick={handleLogout}
            className="settings-row danger-row flex w-full items-center justify-between px-5 py-[15px] text-left text-[14.5px] text-[var(--danger)] hover:bg-[rgba(255,255,255,0.02)] transition-colors"
          >
            Çıkış yap
            <span className="chevron flex-shrink-0 flex text-[var(--muted)]">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </span>
          </button>
          <button
            className="settings-row danger-row flex w-full items-center justify-between px-5 py-[15px] text-left text-[14.5px] text-[var(--danger)] hover:bg-[rgba(255,255,255,0.02)] transition-colors"
            disabled
          >
            Hesabımı sil
            <span className="text-[12px]" style={{ color: 'var(--muted)' }}>Yakında</span>
          </button>
        </div>
      </div>

      <p className="future-note mt-5 text-center text-[12px] opacity-70" style={{ color: 'var(--muted)' }}>
        Yankı v0.1 · KVKK kapsamında verilerin korunur.
      </p>
    </div>
  );
}

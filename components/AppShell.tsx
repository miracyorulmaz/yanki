'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase/use-client';

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'bugun',
    label: 'Bugün',
    href: '/',
    icon: (
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] stroke-current fill-none" strokeWidth={1.6}>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2v2.4M12 19.6V22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2 12h2.4M19.6 12H22M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" />
      </svg>
    ),
  },
  {
    id: 'sohbet',
    label: 'Sohbet',
    href: '/chat',
    icon: (
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] stroke-current fill-none" strokeWidth={1.6}>
        <path d="M4 5h16v11H8l-4 4V5z" />
      </svg>
    ),
  },
  {
    id: 'hafizam',
    label: 'Hafızam',
    href: '/memories',
    icon: (
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] stroke-current fill-none" strokeWidth={1.6}>
        <path d="M4 4h11l5 5v11H4V4z" />
        <path d="M15 4v5h5" />
      </svg>
    ),
  },
  {
    id: 'icgoruler',
    label: 'İçgörüler',
    href: '/insights',
    icon: (
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] stroke-current fill-none" strokeWidth={1.6}>
        <path d="M12 3a6 6 0 0 0-3.4 10.9c.5.4.9 1 .9 1.7v.9h5v-.9c0-.7.4-1.3.9-1.7A6 6 0 0 0 12 3z" />
        <path d="M9.5 19.5h5M10.5 22h3" />
      </svg>
    ),
  },
  {
    id: 'ayarlar',
    label: 'Ayarlar',
    href: '/settings',
    icon: (
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] stroke-current fill-none" strokeWidth={1.6}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useSupabase();
  const [userName, setUserName] = useState('');
  const [userInitial, setUserInitial] = useState('?');

  // Auth-only pages: login, register — no shell
  const isAuthPage = pathname === '/login' || pathname === '/register';
  // Onboarding: no sidebar/mobile-nav, just full-screen flow
  const isOnboarding = pathname === '/onboarding';

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const name =
          (user.user_metadata?.display_name as string) ||
          user.email?.split('@')[0] ||
          '';
        setUserName(name || 'Kullanıcı');
        setUserInitial((name || 'K')[0].toUpperCase());
      }
    }
    load();
  }, [supabase]);

  // No shell for auth/onboarding pages
  if (isAuthPage || isOnboarding) {
    return <>{children}</>;
  }

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <>
      {/* Ambient background */}
      <div className="ambient-bg" aria-hidden="true">
        <span />
        <span />
      </div>

      <div className="app relative z-[1] flex min-h-screen">
        {/* ============ DESKTOP SIDEBAR ============ */}
        <aside className="hidden w-[250px] flex-shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] p-7 pt-7 md:flex sticky top-0 h-screen">
          {/* Wordmark */}
          <div className="mb-8 flex flex-col gap-2.5 px-1">
            <div className="flex items-center gap-2.5">
              <svg
                className="wordmark-mark"
                width="26"
                height="20"
                viewBox="0 0 26 20"
                aria-hidden="true"
              >
                <path
                  className="wave-1"
                  d="M1 12 C 4 6, 8 6, 11 12 S 18 18, 21 12"
                  stroke="var(--primary)"
                  strokeWidth="1.6"
                  fill="none"
                  strokeLinecap="round"
                />
                <path
                  className="wave-2"
                  d="M1 16 C 4 12, 8 12, 11 16 S 18 20, 21 16"
                  stroke="var(--secondary)"
                  strokeWidth="1.6"
                  fill="none"
                  strokeLinecap="round"
                  opacity="0.8"
                />
              </svg>
              <span className="font-display text-[21px] font-medium tracking-[0.06em]">
                YANKI
              </span>
            </div>
            <p className="max-w-[190px] text-[12.5px] leading-relaxed text-[var(--muted)]">
              Kendini zaman içinde duymanın bir yolu.
            </p>
          </div>

          {/* Nav */}
          <nav className="flex-1">
            <ul className="flex flex-col gap-0.5">
              {NAV_ITEMS.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => router.push(item.href)}
                    className={`flex w-full items-center gap-3 rounded-[var(--radius-s)] px-3 py-2.5 text-[14.5px] transition-colors duration-[0.25s] text-left ${
                      isActive(item.href)
                        ? 'bg-[var(--primary-soft)] text-[var(--text)] [&>svg]:stroke-[var(--primary)]'
                        : 'text-[var(--muted)] hover:bg-[rgba(255,255,255,0.03)] hover:text-[var(--text)]'
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Footer */}
          <div className="flex items-center gap-2.5 border-t border-[var(--border)] pt-4">
            <div className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] font-display text-[14px] text-[var(--primary)]">
              {userInitial}
            </div>
            <div>
              <p className="text-[13.5px] font-medium">{userName}</p>
              <p className="text-[12px] text-[var(--muted)]">Çevrimiçi</p>
            </div>
          </div>
        </aside>

        {/* ============ MAIN CONTENT ============ */}
        <main className="min-w-0 flex-1 px-4 py-5 pb-[100px] md:px-12 md:py-10">
          {/* Mobile topbar */}
          <div className="mb-5 flex items-center justify-between md:hidden">
            <div className="flex items-center gap-2">
              <span className="font-display text-[17px] font-medium tracking-[0.06em]">
                YANKI
              </span>
            </div>
            <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[var(--primary-soft)] font-display text-[14px] text-[var(--primary)]">
              {userInitial}
            </div>
          </div>

          {children}
        </main>

        {/* ============ MOBILE BOTTOM NAV ============ */}
        <nav className="mobile-nav fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--border)] bg-[var(--surface)] px-2.5 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2 md:hidden">
          <ul className="flex justify-around">
            {NAV_ITEMS.slice(0, 5).map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => router.push(item.href)}
                  className={`flex min-w-[56px] flex-col items-center gap-1 rounded-xl px-3.5 py-1.5 text-[10.5px] ${
                    isActive(item.href)
                      ? 'text-[var(--primary)]'
                      : 'text-[var(--muted)]'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  );
}

'use client';

import { useState } from 'react';
import { useSupabase } from '@/lib/supabase/use-client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = useSupabase();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalı.');
      setLoading(false);
      return;
    }

    if (!consent) {
      setError('Devam etmek için açık rıza onayı gereklidir.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          consent_given: 'true',
        },
      },
    });

    if (error) {
      setError(
        error.message.includes('already registered')
          ? 'Bu email zaten kayıtlı. Giriş yapmayı deneyin.'
          : 'Bir şeyler ters gitti, tekrar dener misin?',
      );
      setLoading(false);
      return;
    }

    // Kayıt başarılı — onboarding'e yönlendir
    router.push('/onboarding');
    router.refresh();
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-3xl font-bold text-black dark:text-zinc-50">
          Yankı
        </h1>
        <p className="mb-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Hesap oluştur
        </p>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label
              htmlFor="displayName"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Adın
            </label>
            <input
              id="displayName"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              placeholder="Adın soyadın"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              placeholder="ornek@email.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Şifre
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              placeholder="En az 6 karakter"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
              {error}
            </p>
          )}

          <label className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-black focus:ring-black dark:border-zinc-700"
            />
            <span>
              Kişisel verilerimin işlenmesine ve Yankı tarafından kullanılmasına{' '}
              <strong>açık rıza veriyorum</strong>. Verilerimin KVKK kapsamında
              korunduğunu, dilediğim zaman silebileceğimi biliyorum. <em>(v0-placeholder — hukuki metin değildir)</em>
            </span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {loading ? 'Hesap oluşturuluyor...' : 'Kayıt Ol'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Zaten hesabın var mı?{' '}
          <Link
            href="/login"
            className="font-medium text-black underline dark:text-zinc-200"
          >
            Giriş yap
          </Link>
        </p>
      </div>
    </div>
  );
}

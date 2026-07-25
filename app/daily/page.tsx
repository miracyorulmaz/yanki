'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSupabase } from '@/lib/supabase/use-client';
import { useRouter } from 'next/navigation';
import Skeleton from '@/components/Skeleton';

interface DailyQuestion {
  id: string;
  text: string;
  type: string;
  options: { choices?: string[] } | null;
}

export default function DailyPage() {
  const [questions, setQuestions] = useState<DailyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [allDone, setAllDone] = useState(false);
  const supabase = useSupabase();
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        router.push('/login');
        return;
      }

      // Onboarding kontrolü
      const { data: profile } = await supabase
        .from('users')
        .select('onboarding_completed_at')
        .eq('id', currentUser.id)
        .single();

      if (!profile?.onboarding_completed_at) {
        router.push('/onboarding');
        return;
      }

      // Günlük soruları getir
      const res = await fetch('/api/daily-questions/today');
      if (!res.ok) {
        setError('Sorular yüklenemedi.');
        setLoading(false);
        return;
      }

      const data = await res.json();

      if (!data.questions || data.questions.length === 0) {
        setAllDone(true);
        setLoading(false);
        return;
      }

      setQuestions(data.questions);
      setLoading(false);
    }

    init();
  }, [supabase, router]);

  const handleSubmit = useCallback(
    async (question: DailyQuestion) => {
      const answer = answers[question.id]?.trim();
      if (!answer || submitting) return;

      setError('');
      setSubmitting(true);

      try {
        const res = await fetch('/api/daily-questions/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questionId: question.id, answer }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Bir şeyler ters gitti, tekrar dener misin?');
          setSubmitting(false);
          return;
        }

        setSubmitted((prev) => new Set(prev).add(question.id));

        // Tüm sorular cevaplandı mı?
        const newSubmitted = new Set([...submitted, question.id]);
        if (newSubmitted.size >= questions.length) {
          setAllDone(true);
        }
      } catch {
        setError('Bağlantı hatası. Lütfen tekrar deneyin.');
      }

      setSubmitting(false);
    },
    [answers, questions.length, submitted, submitting],
  );

  if (loading) {
    return <Skeleton variant="question" />;
  }

  if (allDone) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-black">
        <div className="w-full max-w-lg text-center">
          <h1 className="text-2xl font-bold text-black dark:text-zinc-50">
            Bugünlük bu kadar!
          </h1>
          <p className="mt-3 text-zinc-500 dark:text-zinc-400">
            Cevapların kaydedildi. Yarın yeni sorularla tekrar görüşeceğiz.
          </p>
          <button
            onClick={() => router.push('/')}
            className="mt-6 rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Ana sayfaya dön
          </button>
        </div>
      </div>
    );
  }

  if (questions.length === 0 && !loading) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-black">
        <div className="w-full max-w-lg text-center">
          <h1 className="text-2xl font-bold text-black dark:text-zinc-50">
            Henüz soru yok
          </h1>
          <p className="mt-3 text-zinc-500 dark:text-zinc-400">
            Soru havuzuna günlük sorular eklenmemiş. Lütfen seed script&apos;ini
            çalıştırın.
          </p>
        </div>
      </div>
    );
  }

  const remainingQuestions = questions.filter((q) => !submitted.has(q.id));

  if (remainingQuestions.length === 0 && questions.length > 0 && !allDone) {
    setAllDone(true);
    return null;
  }

  const currentQuestion = remainingQuestions[0];

  if (!currentQuestion) {
    return null;
  }

  const choices = getChoices(currentQuestion.options);

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-black">
      {/* Progress */}
      <div className="fixed top-0 left-0 right-0 z-10 h-1 bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full bg-black transition-all duration-300 dark:bg-white"
          style={{ width: `${(submitted.size / questions.length) * 100}%` }}
        />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-lg">
          <p className="mb-1 text-xs font-medium text-zinc-400">
            Günlük soru — {submitted.size + 1}/{questions.length}
          </p>

          <h2 className="mb-6 text-xl font-semibold leading-relaxed sm:mb-8 sm:text-2xl text-black dark:text-zinc-50">
            {currentQuestion.text}
          </h2>

          {/* Multiple choice */}
          {currentQuestion.type === 'multiple_choice' && choices.length > 0 && (
            <div className="space-y-3">
              {choices.map((choice) => (
                <button
                  key={choice}
                  onClick={() =>
                    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: choice }))
                  }
                  className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                    answers[currentQuestion.id] === choice
                      ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black'
                      : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
                  }`}
                >
                  {choice}
                </button>
              ))}
            </div>
          )}

          {/* Scaled */}
          {currentQuestion.type === 'scaled' && (
            <div>
              <div className="flex justify-between gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() =>
                      setAnswers((prev) => ({ ...prev, [currentQuestion.id]: String(n) }))
                    }
                    className={`flex h-12 w-12 items-center justify-center rounded-lg border text-sm font-medium transition-colors ${
                      answers[currentQuestion.id] === String(n)
                        ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black'
                        : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex justify-between px-1 text-xs text-zinc-400">
                <span>1</span>
                <span>5</span>
              </div>
            </div>
          )}

          {/* Open text */}
          {(currentQuestion.type === 'open_text' ||
            (!currentQuestion.type && choices.length === 0)) && (
            <textarea
              value={answers[currentQuestion.id] || ''}
              onChange={(e) =>
                setAnswers((prev) => ({ ...prev, [currentQuestion.id]: e.target.value }))
              }
              rows={4}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-3 text-sm text-black placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              placeholder="Cevabını yaz..."
            />
          )}

          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            onClick={() => handleSubmit(currentQuestion)}
            disabled={!answers[currentQuestion.id]?.trim() || submitting}
            className="mt-8 w-full rounded-lg bg-black px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {submitting ? 'Cevaplanıyor...' : 'Cevapla'}
          </button>
        </div>
      </div>
    </div>
  );
}

function getChoices(options: DailyQuestion['options']): string[] {
  if (!options) return [];
  if (Array.isArray(options)) return options;
  if (typeof options === 'object' && 'choices' in options) {
    return (options as { choices: string[] }).choices ?? [];
  }
  return [];
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSupabase } from '@/lib/supabase/use-client';
import { useRouter } from 'next/navigation';
import type { Question } from '@/types';
import Skeleton from '@/components/Skeleton';

type OnboardingQuestion = Pick<Question, 'id' | 'text' | 'question_type' | 'options' | 'weight'>;

export default function OnboardingPage() {
  const [questions, setQuestions] = useState<OnboardingQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const router = useRouter();
  const supabase = useSupabase();

  // Fetch onboarding questions
  useEffect(() => {
    async function loadQuestions() {
      const { data: allQuestions, error } = await supabase
        .from('questions')
        .select('id, text, question_type, options, weight')
        .eq('category', 'onboarding')
        .eq('active', true)
        .order('weight', { ascending: false });

      if (error) {
        setError('Sorular yüklenemedi.');
        setLoading(false);
        return;
      }

      if (!allQuestions || allQuestions.length === 0) {
        // No questions in DB yet — use seed data as fallback
        setError(
          'Onboarding soruları henüz yüklenmemiş. Lütfen `npx tsx db/seed.ts` çalıştırın.',
        );
        setLoading(false);
        return;
      }

      // Check which questions are already answered
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: answered } = await supabase
          .from('entries')
          .select('question_id')
          .eq('user_id', user.id)
          .eq('source', 'onboarding');

        const answeredIds = new Set(answered?.map((e) => e.question_id) ?? []);
        setSkippedIds(answeredIds);
      }

      setQuestions(allQuestions);
      setLoading(false);
    }

    loadQuestions();
  }, [supabase]);

  const currentQuestion = questions[currentIndex];

  const submitAnswer = useCallback(
    async (q: OnboardingQuestion, ans: string) => {
      setSubmitting(true);
      setError('');

      const res = await fetch('/api/onboarding/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: q.id,
          question: q.text,
          questionType: q.question_type,
          answer: ans,
        }),
      });

      if (!res.ok) {
        setError('Bir şeyler ters gitti, tekrar dener misin?');
        setSubmitting(false);
        return false;
      }

      setSubmitting(false);
      return true;
    },
    [],
  );

  const handleNext = async () => {
    if (!currentQuestion) return;

    const ok = await submitAnswer(currentQuestion, answer);
    if (!ok) return;

    // Move to next
    const nextIndex = findNextUnanswered(questions, currentIndex + 1);
    if (nextIndex >= questions.length) {
      // All done
      await completeOnboarding();
    } else {
      setCurrentIndex(nextIndex);
      setAnswer('');
    }
  };

  const handleSkip = () => {
    if (!currentQuestion) return;

    setSkippedIds((prev) => new Set(prev).add(currentQuestion.id));

    const nextIndex = findNextUnanswered(questions, currentIndex + 1);
    if (nextIndex >= questions.length) {
      completeOnboarding();
    } else {
      setCurrentIndex(nextIndex);
      setAnswer('');
    }
  };

  const handleLater = async () => {
    // Save current answer if any, then leave
    if (answer.trim() && currentQuestion) {
      await submitAnswer(currentQuestion, answer);
    }
    router.push('/');
  };

  const completeOnboarding = async () => {
    setSubmitting(true);
    const res = await fetch('/api/onboarding/complete', { method: 'POST' });

    if (!res.ok) {
      const data = await res.json();
      if (data.missingQuestions) {
        // Redirect to those questions
        const missingIds = new Set(data.missingQuestions.map((q: { id: string }) => q.id));
        const idx = questions.findIndex((q) => missingIds.has(q.id));
        if (idx >= 0) {
          setCurrentIndex(idx);
          setAnswer('');
          setError('Bazı sorular zorunlu — lütfen cevaplayın.');
          setSubmitting(false);
          return;
        }
      }
      setError('Bir şeyler ters gitti, tekrar dener misin?');
      setSubmitting(false);
      return;
    }

    setCompleted(true);
    router.push('/');
    router.refresh();
  };

  const canSkip = currentQuestion ? (currentQuestion.weight ?? 1) >= 0.85 : false;

  if (loading) {
    return <Skeleton variant="question" />;
  }

  if (completed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-black dark:text-zinc-50">
            🎉 Tamamlandı!
          </h2>
          <p className="mt-2 text-zinc-500">Yankı&apos;n hazırlanıyor...</p>
        </div>
      </div>
    );
  }

  if (error && !currentQuestion) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="max-w-sm text-center">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-sm text-zinc-500">Tüm sorular cevaplandı.</p>
      </div>
    );
  }

  const total = questions.length;
  const answered = questions.filter((q) => skippedIds.has(q.id)).length;
  const progress = Math.round((answered / total) * 100);

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 dark:bg-black">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 z-10 h-1 bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full bg-black transition-all duration-300 dark:bg-white"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-lg">
          {/* Step indicator */}
          <p className="mb-1 text-xs font-medium text-zinc-400">
            Soru {currentIndex + 1}/{total}
          </p>

          {/* Question */}
          <h2 className="mb-6 text-xl font-semibold leading-relaxed sm:mb-8 sm:text-2xl text-black dark:text-zinc-50">
            {currentQuestion.text}
          </h2>

          {/* Answer area */}
          {currentQuestion.question_type === 'multiple_choice' && (
            <div className="space-y-3">
              {getChoices(currentQuestion.options).map((choice) => (
                <button
                  key={choice}
                  onClick={() => setAnswer(choice)}
                  className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                    answer === choice
                      ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black'
                      : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
                  }`}
                >
                  {choice}
                </button>
              ))}
            </div>
          )}

          {currentQuestion.question_type === 'scaled' && (
            <div>
              <div className="flex justify-between gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setAnswer(String(n))}
                    className={`flex h-12 w-12 items-center justify-center rounded-lg border text-sm font-medium transition-colors ${
                      answer === String(n)
                        ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black'
                        : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex justify-between px-1 text-xs text-zinc-400">
                <span>hiç katılmıyorum</span>
                <span>tamamen katılıyorum</span>
              </div>
            </div>
          )}

          {(currentQuestion.question_type === 'open_text' || !currentQuestion.question_type) && (
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
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

          {/* Actions */}
          <div className="mt-8 flex flex-col gap-3">
            <button
              onClick={handleNext}
              disabled={submitting || !answer.trim()}
              className="w-full rounded-lg bg-black px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              {submitting ? 'Kaydediliyor...' : currentIndex + 1 < total ? 'Devam' : 'Tamamla'}
            </button>

            <div className="flex gap-3">
              {canSkip && (
                <button
                  onClick={handleSkip}
                  disabled={submitting}
                  className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
                >
                  Atla
                </button>
              )}
              <button
                onClick={handleLater}
                disabled={submitting}
                className={`rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900 ${canSkip ? 'flex-1' : 'w-full'}`}
              >
                Daha sonra devam et
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function findNextUnanswered(questions: OnboardingQuestion[], startIndex: number): number {
  for (let i = startIndex; i < questions.length; i++) {
    if (questions[i]) return i;
  }
  return questions.length;
}

function getChoices(options: OnboardingQuestion['options']): string[] {
  if (!options) return [];
  if (Array.isArray(options)) return options;
  if (typeof options === 'object' && 'choices' in options) {
    return (options as { choices: string[] }).choices;
  }
  return [];
}

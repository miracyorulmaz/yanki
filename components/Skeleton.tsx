/**
 * Skeleton loading placeholder — veri yüklenirken gösterilen gri kutucuk.
 *
 * Kullanım:
 *   <Skeleton className="h-4 w-32" />        ← istediğin boyutta
 *   <Skeleton className="h-64 w-full" />     ← tam genişlik
 *   <Skeleton variant="chat" />              ← chat baloncuğu
 *   <Skeleton variant="question" />          ← soru kartı
 */

interface SkeletonProps {
  className?: string;
  variant?: 'chat' | 'question' | 'text';
}

export default function Skeleton({ className, variant }: SkeletonProps) {
  const base = 'animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800';

  if (variant === 'chat') {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        {/* Yankı baloncuğu */}
        <div className="flex justify-start">
          <div className={`w-4/5 rounded-2xl px-4 py-2.5 ${base}`}>
            <div className="mb-1 h-3 w-full rounded bg-zinc-300 dark:bg-zinc-700" />
            <div className="h-3 w-3/4 rounded bg-zinc-300 dark:bg-zinc-700" />
          </div>
        </div>
        {/* Kullanıcı baloncuğu */}
        <div className="flex justify-end">
          <div className={`w-2/5 rounded-2xl px-4 py-2.5 ${base}`}>
            <div className="h-3 w-full rounded bg-zinc-300 dark:bg-zinc-700" />
          </div>
        </div>
        {/* Yankı baloncuğu */}
        <div className="flex justify-start">
          <div className={`w-2/3 rounded-2xl px-4 py-2.5 ${base}`}>
            <div className="mb-1 h-3 w-full rounded bg-zinc-300 dark:bg-zinc-700" />
            <div className="h-3 w-1/2 rounded bg-zinc-300 dark:bg-zinc-700" />
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'question') {
    return (
      <div className="mx-auto w-full max-w-lg space-y-6 px-4 py-16">
        <div className={`h-3 w-16 rounded ${base}`} />
        <div className={`h-7 w-4/5 rounded ${base}`} />
        <div className="space-y-3">
          <div className={`h-12 w-full rounded-lg ${base}`} />
          <div className={`h-12 w-full rounded-lg ${base}`} />
          <div className={`h-12 w-3/5 rounded-lg ${base}`} />
        </div>
        <div className={`mt-8 h-12 w-full rounded-lg ${base}`} />
      </div>
    );
  }

  if (variant === 'text') {
    return (
      <div className="space-y-2">
        <div className={`h-3 w-full rounded ${base}`} />
        <div className={`h-3 w-4/5 rounded ${base}`} />
      </div>
    );
  }

  return <div className={`${base} ${className ?? ''}`} />;
}

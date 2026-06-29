"use client";

import { useTranslation } from "@/hooks/useTranslation";

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`card p-5 animate-pulse ${className}`}>
      <div className="h-3 w-24 rounded skeleton mb-3" />
      <div className="h-7 w-32 rounded skeleton mb-2" />
      <div className="h-3 w-16 rounded skeleton" />
    </div>
  );
}

export function SkeletonSection() {
  return (
    <div className="space-y-4 animate-slide-up">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="card p-6">
        <div className="h-4 w-32 rounded skeleton mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex justify-between">
                <div className="h-3 w-28 rounded skeleton" />
                <div className="h-3 w-20 rounded skeleton" />
              </div>
            ))}
          </div>
          <div className="h-40 rounded skeleton" />
        </div>
      </div>
    </div>
  );
}

export function LoadingOverlay() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-5">
      <div className="relative">
        <div className="w-14 h-14 rounded-full border-2 border-border animate-spin border-t-accent" />
        <div className="absolute inset-0 rounded-full bg-accent/5 animate-pulse-slow" />
      </div>
      <div className="text-center">
        <p className="text-sm text-slate-300 font-medium">{t.states.analyzing}</p>
        <p className="text-xs text-slate-600 mt-1">{t.states.loadingDetails}</p>
      </div>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-loss/10 border border-loss/20 flex items-center justify-center text-2xl">
        ⚠
      </div>
      <div className="text-center max-w-sm">
        <p className="text-sm font-medium text-slate-200 mb-1">{t.states.cannotAnalyze}</p>
        <p className="text-xs text-slate-500">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="px-4 py-2 rounded-xl bg-accent/10 border border-accent/20 text-accent text-sm font-medium hover:bg-accent/20 transition-colors"
      >
        {t.states.retry}
      </button>
    </div>
  );
}

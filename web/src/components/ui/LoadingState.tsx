"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { RefreshCw, AlertTriangle, Wifi, Home } from "lucide-react";

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
    <div className="flex flex-col items-center justify-center py-16 sm:py-20 gap-5 px-4">
      <div className="relative">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-border animate-spin border-t-accent" />
        <div className="absolute inset-0 rounded-full bg-accent/5 animate-pulse-slow" />
      </div>
      <div className="text-center">
        <p className="text-sm text-slate-300 font-medium">{t.states.analyzing}</p>
        <p className="text-xs text-slate-600 mt-1">{t.states.loadingDetails}</p>
      </div>
    </div>
  );
}

function parseErrorMessage(raw: string): string {
  // Unwrap nested JSON: e.g. '{"detail": "Lỗi phân tích: ..."}' → "Lỗi phân tích: ..."
  try {
    const obj = JSON.parse(raw);
    if (typeof obj === "object" && obj !== null && typeof obj.detail === "string") {
      return obj.detail;
    }
  } catch {
    // not JSON — use as-is
  }
  return raw;
}

export function ErrorState({
  message,
  ticker,
  onRetry,
  onReset,
}: {
  message: string;
  ticker?: string;
  onRetry: () => void;
  onReset?: () => void;
}) {
  const { t } = useTranslation();

  const clean = parseErrorMessage(message);
  const isNetworkError = clean.includes("502") || clean.includes("fetch") || clean.includes("aborted") || clean.includes("network");
  const isServerError = !isNetworkError && (clean.includes("500") || clean.includes("Internal") || clean.includes("Lỗi"));
  const isNotFound = clean.includes("404") || clean.includes("không tìm thấy") || clean.includes("not found");

  return (
    <div className="flex flex-col items-center justify-center py-12 sm:py-16 gap-4 sm:gap-5 px-4">
      {/* Icon */}
      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-loss/10 border border-loss/20 flex items-center justify-center shrink-0">
        {isNetworkError
          ? <Wifi className="w-5 h-5 sm:w-6 sm:h-6 text-loss" />
          : <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-loss" />}
      </div>

      {/* Text */}
      <div className="text-center max-w-sm sm:max-w-md w-full">
        <p className="text-sm sm:text-base font-semibold text-slate-200 mb-1.5">
          {t.states.cannotAnalyze}
          {ticker && <span className="text-accent ml-1.5">{ticker}</span>}
        </p>

        {/* Error code badge */}
        <div className="inline-block max-w-full">
          <p className="text-[11px] sm:text-xs text-slate-500 font-mono bg-white/[0.03] border border-white/[0.05] rounded-lg px-3 py-1.5 break-all">
            {clean}
          </p>
        </div>

        {/* Contextual hint */}
        <p className="text-xs text-slate-600 mt-2.5 leading-relaxed">
          {isNetworkError
            ? "Không thể kết nối máy chủ. Kiểm tra mạng và thử lại."
            : isNotFound
              ? "Mã cổ phiếu không hợp lệ hoặc chưa được hỗ trợ."
              : isServerError
                ? "Lỗi tạm thời từ máy chủ. Thường tự hết sau vài giây."
                : "Vui lòng thử lại hoặc kiểm tra mã cổ phiếu."}
        </p>
      </div>

      {/* Buttons */}
      <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full max-w-xs sm:max-w-none sm:w-auto">
        <button
          onClick={onRetry}
          className="flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-2.5 rounded-xl font-semibold text-sm text-[#0A0D12] transition-all duration-200 active:scale-[0.97]"
          style={{ background: "linear-gradient(90deg,#A3FF12,#7CFF3B)", boxShadow: "0 0 16px rgba(163,255,18,0.2)" }}
        >
          <RefreshCw className="w-4 h-4" />
          {t.states.retry}
        </button>

        {onReset && (
          <button
            onClick={onReset}
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-2.5 rounded-xl font-semibold text-sm text-slate-400 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-all duration-200"
          >
            <Home className="w-4 h-4" />
            Trang chủ
          </button>
        )}
      </div>
    </div>
  );
}

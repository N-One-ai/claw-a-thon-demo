"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { Search, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

const POPULAR = ["FPT", "VCB", "HPG", "MWG", "VNM", "ACB", "TCB", "BID", "VIC", "MSN"];

interface TickerSearchProps {
  onAnalyze: (ticker: string) => void;
  isLoading: boolean;
}

export function TickerSearch({ onAnalyze, isLoading }: TickerSearchProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  const submit = (ticker?: string) => {
    const tick = (ticker ?? value).trim().toUpperCase();
    if (!tick || isLoading) return;
    onAnalyze(tick);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") submit();
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight mb-3">
          <span className="text-white">{t.search.titleWhite}</span>{" "}
          <span className="gradient-text">{t.search.titleGradient}</span>
        </h1>
        <p className="text-slate-500 text-sm">{t.search.subtitle}</p>
      </div>

      {/* Search container — unified bar */}
      <div
        className={cn(
          "flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0",
          "sm:p-2 sm:rounded-3xl sm:backdrop-blur-xl sm:border",
          "transition-all duration-200",
          "focus-within:shadow-[0_0_0_1px_rgba(163,255,18,0.25),0_0_30px_rgba(163,255,18,0.06)]",
        )}
        style={{ background: "rgba(20,20,20,0.75)", borderColor: "rgba(163,255,18,0.15)" }}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 flex-1 px-4 py-3 sm:py-0 rounded-2xl sm:rounded-none bg-[rgba(20,20,20,0.75)] sm:bg-transparent border border-[rgba(163,255,18,0.15)] sm:border-0">
          <Search className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value.toUpperCase())}
            onKeyDown={onKey}
            placeholder={t.search.placeholder}
            className="flex-1 bg-transparent outline-none text-slate-200 placeholder:text-slate-600 text-sm sm:text-base font-mono tracking-wide min-h-0"
            maxLength={10}
            disabled={isLoading}
          />
          {value && (
            <button
              onClick={() => { setValue(""); inputRef.current?.focus(); }}
              className="text-slate-600 hover:text-slate-400 text-sm px-1.5 min-h-0"
            >
              ✕
            </button>
          )}
        </div>

        {/* Submit button — always visible */}
        <button
          onClick={() => submit()}
          disabled={!value.trim() || isLoading}
          className="flex items-center justify-center gap-1.5 shrink-0 font-bold text-sm text-[#0A0D12] w-full sm:w-[170px] md:w-[180px] h-[52px] sm:h-[46px] md:h-[48px] px-4 rounded-2xl sm:rounded-[16px] transition-all duration-200 disabled:brightness-[0.6] disabled:cursor-not-allowed"
          style={{ background: "linear-gradient(90deg,#A3FF12,#7CFF3B)", boxShadow: "0 0 20px rgba(163,255,18,0.25)" }}
        >
          <Zap className="w-4 h-4" />
          {t.search.analyzeBtn}
        </button>
      </div>

      {/* Popular tickers */}
      <div className="flex items-center gap-2 mt-4 flex-wrap">
        <span className="text-xs text-slate-600 shrink-0">{t.search.popular}</span>
        {POPULAR.map((tick) => (
          <button
            key={tick}
            onClick={() => { setValue(tick); submit(tick); }}
            disabled={isLoading}
            className="px-3 py-2.5 sm:px-2.5 sm:py-1 rounded-lg text-sm sm:text-xs font-mono font-medium text-slate-400 bg-white/[0.03] border border-border hover:border-accent/40 hover:text-accent hover:bg-accent/5 transition-all min-h-0"
          >
            {tick}
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Search, Zap, BarChart2, Shield, Activity, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

// ── Constants ────────────────────────────────────────────────────────────────

const POPULAR = ["FPT", "VCB", "HPG", "MWG", "VNM", "ACB", "TCB", "VIC"];

// Candlestick chart: [centerX, wickTop, wickBot, bodyTop, bodyHeight, isBull]
const CANDLES: Array<[number, number, number, number, number, boolean]> = [
  [14,  124, 140, 126, 12, true ],
  [32,  118, 134, 121,  9, false],
  [50,  111, 129, 113, 12, true ],
  [68,  115, 127, 117,  9, false],
  [86,  102, 123, 104, 13, true ],
  [104, 107, 119, 109,  9, false],
  [122,  94, 115,  96, 13, true ],
  [140, 100, 112, 102,  9, false],
  [158,  87, 107,  89, 13, true ],
  [176,  92, 103,  94,  8, false],
  [194,  77,  98,  79, 13, true ],
  [212,  82,  94,  84,  8, false],
  [230,  67,  88,  69, 13, true ],
  [248,  72,  84,  74,  8, false],
  [266,  56,  78,  58, 14, true ],
  [284,  61,  73,  63,  8, false],
  [302,  45,  67,  47, 14, true ],
  [320,  50,  62,  52,  9, false],
];

const MA_POINTS =
  "0,138 14,132 32,125 50,119 68,122 86,111 104,113 122,103 140,106 158,95 176,98 194,86 212,88 230,76 248,78 266,65 284,67 302,54 320,57 340,51";

const PARTICLES = [
  { top: "18%", left:  "6%", size: 2, delay: 0,   dur: 9  },
  { top: "72%", left: "13%", size: 3, delay: 2,   dur: 11 },
  { top: "45%", left: "22%", size: 2, delay: 4,   dur: 8  },
  { top: "85%", left: "30%", size: 1, delay: 1,   dur: 13 },
  { top: "30%", left: "78%", size: 2, delay: 3,   dur: 10 },
  { top: "60%", left: "72%", size: 3, delay: 5,   dur: 9  },
  { top: "15%", left: "86%", size: 1, delay: 0.5, dur: 12 },
  { top: "55%", left: "91%", size: 2, delay: 2.5, dur: 8  },
  { top: "80%", left: "62%", size: 2, delay: 6,   dur: 11 },
  { top: "25%", left: "52%", size: 1, delay: 1.5, dur: 14 },
  { top: "90%", left: "42%", size: 3, delay: 3.5, dur: 10 },
  { top: "10%", left: "33%", size: 2, delay: 7,   dur: 9  },
  { top: "65%", left: "40%", size: 1, delay: 4.5, dur: 12 },
  { top: "40%", left: "94%", size: 2, delay: 8,   dur: 8  },
  { top: "75%", left: "50%", size: 1, delay: 2,   dur: 15 },
] as const;

const TICKER_SYMS = ["VCB", "FPT", "HPG", "VNM", "ACB", "TCB", "MWG", "VIC", "BID", "CTG", "MSN", "SSI"];

interface TickerData { sym: string; val: string; chg: string; up: boolean }

async function fetchTickerPrices(): Promise<TickerData[]> {
  try {
    const res = await fetch(
      `/api/prices?syms=${TICKER_SYMS.join(",")}`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const items: { sym: string; price: number | null; prevClose: number | null }[] = await res.json();
    return items
      .filter(d => d.price != null)
      .map(d => {
        const price = d.price!;
        const prev = d.prevClose ?? price;
        const change = prev > 0 ? ((price - prev) / prev) * 100 : 0;
        return {
          sym: d.sym,
          val: new Intl.NumberFormat("vi-VN").format(Math.round(price)),
          chg: `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`,
          up: change >= 0,
        };
      });
  } catch {
    return [];
  }
}

const FALLBACK_TICKERS: TickerData[] = TICKER_SYMS.map(sym => ({ sym, val: "—", chg: "—", up: true }));

// ── Component ────────────────────────────────────────────────────────────────

interface HeroBannerProps {
  onAnalyze: (ticker: string) => void;
  isLoading: boolean;
}

export function HeroBanner({ onAnalyze, isLoading }: HeroBannerProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [tickerItems, setTickerItems] = useState<TickerData[]>(FALLBACK_TICKERS);

  useEffect(() => {
    const refresh = () => {
      fetchTickerPrices().then(data => { if (data.length > 0) setTickerItems(data); });
    };
    refresh();
    const interval = setInterval(refresh, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(interval);
  }, []);
  const { t } = useTranslation();

  const BADGES = [
    { label: t.hero.featureHOSE, icon: BarChart2 },
    { label: t.hero.featureHNX, icon: BarChart2 },
    { label: t.hero.featureValuation, icon: Cpu },
    { label: t.hero.featureRisk, icon: Shield },
    { label: t.hero.featureTech, icon: Activity },
  ];

  const submit = (ticker?: string) => {
    const tick = (ticker ?? value).trim().toUpperCase();
    if (!tick || isLoading) return;
    onAnalyze(tick);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") submit();
  };

  return (
    <section className="relative w-full flex flex-col min-h-[calc(100dvh-3.5rem)] overflow-hidden">

      {/* ── Decorative background ────────────────────────────────────────── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="hero-orb hero-orb-blue absolute -top-16 left-1/2 -translate-x-[60%] w-[500px] h-[500px] rounded-full bg-[#A3FF12]/[0.08] blur-[110px]" />
        <div className="hero-orb hero-orb-cyan-lg absolute -top-8 left-1/2 translate-x-[5%] w-[420px] h-[420px] rounded-full bg-[#2DFF7A]/[0.06] blur-[100px]" />
        <div className="hero-orb hero-orb-cyan absolute top-28 left-[20%] w-60 h-60 rounded-full bg-[#A3FF12]/[0.04] blur-[80px]" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(163,255,18,0.03) 1px, transparent 1px)," +
              "linear-gradient(90deg, rgba(163,255,18,0.03) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
            maskImage: "radial-gradient(ellipse 80% 55% at 50% 0%, black 30%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(ellipse 80% 55% at 50% 0%, black 30%, transparent 100%)",
          }}
        />

        {/* Decorative candlestick chart */}
        <svg
          viewBox="0 0 340 150"
          width={390}
          height={210}
          className="absolute right-0 top-1/2 -translate-y-[52%] hidden md:block"
          style={{
            opacity: 0.115,
            maskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.5) 35%, black 100%)",
            WebkitMaskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.5) 35%, black 100%)",
          }}
        >
          <polyline points={MA_POINTS} fill="none" stroke="#A3FF12" strokeWidth={10} strokeLinecap="round" opacity={0.10} />
          <polyline points={MA_POINTS} fill="none" stroke="#A3FF12" strokeWidth={1.5} strokeLinecap="round" opacity={0.75} />
          {CANDLES.map(([cx, wT, wB, bT, bH, bull], i) => (
            <g key={i}>
              <line x1={cx} y1={wT} x2={cx} y2={wB} stroke={bull ? "#10b981" : "#f43f5e"} strokeWidth={1.5} />
              <rect x={cx - 5} y={bT} width={10} height={bH} fill={bull ? "#10b981" : "#f43f5e"} rx={1} />
            </g>
          ))}
          <line x1={0} y1={148} x2={340} y2={148} stroke="rgba(163,255,18,0.15)" strokeWidth={0.5} />
        </svg>

        {PARTICLES.map((p, i) => (
          <div
            key={i}
            className="hero-particle absolute rounded-full"
            style={{ top: p.top, left: p.left, width: p.size, height: p.size, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }}
          />
        ))}
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center text-center w-full py-10 sm:py-12">

        {/* Live badge */}
        <div
          className="hero-fade-1 mb-7 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-medium"
          style={{ background: "rgba(163,255,18,0.08)", borderColor: "rgba(163,255,18,0.2)", color: "#A3FF12" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-slow" />
          {t.hero.badge}
        </div>

        {/* Title */}
        <h1 className="hero-fade-1 font-extrabold tracking-tight leading-[1.05] mb-5 text-[32px] sm:text-[38px] md:text-[45px] lg:text-[58px]">
          <span className="text-white">{t.hero.titleWhite}</span>{" "}
          <span className="gradient-text">{t.hero.titleGradient}</span>
        </h1>

        {/* Subtitle */}
        <div className="hero-fade-2 max-w-lg mb-8 sm:mb-10 px-4 sm:px-0 text-center space-y-1.5">
          <p className="text-slate-300 text-base sm:text-lg md:text-xl font-medium leading-snug">
            {t.hero.subtitle}
          </p>
          <p className="text-slate-500 text-sm sm:text-base leading-relaxed">
            {t.hero.subtitleHighlight}
          </p>
        </div>

        {/* Search input */}
        <div className="hero-fade-3 w-full max-w-xl mb-5 px-4 sm:px-0">
          {/* Desktop: single container. Mobile: stacked */}
          <div
            className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 sm:p-2 sm:rounded-3xl sm:backdrop-blur-xl sm:border transition-all duration-300 focus-within:shadow-[0_0_0_1px_rgba(163,255,18,0.25),0_0_40px_rgba(163,255,18,0.06)]"
            style={{ background: "rgba(20,20,20,0.75)", borderColor: "rgba(163,255,18,0.15)" }}
          >
            {/* Input row */}
            <div className="flex items-center gap-3 flex-1 px-4 py-3 sm:py-0 rounded-2xl sm:rounded-none bg-[rgba(20,20,20,0.75)] sm:bg-transparent border border-[rgba(163,255,18,0.15)] sm:border-0">
              <Search className="w-5 h-5 text-slate-500 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value.toUpperCase())}
                onKeyDown={onKey}
                placeholder={t.hero.placeholder}
                className="flex-1 bg-transparent outline-none text-slate-200 placeholder:text-slate-600 text-sm sm:text-base font-mono tracking-wider min-h-0"
                maxLength={10}
                autoComplete="off"
                spellCheck={false}
                disabled={isLoading}
              />
              {value && (
                <button
                  onClick={() => { setValue(""); inputRef.current?.focus(); }}
                  className="text-slate-600 hover:text-slate-400 transition-colors text-sm px-1.5 min-h-0"
                >✕</button>
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
              {t.hero.analyzeBtn}
            </button>
          </div>
        </div>

        {/* Popular tickers */}
        <div className="hero-fade-3 flex items-center gap-2 mb-10 flex-wrap justify-center">
          <span className="text-xs text-slate-600 shrink-0">{t.hero.popular}</span>
          {POPULAR.map((tick) => (
            <button
              key={tick}
              onClick={() => { setValue(tick); submit(tick); }}
              disabled={isLoading}
              className="hero-ticker-btn px-3 py-2.5 sm:px-2.5 sm:py-1 rounded-lg text-sm sm:text-xs font-mono font-medium text-slate-400 disabled:opacity-50"
            >
              {tick}
            </button>
          ))}
        </div>

        {/* Feature badges */}
        <div className="hero-fade-4 flex flex-wrap justify-center gap-2">
          {BADGES.map(({ label, icon: Icon }, i) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 sm:px-3 sm:py-1.5 rounded-full text-sm sm:text-xs font-medium border"
              style={{
                background: i % 2 === 0 ? "rgba(79,141,255,0.07)" : "rgba(34,211,238,0.06)",
                borderColor: i % 2 === 0 ? "rgba(79,141,255,0.18)" : "rgba(34,211,238,0.16)",
                color: i % 2 === 0 ? "#A3FF12" : "#2DFF7A",
              }}
            >
              <Icon className="w-3 h-3" />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Ticker tape ──────────────────────────────────────────────────── */}
      <div
        className="relative z-10 w-full overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.018)",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div className="absolute left-0 top-0 bottom-0 w-12 z-10 pointer-events-none"
          style={{ background: "linear-gradient(to right,var(--bg-base),transparent)" }} />
        <div className="absolute right-0 top-0 bottom-0 w-12 z-10 pointer-events-none"
          style={{ background: "linear-gradient(to left,var(--bg-base),transparent)" }} />
        <div className="ticker-scroll flex items-center" aria-hidden>
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <div key={i} className="flex items-center gap-2.5 px-5 py-2.5 shrink-0 border-r border-white/[0.05]">
              <span className="font-mono text-[11px] font-semibold text-slate-400 tracking-wide">{item.sym}</span>
              <span className="font-mono text-[11px] text-slate-600">{item.val}</span>
              <span className={cn("font-mono text-[10px] font-bold", item.up ? "text-profit" : "text-loss")}>
                {item.up ? "▲" : "▼"} {item.chg}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

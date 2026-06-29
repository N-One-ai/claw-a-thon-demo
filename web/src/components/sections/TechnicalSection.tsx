"use client";

import { useMemo, useState, useEffect } from "react";
import type { TechnicalSignal } from "@/types/analysis";
import { CandlestickChart } from "@/components/charts/CandlestickChart";
import { RSIPanel } from "@/components/charts/RSIPanel";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import {
  TrendingUp, TrendingDown, Activity, BarChart3,
  Gauge, Brain, CheckCircle, AlertTriangle, Zap, Target,
  ArrowUp, ArrowDown, ShieldCheck, ChartLine, Grid3x3, Layers,
} from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";

// ── Scoring ────────────────────────────────────────────────────────────────────

function gc(s: number) { return s >= 65 ? "#7CFF3B" : s >= 40 ? "#FFB020" : "#FF5A76"; }
function gl(s: number) { return s >= 65 ? "Tích cực" : s >= 40 ? "Trung lập" : "Tiêu cực"; }
function rsiScore(v: number) { return v > 70 ? 25 : v > 60 ? 45 : v > 40 ? 75 : v > 30 ? 60 : 30; }
function macdScore(l: string) { return l === "Mua" ? 85 : l === "Bán" ? 20 : 50; }
function trendScore(t: string) { return t === "Tăng mạnh" ? 90 : t === "Giảm" ? 15 : 50; }
function pos52Score(p: number) { return p > 80 ? 30 : p > 60 ? 55 : p > 40 ? 70 : p > 20 ? 60 : 40; }

// ── Component ──────────────────────────────────────────────────────────────────

interface Props { technical: TechnicalSignal; ticker?: string }

export function TechnicalSection({ technical: tech, ticker = "—" }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { t, formatCurrency, translateLabel } = useTranslation();
  const tr = t.technical;

  const { current_price, sma_20, sma_50, sma_200, rsi_14, rsi_label, macd_label, price_trend, high_52w, low_52w, position_52w_pct, volume_trend, chart_data } = tech;

  const techScore = useMemo(() => {
    const s: number[] = [];
    if (rsi_14 != null) s.push(rsiScore(rsi_14));
    if (macd_label) s.push(macdScore(macd_label));
    if (price_trend) s.push(trendScore(price_trend));
    if (position_52w_pct != null) s.push(pos52Score(position_52w_pct));
    if (sma_50 != null) s.push(current_price > sma_50 ? 70 : 30);
    if (sma_200 != null) s.push(current_price > sma_200 ? 75 : 25);
    return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : 50;
  }, [rsi_14, macd_label, price_trend, position_52w_pct, sma_50, sma_200, current_price]);

  const scoreColor = gc(techScore);

  // Sub-scores for breakdown bars
  const momentum = rsi_14 != null ? rsiScore(rsi_14) : 50;
  const volumeScore = volume_trend === "Tăng mạnh" ? 80 : volume_trend === "Giảm" ? 30 : 55;
  const trendS = trendScore(price_trend ?? "");
  const confidence = Math.min(100, Math.round((techScore + momentum + trendS) / 3));

  // Insights
  const strengths: Array<{ icon: React.ElementType; title: string; sub: string; score: number }> = [];
  const concerns: Array<{ icon: React.ElementType; title: string; sub: string; score: number }> = [];

  if (rsi_14 != null) {
    const s = rsiScore(rsi_14);
    const item = { icon: Activity, title: "RSI (14)", sub: `${rsi_14.toFixed(0)} — ${rsi_label ? translateLabel(rsi_label) : ""}`, score: s };
    s >= 50 ? strengths.push(item) : concerns.push(item);
  }
  if (macd_label) {
    const s = macdScore(macd_label);
    const item = { icon: BarChart3, title: "MACD", sub: translateLabel(macd_label), score: s };
    s >= 50 ? strengths.push(item) : concerns.push(item);
  }
  if (price_trend) {
    const s = trendScore(price_trend);
    const item = { icon: TrendingUp, title: tr.priceTrend, sub: translateLabel(price_trend), score: s };
    s >= 50 ? strengths.push(item) : concerns.push(item);
  }
  if (sma_200 != null) {
    const above = current_price > sma_200;
    const item = { icon: Target, title: "SMA 200", sub: above ? tr.aboveSMA : tr.belowSMA, score: above ? 75 : 25 };
    above ? strengths.push(item) : concerns.push(item);
  }
  if (position_52w_pct != null) {
    const s = pos52Score(position_52w_pct);
    const item = { icon: Gauge, title: tr.week52Title, sub: `${position_52w_pct.toFixed(0)}%`, score: s };
    s >= 50 ? strengths.push(item) : concerns.push(item);
  }
  if (volume_trend) {
    const item = { icon: Zap, title: tr.volumeTrend, sub: translateLabel(volume_trend), score: volumeScore };
    volumeScore >= 50 ? strengths.push(item) : concerns.push(item);
  }

  // Sentiment donut
  const bullish = strengths.length;
  const bearish = concerns.length;
  const neutral = Math.max(0, 6 - bullish - bearish);
  const donutData = [
    { name: "Tích cực", value: bullish, color: "#7CFF3B" },
    { name: "Trung lập", value: neutral, color: "#FFB020" },
    { name: "Tiêu cực", value: bearish, color: "#FF5A76" },
  ].filter(d => d.value > 0);

  const smaRows = [
    { label: "SMA 20", value: sma_20, term: tr.shortTerm },
    { label: "SMA 50", value: sma_50, term: tr.medTerm },
    { label: "SMA 200", value: sma_200, term: tr.longTerm },
  ];

  return (
    <div className="space-y-3 animate-slide-up">

      {/* ═══ SECTION 1: PREMIUM TECHNICAL SCORE ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {/* Gauge + breakdown */}
        <div className="md:col-span-2 card p-5 sm:p-7 flex flex-col items-center gap-5">
          <PremiumGauge value={techScore} color={scoreColor} label={gl(techScore)} />
          <div className="w-full space-y-2.5">
            <BreakdownBar label="Momentum" value={momentum} />
            <BreakdownBar label="Volume" value={volumeScore} />
            <BreakdownBar label="Trend" value={trendS} />
            <BreakdownBar label="Confidence" value={confidence} />
          </div>
        </div>

        {/* AI Market Summary — card grid */}
        <div className="md:col-span-3 card p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base font-semibold text-white font-mono">{ticker}</h2>
            <span className="text-[10px] text-slate-600 uppercase tracking-wider">{tr.signalsTitle}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[...strengths, ...concerns].slice(0, 6).map((item, i) => {
              const isPositive = item.score >= 50;
              const color = gc(item.score);
              return (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.02] transition-colors">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}10`, color }}>
                    <item.icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-slate-400 font-medium">{item.title}</p>
                    <p className="text-xs font-semibold text-white truncate">{item.sub}</p>
                  </div>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: `${color}15`, color }}>
                    {isPositive ? "▲" : "▼"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ═══ SECTION 2: SIGNAL KPI + SENTIMENT ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-6 gap-3">
        {/* 5 KPI cards */}
        <div className="lg:col-span-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[...strengths, ...concerns].slice(0, 5).map((s, i) => {
            const color = gc(s.score);
            return (
              <div key={i} className="card card-hover p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}12`, color }}>
                    <s.icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${color}15`, color }}>{gl(s.score)}</span>
                </div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{s.title}</p>
                <p className="text-lg font-mono font-extrabold text-white">{s.sub}</p>
                <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden mt-2">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${s.score}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Sentiment donut + confidence */}
        <div className="lg:col-span-2 card p-5 flex flex-col items-center gap-3">
          <SectionHeader icon={Activity} title="Market Sentiment" color="cyan" className="mb-3" />
          {mounted && (
            <div className="relative w-[120px] h-[120px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={36} outerRadius={52} paddingAngle={4} dataKey="value" strokeWidth={0}>
                    {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-white font-mono">{bullish}/{bullish + bearish + neutral}</span>
                <span className="text-[8px] text-slate-500">tín hiệu</span>
              </div>
            </div>
          )}
          <div className="flex gap-3 text-[10px]">
            {donutData.map(d => (
              <div key={d.name} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                <span className="text-slate-500">{d.name}</span>
              </div>
            ))}
          </div>
          {/* AI Confidence */}
          <div className="w-full pt-3 border-t border-white/[0.04]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-slate-500">AI Confidence</span>
              <span className="text-xs font-mono font-bold" style={{ color: gc(confidence) }}>{confidence}%</span>
            </div>
            <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${confidence}%`, background: gc(confidence) }} />
            </div>
          </div>
        </div>
      </div>

      {/* ═══ SECTION 3: CHARTS ═══ */}
      <CandlestickChart data={chart_data} ticker={ticker} />
      <RSIPanel data={chart_data} />

      {/* ═══ SECTION 4: MA TABLE ═══ */}
      <div className="card p-5">
        <SectionHeader icon={Layers} title={tr.movingAverages} color="blue" />
        <div className="hidden sm:grid grid-cols-12 gap-2 text-[9px] uppercase tracking-wider text-slate-600 pb-2 border-b border-white/[0.04] mb-1">
          <span className="col-span-2">MA</span>
          <span className="col-span-3 text-right">{tr.currentPrice}</span>
          <span className="col-span-2 text-right">Chênh lệch</span>
          <span className="col-span-3">Tín hiệu</span>
          <span className="col-span-2 text-right">Kỳ hạn</span>
        </div>
        <div className="space-y-0.5">
          {smaRows.map(({ label, value, term }) => {
            if (value == null) return null;
            const diff = ((current_price - value) / value) * 100;
            const above = current_price >= value;
            const color = above ? "#7CFF3B" : "#FF5A76";
            return (
              <div key={label} className="grid grid-cols-12 gap-2 items-center py-2.5 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.01] rounded-lg px-1 -mx-1 transition-colors">
                <div className="col-span-2 flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full" style={{ background: color }} />
                  <span className="text-xs text-slate-300 font-medium">{label}</span>
                </div>
                <span className="col-span-3 text-xs font-mono text-white text-right">{formatCurrency(value)}</span>
                <span className="col-span-2 text-xs font-mono font-bold text-right" style={{ color }}>{above ? "+" : ""}{diff.toFixed(1)}%</span>
                <div className="col-span-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border" style={{ background: `${color}12`, color, borderColor: `${color}20` }}>
                    {above ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                    {above ? tr.aboveSMA : tr.belowSMA}
                  </span>
                </div>
                <span className="col-span-2 text-[10px] text-slate-600 text-right hidden sm:block">{term}</span>
              </div>
            );
          })}
        </div>
        {high_52w != null && low_52w != null && (
          <div className="mt-5 pt-4 border-t border-white/[0.04]">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">{tr.week52Title}</p>
            <div className="relative">
              <div className="h-2.5 bg-white/[0.04] rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ background: "linear-gradient(90deg, #FF5A76, #FFB020 40%, #7CFF3B)" }} />
              </div>
              {position_52w_pct != null && (
                <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 shadow-glow" style={{ borderColor: "#A3FF12", left: `calc(${position_52w_pct}% - 8px)` }} />
              )}
              <div className="flex justify-between text-[10px] text-slate-600 mt-2">
                <span className="font-mono">{formatCurrency(low_52w)}</span>
                <span className="font-mono text-white">{formatCurrency(current_price)} ({tr.currentPrice})</span>
                <span className="font-mono">{formatCurrency(high_52w)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ SECTION 5: TREND MATRIX ═══ */}
      <div className="card p-5">
        <SectionHeader icon={Grid3x3} title="Trend Matrix" color="purple" />
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {[
            { tf: "1D", signal: macd_label === "Mua" ? "B" : macd_label === "Bán" ? "S" : "N" },
            { tf: "1W", signal: rsi_14 != null ? (rsi_14 < 40 ? "B" : rsi_14 > 60 ? "S" : "N") : "N" },
            { tf: "1M", signal: sma_20 != null ? (current_price > sma_20 ? "B" : "S") : "N" },
            { tf: "3M", signal: sma_50 != null ? (current_price > sma_50 ? "B" : "S") : "N" },
            { tf: "6M", signal: sma_200 != null ? (current_price > sma_200 ? "B" : "S") : "N" },
            { tf: "1Y", signal: price_trend === "Tăng mạnh" ? "B" : price_trend === "Giảm" ? "S" : "N" },
          ].map(({ tf, signal }) => {
            const color = signal === "B" ? "#7CFF3B" : signal === "S" ? "#FF5A76" : "#FFB020";
            const label = signal === "B" ? "Tăng" : signal === "S" ? "Giảm" : "TB";
            return (
              <div key={tf} className="text-center p-3 rounded-xl border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.02] transition-colors">
                <p className="text-[10px] text-slate-600 mb-1.5">{tf}</p>
                <div className="w-3.5 h-3.5 rounded-full mx-auto mb-1.5" style={{ background: color, boxShadow: `0 0 10px ${color}50` }} />
                <p className="text-[10px] font-bold" style={{ color }}>{label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ SECTION 6: AI VERDICT ═══ */}
      <div className="card p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Brain className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white">Phân tích kỹ thuật AI</h3>
            <span className="text-[10px] text-slate-600">AI Technical Analysis</span>
          </div>
          <span className="px-3 py-1.5 rounded-xl text-xs font-bold border" style={{ background: `${scoreColor}12`, color: scoreColor, borderColor: `${scoreColor}25` }}>
            {gl(techScore)}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {strengths.length > 0 && (
            <div className="bg-white/[0.01] rounded-xl p-4 border border-white/[0.03]">
              <p className="text-[10px] font-semibold text-profit uppercase tracking-wider mb-3 flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> Tín hiệu tích cực</p>
              {strengths.map((s, i) => (
                <div key={i} className="flex items-center gap-2 mb-2 last:mb-0">
                  <s.icon className="w-3 h-3 text-profit shrink-0" />
                  <span className="text-xs text-slate-400">{s.title}: {s.sub}</span>
                </div>
              ))}
            </div>
          )}
          {concerns.length > 0 && (
            <div className="bg-white/[0.01] rounded-xl p-4 border border-white/[0.03]">
              <p className="text-[10px] font-semibold text-warn uppercase tracking-wider mb-3 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Cần theo dõi</p>
              {concerns.map((c, i) => (
                <div key={i} className="flex items-center gap-2 mb-2 last:mb-0">
                  <c.icon className="w-3 h-3 text-warn shrink-0" />
                  <span className="text-xs text-slate-400">{c.title}: {c.sub}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PremiumGauge({ value, color, label }: { value: number; color: string; label: string }) {
  const r = 52; const circ = 2 * Math.PI * r;
  const arcLen = circ * 0.75;
  const filled = arcLen * (Math.max(0, Math.min(100, value)) / 100);
  const gradId = `techGrad-${value}`;
  return (
    <svg viewBox="0 0 128 112" className="w-[170px] h-[150px]">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FF5A76" />
          <stop offset="50%" stopColor="#FFB020" />
          <stop offset="100%" stopColor="#7CFF3B" />
        </linearGradient>
        <filter id="gaugeGlow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10"
        strokeDasharray={`${arcLen} ${circ - arcLen}`} strokeLinecap="round" transform="rotate(135 64 64)" />
      <circle cx="64" cy="64" r={r} fill="none" stroke={`url(#${gradId})`} strokeWidth="10"
        strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round" transform="rotate(135 64 64)"
        filter="url(#gaugeGlow)" className="transition-all duration-1000" />
      <text x="64" y="58" textAnchor="middle" fill="white" fontSize="30" fontWeight="800" fontFamily="JetBrains Mono, monospace">{value}</text>
      <text x="64" y="76" textAnchor="middle" fill={color} fontSize="11" fontWeight="700" letterSpacing="0.5">{label}</text>
      <text x="64" y="92" textAnchor="middle" fill="rgba(148,163,184,0.5)" fontSize="8">{value}/100</text>
    </svg>
  );
}

function BreakdownBar({ label, value }: { label: string; value: number }) {
  const color = gc(value);
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] text-slate-500 w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-[10px] font-mono font-semibold w-7 text-right" style={{ color }}>{value}</span>
    </div>
  );
}

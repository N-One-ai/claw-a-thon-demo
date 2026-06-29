"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, ResponsiveContainer, YAxis,
} from "recharts";
import {
  TrendingUp, TrendingDown, Target, Shield, Activity,
  Gauge, ChevronUp, ChevronDown, Minus,
} from "lucide-react";
import type { AnalysisResponse } from "@/types/analysis";
import { computeInvestmentScore, riskBg, labelColor, cn } from "@/lib/utils";
import { translateSector } from "@/lib/sectors";
import { useTranslation } from "@/hooks/useTranslation";
import type { Translations } from "@/locales/types";

// ── Premium card wrapper ───────────────────────────────────────────────────────

const CARD = "card card-hover p-4 sm:p-5";

// ── Recommendation mapping ─────────────────────────────────────────────────────

function getRec(label: string, t: Translations) {
  const m: Record<string, { text: string; cls: string }> = {
    "Rất hấp dẫn": { text: t.kpi.recStrongBuy, cls: "bg-profit/15 text-profit border-profit/30" },
    "Hấp dẫn":     { text: t.kpi.recBuy,       cls: "bg-profit/10 text-profit border-profit/25" },
    "Trung lập":   { text: t.kpi.recHold,      cls: "bg-warn/10 text-warn border-warn/25" },
    "Đắt":         { text: t.kpi.recSell,      cls: "bg-loss/10 text-loss border-loss/25" },
    "Rất đắt":     { text: t.kpi.recStrongSell, cls: "bg-loss/15 text-loss border-loss/30" },
  };
  return m[label] ?? null;
}

// ── Circular score gauge ───────────────────────────────────────────────────────

function ScoreGauge({ value, size = 96, color }: { value: number; size?: number; color: string }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const offset = circ - (circ * Math.min(100, Math.max(0, value))) / 100;
  return (
    <svg viewBox="0 0 96 96" width={size} height={size} className="shrink-0">
      <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
      <circle
        cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="6"
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
        transform="rotate(-90 48 48)" className="transition-all duration-700"
        style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
      />
      <text x="48" y="44" textAnchor="middle" fill="white" fontSize="22" fontWeight="800" fontFamily="JetBrains Mono, monospace">
        {value}
      </text>
      <text x="48" y="60" textAnchor="middle" fill="rgba(148,163,184,0.7)" fontSize="9" fontWeight="500">
        /100
      </text>
    </svg>
  );
}

// ── Risk meter gauge (half circle) ─────────────────────────────────────────────

function RiskMeter({ score, size = 80 }: { score: number; size?: number }) {
  const color = score >= 65 ? "#2DFF7A" : score >= 40 ? "#FFB020" : "#FF4D6D";
  const r = 32;
  const circ = Math.PI * r;
  const filled = (circ * Math.min(100, Math.max(0, score))) / 100;
  return (
    <svg viewBox="0 0 80 48" width={size} height={size * 0.6} className="shrink-0">
      <path d="M 8 44 A 32 32 0 0 1 72 44" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" strokeLinecap="round" />
      <path d="M 8 44 A 32 32 0 0 1 72 44" fill="none" stroke={color} strokeWidth="5"
        strokeLinecap="round" strokeDasharray={`${filled} ${circ}`}
        className="transition-all duration-700"
        style={{ filter: `drop-shadow(0 0 4px ${color}50)` }}
      />
      <text x="40" y="40" textAnchor="middle" fill="white" fontSize="14" fontWeight="700" fontFamily="JetBrains Mono, monospace">
        {score}
      </text>
    </svg>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  data: AnalysisResponse;
}

export function ExecutiveSummary({ data }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { t, formatCurrency, formatPercent, translateLabel } = useTranslation();
  const { valuation: v, risk: r, technical: tech, company } = data;
  const price = data.current_price;
  const discount = v?.discount_pct ?? null;
  const riskLevel = r?.overall_risk ?? "—";

  const investScore = discount != null && riskLevel !== "—"
    ? computeInvestmentScore(discount, riskLevel)
    : null;

  const scoreColor = investScore != null
    ? investScore >= 70 ? "#2DFF7A" : investScore >= 50 ? "#A3FF12" : investScore >= 30 ? "#FFB020" : "#FF4D6D"
    : "#475569";

  const rec = v?.label ? getRec(v.label, t) : null;

  const riskScore = useMemo(() => {
    if (!r) return 50;
    const m: Record<string, number> = { "Thấp": 82, LOW: 82, "Trung bình": 55, MEDIUM: 55, "Cao": 30, HIGH: 30, "Rất cao": 12, VERY_HIGH: 12 };
    return m[r.overall_risk] ?? 50;
  }, [r]);

  const sparkData = useMemo(() => {
    const raw = tech?.chart_data;
    if (!raw || raw.length < 10) return null;
    return raw.slice(-30).map(d => ({ p: d.close }));
  }, [tech]);

  const sparkUp = sparkData && sparkData.length >= 2
    ? sparkData[sparkData.length - 1].p >= sparkData[0].p
    : true;

  const trendIcon = tech?.price_trend === "Tăng mạnh"
    ? <ChevronUp className="w-3.5 h-3.5 text-profit" />
    : tech?.price_trend === "Giảm"
      ? <ChevronDown className="w-3.5 h-3.5 text-loss" />
      : <Minus className="w-3.5 h-3.5 text-slate-500" />;

  return (
    <div className="animate-slide-up space-y-4">
      {/* ── Company header ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-mono font-extrabold text-2xl text-white tracking-tight">{company.ticker}</span>
        <span className="text-slate-400 text-sm font-medium">{company.name}</span>
        <span className="text-[10px] text-slate-600 border border-border rounded-md px-2 py-0.5 uppercase tracking-wider">
          {company.exchange} · {translateSector(company.sector)}
        </span>
        {rec && (
          <span className={cn("ml-auto px-3 py-1.5 rounded-xl text-xs font-bold tracking-wider border", rec.cls)}>
            ▶ {rec.text}
          </span>
        )}
      </div>

      {/* ── 4-card executive row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

        {/* ─ Card 1: Investment Score ─ */}
        <div className={CARD}>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-accent" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t.kpi.investmentScore}</span>
          </div>
          <div className="flex items-center gap-4">
            <ScoreGauge value={investScore ?? 0} size={88} color={scoreColor} />
            <div className="flex flex-col gap-1.5 min-w-0">
              {rec && (
                <span className={cn("inline-flex self-start px-2 py-0.5 rounded-md text-[10px] font-bold border", rec.cls)}>
                  {rec.text}
                </span>
              )}
              <div className="flex items-center gap-1 text-xs text-slate-500">
                {trendIcon}
                <span>{tech ? translateLabel(tech.price_trend) : "—"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─ Card 2: Fair Value + Sparkline ─ */}
        <div className={CARD}>
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-accent" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t.kpi.fairValue}</span>
          </div>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xl font-extrabold font-mono text-accent truncate">
                {v ? formatCurrency(v.consensus_value) : "—"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                vs {price != null ? formatCurrency(price) : "—"}
              </p>
              {discount != null && (
                <p className={cn("text-sm font-bold font-mono mt-1", discount > 0 ? "text-profit" : "text-loss")}>
                  {discount > 0
                    ? <TrendingUp className="w-3.5 h-3.5 inline mr-0.5 -mt-0.5" />
                    : <TrendingDown className="w-3.5 h-3.5 inline mr-0.5 -mt-0.5" />}
                  {formatPercent(discount)}
                </p>
              )}
            </div>
            {/* Mini sparkline */}
            {mounted && sparkData && (
              <div className="w-20 h-10 shrink-0 opacity-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={sparkUp ? "#2DFF7A" : "#FF4D6D"} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={sparkUp ? "#2DFF7A" : "#FF4D6D"} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <YAxis domain={["dataMin", "dataMax"]} hide />
                    <Area type="monotone" dataKey="p" stroke={sparkUp ? "#2DFF7A" : "#FF4D6D"} strokeWidth={1.5} fill="url(#sparkGrad)" dot={false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* ─ Card 3: Expected Return (scenarios) ─ */}
        <div className={CARD}>
          <div className="flex items-center gap-2 mb-3">
            <Gauge className="w-4 h-4 text-accent" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t.tabs.scenarios}</span>
          </div>
          {v?.scenarios?.length ? (
            <div className="space-y-2.5">
              {v.scenarios.map((s) => {
                const upside = ((s.fair_value - (price ?? 0)) / (price ?? 1)) * 100;
                const isPos = upside > 0;
                const barW = Math.min(100, Math.max(5, 30 + upside * 0.5));
                const barColor = s.name === "Bi quan" ? "#FF4D6D" : s.name === "Lạc quan" ? "#2DFF7A" : "#A3FF12";
                return (
                  <div key={s.name} className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 w-14 shrink-0 truncate">{translateLabel(s.name)}</span>
                    <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${barW}%`, background: barColor }} />
                    </div>
                    <span className={cn("text-[11px] font-mono font-semibold w-14 text-right", isPos ? "text-profit" : "text-loss")}>
                      {isPos ? "+" : ""}{upside.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
              <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between">
                <span className="text-[10px] text-slate-600">PWV</span>
                <span className="text-xs font-mono font-bold text-accent">{formatCurrency(v.probability_weighted_value)}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-600">—</p>
          )}
        </div>

        {/* ─ Card 4: Risk Score ─ */}
        <div className={CARD}>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-accent" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t.kpi.riskLevel}</span>
          </div>
          <div className="flex items-center gap-3">
            <RiskMeter score={riskScore} size={76} />
            <div className="flex-1 min-w-0">
              {riskLevel !== "—" && (
                <span className={cn("inline-flex px-2.5 py-1 rounded-lg text-xs font-bold border mb-1.5", riskBg(riskLevel))}>
                  {translateLabel(riskLevel)}
                </span>
              )}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                {r?.beta != null && (
                  <MetricDot label="Beta" value={r.beta.toFixed(2)} />
                )}
                {r?.annualized_volatility_pct != null && (
                  <MetricDot label="Vol" value={`${r.annualized_volatility_pct.toFixed(0)}%`} />
                )}
                {r?.debt_to_equity != null && (
                  <MetricDot label="D/E" value={r.debt_to_equity.toFixed(2)} />
                )}
                {r?.interest_coverage != null && (
                  <MetricDot label="Cov" value={`${r.interest_coverage.toFixed(1)}×`} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Technical quick strip ── */}
      {tech && (
        <div className="card flex items-center text-xs overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-4 sm:gap-6 px-4 sm:px-5 py-3 w-full">
            <span className="text-slate-600 uppercase tracking-wider text-[10px] font-semibold shrink-0">{t.kpi.technical}</span>
            <TechChip label="RSI" value={tech.rsi_14?.toFixed(0) ?? "—"} sub={translateLabel(tech.rsi_label)} />
            <Sep />
            <TechChip label="MACD" value={translateLabel(tech.macd_label)} />
            <Sep />
            <TechChip label={t.kpi.trend} value={translateLabel(tech.price_trend)} />
            {tech.position_52w_pct != null && (
              <>
                <Sep />
                <TechChip label={t.kpi.week52} value={`${tech.position_52w_pct.toFixed(0)}%`} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tiny sub-components ────────────────────────────────────────────────────────

function MetricDot({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-slate-600">{label}</span>
      <span className="font-mono font-medium text-slate-300">{value}</span>
    </div>
  );
}

function TechChip({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-slate-600 text-[10px] uppercase tracking-wider">{label}</span>
      <span className="text-slate-300 font-mono font-medium">{value}</span>
      {sub && <span className="text-slate-600 text-[10px]">({sub})</span>}
    </div>
  );
}

function Sep() {
  return <div className="w-px h-4 bg-white/[0.06]" />;
}

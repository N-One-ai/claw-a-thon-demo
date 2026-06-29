"use client";

import { useState, useEffect } from "react";
import type { AnalysisResponse } from "@/types/analysis";
import { formatNumber, cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import {
  Shield, TrendingUp, TrendingDown, Minus, Wallet, Activity, Building2,
  HeartPulse, AlertTriangle, CheckCircle, Brain,
} from "lucide-react";

const TT: React.CSSProperties = {
  background: "var(--bg-card)", border: "1px solid var(--card-border)",
  borderRadius: 12, fontSize: 11, color: "#E2E8F0",
};

// ── Main Component ─────────────────────────────────────────────────────────────

export function FinancialHealthSection({ data }: { data: AnalysisResponse }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { risk } = data;
  const { t, translateLabel } = useTranslation();

  const de = risk?.debt_to_equity;
  const coverage = risk?.interest_coverage;
  const beta = risk?.beta;
  const stability = risk?.earnings_stability;
  const flags = risk?.flags ?? [];

  // Scores
  const deScore = de != null ? Math.max(0, Math.min(100, 100 - de * 30)) : null;
  const covScore = coverage != null ? Math.min(100, coverage * 8) : null;
  const betaScore = beta != null ? Math.max(0, 100 - Math.abs(beta - 1) * 40) : null;
  const stabScore = stability === "Cao" ? 85 : stability === "Trung bình" ? 55 : stability ? 25 : null;

  const allScores = [deScore, covScore, betaScore, stabScore].filter((s): s is number => s != null);
  const healthScore = allScores.length > 0
    ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    : null;
  const healthColor = healthScore != null ? (healthScore >= 65 ? "#7CFF3B" : healthScore >= 40 ? "#FFB020" : "#FF5A76") : "#475569";
  const healthLabel = healthScore != null ? (healthScore >= 65 ? t.health.good : healthScore >= 40 ? t.health.medium : t.health.weak) : "—";

  // Insights
  const insights: Array<{ text: string; positive: boolean }> = [];
  if (de != null && de < 1) insights.push({ text: t.health.lowLeverage, positive: true });
  if (de != null && de >= 2) insights.push({ text: t.health.highLeverage, positive: false });
  if (coverage != null && coverage > 5) insights.push({ text: t.health.goodCoverage, positive: true });
  if (coverage != null && coverage < 2) insights.push({ text: t.health.highCoverageRisk, positive: false });
  if (beta != null && beta < 1) insights.push({ text: t.health.lowVolatility, positive: true });
  if (beta != null && beta > 1.5) insights.push({ text: t.health.highVolatility, positive: false });
  if (stability === "Cao") insights.push({ text: t.health.stableEarnings, positive: true });
  if (stability === "Thấp") insights.push({ text: t.health.unstableEarnings, positive: false });

  // Radar data
  const radarData = [
    { axis: "Nợ/Vốn", score: deScore ?? 50 },
    { axis: "Trả lãi", score: covScore ?? 50 },
    { axis: "Beta", score: betaScore ?? 50 },
    { axis: "Ổn định", score: stabScore ?? 50 },
    { axis: "Tổng", score: healthScore ?? 50 },
  ];

  // Bar comparison data
  const compData = [
    { metric: "D/E", company: de ?? 0, industry: 1.2 },
    { metric: "Cov", company: coverage ?? 0, industry: 4.0 },
    { metric: "Beta", company: beta ?? 1, industry: 1.0 },
  ];

  const metrics = [
    {
      icon: Wallet, label: t.health.debtEquity,
      value: de != null ? formatNumber(de) : "—",
      score: deScore, color: gradeColor(deScore),
      desc: de != null ? (de < 1 ? t.health.lowLeverage : de < 2 ? t.health.medLeverage : t.health.highLeverage) : t.health.noData,
      trend: (de != null ? (de < 1.5 ? "up" : "down") : "neutral") as "up" | "down" | "neutral",
    },
    {
      icon: Shield, label: t.health.interestCoverage,
      value: coverage != null ? `${formatNumber(coverage)}×` : "—",
      score: covScore, color: gradeColor(covScore),
      desc: coverage != null ? (coverage > 5 ? t.health.goodCoverage : coverage > 2 ? t.health.medCoverage : t.health.highCoverageRisk) : t.health.noData,
      trend: (coverage != null ? (coverage > 3 ? "up" : "down") : "neutral") as "up" | "down" | "neutral",
    },
    {
      icon: Activity, label: t.health.betaVsIndex,
      value: beta != null ? formatNumber(beta) : "—",
      score: betaScore, color: gradeColor(betaScore),
      desc: beta != null ? (beta < 0.8 ? t.health.lowVolatility : beta < 1.2 ? t.health.medVolatility : t.health.highVolatility) : t.health.noData,
      trend: (beta != null ? (beta < 1.2 ? "up" : "down") : "neutral") as "up" | "down" | "neutral",
    },
    {
      icon: HeartPulse, label: t.health.earningsStability,
      value: stability ? translateLabel(stability) : "—",
      score: stabScore, color: gradeColor(stabScore),
      desc: stability === "Cao" ? t.health.stableEarnings : stability === "Trung bình" ? t.health.medEarnings : t.health.unstableEarnings,
      trend: (stability === "Cao" ? "up" : "neutral") as "up" | "down" | "neutral",
    },
  ];

  return (
    <div className="space-y-3 animate-slide-up">

      {/* ═══ SECTION 1: KPI CARDS ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="card card-hover p-4 sm:p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${m.color}12`, color: m.color }}>
                  <m.icon className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{m.label}</span>
              </div>
              <Badge trend={m.trend} color={m.color} />
            </div>
            <p className="text-2xl font-mono font-extrabold text-white mb-2">{m.value}</p>
            {m.score != null && (
              <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden mb-2">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${m.score}%`, background: m.color }} />
              </div>
            )}
            <p className="text-[11px] text-slate-500 leading-relaxed">{m.desc}</p>
          </div>
        ))}
      </div>

      {/* ═══ SECTION 2: HEALTH SCORE + INSIGHTS ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

        {/* Health gauge */}
        <div className="card p-5 sm:p-6 flex flex-col sm:flex-row items-center gap-6">
          <div className="shrink-0">
            <HealthGauge value={healthScore ?? 0} color={healthColor} label={healthLabel} />
          </div>
          <div className="flex-1 space-y-3">
            <h3 className="text-sm font-semibold text-white">Sức khỏe doanh nghiệp</h3>
            {insights.slice(0, 5).map((ins, i) => (
              <div key={i} className="flex items-start gap-2">
                {ins.positive
                  ? <CheckCircle className="w-3.5 h-3.5 text-profit mt-0.5 shrink-0" />
                  : <AlertTriangle className="w-3.5 h-3.5 text-warn mt-0.5 shrink-0" />}
                <span className="text-xs text-slate-400 leading-relaxed">{ins.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Radar */}
        {mounted && (
          <div className="card p-5">
            <SectionHeader icon={Building2} title="So sánh ngành" color="blue" className="mb-3" />
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgba(255,255,255,0.05)" />
                  <PolarAngleAxis dataKey="axis" tick={{ fill: "#64748b", fontSize: 9 }} />
                  <Radar dataKey="score" stroke={healthColor} fill={healthColor} fillOpacity={0.10} strokeWidth={1.5} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* ═══ SECTION 3: INDUSTRY COMPARISON BAR ═══ */}
      {mounted && (
        <div className="card p-5">
          <SectionHeader icon={Building2} title="So sánh với trung bình ngành" color="blue" />
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compData} barGap={4} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                <CartesianGrid strokeDasharray="3 0" stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis dataKey="metric" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "#475569" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TT} />
                <Bar dataKey="company" name="Công ty" radius={[4, 4, 0, 0]} barSize={20}>
                  {compData.map((_, i) => <Cell key={i} fill="#7CFF3B" fillOpacity={0.8} />)}
                </Bar>
                <Bar dataKey="industry" name="TB ngành" radius={[4, 4, 0, 0]} fill="#475569" fillOpacity={0.5} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ═══ SECTION 4: RISK WARNINGS ═══ */}
      {flags.length > 0 && (
        <div className="card p-5">
          <SectionHeader icon={AlertTriangle} title={t.health.flagsTitle} color="red" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {flags.map((f, i) => {
              const isHigh = f.severity === "Cao" || f.severity === "HIGH";
              const isMed = f.severity === "Trung bình" || f.severity === "MEDIUM";
              const color = isHigh ? "#FF5A76" : isMed ? "#FFB020" : "#7CFF3B";
              const Icon = isHigh ? AlertTriangle : isMed ? AlertTriangle : CheckCircle;
              return (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-white/[0.04] bg-white/[0.01]">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}12`, color }}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color }}>{f.severity}</span>
                    <p className="text-xs text-slate-400 leading-relaxed mt-0.5">{f.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ SECTION 5: AI SUMMARY ═══ */}
      {risk?.risk_summary && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center">
              <Brain className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">{t.health.riskSummaryTitle}</h3>
              <span className="text-[10px] text-slate-600">AI Analysis</span>
            </div>
            {healthScore != null && (
              <span className="ml-auto text-xs font-bold px-2.5 py-1 rounded-lg border" style={{
                background: `${healthColor}12`, color: healthColor, borderColor: `${healthColor}25`,
              }}>
                {healthLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">{risk.risk_summary}</p>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function gradeColor(score: number | null): string {
  if (score == null) return "#475569";
  if (score >= 65) return "#7CFF3B";
  if (score >= 40) return "#FFB020";
  return "#FF5A76";
}

function Badge({ trend, color }: { trend: "up" | "down" | "neutral"; color: string }) {
  const Icon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  return (
    <div className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg" style={{ background: `${color}12`, color }}>
      <Icon className="w-3 h-3" />
    </div>
  );
}

function HealthGauge({ value, color, label }: { value: number; color: string; label: string }) {
  const r = 50;
  const circ = 2 * Math.PI * r;
  const arcLen = circ * 0.75;
  const filled = arcLen * (Math.max(0, Math.min(100, value)) / 100);
  return (
    <svg viewBox="0 0 128 110" className="w-[160px] h-[136px]">
      <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8"
        strokeDasharray={`${arcLen} ${circ - arcLen}`} strokeLinecap="round" transform="rotate(135 64 64)" />
      <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round" transform="rotate(135 64 64)"
        className="transition-all duration-700" style={{ filter: `drop-shadow(0 0 6px ${color}40)` }} />
      <text x="64" y="58" textAnchor="middle" fill="white" fontSize="26" fontWeight="800" fontFamily="JetBrains Mono, monospace">{value}</text>
      <text x="64" y="78" textAnchor="middle" fill={color} fontSize="10" fontWeight="600">{label}</text>
    </svg>
  );
}

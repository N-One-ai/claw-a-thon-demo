"use client";

import { useEffect, useState, useMemo } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  LineChart, Line,
} from "recharts";
import type { RiskProfile } from "@/types/analysis";
import { cn } from "@/lib/utils";
import {
  Shield, ShieldCheck, ShieldAlert, Activity, Wallet, Gauge,
  TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle,
  Brain, Zap, ChevronRight, BarChart3, Radar as RadarIcon, Building2, Grid3x3,
} from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useTranslation } from "@/hooks/useTranslation";

// ── Score helpers (unchanged logic) ────────────────────────────────────────────

function scoreFromBeta(b: number) { return b < 0.5 ? 92 : b < 0.8 ? 82 : b < 1 ? 72 : b < 1.2 ? 60 : b < 1.5 ? 42 : b < 2 ? 28 : 15; }
function scoreFromDE(d: number) { return d < 0.3 ? 92 : d < 0.5 ? 82 : d < 1 ? 70 : d < 1.5 ? 52 : d < 2 ? 35 : 18; }
function scoreFromCoverage(c: number) { return c < 0 ? 5 : c < 1 ? 15 : c < 1.5 ? 28 : c < 3 ? 48 : c < 5 ? 65 : c < 10 ? 82 : 92; }
function scoreFromStability(s: string) { return s === "Cao" ? 88 : s === "Trung bình" ? 55 : 25; }
function scoreFromVolatility(v: number) { return v < 15 ? 92 : v < 25 ? 78 : v < 35 ? 62 : v < 45 ? 45 : v < 55 ? 30 : 18; }
function gc(s: number) { return s >= 65 ? "#7CFF3B" : s >= 40 ? "#FFB020" : "#FF5A76"; }
function gl(s: number) { return s >= 65 ? "An toàn" : s >= 40 ? "TB" : "Cao"; }

const TT: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: 12, fontSize: 11, color: "#E2E8F0" };

// ── Component ──────────────────────────────────────────────────────────────────

interface Props { risk: RiskProfile; ticker?: string }

export function RiskSection({ risk, ticker = "—" }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { t, translateLabel } = useTranslation();
  const tr = t.risk;

  // Build metrics
  const metrics = useMemo(() => {
    const m: Array<{ key: string; icon: React.ElementType; label: string; value: string; score: number; raw: number }> = [];
    if (risk.beta != null) m.push({ key: "beta", icon: Activity, label: tr.metricBeta, value: risk.beta.toFixed(2), score: scoreFromBeta(risk.beta), raw: risk.beta });
    if (risk.debt_to_equity != null) m.push({ key: "de", icon: Wallet, label: tr.metricDE, value: risk.debt_to_equity.toFixed(2), score: scoreFromDE(risk.debt_to_equity), raw: risk.debt_to_equity });
    if (risk.interest_coverage != null) m.push({ key: "cov", icon: Shield, label: tr.metricCoverage, value: `${risk.interest_coverage.toFixed(1)}×`, score: scoreFromCoverage(risk.interest_coverage), raw: risk.interest_coverage });
    if (risk.earnings_stability) m.push({ key: "stab", icon: BarChart3, label: tr.metricStability, value: translateLabel(risk.earnings_stability), score: scoreFromStability(risk.earnings_stability), raw: scoreFromStability(risk.earnings_stability) });
    if (risk.annualized_volatility_pct != null) m.push({ key: "vol", icon: Zap, label: tr.metricVolatility, value: `${risk.annualized_volatility_pct.toFixed(1)}%`, score: scoreFromVolatility(risk.annualized_volatility_pct), raw: risk.annualized_volatility_pct });
    return m;
  }, [risk, tr, translateLabel]);

  const weights: Record<string, number> = { beta: 0.20, de: 0.25, cov: 0.20, stab: 0.20, vol: 0.15 };
  const overallScore = metrics.length
    ? Math.round(metrics.reduce((s, m) => s + m.score * (weights[m.key] ?? 0.20), 0) / metrics.reduce((w, m) => w + (weights[m.key] ?? 0.20), 0))
    : 50;
  const overallColor = gc(overallScore);
  const overallLabel = overallScore >= 78 ? tr.verySafe : overallScore >= 62 ? tr.safe : overallScore >= 45 ? tr.medium : overallScore >= 30 ? tr.risky : tr.highRisk;

  // Explanation
  const explanation = useMemo(() => {
    const parts = [tr.explainOpening(ticker, translateLabel(risk.overall_risk), overallScore)];
    if (risk.beta != null) parts.push(risk.beta < 0.8 ? tr.explainBetaLow(risk.beta) : risk.beta < 1.2 ? tr.explainBetaMed(risk.beta) : tr.explainBetaHigh(risk.beta));
    if (risk.debt_to_equity != null) parts.push(risk.debt_to_equity < 0.5 ? tr.explainDELow(risk.debt_to_equity) : risk.debt_to_equity < 1.5 ? tr.explainDEMed(risk.debt_to_equity) : tr.explainDEHigh(risk.debt_to_equity));
    if (risk.interest_coverage != null && risk.interest_coverage > 0) parts.push(risk.interest_coverage > 10 ? tr.explainCovHigh(risk.interest_coverage) : risk.interest_coverage > 3 ? tr.explainCovMed(risk.interest_coverage) : tr.explainCovLow(risk.interest_coverage));
    if (risk.earnings_stability) parts.push(risk.earnings_stability === "Cao" ? tr.explainStabilityHigh : risk.earnings_stability === "Trung bình" ? tr.explainStabilityMed : tr.explainStabilityLow);
    if (risk.annualized_volatility_pct != null) { const v = risk.annualized_volatility_pct; parts.push(v < 25 ? tr.explainVolLow(v) : v < 40 ? tr.explainVolMed(v) : tr.explainVolHigh(v)); }
    return parts.join(" ");
  }, [risk, ticker, tr, overallScore, translateLabel]);

  const radarData = metrics.map(m => ({ axis: m.label, score: m.score }));
  const flags = risk.flags ?? [];

  // Insights
  const strengths = metrics.filter(m => m.score >= 65);
  const concerns = metrics.filter(m => m.score < 65);

  // Heatmap data
  const heatmap = metrics.map(m => ({ label: m.label, score: m.score, level: m.score >= 80 ? "Rất thấp" : m.score >= 65 ? "Thấp" : m.score >= 45 ? "TB" : m.score >= 30 ? "Cao" : "Rất cao" }));

  // Bar comparison
  const barData = [
    risk.beta != null ? { metric: "Beta", company: risk.beta, industry: 1.0 } : null,
    risk.debt_to_equity != null ? { metric: "D/E", company: risk.debt_to_equity, industry: 1.2 } : null,
    risk.interest_coverage != null ? { metric: "Cov", company: Math.min(risk.interest_coverage, 15), industry: 4.0 } : null,
    risk.annualized_volatility_pct != null ? { metric: "Vol%", company: risk.annualized_volatility_pct, industry: 30 } : null,
  ].filter(Boolean) as Array<{ metric: string; company: number; industry: number }>;

  return (
    <div className="space-y-3 animate-slide-up">

      {/* ═══ SECTION 1: RISK OVERVIEW ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {/* Gauge */}
        <div className="md:col-span-2 card p-5 sm:p-6 flex flex-col items-center justify-center gap-3">
          <RiskGauge value={overallScore} color={overallColor} label={overallLabel} />
          <span className={cn("px-3 py-1 rounded-xl text-xs font-bold border",
            overallScore >= 65 ? "bg-profit/10 text-profit border-profit/20" : overallScore >= 40 ? "bg-warn/10 text-warn border-warn/20" : "bg-loss/10 text-loss border-loss/20"
          )}>
            {tr.overallRisk} {translateLabel(risk.overall_risk)}
          </span>
        </div>

        {/* AI Summary */}
        <div className="md:col-span-3 card p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-lg font-semibold text-white font-mono">{ticker}</h2>
            <span className="text-[10px] text-slate-600">{tr.safetyScore}: {overallScore}/100</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {strengths.map(m => (
              <div key={m.key} className="flex items-start gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-profit mt-0.5 shrink-0" />
                <span className="text-xs text-slate-400">{m.label}: {m.value} — {gl(m.score)}</span>
              </div>
            ))}
            {concerns.map(m => (
              <div key={m.key} className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-warn mt-0.5 shrink-0" />
                <span className="text-xs text-slate-400">{m.label}: {m.value} — {gl(m.score)}</span>
              </div>
            ))}
          </div>
          {risk.risk_summary && <p className="text-xs text-slate-500 leading-relaxed border-t border-white/[0.04] pt-3">{risk.risk_summary}</p>}
        </div>
      </div>

      {/* ═══ SECTION 2: RISK KPI CARDS ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {metrics.map(m => (
          <div key={m.key} className="card card-hover p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${gc(m.score)}12`, color: gc(m.score) }}>
                <m.icon className="w-3.5 h-3.5" />
              </div>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${gc(m.score)}15`, color: gc(m.score) }}>{gl(m.score)}</span>
            </div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{m.label}</p>
            <p className="text-xl font-mono font-extrabold text-white mb-2">{m.value}</p>
            <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${m.score}%`, background: gc(m.score) }} />
            </div>
          </div>
        ))}
      </div>

      {/* ═══ SECTION 3: RADAR + HEATMAP ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Radar */}
        {mounted && radarData.length >= 3 && (
          <div className="card p-5">
            <SectionHeader icon={RadarIcon} title={tr.radarTitle} color="purple" className="mb-3" />
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgba(255,255,255,0.05)" />
                  <PolarAngleAxis dataKey="axis" tick={{ fill: "#64748b", fontSize: 9 }} />
                  <Radar dataKey="score" stroke={overallColor} fill={overallColor} fillOpacity={0.10} strokeWidth={1.5} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-slate-600 text-center mt-2">{tr.radarHint}</p>
          </div>
        )}

        {/* Heatmap */}
        <div className="card p-5">
          <SectionHeader icon={Grid3x3} title="Risk Heatmap" color="red" />
          <div className="space-y-2">
            {heatmap.map(h => (
              <div key={h.label} className="flex items-center gap-3">
                <span className="text-[11px] text-slate-500 w-16 shrink-0 truncate">{h.label}</span>
                <div className="flex-1 h-8 bg-white/[0.02] rounded-lg overflow-hidden flex items-center px-3 border border-white/[0.03]" style={{ background: `${gc(h.score)}06` }}>
                  <div className="h-3 rounded-full transition-all duration-700" style={{ width: `${h.score}%`, background: gc(h.score) }} />
                </div>
                <span className="text-[10px] font-mono font-semibold w-8 text-right" style={{ color: gc(h.score) }}>{h.score}</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded w-14 text-center" style={{ background: `${gc(h.score)}12`, color: gc(h.score) }}>{h.level}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ SECTION 4: INDUSTRY COMPARISON ═══ */}
      {mounted && barData.length >= 2 && (
        <div className="card p-5">
          <SectionHeader icon={Building2} title="So sánh với ngành" color="blue" />
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} barGap={4} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                <CartesianGrid strokeDasharray="3 0" stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis dataKey="metric" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "#475569" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TT} />
                <Bar dataKey="company" name="Công ty" radius={[4, 4, 0, 0]} barSize={18}>
                  {barData.map((_, i) => <Cell key={i} fill="#7CFF3B" fillOpacity={0.8} />)}
                </Bar>
                <Bar dataKey="industry" name="TB ngành" radius={[4, 4, 0, 0]} fill="#475569" fillOpacity={0.4} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ═══ SECTION 5: ALERT CENTER ═══ */}
      {flags.length > 0 && (
        <div className="card p-5">
          <SectionHeader icon={AlertTriangle} title={tr.warningsTitle} color="red" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {flags.map((f, i) => {
              const isHigh = f.severity === "Cao" || f.severity === "HIGH";
              const isMed = f.severity === "Trung bình" || f.severity === "MEDIUM";
              const color = isHigh ? "#FF5A76" : isMed ? "#FFB020" : "#7CFF3B";
              const Icon = isHigh ? ShieldAlert : isMed ? AlertTriangle : CheckCircle;
              const sev = isHigh ? "Critical" : isMed ? "Medium" : "Low";
              return (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.02] transition-colors">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}12`, color }}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color }}>{sev}</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{f.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ SECTION 6: AI CONCLUSION ═══ */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
            <Brain className="w-4.5 h-4.5 text-accent" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white">{tr.aiTitle}</h3>
            <span className="text-[10px] text-slate-600">AI Risk Analysis</span>
          </div>
          <span className="px-3 py-1.5 rounded-xl text-xs font-bold border" style={{ background: `${overallColor}12`, color: overallColor, borderColor: `${overallColor}25` }}>
            {overallLabel}
          </span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed mb-4">{explanation}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {strengths.length > 0 && (
            <div className="bg-white/[0.01] rounded-xl p-3 border border-white/[0.03]">
              <p className="text-[10px] font-semibold text-profit uppercase tracking-wider mb-2 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Điểm mạnh</p>
              {strengths.map(m => <p key={m.key} className="text-xs text-slate-400 mb-1">• {m.label} ({m.value})</p>)}
            </div>
          )}
          {concerns.length > 0 && (
            <div className="bg-white/[0.01] rounded-xl p-3 border border-white/[0.03]">
              <p className="text-[10px] font-semibold text-warn uppercase tracking-wider mb-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Cần theo dõi</p>
              {concerns.map(m => <p key={m.key} className="text-xs text-slate-400 mb-1">• {m.label} ({m.value})</p>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function RiskGauge({ value, color, label }: { value: number; color: string; label: string }) {
  const r = 50; const circ = 2 * Math.PI * r;
  const arcLen = circ * 0.75;
  const filled = arcLen * (Math.max(0, Math.min(100, value)) / 100);
  return (
    <svg viewBox="0 0 128 110" className="w-[160px] h-[136px]">
      <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8"
        strokeDasharray={`${arcLen} ${circ - arcLen}`} strokeLinecap="round" transform="rotate(135 64 64)" />
      <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round" transform="rotate(135 64 64)"
        className="transition-all duration-700" style={{ filter: `drop-shadow(0 0 6px ${color}40)` }} />
      <text x="64" y="58" textAnchor="middle" fill="white" fontSize="28" fontWeight="800" fontFamily="JetBrains Mono, monospace">{value}</text>
      <text x="64" y="78" textAnchor="middle" fill={color} fontSize="10" fontWeight="600">{label}</text>
    </svg>
  );
}

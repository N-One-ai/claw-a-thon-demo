"use client";

import { useState, useEffect, useMemo } from "react";
import type { AnalysisResponse, DCFScenario } from "@/types/analysis";
import { computeInvestmentScore, riskBg, labelColor, cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import type { Translations } from "@/locales/types";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine,
  AreaChart, Area,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from "recharts";
import {
  TrendingUp, TrendingDown, Target, Shield, Activity, Gauge,
  Brain, BarChart3, Zap, AlertTriangle, CheckCircle, ChevronRight,
} from "lucide-react";
import { CandlestickChart } from "@/components/charts/CandlestickChart";
import { RSIPanel } from "@/components/charts/RSIPanel";
import { AIReport } from "@/components/sections/AIReport";

// ── Design tokens ──────────────────────────────────────────────────────────────

const CARD = "rounded-3xl border border-white/[0.06] p-4 sm:p-6";
const BG: React.CSSProperties = { background: "#131C28", boxShadow: "0 8px 32px rgba(0,0,0,0.25)" };
const TOOLTIP_STYLE = { background: "#0F1319", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, fontSize: 11, color: "#E2E8F0" };
const DONUT_COLORS = ["#A3FF12", "#2DFF7A", "#FFB020", "#FF4D6D"];

// ── Recommendation ─────────────────────────────────────────────────────────────

function getRec(label: string, t: Translations) {
  const m: Record<string, { text: string; cls: string; dot: string }> = {
    "Rất hấp dẫn": { text: t.kpi.recStrongBuy, cls: "bg-profit/15 text-profit border-profit/30", dot: "bg-profit" },
    "Hấp dẫn":     { text: t.kpi.recBuy,       cls: "bg-profit/10 text-profit border-profit/20", dot: "bg-profit" },
    "Trung lập":   { text: t.kpi.recHold,      cls: "bg-warn/10 text-warn border-warn/20",       dot: "bg-warn" },
    "Đắt":         { text: t.kpi.recSell,      cls: "bg-loss/10 text-loss border-loss/20",       dot: "bg-loss" },
    "Rất đắt":     { text: t.kpi.recStrongSell, cls: "bg-loss/15 text-loss border-loss/30",      dot: "bg-loss" },
  };
  return m[label] ?? null;
}

// ── SVG Gauges ─────────────────────────────────────────────────────────────────

function CircleGauge({ value, color, size = 100 }: { value: number; color: string; size?: number }) {
  const r = 40; const circ = 2 * Math.PI * r;
  const offset = circ - (circ * Math.min(100, Math.max(0, value))) / 100;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset} transform="rotate(-90 50 50)"
        className="transition-all duration-700" style={{ filter: `drop-shadow(0 0 6px ${color}40)` }} />
      <text x="50" y="46" textAnchor="middle" fill="white" fontSize="22" fontWeight="800" fontFamily="JetBrains Mono, monospace">{value}</text>
      <text x="50" y="62" textAnchor="middle" fill="rgba(156,163,175,0.6)" fontSize="9">/100</text>
    </svg>
  );
}

function HalfGauge({ value, color, size = 80 }: { value: number; color: string; size?: number }) {
  const r = 32; const halfCirc = Math.PI * r;
  const filled = (halfCirc * Math.min(100, Math.max(0, value))) / 100;
  return (
    <svg viewBox="0 0 80 50" width={size} height={size * 0.625}>
      <path d="M 8 46 A 32 32 0 0 1 72 46" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" strokeLinecap="round" />
      <path d="M 8 46 A 32 32 0 0 1 72 46" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={`${filled} ${halfCirc}`} className="transition-all duration-700"
        style={{ filter: `drop-shadow(0 0 4px ${color}40)` }} />
      <text x="40" y="42" textAnchor="middle" fill="white" fontSize="15" fontWeight="700" fontFamily="JetBrains Mono, monospace">{value}</text>
    </svg>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function AnalysisDashboard({ data }: { data: AnalysisResponse }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { t, formatCurrency, formatPercent, translateLabel } = useTranslation();

  const { valuation: v, risk: r, technical: tech, company } = data;
  const price = data.current_price ?? 0;
  const discount = v?.discount_pct ?? 0;
  const riskLevel = r?.overall_risk ?? "—";
  const investScore = v && riskLevel !== "—" ? computeInvestmentScore(discount, riskLevel) : null;
  const scoreColor = investScore != null ? (investScore >= 70 ? "#2DFF7A" : investScore >= 50 ? "#A3FF12" : investScore >= 30 ? "#FFB020" : "#FF4D6D") : "#475569";
  const rec = v?.label ? getRec(v.label, t) : null;

  const riskScore = useMemo(() => {
    if (!r) return 50;
    const m: Record<string, number> = { "Thấp": 82, LOW: 82, "Trung bình": 55, MEDIUM: 55, "Cao": 30, HIGH: 30, "Rất cao": 12, VERY_HIGH: 12 };
    return m[r.overall_risk] ?? 50;
  }, [r]);
  const riskColor = riskScore >= 65 ? "#2DFF7A" : riskScore >= 40 ? "#FFB020" : "#FF4D6D";

  // Donut data
  const donutData = useMemo(() => {
    if (!v) return [];
    return [
      { name: "P/E", value: v.pe_result.fair_value, weight: v.pe_result.weight, available: v.pe_result.is_available },
      { name: "P/B", value: v.pb_result.fair_value, weight: v.pb_result.weight, available: v.pb_result.is_available },
      { name: "Graham", value: v.graham_result.fair_value, weight: v.graham_result.weight, available: v.graham_result.is_available },
      { name: "DCF", value: v.dcf_result.fair_value, weight: v.dcf_result.weight, available: v.dcf_result.is_available },
    ].filter(d => d.available && d.value != null && d.value > 0);
  }, [v]);

  // Sparkline
  const sparkData = useMemo(() => {
    const raw = tech?.chart_data;
    if (!raw || raw.length < 5) return null;
    return raw.slice(-30).map(d => ({ p: d.close }));
  }, [tech]);
  const sparkUp = sparkData ? sparkData[sparkData.length - 1].p >= sparkData[0].p : true;

  // Scenario data
  const scenarioData = useMemo(() => {
    if (!v?.scenarios?.length) return null;
    return v.scenarios.map(s => ({
      name: translateLabel(s.name),
      rawName: s.name,
      value: s.fair_value,
      upside: ((s.fair_value - price) / price) * 100,
      prob: s.probability * 100,
      scenario: s,
    }));
  }, [v, price, translateLabel]);

  // Risk radar
  const riskRadar = useMemo(() => {
    const items: Array<{ metric: string; score: number }> = [];
    if (r?.beta != null) items.push({ metric: "Beta", score: r.beta < 1 ? 75 : r.beta < 1.5 ? 50 : 25 });
    if (r?.debt_to_equity != null) items.push({ metric: "D/E", score: r.debt_to_equity < 0.5 ? 85 : r.debt_to_equity < 1.5 ? 55 : 20 });
    if (r?.interest_coverage != null) items.push({ metric: "Cov", score: r.interest_coverage > 5 ? 80 : r.interest_coverage > 2 ? 55 : 25 });
    if (r?.earnings_stability) items.push({ metric: "Ổn định", score: r.earnings_stability === "Cao" ? 85 : r.earnings_stability === "Trung bình" ? 55 : 25 });
    if (r?.annualized_volatility_pct != null) items.push({ metric: "Vol", score: r.annualized_volatility_pct < 25 ? 80 : r.annualized_volatility_pct < 40 ? 50 : 20 });
    return items;
  }, [r]);

  const SCENARIO_COLOR: Record<string, string> = { "Bi quan": "#FF4D6D", "Cơ sở": "#A3FF12", "Lạc quan": "#2DFF7A" };

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ═══════════ SECTION 1: EXECUTIVE SUMMARY ═══════════ */}
      <div className={CARD} style={BG}>
        <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
          {/* Left: ticker */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
              <span className="font-mono font-extrabold text-accent text-lg">{company.ticker.slice(0, 2)}</span>
            </div>
            <div>
              <h1 className="font-mono font-extrabold text-xl text-white">{company.ticker}</h1>
              <p className="text-xs text-slate-500">{company.name}</p>
            </div>
          </div>

          {/* Metrics strip */}
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-6">
            <SummaryMetric label={t.valuation.currentPrice} value={formatCurrency(price)} />
            <SummaryMetric label={t.valuation.fairValue} value={v ? formatCurrency(v.consensus_value) : "—"} accent />
            <SummaryMetric label={t.kpi.upsideDownside}
              value={v ? formatPercent(discount) : "—"}
              valueClass={discount > 0 ? "text-profit" : "text-loss"} />
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-600 uppercase tracking-wider">{t.kpi.recommendation}</span>
              {rec ? (
                <span className={cn("inline-flex self-start items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold border", rec.cls)}>
                  <span className={cn("w-2 h-2 rounded-full", rec.dot)} />
                  {rec.text}
                </span>
              ) : <span className="text-slate-600 text-sm">—</span>}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ SECTION 2: KPI OVERVIEW ═══════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Investment Score */}
        <div className={CARD} style={BG}>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-accent" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t.kpi.investmentScore}</span>
          </div>
          <div className="flex items-center gap-3">
            <CircleGauge value={investScore ?? 0} color={scoreColor} size={80} />
            <div>
              {rec && <span className={cn("inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold border", rec.cls)}>{rec.text}</span>}
              <p className="text-[10px] text-slate-600 mt-1">{tech ? translateLabel(tech.price_trend) : "—"}</p>
            </div>
          </div>
        </div>

        {/* Fair Value + sparkline */}
        <div className={CARD} style={BG}>
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-accent" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t.kpi.fairValue}</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xl font-extrabold font-mono text-accent">{v ? formatCurrency(v.consensus_value) : "—"}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">vs {formatCurrency(price)}</p>
              {v && <p className={cn("text-sm font-bold font-mono mt-0.5", discount > 0 ? "text-profit" : "text-loss")}>{formatPercent(discount)}</p>}
            </div>
            {mounted && sparkData && (
              <div className="w-20 h-10 opacity-70">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                    <defs><linearGradient id="spG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={sparkUp ? "#2DFF7A" : "#FF4D6D"} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={sparkUp ? "#2DFF7A" : "#FF4D6D"} stopOpacity={0} />
                    </linearGradient></defs>
                    <YAxis domain={["dataMin", "dataMax"]} hide />
                    <Area type="monotone" dataKey="p" stroke={sparkUp ? "#2DFF7A" : "#FF4D6D"} strokeWidth={1.5} fill="url(#spG)" dot={false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Expected Return */}
        <div className={CARD} style={BG}>
          <div className="flex items-center gap-2 mb-3">
            <Gauge className="w-4 h-4 text-accent" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t.tabs.scenarios}</span>
          </div>
          {v?.scenarios?.length ? (
            <div className="space-y-2">
              {v.scenarios.map(s => {
                const up = ((s.fair_value - price) / price) * 100;
                return (
                  <div key={s.name} className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 w-12 shrink-0 truncate">{translateLabel(s.name)}</span>
                    <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(5, 40 + up * 0.5))}%`, background: SCENARIO_COLOR[s.name] ?? "#475569" }} />
                    </div>
                    <span className={cn("text-[11px] font-mono font-semibold w-12 text-right", up > 0 ? "text-profit" : "text-loss")}>{up > 0 ? "+" : ""}{up.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-sm text-slate-600">—</p>}
        </div>

        {/* Risk Score */}
        <div className={CARD} style={BG}>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-accent" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t.kpi.riskLevel}</span>
          </div>
          <div className="flex items-center gap-3">
            <HalfGauge value={riskScore} color={riskColor} size={72} />
            <div className="space-y-1">
              {riskLevel !== "—" && <span className={cn("inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold border", riskBg(riskLevel))}>{translateLabel(riskLevel)}</span>}
              {r?.beta != null && <p className="text-[10px] text-slate-500">Beta {r.beta.toFixed(2)}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ SECTION 3: VALUATION MODELS ═══════════ */}
      {v && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Donut chart */}
          <div className={CARD} style={BG}>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-4">{t.valuation.models}</h3>
            {mounted && donutData.length > 0 && (
              <div className="flex items-center gap-6">
                <div className="relative w-[150px] h-[150px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donutData} cx="50%" cy="50%" innerRadius={42} outerRadius={65} paddingAngle={3} dataKey="weight" strokeWidth={0}>
                        {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val: number) => [`${(val * 100).toFixed(0)}%`, "Weight"]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-lg font-bold text-white font-mono">{donutData.length}</span>
                    <span className="text-[8px] text-slate-500 uppercase">models</span>
                  </div>
                </div>
                <div className="flex-1 space-y-2.5">
                  {donutData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: DONUT_COLORS[i] }} />
                      <span className="text-xs text-slate-400 flex-1">{d.name}</span>
                      <span className="text-xs font-mono font-semibold text-white">{formatCurrency(d.value!)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Consensus card */}
          <div className={CARD} style={BG}>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-4">{t.valuation.consensus}</h3>
            <div className="space-y-3">
              {donutData.map((d, i) => {
                const upside = ((d.value! - price) / price) * 100;
                return (
                  <div key={d.name} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-5 rounded-full" style={{ background: DONUT_COLORS[i] }} />
                      <span className="text-sm text-slate-300">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono font-semibold text-white text-sm">{formatCurrency(d.value!)}</span>
                      <span className={cn("font-mono text-xs font-bold w-14 text-right", upside > 0 ? "text-profit" : "text-loss")}>
                        {upside > 0 ? "+" : ""}{upside.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                );
              })}
              <div className="pt-2 flex items-center justify-between">
                <span className="text-sm font-bold text-white">{t.valuation.consensus}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-extrabold text-accent">{formatCurrency(v.consensus_value)}</span>
                  <span className={cn("font-mono font-bold text-sm", discount > 0 ? "text-profit" : "text-loss")}>{formatPercent(discount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ SECTION 4: SCENARIO FORECAST ═══════════ */}
      {scenarioData && (
        <div className={CARD} style={BG}>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-4">{t.tabs.scenarios}</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart */}
            {mounted && (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scenarioData} barSize={36}>
                    <CartesianGrid strokeDasharray="3 0" stroke="rgba(255,255,255,0.03)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "#475569" }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} width={40} />
                    <ReferenceLine y={price} stroke="#475569" strokeDasharray="3 3" label={{ value: t.valuation.currentPrice, position: "right", fill: "#475569", fontSize: 9 }} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val: number) => [formatCurrency(val), t.valuation.fairValue]} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {scenarioData.map((s, i) => <Cell key={i} fill={SCENARIO_COLOR[s.rawName] ?? "#475569"} fillOpacity={0.85} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {/* Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {scenarioData.map((s) => (
                <div key={s.rawName} className="rounded-2xl border border-white/[0.06] p-3 sm:p-4" style={{ background: "rgba(255,255,255,0.02)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-300">{s.name}</span>
                    <span className="text-[10px] text-slate-600 bg-white/[0.04] px-2 py-0.5 rounded-full">{s.prob.toFixed(0)}%</span>
                  </div>
                  <p className="font-mono text-lg font-bold" style={{ color: SCENARIO_COLOR[s.rawName] }}>{formatCurrency(s.scenario.fair_value)}</p>
                  <p className={cn("text-xs font-mono font-semibold mt-0.5", s.upside > 0 ? "text-profit" : "text-loss")}>
                    {s.upside > 0 ? "+" : ""}{s.upside.toFixed(1)}%
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ SECTION 5: TECHNICAL ANALYSIS ═══════════ */}
      {tech && (
        <div className={CARD} style={BG}>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-4">{t.tabs.technical}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <SignalCard label="RSI (14)" value={tech.rsi_14?.toFixed(0) ?? "—"} sub={translateLabel(tech.rsi_label)}
              color={tech.rsi_14 != null ? (tech.rsi_14 > 70 ? "#FF4D6D" : tech.rsi_14 < 30 ? "#2DFF7A" : "#A3FF12") : "#475569"}
              pct={tech.rsi_14 ?? 50} />
            <SignalCard label="MACD" value={translateLabel(tech.macd_label)}
              color={tech.macd_label === "Mua" ? "#2DFF7A" : tech.macd_label === "Bán" ? "#FF4D6D" : "#FFB020"} />
            <SignalCard label="SMA 20" value={tech.sma_20 ? formatCurrency(tech.sma_20) : "—"}
              sub={tech.sma_20 && price > tech.sma_20 ? "↑" : "↓"}
              color={tech.sma_20 && price > tech.sma_20 ? "#2DFF7A" : "#FF4D6D"} />
            <SignalCard label="SMA 50" value={tech.sma_50 ? formatCurrency(tech.sma_50) : "—"}
              sub={tech.sma_50 && price > tech.sma_50 ? "↑" : "↓"}
              color={tech.sma_50 && price > tech.sma_50 ? "#2DFF7A" : "#FF4D6D"} />
            <SignalCard label="SMA 200" value={tech.sma_200 ? formatCurrency(tech.sma_200) : "—"}
              sub={tech.sma_200 && price > tech.sma_200 ? "↑" : "↓"}
              color={tech.sma_200 && price > tech.sma_200 ? "#2DFF7A" : "#FF4D6D"} />
            <SignalCard label="52T" value={tech.position_52w_pct != null ? `${tech.position_52w_pct.toFixed(0)}%` : "—"}
              pct={tech.position_52w_pct ?? 50}
              color={tech.position_52w_pct != null ? (tech.position_52w_pct > 70 ? "#FFB020" : tech.position_52w_pct < 30 ? "#2DFF7A" : "#A3FF12") : "#475569"} />
          </div>
          <CandlestickChart data={tech.chart_data} ticker={data.ticker} />
          <div className="mt-3">
            <RSIPanel data={tech.chart_data} />
          </div>
        </div>
      )}

      {/* ═══════════ SECTION 6: RISK DASHBOARD ═══════════ */}
      {r && (
        <div className={CARD} style={BG}>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-4">{t.tabs.risk}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Radar */}
            {mounted && riskRadar.length >= 3 && (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={riskRadar}>
                    <PolarGrid stroke="rgba(255,255,255,0.05)" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: "#64748b", fontSize: 10 }} />
                    <Radar dataKey="score" stroke={riskColor} fill={riskColor} fillOpacity={0.12} strokeWidth={1.5} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}
            {/* Metrics */}
            <div className="space-y-3">
              {r.beta != null && <RiskMetric icon={Activity} label="Beta" value={r.beta.toFixed(2)} score={r.beta < 1 ? 75 : r.beta < 1.5 ? 50 : 25} />}
              {r.debt_to_equity != null && <RiskMetric icon={BarChart3} label={t.risk.metricDE} value={r.debt_to_equity.toFixed(2)} score={r.debt_to_equity < 0.5 ? 85 : r.debt_to_equity < 1.5 ? 55 : 20} />}
              {r.interest_coverage != null && <RiskMetric icon={Shield} label={t.risk.metricCoverage} value={`${r.interest_coverage.toFixed(1)}×`} score={r.interest_coverage > 5 ? 80 : r.interest_coverage > 2 ? 55 : 25} />}
              {r.earnings_stability && <RiskMetric icon={Gauge} label={t.risk.metricStability} value={translateLabel(r.earnings_stability)} score={r.earnings_stability === "Cao" ? 85 : r.earnings_stability === "Trung bình" ? 55 : 25} />}
              {r.annualized_volatility_pct != null && <RiskMetric icon={Zap} label={t.risk.metricVolatility} value={`${r.annualized_volatility_pct.toFixed(1)}%`} score={r.annualized_volatility_pct < 25 ? 80 : r.annualized_volatility_pct < 40 ? 50 : 20} />}
            </div>
          </div>
          {r.risk_summary && (
            <div className="mt-4 pt-4 border-t border-white/[0.06]">
              <p className="text-xs text-slate-400 leading-relaxed">{r.risk_summary}</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ SECTION 7: AI REPORT ═══════════ */}
      <AIReport ticker={data.ticker} initialReport={data.report} data={data} />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SummaryMetric({ label, value, accent, valueClass }: { label: string; value: string; accent?: boolean; valueClass?: string }) {
  return (
    <div>
      <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={cn("text-lg font-extrabold font-mono", accent ? "text-accent" : valueClass ?? "text-white")}>{value}</p>
    </div>
  );
}

function SignalCard({ label, value, sub, color, pct }: { label: string; value: string; sub?: string; color: string; pct?: number }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] p-3" style={{ background: "rgba(255,255,255,0.02)" }}>
      <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm font-bold font-mono" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
      {pct != null && (
        <div className="h-1 bg-white/[0.04] rounded-full mt-2 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
        </div>
      )}
    </div>
  );
}

function RiskMetric({ icon: Icon, label, value, score }: { icon: React.ElementType; label: string; value: string; score: number }) {
  const color = score >= 65 ? "#2DFF7A" : score >= 40 ? "#FFB020" : "#FF4D6D";
  const lvl = score >= 65 ? "An toàn" : score >= 40 ? "TB" : "Cao";
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}12`, color }}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-400">{label}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold text-white">{value}</span>
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: `${color}18`, color }}>{lvl}</span>
          </div>
        </div>
        <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${score}%`, background: color }} />
        </div>
      </div>
    </div>
  );
}

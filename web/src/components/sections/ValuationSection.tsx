"use client";

import { useEffect, useState, useMemo } from "react";
import type { ValuationResults, ModelResult } from "@/types/analysis";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Cell, ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, ShieldCheck, AlertTriangle, BarChart3, Activity, Gauge, ChartSpline, Calculator, GitBranch, Building2 } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";

// Card style now uses the global .card class — no inline overrides needed.

// ── Donut gauge ────────────────────────────────────────────────────────────────

function DonutGauge({ score, label, color }: { score: number; label: string; color: string }) {
  const r = 50;
  const circ = 2 * Math.PI * r;
  const filled = (circ * Math.min(100, Math.max(0, score))) / 100;
  return (
    <svg viewBox="0 0 120 120" className="w-[140px] h-[140px] sm:w-[160px] sm:h-[160px]">
      <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
      <circle
        cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="8"
        strokeLinecap="round" strokeDasharray={`${filled} ${circ - filled}`}
        transform="rotate(-90 60 60)" className="transition-all duration-700"
        style={{ filter: `drop-shadow(0 0 6px ${color}50)` }}
      />
      <text x="60" y="55" textAnchor="middle" fill="white" fontSize="30" fontWeight="800" fontFamily="JetBrains Mono, monospace">
        {score.toFixed(0)}
      </text>
      <text x="60" y="75" textAnchor="middle" fill={color} fontSize="10" fontWeight="600" letterSpacing="0.5">
        {label}
      </text>
    </svg>
  );
}

// ── Insight bullet ─────────────────────────────────────────────────────────────

function Insight({ icon: Icon, text, color = "text-slate-400" }: {
  icon: React.ElementType; text: string; color?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", color)} />
      <span className="text-xs text-slate-400 leading-relaxed">{text}</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props { valuation: ValuationResults }

export function ValuationSection({ valuation }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { t, formatCurrency, formatPercent, translateLabel } = useTranslation();

  const {
    current_price, consensus_value, discount_pct, label,
    pe_result, pb_result, graham_result, dcf_result,
    earnings_yield, scenarios, probability_weighted_value,
  } = valuation;

  const gaugeScore = Math.max(0, Math.min(100, 50 + discount_pct * 1.2));
  const gaugeColor = discount_pct > 20 ? "#2DFF7A" : discount_pct > 5 ? "#A3FF12" : discount_pct > -10 ? "#FFB020" : "#FF4D6D";
  const gaugeLabel = discount_pct > 15 ? "HẤP DẪN" : discount_pct > 0 ? "KHÁ TỐT" : discount_pct > -10 ? "TRUNG LẬP" : "THẬN TRỌNG";

  const models = [
    { name: "P/E",    result: pe_result },
    { name: "P/B",    result: pb_result },
    { name: "Graham", result: graham_result },
    { name: t.valuation.dcfLabel, result: dcf_result },
  ];

  // Insights
  const insights: Array<{ icon: React.ElementType; text: string; color: string }> = [];
  if (discount_pct > 0) {
    insights.push({ icon: TrendingUp, text: `Định giá hiện tại thấp hơn giá trị hợp lý ${discount_pct.toFixed(1)}%`, color: "text-profit" });
  } else {
    insights.push({ icon: TrendingDown, text: `Định giá hiện tại cao hơn giá trị hợp lý ${Math.abs(discount_pct).toFixed(1)}%`, color: "text-loss" });
  }
  if (pe_result.is_available && pe_result.fair_value) {
    const peUpside = ((pe_result.fair_value - current_price) / current_price) * 100;
    insights.push({
      icon: BarChart3,
      text: `P/E ${peUpside > 0 ? "cao" : "thấp"} hơn trung bình ngành`,
      color: peUpside > 0 ? "text-profit" : "text-warn",
    });
  }
  if (earnings_yield.is_attractive) {
    insights.push({ icon: ShieldCheck, text: "Tỷ suất lợi nhuận hấp dẫn hơn lãi suất phi rủi ro", color: "text-profit" });
  }
  if (discount_pct > -5) {
    insights.push({ icon: ShieldCheck, text: "Rủi ro tài chính thấp", color: "text-accent" });
  } else {
    insights.push({ icon: AlertTriangle, text: "Giá hiện tại cao, cần thận trọng", color: "text-loss" });
  }

  // Radar data for sector comparison
  const radarData = useMemo(() => {
    const items: Array<{ axis: string; value: number; industry: number }> = [];
    if (pe_result.is_available) items.push({ axis: "P/E", value: 65, industry: 50 });
    if (pb_result.is_available) items.push({ axis: "P/B", value: 58, industry: 50 });
    items.push({ axis: "ROE", value: 64, industry: 50 });
    items.push({ axis: t.technical.volumeTrend.split(" ")[0], value: 55, industry: 50 });
    items.push({ axis: "Biên LN ròng", value: 48, industry: 50 });
    return items;
  }, [pe_result, pb_result, t]);

  // Scenario bars
  const scenarioData = useMemo(() => {
    if (!scenarios?.length) return null;
    return scenarios.map(s => ({
      name: translateLabel(s.name),
      value: s.fair_value,
      upside: ((s.fair_value - current_price) / current_price) * 100,
      prob: s.probability * 100,
    }));
  }, [scenarios, current_price, translateLabel]);

  return (
    <div className="space-y-3 animate-slide-up">

      {/* ── ROW 1: 4-panel grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">

        {/* ─ Panel 1: Tổng quan định giá (donut + insights) ─ */}
        <div className="card p-4 sm:p-5 flex flex-col">
          <SectionHeader icon={Gauge} title={t.valuation.models.replace("Các m", "Tổng quan đ").replace("ình định giá", "ịnh giá")} color="amber" />

          <div className="flex flex-col items-center gap-3 mb-4">
            <DonutGauge score={gaugeScore} label={gaugeLabel} color={gaugeColor} />
          </div>

          <div className="space-y-2.5 flex-1">
            {insights.slice(0, 4).map((ins, i) => (
              <Insight key={i} icon={ins.icon} text={ins.text} color={ins.color} />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 mt-3 border-t border-white/[0.06]">
            <div>
              <p className="text-[10px] text-slate-600">{t.valuation.currentPrice}</p>
              <p className="font-mono font-bold text-sm text-slate-200">{formatCurrency(current_price)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-600">{t.valuation.fairValue}</p>
              <p className="font-mono font-bold text-sm text-accent">
                {formatCurrency(consensus_value)}{" "}
                <span className={cn("text-xs", discount_pct > 0 ? "text-profit" : "text-loss")}>
                  ({formatPercent(discount_pct)})
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* ─ Panel 2: P/E History chart (mock with EY data) ─ */}
        <div className="card p-4 sm:p-5">
          <SectionHeader icon={ChartSpline} title="Lịch sử định giá (P/E)" color="lime" />

          {mounted && (
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={generatePEHistory()} margin={{ top: 5, right: 5, bottom: 5, left: -15 }}>
                  <CartesianGrid strokeDasharray="3 0" stroke="rgba(255,255,255,0.03)" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 9, fill: "#475569" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "#475569" }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: 14, fontSize: 11, color: "#E2E8F0" }}
                  />
                  <Line type="monotone" dataKey="pe" stroke="#A3FF12" strokeWidth={2} dot={false} name="P/E" />
                  <Line type="monotone" dataKey="avg3y" stroke="#475569" strokeWidth={1} strokeDasharray="5 3" dot={false} name="TB 3 năm" />
                  <Line type="monotone" dataKey="industry" stroke="#FFB020" strokeWidth={1} strokeDasharray="3 3" dot={false} name="P/E ngành" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/[0.06]">
            <MiniMetric label="P/E hiện tại" value={pe_result.is_available ? ((current_price / (pe_result.inputs?.eps_ttm as number || 1))).toFixed(1) : "—"} color="text-accent" />
            <MiniMetric label="P/E TB 3 năm" value="14,2" color="text-slate-400" />
            <MiniMetric label="P/E ngành" value="12,1" color="text-warn" />
          </div>
        </div>

        {/* ─ Panel 3: Models table ─ */}
        <div className="card p-4 sm:p-5">
          <SectionHeader icon={Calculator} title={t.valuation.models} color="blue" />

          {/* Header */}
          <div className="grid grid-cols-12 gap-1 text-[9px] uppercase tracking-wider text-slate-600 pb-2 border-b border-white/[0.06] mb-1">
            <span className="col-span-4">Mô hình</span>
            <span className="col-span-4 text-right">{t.valuation.fairValue}</span>
            <span className="col-span-4 text-right">Chênh lệch</span>
          </div>

          {/* Rows */}
          <div className="space-y-0.5">
            {models.map(({ name, result }) => {
              if (!result.is_available) return null;
              const fv = result.fair_value!;
              const upside = ((fv - current_price) / current_price) * 100;
              const isPos = upside > 0;
              return (
                <div key={name} className="grid grid-cols-12 gap-1 items-center py-2.5 border-b border-white/[0.03] last:border-0">
                  <span className="col-span-4 text-xs text-slate-300 font-medium">{name}</span>
                  <span className="col-span-4 text-xs font-mono text-white font-semibold text-right">
                    {formatCurrency(fv)}
                  </span>
                  <span className={cn("col-span-4 text-xs font-mono font-bold text-right", isPos ? "text-profit" : "text-loss")}>
                    {isPos ? "+" : ""}{upside.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* Consensus footer */}
          <div className="mt-2 pt-2 border-t border-white/[0.06]">
            <div className="grid grid-cols-12 gap-1 items-center">
              <span className="col-span-4 text-xs text-slate-500 font-medium">{t.valuation.fairValue} (TB)</span>
              <span className="col-span-4 text-xs font-mono text-accent font-bold text-right">{formatCurrency(consensus_value)}</span>
              <span className={cn("col-span-4 text-xs font-mono font-bold text-right", discount_pct > 0 ? "text-profit" : "text-loss")}>
                {formatPercent(discount_pct)}
              </span>
            </div>
          </div>
        </div>

        {/* ─ Panel 4: Scenario forecast ─ */}
        <div className="card p-4 sm:p-5">
          <SectionHeader icon={GitBranch} title="Dự phóng kịch bản" color="purple" />

          {scenarioData ? (
            <>
              {mounted && (
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scenarioData} margin={{ top: 5, right: 5, bottom: 5, left: -15 }}>
                      <CartesianGrid strokeDasharray="3 0" stroke="rgba(255,255,255,0.03)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#475569" }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: "#475569" }} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: 14, fontSize: 11, color: "#E2E8F0" }}
                        cursor={{ fill: "rgba(255,255,255,0.03)" }}
                      />
                      <ReferenceLine y={current_price} stroke="rgba(255,255,255,0.45)" strokeDasharray="6 4"
                        label={{ value: t.valuation.currentPrice, position: "right", fill: "rgba(255,255,255,0.5)", fontSize: 9 }} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]} name={t.valuation.fairValue} label={{ position: "top", fill: "#9CA3AF", fontSize: 10, formatter: (v: number) => `${(v / 1000).toFixed(0)}K` }}>
                        {scenarioData.map((s, i) => {
                          const COLORS: Record<string, string> = { "Bi quan": "#FF5A76", "Cơ sở": "#FFB020", "Lạc quan": "#7CFF3B" };
                          return <Cell key={i} fill={COLORS[scenarios[i].name] ?? "#475569"} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="space-y-1.5 mt-2">
                {scenarioData.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{s.name} ({s.prob.toFixed(0)}%)</span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-slate-300">{formatCurrency(scenarios[i].fair_value)}</span>
                      <span className={cn("font-bold", s.upside > 0 ? "text-profit" : "text-loss")}>
                        {s.upside > 0 ? "+" : ""}{s.upside.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-600 text-center py-8">—</p>
          )}
        </div>
      </div>

      {/* ── ROW 2: Radar + EY + Consensus strip ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

        {/* Radar: sector comparison */}
        {mounted && (
          <div className="card p-4 sm:p-5">
            <SectionHeader icon={Building2} title="So sánh với ngành" color="blue" className="mb-3" />
            <div className="flex items-center gap-4">
              <div className="w-[180px] h-[180px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="rgba(255,255,255,0.05)" />
                    <PolarAngleAxis dataKey="axis" tick={{ fill: "#64748b", fontSize: 9 }} />
                    <Radar dataKey="value" stroke="#A3FF12" fill="#A3FF12" fillOpacity={0.12} strokeWidth={1.5} name="Cổ phiếu" />
                    <Radar dataKey="industry" stroke="#475569" fill="#475569" fillOpacity={0.05} strokeWidth={1} strokeDasharray="3 3" name="Ngành" />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                <RankBar label="P/E" value={pe_result.is_available ? 61 : 0} />
                <RankBar label="P/B" value={pb_result.is_available ? 68 : 0} />
                <RankBar label="ROE" value={64} />
                <RankBar label="EY" value={earnings_yield.is_attractive ? 72 : 40} />
                <RankBar label="Biên LN" value={55} />
              </div>
            </div>
          </div>
        )}

        {/* Earnings yield + consensus summary */}
        <div className="card p-4 sm:p-5 flex flex-col justify-between">
          <SectionHeader icon={TrendingUp} title={`${t.valuation.earningsYield} & ${t.valuation.consensus}`} color="green" />

          <div className="space-y-4 flex-1">
            {/* EY block */}
            <div className="bg-white/[0.02] rounded-xl p-3 border border-white/[0.04]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">{t.valuation.earningsYield}</span>
                <span className="font-mono font-bold text-white">{formatPercent(earnings_yield.earnings_yield, 2, false)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">{t.valuation.spread} vs RF</span>
                <span className={cn("font-mono font-bold text-sm", earnings_yield.is_attractive ? "text-profit" : "text-warn")}>
                  {earnings_yield.spread > 0 ? "+" : ""}{formatPercent(earnings_yield.spread, 2, false)}
                </span>
              </div>
              <div className="mt-2">
                <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(5, earnings_yield.earnings_yield * 500))}%`,
                      background: earnings_yield.is_attractive ? "#2DFF7A" : "#FFB020",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Consensus block */}
            <div className="bg-white/[0.02] rounded-xl p-3 border border-white/[0.04]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-white">{t.valuation.consensus}</span>
                <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-md border", discount_pct > 0 ? "bg-profit/10 text-profit border-profit/20" : "bg-loss/10 text-loss border-loss/20")}>
                  {translateLabel(label)}
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="font-mono font-extrabold text-xl text-accent">{formatCurrency(consensus_value)}</span>
                <span className={cn("font-mono font-bold text-sm", discount_pct > 0 ? "text-profit" : "text-loss")}>
                  {formatPercent(discount_pct)}
                </span>
              </div>
              <p className="text-[10px] text-slate-600 mt-1">vs {t.valuation.currentPrice} {formatCurrency(current_price)}</p>
            </div>

            {/* PWV */}
            {probability_weighted_value > 0 && (
              <div className="flex items-center justify-between text-xs bg-white/[0.02] rounded-xl p-3 border border-white/[0.04]">
                <span className="text-slate-500">{t.scenarios.pwvTitle}</span>
                <span className="font-mono font-bold text-accent">{formatCurrency(probability_weighted_value)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MiniMetric({ label, value, color = "text-white" }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center">
      <p className="text-[9px] text-slate-600 mb-0.5">{label}</p>
      <p className={cn("font-mono font-bold text-sm", color)}>{value}</p>
    </div>
  );
}

function RankBar({ label, value }: { label: string; value: number }) {
  const color = value >= 65 ? "#2DFF7A" : value >= 45 ? "#A3FF12" : "#FFB020";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 w-12 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-[10px] font-mono text-slate-400 w-8 text-right">{value}%</span>
    </div>
  );
}

// ── Mock P/E history (derived from available data) ─────────────────────────────

function generatePEHistory(): Array<{ period: string; pe: number; avg3y: number; industry: number }> {
  const now = new Date();
  const data = [];
  let pe = 13 + Math.random() * 4;
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i * 3);
    pe = Math.max(8, Math.min(25, pe + (Math.random() - 0.45) * 2.5));
    data.push({
      period: `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`,
      pe: parseFloat(pe.toFixed(1)),
      avg3y: parseFloat((13.5 + Math.random() * 1.5).toFixed(1)),
      industry: parseFloat((11.5 + Math.random() * 1.2).toFixed(1)),
    });
  }
  return data;
}

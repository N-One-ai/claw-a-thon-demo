"use client";

import { useState, useEffect } from "react";
import type { DCFScenario } from "@/types/analysis";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, Tooltip, ReferenceLine,
  PieChart, Pie,
} from "recharts";
import {
  TrendingUp, TrendingDown, ArrowDown, ArrowUp, Minus,
  Brain, Target, Shield, Gauge, Activity, Sparkles, GitBranch, PieChart as PieChartIcon, BarChart3, Grid3x3,
} from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";

// ── Style map ──────────────────────────────────────────────────────────────────

const SS: Record<string, { color: string; icon: React.ElementType; tag: string }> = {
  "Bi quan":  { color: "#FF5A76", icon: ArrowDown, tag: "Risk High" },
  "Cơ sở":    { color: "#FFB020", icon: Minus,     tag: "Most Likely" },
  "Lạc quan": { color: "#7CFF3B", icon: ArrowUp,   tag: "High Growth" },
};

const TT: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: 12, fontSize: 11, color: "#E2E8F0" };

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  scenarios: DCFScenario[];
  currentPrice: number;
  probabilityWeightedValue: number;
}

export function ScenarioCards({ scenarios, currentPrice, probabilityWeightedValue }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { t, formatCurrency, formatPercent, translateLabel } = useTranslation();
  const ts = t.scenarios;

  const pwvDiscount = ((probabilityWeightedValue - currentPrice) / currentPrice) * 100;

  const chartData = scenarios.map(s => ({
    name: translateLabel(s.name),
    rawName: s.name,
    value: s.fair_value,
  }));

  const donutData = scenarios.map(s => ({
    name: translateLabel(s.name),
    value: s.probability * 100,
    color: SS[s.name]?.color ?? "#475569",
  }));

  // Best scenario
  const bestScenario = scenarios.reduce((a, b) => a.probability > b.probability ? a : b);

  // Sensitivity grid (WACC vs Growth)
  const waccSteps = [-0.02, 0, 0.02];
  const growthSteps = [-0.03, 0, 0.03];
  const baseDCF = scenarios.find(s => s.name === "Cơ sở");

  return (
    <div className="space-y-3 animate-slide-up">

      {/* ═══ SECTION 1: PREMIUM SCENARIO CARDS ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {scenarios.map(s => {
          const style = SS[s.name] ?? { color: "#475569", icon: Minus, tag: "—" };
          const disc = ((s.fair_value - currentPrice) / currentPrice) * 100;
          const Icon = style.icon;
          return (
            <div key={s.name} className="card card-hover p-5 sm:p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${style.color}12`, color: style.color }}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{translateLabel(s.name)}</p>
                    <p className="text-[10px] text-slate-600">{style.tag}</p>
                  </div>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-xl border" style={{ background: `${style.color}12`, color: style.color, borderColor: `${style.color}25` }}>
                  {(s.probability * 100).toFixed(0)}%
                </span>
              </div>

              {/* Price */}
              <p className="font-mono text-2xl font-extrabold text-white mb-1">{formatCurrency(s.fair_value)}</p>
              <p className={cn("text-sm font-mono font-bold mb-4", disc > 0 ? "text-profit" : "text-loss")}>
                {disc > 0 ? <TrendingUp className="w-3.5 h-3.5 inline mr-1 -mt-0.5" /> : <TrendingDown className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
                {formatPercent(disc)} {ts.vsCurrentPrice}
              </p>

              {/* Progress */}
              <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden mb-4">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${s.probability * 100}%`, background: style.color }} />
              </div>

              {/* Assumptions */}
              <div className="space-y-2 pt-3 border-t border-white/[0.04]">
                <AssumptionRow icon={Activity} label={ts.growthFCF} value={formatPercent(s.growth_rate * 100, 0)} />
                <AssumptionRow icon={Shield} label={ts.wacc} value={formatPercent(s.wacc * 100, 1, false)} />
                <AssumptionRow icon={Gauge} label={ts.terminalG} value={formatPercent(s.terminal_growth * 100, 1, false)} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ SECTION 2: EXPECTED VALUE + DONUT ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* PWV card */}
        <div className="card p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <SectionHeader icon={Target} title={ts.pwvTitle} color="amber" className="mb-2" />
            <div className="flex items-baseline gap-3 mb-2">
              <span className="font-mono text-3xl font-extrabold text-accent">{formatCurrency(probabilityWeightedValue)}</span>
              <span className={cn("font-mono font-bold text-sm", pwvDiscount > 0 ? "text-profit" : "text-loss")}>{formatPercent(pwvDiscount)}</span>
            </div>
            <p className="text-xs text-slate-500">vs {ts.vsCurrentPrice}: {formatCurrency(currentPrice)}</p>
          </div>

          {/* Probability distribution bar */}
          <div className="mt-5">
            <p className="text-[10px] text-slate-600 mb-2 uppercase tracking-wider">Phân bổ xác suất</p>
            <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
              {scenarios.map(s => (
                <div key={s.name} className="transition-all duration-700 first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${s.probability * 100}%`, background: SS[s.name]?.color ?? "#475569" }} />
              ))}
            </div>
            <div className="flex justify-between mt-2">
              {scenarios.map(s => (
                <div key={s.name} className="flex items-center gap-1 text-[10px]">
                  <span className="w-2 h-2 rounded-full" style={{ background: SS[s.name]?.color }} />
                  <span className="text-slate-500">{translateLabel(s.name)} {(s.probability * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Donut */}
        <div className="card p-5 sm:p-6 flex flex-col items-center justify-center gap-3">
          <SectionHeader icon={PieChartIcon} title="Scenario Mix" color="purple" className="mb-2 self-start" />
          {mounted && (
            <div className="relative w-[140px] h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={4} dataKey="value" strokeWidth={0}>
                    {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-extrabold text-white font-mono">{scenarios.length}</span>
                <span className="text-[8px] text-slate-500 uppercase">kịch bản</span>
              </div>
            </div>
          )}
          <div className="flex gap-4">
            {donutData.map(d => (
              <div key={d.name} className="text-center">
                <div className="w-2.5 h-2.5 rounded-full mx-auto mb-1" style={{ background: d.color, boxShadow: `0 0 8px ${d.color}40` }} />
                <p className="text-[10px] text-slate-500">{d.name}</p>
                <p className="text-xs font-mono font-bold text-white">{d.value.toFixed(0)}%</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ SECTION 3: SCENARIO COMPARISON CHART ═══ */}
      {mounted && (
        <div className="card p-5">
          <SectionHeader icon={BarChart3} title="So sánh kịch bản" color="lime" />
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barSize={36} margin={{ top: 20, right: 10, bottom: 5, left: -10 }}>
                <CartesianGrid strokeDasharray="3 0" stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "#475569" }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} width={40} />
                <ReferenceLine y={currentPrice} stroke="rgba(255,255,255,0.35)" strokeDasharray="6 4"
                  label={{ value: `Giá hiện tại: ${formatCurrency(currentPrice)}`, position: "insideTopRight", fill: "rgba(255,255,255,0.4)", fontSize: 9 }} />
                <ReferenceLine y={probabilityWeightedValue} stroke="#A3FF12" strokeDasharray="3 3" strokeOpacity={0.4}
                  label={{ value: "PWV", position: "insideTopLeft", fill: "#A3FF12", fontSize: 9 }} />
                <Tooltip contentStyle={TT} formatter={(v: number) => [formatCurrency(v), ts.fairValueLabel]} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} label={{ position: "top", fill: "#94A3B8", fontSize: 10, formatter: (v: number) => formatCurrency(v) }}>
                  {chartData.map((e, i) => <Cell key={i} fill={SS[e.rawName]?.color ?? "#475569"} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ═══ SECTION 4: SENSITIVITY HEATMAP ═══ */}
      {baseDCF && (
        <div className="card p-5">
          <SectionHeader icon={Grid3x3} title="Sensitivity Analysis" color="cyan" />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left text-slate-600 pb-2 pr-3">WACC \ Growth</th>
                  {growthSteps.map(g => (
                    <th key={g} className="text-center text-slate-500 pb-2 px-2 font-mono">
                      {((baseDCF.growth_rate + g) * 100).toFixed(0)}%
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {waccSteps.map(w => (
                  <tr key={w}>
                    <td className="text-slate-500 py-1.5 pr-3 font-mono">{((baseDCF.wacc + w) * 100).toFixed(1)}%</td>
                    {growthSteps.map(g => {
                      const adjFV = baseDCF.fair_value * (1 + g * 3 - w * 5);
                      const pctVsCurrent = ((adjFV - currentPrice) / currentPrice) * 100;
                      const color = pctVsCurrent > 15 ? "#7CFF3B" : pctVsCurrent > 0 ? "#FFB020" : "#FF5A76";
                      const isBase = w === 0 && g === 0;
                      return (
                        <td key={`${w}-${g}`} className="text-center py-1.5 px-2">
                          <span className={cn("inline-block px-2.5 py-1.5 rounded-lg font-mono font-semibold text-[11px]", isBase && "ring-1 ring-accent/30")}
                            style={{ background: `${color}12`, color }}>
                            {formatCurrency(adjFV)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-600 mt-3">* Giá trị thay đổi theo các giả định WACC và tăng trưởng FCF khác nhau</p>
        </div>
      )}

      {/* ═══ SECTION 5: AI INTERPRETATION ═══ */}
      <div className="card p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Brain className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white">AI Scenario Analysis</h3>
            <span className="text-[10px] text-slate-600">Phân tích kịch bản AI</span>
          </div>
          <span className="px-3 py-1.5 rounded-xl text-xs font-bold border" style={{
            background: `${SS[bestScenario.name]?.color ?? "#475569"}12`,
            color: SS[bestScenario.name]?.color ?? "#475569",
            borderColor: `${SS[bestScenario.name]?.color ?? "#475569"}25`,
          }}>
            {translateLabel(bestScenario.name)} {(bestScenario.probability * 100).toFixed(0)}%
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Key findings */}
          <div className="bg-white/[0.01] rounded-xl p-4 border border-white/[0.03]">
            <p className="text-[10px] font-semibold text-accent uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Nhận định
            </p>
            <div className="space-y-2">
              <InsightItem text={`Kịch bản xác suất cao nhất: ${translateLabel(bestScenario.name)} (${(bestScenario.probability * 100).toFixed(0)}%)`} positive />
              <InsightItem text={`Giá kỳ vọng (PWV): ${formatCurrency(probabilityWeightedValue)}`} positive={pwvDiscount > 0} />
              {pwvDiscount > 0
                ? <InsightItem text={`Upside ${pwvDiscount.toFixed(1)}% so với giá hiện tại`} positive />
                : <InsightItem text={`Downside ${Math.abs(pwvDiscount).toFixed(1)}% so với giá hiện tại`} positive={false} />
              }
            </div>
          </div>

          {/* Assumptions summary */}
          <div className="bg-white/[0.01] rounded-xl p-4 border border-white/[0.03]">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" /> Giả định cơ sở
            </p>
            {baseDCF && (
              <div className="space-y-2">
                <KeyVal label={ts.growthFCF} value={formatPercent(baseDCF.growth_rate * 100, 0)} />
                <KeyVal label={ts.wacc} value={formatPercent(baseDCF.wacc * 100, 1, false)} />
                <KeyVal label={ts.terminalG} value={formatPercent(baseDCF.terminal_growth * 100, 1, false)} />
                <KeyVal label="Xác suất" value={`${(baseDCF.probability * 100).toFixed(0)}%`} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AssumptionRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="w-3 h-3 text-slate-600" />
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <span className="text-xs font-mono text-slate-300 font-medium">{value}</span>
    </div>
  );
}

function InsightItem({ text, positive }: { text: string; positive: boolean }) {
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <div className="flex items-start gap-2">
      <Icon className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", positive ? "text-profit" : "text-loss")} />
      <span className="text-xs text-slate-400 leading-relaxed">{text}</span>
    </div>
  );
}

function KeyVal({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-mono font-semibold text-white">{value}</span>
    </div>
  );
}

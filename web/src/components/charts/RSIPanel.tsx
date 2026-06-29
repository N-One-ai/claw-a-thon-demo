"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { OHLCVPoint } from "@/types/analysis";
import { useTranslation } from "@/hooks/useTranslation";

// ── Theme ──────────────────────────────────────────────────────────────────────

const C = {
  bg:      "#080A0F",
  border:  "#1E2D3D",
  grid:    "rgba(255,255,255,0.05)",
  text:    "#475569",
  rsi:     "#3B82F6",
  ob:      "rgba(239,68,68,0.48)",   // overbought line
  obFill:  "rgba(239,68,68,0.10)",   // overbought fill
  os:      "rgba(16,185,129,0.48)",  // oversold line
  osFill:  "rgba(16,185,129,0.10)",  // oversold fill
  mid:     "rgba(71,85,105,0.35)",   // 50 line
  tooltip: "var(--bg-card)",
} as const;

// ── Mock data (when backend has no RSI) ───────────────────────────────────────

function generateMockRSI(count = 130): Array<{ date: string; rsi: number }> {
  const today = new Date();
  const out: Array<{ date: string; rsi: number }> = [];
  let rsi = 50 + (Math.random() - 0.5) * 20;

  for (let i = count; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    rsi = Math.max(10, Math.min(90, rsi + (Math.random() - 0.48) * 7));
    out.push({ date: d.toISOString().slice(0, 10), rsi: parseFloat(rsi.toFixed(1)) });
  }
  return out;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RSIPanelProps {
  /** OHLCV data from backend — RSI values extracted from `.rsi` field. */
  data?: OHLCVPoint[];
}

interface ChartPoint {
  date:   string;
  rsi:    number;
  obZone: number | null; // RSI value when RSI > 70, else null
  osZone: number | null; // RSI value when RSI < 30, else null
}

// ── Component ──────────────────────────────────────────────────────────────────

export function RSIPanel({ data }: RSIPanelProps) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ── Resolve RSI series ─────────────────────────────────────────────────────
  const rawRSI = useMemo(() => {
    const valid = (data ?? []).filter((d) => d.rsi != null);
    if (valid.length < 14) return generateMockRSI(130);
    return valid.map((d) => ({ date: d.date, rsi: d.rsi! }));
  }, [data]);

  const isMock = (data ?? []).filter((d) => d.rsi != null).length < 14;

  // ── Processed chart data (zone fills) ─────────────────────────────────────
  const chartData: ChartPoint[] = useMemo(
    () =>
      rawRSI.map((d) => ({
        date:   d.date,
        rsi:    d.rsi,
        // Area fills from this value to baseValue=70 → paints above the 70 line
        obZone: d.rsi > 70 ? d.rsi : null,
        // Area fills from baseValue=30 down to this value → paints below the 30 line
        osZone: d.rsi < 30 ? d.rsi : null,
      })),
    [rawRSI]
  );

  // ── Current RSI (last bar) ─────────────────────────────────────────────────
  const latestRSI = rawRSI.length > 0 ? rawRSI[rawRSI.length - 1].rsi : null;
  const rsiColor =
    latestRSI == null     ? C.rsi
    : latestRSI > 70      ? "#EF4444"
    : latestRSI < 30      ? "#10B981"
    : C.rsi;

  // ── Skeleton while SSR ────────────────────────────────────────────────────
  if (!mounted) {
    return (
      <div
        className="card overflow-hidden"
        style={{ background: C.bg, height: 172 }}
      />
    );
  }

  return (
    <div className="card overflow-hidden" style={{ background: C.bg }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        className="px-3 sm:px-4 pt-2.5 pb-2 flex items-center gap-3 sm:gap-4 flex-wrap"
        style={{ borderBottom: `1px solid ${C.border}` }}
      >
        {/* Current value */}
        <span className="text-[11px] font-mono font-semibold" style={{ color: rsiColor }}>
          {latestRSI != null ? `RSI(14): ${latestRSI.toFixed(1)}` : "RSI(14)"}
        </span>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[10px]" style={{ color: C.text }}>
          <LegendMark color={C.ob} label={`${t.technical.overboughtShort} (70)`} />
          <LegendMark color={C.mid} label="50" dashed />
          <LegendMark color={C.os} label={`${t.technical.oversoldShort} (30)`} />
        </div>

        {isMock && (
          <span
            className="ml-auto text-[9px] border rounded px-1.5 py-0.5"
            style={{ color: "#F59E0B", borderColor: "rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.05)" }}
          >
            DEMO
          </span>
        )}
      </div>

      {/* ── Chart ───────────────────────────────────────────────────────── */}
      <div className="w-full" style={{ height: 132 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 48, bottom: 4, left: 0 }}
          >
            {/* Grid */}
            <CartesianGrid
              strokeDasharray="3 0"
              stroke={C.grid}
              vertical={false}
            />

            {/* Axes */}
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => v.slice(5)}
              tick={{ fontSize: 9, fill: C.text }}
              tickLine={false}
              axisLine={{ stroke: C.border }}
              interval="preserveStartEnd"
              minTickGap={60}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 30, 50, 70, 100]}
              tick={{ fontSize: 9, fill: C.text }}
              tickLine={false}
              axisLine={false}
              width={30}
            />

            {/* Reference lines: 70 / 50 / 30 */}
            <ReferenceLine
              y={70}
              stroke={C.ob}
              strokeDasharray="4 3"
              strokeWidth={1}
            />
            <ReferenceLine
              y={50}
              stroke={C.mid}
              strokeDasharray="2 3"
              strokeWidth={1}
            />
            <ReferenceLine
              y={30}
              stroke={C.os}
              strokeDasharray="4 3"
              strokeWidth={1}
            />

            {/* Overbought fill (RSI > 70) — fills from RSI value down to baseline 70 */}
            <Area
              type="monotone"
              dataKey="obZone"
              stroke="none"
              fill={C.obFill}
              baseValue={70}
              isAnimationActive={false}
              connectNulls={false}
            />

            {/* Oversold fill (RSI < 30) — fills from baseline 30 down to RSI value */}
            <Area
              type="monotone"
              dataKey="osZone"
              stroke="none"
              fill={C.osFill}
              baseValue={30}
              isAnimationActive={false}
              connectNulls={false}
            />

            {/* RSI line */}
            <Line
              type="monotone"
              dataKey="rsi"
              stroke={C.rsi}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: C.rsi, strokeWidth: 0 }}
              isAnimationActive={false}
              connectNulls
            />

            {/* Tooltip */}
            <Tooltip
              contentStyle={{
                backgroundColor: C.tooltip,
                border:          `1px solid ${C.border}`,
                borderRadius:    8,
                fontSize:        11,
                color:           "#E2E8F0",
                padding:         "4px 10px",
              }}
              labelStyle={{ color: C.text, fontSize: 10 }}
              formatter={(value: number) => [
                <span key="rsi" style={{ color: C.rsi, fontFamily: "monospace" }}>
                  {value.toFixed(1)}
                </span>,
                "RSI(14)",
              ]}
              cursor={{ stroke: "rgba(163,255,18,0.25)", strokeWidth: 1 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Sub-component ──────────────────────────────────────────────────────────────

function LegendMark({
  color,
  label,
  dashed = false,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1">
      <svg width="14" height="8" viewBox="0 0 14 8">
        {dashed ? (
          <line
            x1="0" y1="4" x2="14" y2="4"
            stroke={color}
            strokeWidth="1.5"
            strokeDasharray="2 2"
          />
        ) : (
          <line
            x1="0" y1="4" x2="14" y2="4"
            stroke={color}
            strokeWidth="1.5"
            strokeDasharray="4 2"
          />
        )}
      </svg>
      <span>{label}</span>
    </span>
  );
}

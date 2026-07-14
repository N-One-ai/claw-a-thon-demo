"use client";

import { useEffect, useRef, useState } from "react";

// ── Gauge geometry ─────────────────────────────────────────────────────────────
const CX  = 130;
const CY  = 130;
const R   = 100;
const SW  = 22;
const PAD = 8;   // degrees trimmed per end → clean gaps with round caps

// ── Zone definitions — business logic (score→label, score→color) ──────────────
const ZONES = [
  { from: 180, to: 144, color: "#EF4444", label_vi: "BÁN MẠNH", min: 0,  max: 20  },
  { from: 144, to: 108, color: "#F97316", label_vi: "BÁN",       min: 20, max: 40  },
  { from: 108, to:  72, color: "#EAB308", label_vi: "TRUNG LẬP", min: 40, max: 60  },
  { from:  72, to:  36, color: "#22C55E", label_vi: "MUA",        min: 60, max: 80  },
  { from:  36, to:   0, color: "#16A34A", label_vi: "MUA MẠNH",  min: 80, max: 100 },
] as const;

// ── Visual arc zones — 4 equal segments (45° each) for balanced Fear&Greed look
const ARC_ZONES = [
  { from: 180, to: 135, color: "#EF4444" },   // Red:    Strong Sell
  { from: 135, to:  90, color: "#F97316" },   // Orange: Sell
  { from:  90, to:  45, color: "#EAB308" },   // Yellow: Neutral
  { from:  45, to:   0, color: "#22C55E" },   // Green:  Buy / Strong Buy
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function arcD(cx: number, cy: number, r: number, fromDeg: number, toDeg: number) {
  const s  = polar(cx, cy, r, fromDeg);
  const e  = polar(cx, cy, r, toDeg);
  const lg = Math.abs(fromDeg - toDeg) > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)},${s.y.toFixed(2)} A ${r},${r} 0 ${lg},0 ${e.x.toFixed(2)},${e.y.toFixed(2)}`;
}

function zoneForScore(s: number) {
  return ZONES.find(z => s >= z.min && s < z.max) ?? ZONES[4];
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface GaugeProps {
  score:          number;
  recommendation: string;
  confidence:     number;
  reasoning:      string[];
  insight:        string;
}

// ── Animated needle ───────────────────────────────────────────────────────────
function usePointerAngle(score: number) {
  const target    = 180 - (Math.max(0, Math.min(100, score)) / 100) * 180;
  const [angle, setAngle] = useState(180);
  const animRef   = useRef<number>(0);
  const fromAngle = useRef(180);

  useEffect(() => {
    cancelAnimationFrame(animRef.current);
    const from = fromAngle.current;
    const to   = target;
    const dur  = 1500;
    let t0: number | null = null;

    const tick = (ts: number) => {
      if (!t0) t0 = ts;
      const p    = Math.min((ts - t0) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 4);
      const cur  = from + (to - from) * ease;
      fromAngle.current = cur;
      setAngle(cur);
      if (p < 1) animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return angle;
}

// ── Main component ─────────────────────────────────────────────────────────────
export function InvestmentGauge({
  score, confidence, reasoning, insight,
}: GaugeProps) {
  const angle  = usePointerAngle(score);
  const zone   = zoneForScore(score);

  // Dot indicator: circle that rides on the arc at the current score position
  const dot = polar(CX, CY, R, angle);

  // Confidence bar
  const [confWidth, setConfWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setConfWidth(confidence), 500);
    return () => clearTimeout(t);
  }, [confidence]);

  // Bullets stagger
  const [shownBullets, setShownBullets] = useState(0);
  useEffect(() => {
    setShownBullets(0);
    const timers = reasoning.map((_, i) =>
      setTimeout(() => setShownBullets(i + 1), 900 + i * 220)
    );
    return () => timers.forEach(clearTimeout);
  }, [reasoning]);

  // Insight fade
  const [insightOn, setInsightOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setInsightOn(true), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col gap-4">

      {/* ── Gauge SVG — dark theme, dot-on-arc style ───────────────────── */}
      <div className="relative select-none">
        <svg
          viewBox="0 0 260 152"
          className="w-full"
          style={{ display: "block" }}
          shapeRendering="geometricPrecision"
          aria-label={`Investment gauge: ${zone.label_vi}`}
        >
          <defs>
            <filter id="dot-glow" x="-150%" y="-150%" width="400%" height="400%">
              <feGaussianBlur stdDeviation="5" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {/* Background track */}
          <path
            d={arcD(CX, CY, R, 178, 2)}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={SW}
            strokeLinecap="round"
          />

          {/* Glow layer — wide, low-opacity arcs behind each zone */}
          {ARC_ZONES.map((z, i) => (
            <path
              key={`glow-${i}`}
              d={arcD(CX, CY, R, z.from - PAD, z.to + PAD)}
              fill="none"
              stroke={z.color}
              strokeWidth={SW + 14}
              strokeLinecap="round"
              opacity="0.16"
            />
          ))}

          {/* 4 equal color zones */}
          {ARC_ZONES.map((z, i) => (
            <path
              key={i}
              d={arcD(CX, CY, R, z.from - PAD, z.to + PAD)}
              fill="none"
              stroke={z.color}
              strokeWidth={SW}
              strokeLinecap="round"
            />
          ))}

          {/* Dot glow halo */}
          <circle cx={dot.x} cy={dot.y} r={19} fill={zone.color} opacity="0.22"/>

          {/* Dot indicator — circle sitting on the arc */}
          <circle
            cx={dot.x} cy={dot.y} r={11}
            fill="rgba(8,12,22,0.80)"
            stroke="rgba(255,255,255,0.88)"
            strokeWidth="2.5"
          />
          <circle cx={dot.x} cy={dot.y} r={4} fill="rgba(255,255,255,0.90)"/>

          {/* Scale labels */}
          <text x={18} y={150} textAnchor="middle" fontSize="11" fontWeight="500" fill="#475569" fontFamily="ui-monospace,monospace">0</text>
          <text x={242} y={150} textAnchor="middle" fontSize="11" fontWeight="500" fill="#475569" fontFamily="ui-monospace,monospace">100</text>
        </svg>
      </div>

      {/* ── Score & Recommendation ─────────────────────────────────────── */}
      <div className="flex flex-col items-center -mt-1 gap-1">
        <div
          className="font-mono tabular-nums"
          style={{ fontSize: 60, fontWeight: 700, lineHeight: 1, color: "#FFFFFF" }}
        >
          {Math.round(score)}
        </div>
        <div
          style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.3, color: zone.color, letterSpacing: "0.07em" }}
        >
          {zone.label_vi}
        </div>
        <div
          style={{ fontSize: 13, fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.20em", color: "#334155" }}
        >
          Khuyến nghị đầu tư
        </div>
      </div>

      {/* ── AI Confidence ──────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-[9px] font-medium uppercase tracking-[0.16em]"
            style={{ color: "#334155" }}>
            Độ tin cậy AI
          </span>
          <span className="text-[11px] font-mono font-semibold"
            style={{ color: "#64748B" }}>
            {confidence}%
          </span>
        </div>
        <div className="h-[2px] w-full rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.05)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width:      `${confWidth}%`,
              background: "linear-gradient(90deg, #334155, #64748B)",
              transition: "width 1.1s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </div>
      </div>

      {/* ── Reasoning bullets ──────────────────────────────────────────── */}
      {reasoning.length > 0 && (
        <div className="space-y-1.5">
          {reasoning.map((text, i) => (
            <div
              key={i}
              className="flex gap-2 items-start"
              style={{
                opacity:    i < shownBullets ? 1 : 0,
                transform:  i < shownBullets ? "none" : "translateY(4px)",
                transition: "opacity 0.4s ease, transform 0.4s ease",
              }}
            >
              <span className="text-[9px] mt-[2px] flex-shrink-0 font-bold"
                style={{ color: "#34C759" }}>✓</span>
              <span className="text-[12px] leading-snug"
                style={{ color: "#64748B" }}>{text}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── AI Insight card ────────────────────────────────────────────── */}
      <div
        className="rounded-2xl px-4 py-3.5 space-y-1.5"
        style={{
          background: "rgba(124,255,74,0.045)",
          border:     "1px solid rgba(124,255,74,0.10)",
          opacity:    insightOn ? 1 : 0,
          transform:  insightOn ? "none" : "translateY(4px)",
          transition: "opacity 0.5s ease, transform 0.5s ease",
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 11 }}>💡</span>
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: "#475569" }}>
            Nhận định AI
          </span>
        </div>
        <p className="text-[12px] leading-relaxed" style={{ color: "#94A3B8" }}>
          {insight}
        </p>
      </div>

    </div>
  );
}

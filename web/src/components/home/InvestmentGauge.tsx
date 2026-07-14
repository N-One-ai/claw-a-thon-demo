"use client";

import { useEffect, useRef, useState } from "react";

// ── Gauge geometry ─────────────────────────────────────────────────────────────
const CX  = 130;
const CY  = 130;
const R   = 100;
const SW  = 26;
const PAD = 10;  // degrees trimmed per end → ~10px visible gap, pill-shaped segments

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

  // Needle geometry: thin elongated triangle with short tail behind hub
  const a_rad  = (angle * Math.PI) / 180;
  const cos_a  = Math.cos(a_rad);
  const sin_a  = Math.sin(a_rad);
  const tip    = polar(CX, CY, R * 0.78, angle);
  const tail   = polar(CX, CY, 18, angle + 180);
  const hw     = 2.0;   // half-width at widest point
  const needlePath = [
    `M ${(CX + sin_a * hw).toFixed(2)},${(CY + cos_a * hw).toFixed(2)}`,
    `L ${tip.x.toFixed(2)},${tip.y.toFixed(2)}`,
    `L ${(CX - sin_a * hw).toFixed(2)},${(CY - cos_a * hw).toFixed(2)}`,
    `L ${tail.x.toFixed(2)},${tail.y.toFixed(2)}`,
    "Z",
  ].join(" ");

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

      {/* ── Gauge card — white background, matches reference style ──────── */}
      <div
        className="relative select-none rounded-2xl"
        style={{ background: "#FFFFFF", padding: "20px 12px 16px" }}
      >
        <svg
          viewBox="0 0 260 150"
          className="w-full"
          style={{ display: "block" }}
          shapeRendering="geometricPrecision"
          aria-label={`Investment gauge: ${zone.label_vi}`}
        >
          <defs>
            <filter id="needle-shadow" x="-80%" y="-80%" width="260%" height="260%">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="rgba(0,0,0,0.22)" floodOpacity="1"/>
            </filter>
          </defs>

          {/* Background track */}
          <path
            d={arcD(CX, CY, R, 178, 2)}
            fill="none"
            stroke="rgba(0,0,0,0.06)"
            strokeWidth={SW + 2}
            strokeLinecap="round"
          />

          {/* 4 equal color zones (45° each) */}
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

          {/* Needle */}
          <path d={needlePath} fill="#111827" filter="url(#needle-shadow)" />

          {/* Hub: white outer ring → gray ring → dark center */}
          <circle cx={CX} cy={CY} r={16} fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="1.5"/>
          <circle cx={CX} cy={CY} r={10} fill="#4B5563"/>
          <circle cx={CX} cy={CY} r={4.5} fill="#111827"/>

          {/* Scale labels */}
          <text x={20} y={148} textAnchor="middle" fontSize="11" fontWeight="500" fill="#9CA3AF" fontFamily="ui-monospace,monospace">0</text>
          <text x={240} y={148} textAnchor="middle" fontSize="11" fontWeight="500" fill="#9CA3AF" fontFamily="ui-monospace,monospace">100</text>
        </svg>

        {/* Score & Recommendation — dark text on white card */}
        <div className="flex flex-col items-center gap-0.5" style={{ marginTop: -4 }}>
          <div
            className="font-mono tabular-nums"
            style={{ fontSize: 60, fontWeight: 700, lineHeight: 1, color: "#111827" }}
          >
            {Math.round(score)}
          </div>
          <div
            style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.3, color: zone.color, letterSpacing: "0.07em" }}
          >
            {zone.label_vi}
          </div>
          <div
            style={{ fontSize: 13, fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.20em", color: "#9CA3AF" }}
          >
            Khuyến nghị đầu tư
          </div>
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

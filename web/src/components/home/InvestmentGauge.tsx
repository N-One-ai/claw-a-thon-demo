"use client";

import { useEffect, useRef, useState } from "react";

// ── Geometry ──────────────────────────────────────────────────────────────────
const CX       = 170;           // arc center x
const CY       = 165;           // arc center y
const R        = 125;           // arc radius
const SW       = 20;            // stroke width (arc thickness)
const PAD      = 6;             // degrees trimmed per end → ~5px visible gap
const VBOX     = "0 0 340 205";
const TICK_IN  = R + SW / 2 + 3;   // 138 — inner tick radius
const TICK_OUT = R + SW / 2 + 9;   // 144 — outer tick radius
const LABEL_R  = R + SW / 2 + 22;  // 157 — label radius

// ── Business-logic zones (5) — drives recommendation label + color ────────────
const ZONES = [
  { color: "#EF4444", label_vi: "BÁN MẠNH", min: 0,  max: 20  },
  { color: "#F97316", label_vi: "BÁN",       min: 20, max: 40  },
  { color: "#EAB308", label_vi: "TRUNG LẬP", min: 40, max: 60  },
  { color: "#22C55E", label_vi: "MUA",        min: 60, max: 80  },
  { color: "#16A34A", label_vi: "MUA MẠNH",  min: 80, max: 100 },
] as const;

// ── Visual arc zones (4 equal 45° bands, user-specified) ─────────────────────
const ARC_ZONES = [
  { from: 180, to: 135, color: "#EF4444" },   // score  0–25
  { from: 135, to:  90, color: "#F97316" },   // score 25–50
  { from:  90, to:  45, color: "#EAB308" },   // score 50–75
  { from:  45, to:   0, color: "#22C55E" },   // score 75–100
];

const TICK_VALS  = Array.from({ length: 11 }, (_, i) => i * 10);
const TICK_MAJOR = new Set([0, 25, 50, 75, 100]);

// ── Pure helpers ──────────────────────────────────────────────────────────────
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

function scoreToAngle(s: number) {
  return 180 - (Math.max(0, Math.min(100, s)) / 100) * 180;
}

function zoneForScore(s: number) {
  return ZONES.find(z => s >= z.min && s < z.max) ?? ZONES[4];
}

function activeArcColor(s: number): string {
  const a = scoreToAngle(s);
  return (ARC_ZONES.find(z => a <= z.from && a >= z.to) ?? ARC_ZONES[3]).color;
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface GaugeProps {
  score:          number;
  recommendation: string;
  confidence:     number;
  reasoning:      string[];
  insight:        string;
}

// ── Needle animation — 800ms cubic ease-out, starts from 0 on mount ───────────
function useNeedleAngle(score: number) {
  const target  = scoreToAngle(score);
  const [angle, setAngle] = useState(180);
  const animRef = useRef<number>(0);
  const fromRef = useRef(180);

  useEffect(() => {
    cancelAnimationFrame(animRef.current);
    const from = fromRef.current;
    const dur  = 800;
    let t0: number | null = null;

    const tick = (ts: number) => {
      if (!t0) t0 = ts;
      const p    = Math.min((ts - t0) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);   // cubic ease-out
      const cur  = from + (target - from) * ease;
      fromRef.current = cur;
      setAngle(cur);
      if (p < 1) animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return angle;
}

// ── Main component ────────────────────────────────────────────────────────────
export function InvestmentGauge({ score, confidence, reasoning, insight }: GaugeProps) {
  const angle  = useNeedleAngle(score);
  const zone   = zoneForScore(score);
  const active = activeArcColor(score);

  // Needle — thin tapered polygon, tip at 86% of arc radius
  const tip  = polar(CX, CY, R * 0.86, angle);
  const tail = polar(CX, CY, 18,       angle + 180);
  const sinA = Math.sin(angle * Math.PI / 180);
  const cosA = Math.cos(angle * Math.PI / 180);
  const hw   = 2.2;
  const needlePath = [
    `M ${(CX + sinA * hw).toFixed(2)},${(CY + cosA * hw).toFixed(2)}`,
    `L ${tip.x.toFixed(2)},${tip.y.toFixed(2)}`,
    `L ${(CX - sinA * hw).toFixed(2)},${(CY - cosA * hw).toFixed(2)}`,
    `L ${tail.x.toFixed(2)},${tail.y.toFixed(2)}`,
    "Z",
  ].join(" ");

  // Staggered reveals
  const [confWidth,    setConfWidth   ] = useState(0);
  const [shownBullets, setShownBullets] = useState(0);
  const [insightOn,    setInsightOn   ] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setConfWidth(confidence), 500);
    return () => clearTimeout(t);
  }, [confidence]);

  useEffect(() => {
    setShownBullets(0);
    const ts = reasoning.map((_, i) =>
      setTimeout(() => setShownBullets(i + 1), 900 + i * 220));
    return () => ts.forEach(clearTimeout);
  }, [reasoning]);

  useEffect(() => {
    const t = setTimeout(() => setInsightOn(true), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col gap-4">

      {/* ── Gauge SVG ───────────────────────────────────────────────────────── */}
      <div className="relative select-none">
        <svg
          viewBox={VBOX}
          className="w-full"
          style={{ display: "block" }}
          shapeRendering="geometricPrecision"
          aria-label={`Gauge: ${zone.label_vi}`}
        >
          <defs>
            <filter id="g-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="5" result="b"/>
              <feMerge>
                <feMergeNode in="b"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <filter id="g-hub" x="-120%" y="-120%" width="340%" height="340%">
              <feDropShadow dx="0" dy="2" stdDeviation="5" floodColor="#000" floodOpacity="0.6"/>
            </filter>
          </defs>

          {/* Background track */}
          <path
            d={arcD(CX, CY, R, 178, 2)}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={SW + 2}
            strokeLinecap="round"
          />

          {/* Active-zone soft glow layer */}
          {ARC_ZONES.map((z, i) => z.color === active && (
            <path
              key={`gl${i}`}
              d={arcD(CX, CY, R, z.from - PAD, z.to + PAD)}
              fill="none"
              stroke={z.color}
              strokeWidth={SW + 20}
              strokeLinecap="round"
              opacity="0.18"
              filter="url(#g-glow)"
            />
          ))}

          {/* Color arcs — active zone full brightness, others dimmed to 50% */}
          {ARC_ZONES.map((z, i) => (
            <path
              key={i}
              d={arcD(CX, CY, R, z.from - PAD, z.to + PAD)}
              fill="none"
              stroke={z.color}
              strokeWidth={SW}
              strokeLinecap="round"
              opacity={z.color === active ? 1 : 0.5}
            />
          ))}

          {/* Tick marks every 10 points */}
          {TICK_VALS.map(v => {
            const a  = scoreToAngle(v);
            const p1 = polar(CX, CY, TICK_IN,  a);
            const p2 = polar(CX, CY, TICK_OUT, a);
            return (
              <line
                key={v}
                x1={p1.x.toFixed(2)} y1={p1.y.toFixed(2)}
                x2={p2.x.toFixed(2)} y2={p2.y.toFixed(2)}
                stroke={TICK_MAJOR.has(v) ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.18)"}
                strokeWidth={TICK_MAJOR.has(v) ? 1.5 : 1}
                strokeLinecap="round"
              />
            );
          })}

          {/* Zone labels: 0  25  50  75  100 */}
          {[0, 25, 50, 75, 100].map(v => {
            const a      = scoreToAngle(v);
            const p      = polar(CX, CY, LABEL_R, a);
            const anchor: "start" | "middle" | "end" =
              v === 0 ? "end" : v === 100 ? "start" : "middle";
            return (
              <text
                key={v}
                x={p.x.toFixed(2)}
                y={(p.y + 4).toFixed(2)}
                textAnchor={anchor}
                fontSize="11"
                fontWeight="500"
                fill="rgba(100,116,139,0.85)"
                fontFamily="ui-monospace,monospace"
              >
                {v}
              </text>
            );
          })}

          {/* Needle */}
          <path d={needlePath} fill="#0F172A"/>

          {/* Hub: dark navy fill + white border + shadow */}
          <circle cx={CX} cy={CY} r={13} fill="#0F172A" filter="url(#g-hub)"/>
          <circle cx={CX} cy={CY} r={13} fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1.5"/>
          <circle cx={CX} cy={CY} r={5}  fill="#1E293B"/>
        </svg>
      </div>

      {/* ── Score display ────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center -mt-3 gap-1">
        <div
          className="font-mono tabular-nums"
          style={{ fontSize: 64, fontWeight: 700, lineHeight: 1, color: "#FFFFFF" }}
        >
          {Math.round(score)}
        </div>
        <div
          style={{
            fontSize:      20,
            fontWeight:    600,
            lineHeight:    1.3,
            color:         zone.color,
            letterSpacing: "0.08em",
          }}
        >
          {zone.label_vi}
        </div>
        <div
          style={{
            fontSize:      11,
            fontWeight:    500,
            textTransform: "uppercase" as const,
            letterSpacing: "0.20em",
            color:         "#334155",
          }}
        >
          Khuyến nghị đầu tư
        </div>
      </div>

      {/* ── AI Confidence ────────────────────────────────────────────────────── */}
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

      {/* ── Reasoning bullets ────────────────────────────────────────────────── */}
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

      {/* ── AI Insight card ──────────────────────────────────────────────────── */}
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

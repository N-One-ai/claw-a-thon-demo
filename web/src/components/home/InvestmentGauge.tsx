"use client";

import { useEffect, useRef, useState } from "react";

// ── Geometry ──────────────────────────────────────────────────────────────────
const CX   = 160;
const CY   = 158;
const R    = 128;
const SW   = 22;
const VBOX = "0 0 320 192";

// ── Business-logic zones (5) — drives label + color ───────────────────────────
const ZONES = [
  { color: "#EF4444", label_vi: "BÁN MẠNH", min: 0,  max: 20  },
  { color: "#F97316", label_vi: "BÁN",       min: 20, max: 40  },
  { color: "#EAB308", label_vi: "TRUNG LẬP", min: 40, max: 60  },
  { color: "#22C55E", label_vi: "MUA",        min: 60, max: 80  },
  { color: "#16A34A", label_vi: "MUA MẠNH",  min: 80, max: 100 },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function arcD(cx: number, cy: number, r: number, fromDeg: number, toDeg: number) {
  const s     = polar(cx, cy, r, fromDeg);
  const e     = polar(cx, cy, r, toDeg);
  const span  = fromDeg - toDeg;
  // For span ≥ 180° the two semicircles are equal length; sweep=0 is ambiguous
  // and browsers pick the lower arc. sweep=1 (CW in SVG Y-down) forces upper.
  const sweep = span >= 180 ? 1 : 0;
  const lg    = span > 180  ? 1 : 0;
  return `M ${s.x.toFixed(2)},${s.y.toFixed(2)} A ${r},${r} 0 ${lg},${sweep} ${e.x.toFixed(2)},${e.y.toFixed(2)}`;
}

function scoreToAngle(s: number) {
  return 180 - (Math.max(0, Math.min(100, s)) / 100) * 180;
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

// ── Pointer animation — 800ms cubic ease-out, starts at 0 on mount ────────────
function usePointerAngle(score: number) {
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
      const ease = 1 - Math.pow(1 - p, 3);
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

// ── Component ─────────────────────────────────────────────────────────────────
export function InvestmentGauge({ score, confidence, reasoning, insight }: GaugeProps) {
  const angle = usePointerAngle(score);
  const zone  = zoneForScore(score);

  // Triangle pointer — rides on the arc, tip pointing toward center
  const sinA = Math.sin(angle * Math.PI / 180);
  const cosA = Math.cos(angle * Math.PI / 180);
  // Unit tangent (perpendicular to radius, CCW)
  const tx = -sinA, ty = -cosA;
  // Radial outward / inward unit vectors
  const rox = cosA, roy = -sinA;
  const rix = -cosA, riy = sinA;

  const triAnchor = polar(CX, CY, R, angle);
  const h  = 12;  // half-height: base to center, center to tip
  const hw = 8;   // half-width of base
  const bL = { x: triAnchor.x + rox * h + tx * hw, y: triAnchor.y + roy * h + ty * hw };
  const bR = { x: triAnchor.x + rox * h - tx * hw, y: triAnchor.y + roy * h - ty * hw };
  const tp = { x: triAnchor.x + rix * h,            y: triAnchor.y + riy * h            };
  const pointerPts = `${bL.x.toFixed(2)},${bL.y.toFixed(2)} ${bR.x.toFixed(2)},${bR.y.toFixed(2)} ${tp.x.toFixed(2)},${tp.y.toFixed(2)}`;

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
            {/* Horizontal gradient spanning full arc width — 4 zone colors */}
            <linearGradient
              id="arc-grad"
              x1={CX - R} y1="0"
              x2={CX + R} y2="0"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%"    stopColor="#EF4444"/>
              <stop offset="33.3%" stopColor="#F97316"/>
              <stop offset="66.7%" stopColor="#EAB308"/>
              <stop offset="100%"  stopColor="#22C55E"/>
            </linearGradient>
          </defs>

          {/* Single continuous 180° arc with 4-zone gradient */}
          <path
            d={arcD(CX, CY, R, 180, 0)}
            fill="none"
            stroke="url(#arc-grad)"
            strokeWidth={SW}
            strokeLinecap="round"
          />

          {/* Triangle pointer on the arc */}
          <polygon points={pointerPts} fill="#64748B"/>
        </svg>
      </div>

      {/* ── Score display ────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center -mt-2 gap-1">
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1, color: "#FFFFFF" }}>
          {Math.round(score)}
        </div>
        <div style={{ fontSize: 22, fontWeight: 400, lineHeight: 1.4, color: "#CBD5E1" }}>
          {zone.label_vi}
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

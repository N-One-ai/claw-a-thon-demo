"use client";

import { useEffect, useId, useRef, useState } from "react";

// ── Gauge geometry ─────────────────────────────────────────────────────────────
const CX = 130;
const CY = 118;
const R  = 95;
const SW = 10;
const PAD = 2; // degrees of gap between zone arcs

// ── Zone definitions (angle: 180° = left/Bán Mạnh, 0° = right/Mua Mạnh) ──────
const ZONES = [
  { from: 180, to: 144, color: "#FF3B30", label: "STRONG SELL", label_vi: "BÁN MẠNH", emoji: "🔴", min: 0,  max: 20  },
  { from: 144, to: 108, color: "#FF9500", label: "SELL",        label_vi: "BÁN",       emoji: "🟠", min: 20, max: 40  },
  { from: 108, to:  72, color: "#FFD60A", label: "NEUTRAL",     label_vi: "TRUNG LẬP", emoji: "🟡", min: 40, max: 60  },
  { from:  72, to:  36, color: "#34C759", label: "BUY",         label_vi: "MUA",        emoji: "🟢", min: 60, max: 80  },
  { from:  36, to:   0, color: "#7CFF4A", label: "STRONG BUY",  label_vi: "MUA MẠNH",  emoji: "💚", min: 80, max: 100 },
] as const;

// ── Geometry helpers ───────────────────────────────────────────────────────────
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

// ── Animated pointer ───────────────────────────────────────────────────────────
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
  score, recommendation, confidence, reasoning, insight,
}: GaugeProps) {
  const uid   = useId();
  const angle = usePointerAngle(score);
  const zone  = zoneForScore(score);

  // Dot sits on the arc
  const dot    = polar(CX, CY, R, angle);
  const glowId = `${uid}gw`;

  // Recommendation fade-in
  const [recOn, setRecOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setRecOn(true), 700); return () => clearTimeout(t); }, []);

  // Confidence bar animate
  const [confWidth, setConfWidth] = useState(0);
  useEffect(() => { const t = setTimeout(() => setConfWidth(confidence), 500); return () => clearTimeout(t); }, [confidence]);

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
  useEffect(() => { const t = setTimeout(() => setInsightOn(true), 1500); return () => clearTimeout(t); }, []);

  return (
    <div className="flex flex-col gap-4">

      {/* ── Gauge SVG ───────────────────────────────────────────────────── */}
      <div className="relative select-none">
        <svg
          viewBox="0 0 260 130"
          className="w-full"
          style={{ display: "block", maxHeight: 155 }}
          aria-label={`Investment gauge: ${recommendation}`}
        >
          <defs>
            <filter id={glowId} x="-30%" y="-100%" width="160%" height="400%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background track */}
          <path
            d={arcD(CX, CY, R, 180, 0)}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={SW + 2}
            strokeLinecap="butt"
          />

          {/* Zone arcs — each shrunk by PAD° on both ends to create natural gaps */}
          {ZONES.map((z, i) => (
            <path
              key={i}
              d={arcD(CX, CY, R, z.from - PAD, z.to + PAD)}
              fill="none"
              stroke={z.color}
              strokeWidth={SW}
              strokeLinecap="butt"
              opacity={z.label === zone.label ? "0.95" : "0.22"}
              style={z.label === zone.label
                ? { filter: `drop-shadow(0 0 4px ${z.color}55)` }
                : undefined}
            />
          ))}

          {/* Score number — center of gauge */}
          <text
            x={CX}
            y={CY - 20}
            textAnchor="middle"
            fontSize="30"
            fontWeight="700"
            fill="#FFFFFF"
            fontFamily="ui-monospace,monospace"
          >
            {Math.round(score)}
          </text>

          {/* Zone label (Vietnamese) — below score */}
          <text
            x={CX}
            y={CY - 4}
            textAnchor="middle"
            fontSize="9"
            fontWeight="600"
            fill={zone.color}
            fontFamily="ui-sans-serif,sans-serif"
            letterSpacing="0.08em"
          >
            {zone.label_vi}
          </text>

          {/* Dot glow layer */}
          <circle
            cx={dot.x.toFixed(2)}
            cy={dot.y.toFixed(2)}
            r="7"
            fill={zone.color}
            opacity="0.3"
            filter={`url(#${glowId})`}
          />

          {/* Dot on arc — Fear & Greed style */}
          <circle
            cx={dot.x.toFixed(2)}
            cy={dot.y.toFixed(2)}
            r="5.5"
            fill="rgba(9,13,20,0.95)"
            stroke="rgba(255,255,255,0.85)"
            strokeWidth="1.5"
          />
          <circle
            cx={dot.x.toFixed(2)}
            cy={dot.y.toFixed(2)}
            r="2"
            fill={zone.color}
          />
        </svg>
      </div>

      {/* ── Recommendation ─────────────────────────────────────────────── */}
      <div
        className="flex flex-col items-center gap-1 transition-all duration-600"
        style={{ opacity: recOn ? 1 : 0, transform: recOn ? "none" : "translateY(6px)" }}
      >
        <div className="text-[9px] font-medium uppercase tracking-[0.2em]"
          style={{ color: "#334155" }}>
          Khuyến nghị
        </div>
        <div
          className="text-[20px] font-bold font-mono tracking-widest"
          style={{
            color:      zone.color,
            textShadow: `0 0 24px ${zone.color}50`,
          }}
        >
          {zone.emoji} {recommendation}
        </div>
      </div>

      {/* ── Độ tin cậy AI ──────────────────────────────────────────────── */}
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

      {/* ── Lý do phân tích ────────────────────────────────────────────── */}
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

      {/* ── Nhận định AI ───────────────────────────────────────────────── */}
      <div
        className="rounded-2xl px-4 py-3.5 space-y-1.5"
        style={{
          background:  "rgba(124,255,74,0.045)",
          border:      "1px solid rgba(124,255,74,0.10)",
          opacity:     insightOn ? 1 : 0,
          transform:   insightOn ? "none" : "translateY(4px)",
          transition:  "opacity 0.5s ease, transform 0.5s ease",
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

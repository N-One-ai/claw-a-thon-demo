"use client";

import { cn } from "@/lib/utils";

interface GaugeChartProps {
  value: number;       // 0–100
  label?: string;
  sublabel?: string;
  size?: number;
  color?: "blue" | "green" | "red" | "yellow";
  className?: string;
}

const COLORS = {
  blue: { stroke: "#A3FF12", glow: "rgba(163,255,18,0.3)", text: "text-accent" },
  green: { stroke: "#2DFF7A", glow: "rgba(45,255,122,0.3)", text: "text-profit" },
  red: { stroke: "#FF4D6D", glow: "rgba(255,77,109,0.3)", text: "text-loss" },
  yellow: { stroke: "#FFB020", glow: "rgba(255,176,32,0.3)", text: "text-warn" },
};

export function GaugeChart({
  value,
  label,
  sublabel,
  size = 160,
  color = "blue",
  className,
}: GaugeChartProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const c = COLORS[color];

  // 270° arc (from 225° to -45°)
  const r = 54;
  const cx = 64;
  const cy = 64;
  const circumference = 2 * Math.PI * r;
  const arcLength = circumference * 0.75; // 270°
  const filled = arcLength * (clamped / 100);
  const gap = circumference - filled;

  // Rotate so arc starts at 225°
  const rotation = 135;

  return (
    <div
      className={cn("flex flex-col items-center", className)}
      style={{ width: size }}
    >
      <div className="relative" style={{ width: size, height: size * 0.85 }}>
        <svg
          viewBox="0 0 128 128"
          width={size}
          height={size * 0.85}
          className="overflow-visible"
        >
          <defs>
            <filter id={`glow-${color}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Track */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="10"
            strokeDasharray={`${arcLength} ${circumference - arcLength}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            transform={`rotate(${rotation}, ${cx}, ${cy})`}
          />

          {/* Filled arc */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={c.stroke}
            strokeWidth="10"
            strokeDasharray={`${filled} ${gap}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            transform={`rotate(${rotation}, ${cx}, ${cy})`}
            filter={`url(#glow-${color})`}
            style={{ transition: "stroke-dasharray 1s ease-out" }}
          />

          {/* Center text */}
          <text
            x={cx}
            y={cy - 4}
            textAnchor="middle"
            fill={c.stroke}
            fontSize="22"
            fontWeight="700"
            fontFamily="JetBrains Mono, monospace"
          >
            {clamped.toFixed(0)}
          </text>
          {label && (
            <text
              x={cx}
              y={cy + 14}
              textAnchor="middle"
              fill="#64748b"
              fontSize="8"
              fontWeight="500"
              letterSpacing="1"
              fontFamily="Inter, sans-serif"
              textDecoration="none"
            >
              {label.toUpperCase()}
            </text>
          )}
        </svg>

        {sublabel && (
          <p className="text-center text-xs text-slate-500 -mt-2">{sublabel}</p>
        )}
      </div>
    </div>
  );
}

/* ── Simple horizontal bar gauge ── */
interface BarGaugeProps {
  value: number;   // 0–100
  color?: "green" | "red" | "blue" | "yellow";
  height?: number;
}

export function BarGauge({ value, color = "blue", height = 6 }: BarGaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const colorMap = {
    green: "bg-profit",
    red: "bg-loss",
    blue: "bg-accent",
    yellow: "bg-warn",
  };

  return (
    <div
      className="w-full rounded-full bg-white/[0.05] overflow-hidden"
      style={{ height }}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-700", colorMap[color])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

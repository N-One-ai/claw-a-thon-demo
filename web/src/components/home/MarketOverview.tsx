"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────

interface IndexData   { value: number; change: number; change_pct: number }
interface BreadthData { advance: number; decline: number; unchanged: number }
interface SparklineData {
  vnindex: number[]; hnxindex: number[]; vn30: number[]; volume: number[];
}
interface MarketData {
  vnindex:     IndexData | null;
  vn30:        IndexData | null;
  hose:        BreadthData | null;
  hnx:         (IndexData & BreadthData) | null;
  liquidity:   number | null;
  volume:      number | null;
  foreignFlow: number | null;
  healthScore: number | null;
  sparklines?: SparklineData;
  errors:      string[];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Design tokens
// ─────────────────────────────────────────────────────────────────────────────

const POS   = "#7CFF4A";
const NEG   = "#FF5C7A";
const WARN  = "#FFB020";
const MUTED = "#94A3B8";

function indexColor(change?: number | null) {
  return (change ?? 0) >= 0 ? POS : NEG;
}

function healthMeta(score: number): { label: string; color: string } {
  if (score < 35) return { label: "Giảm mạnh",  color: NEG  };
  if (score < 48) return { label: "Thận trọng", color: WARN };
  if (score < 55) return { label: "Trung lập",  color: MUTED };
  if (score < 70) return { label: "Tích cực",   color: POS  };
  return             { label: "Tăng mạnh",       color: "#A3FF12" };
}

// ─────────────────────────────────────────────────────────────────────────────
//  useCountUp
// ─────────────────────────────────────────────────────────────────────────────

function useCountUp(target: number | null, ms = 820): number | null {
  const [cur, setCur] = useState<number | null>(null);
  const raf  = useRef<number>(0);
  const t0   = useRef<number>(0);
  const from = useRef<number>(0);

  useEffect(() => {
    if (target === null) { setCur(null); return; }
    cancelAnimationFrame(raf.current);
    t0.current   = performance.now();
    from.current = cur ?? target * 0.92;

    const tick = (ts: number) => {
      const p    = Math.min((ts - t0.current) / ms, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setCur(from.current + (target - from.current) * ease);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else        setCur(target);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return cur;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Sparkline (Catmull-Rom smooth curve)
// ─────────────────────────────────────────────────────────────────────────────

function Sparkline({
  data,
  color,
  height  = 48,
  stroke  = 1.5,
}: {
  data?:   number[];
  color:   string;
  height?: number;
  stroke?: number;
}) {
  const uid = useId();
  if (!data || data.length < 2) return <div style={{ height }} />;

  const W   = 400;
  const H   = height;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const rng = max - min || 1;
  const py  = 3;

  const pts: [number, number][] = data.map((v, i) => [
    (i / (data.length - 1)) * W,
    H - py - ((v - min) / rng) * (H - py * 2),
  ]);

  let path = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[Math.max(0, i - 2)];
    const [x1, y1] = pts[i - 1];
    const [x2, y2] = pts[i];
    const [x3, y3] = pts[Math.min(pts.length - 1, i + 1)];
    path += ` C${(x1+(x2-x0)/6).toFixed(2)},${(y1+(y2-y0)/6).toFixed(2)} ${(x2-(x3-x1)/6).toFixed(2)},${(y2-(y3-y1)/6).toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)}`;
  }

  const [lx, ly] = pts[pts.length - 1];
  const area = `${path} L${lx},${H} L0,${H} Z`;
  const gid  = `${uid}g`;
  const fid  = `${uid}f`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      className="w-full" style={{ height, display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.20" />
          <stop offset="65%"  stopColor={color} stopOpacity="0.04" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <filter id={fid} x="-5%" y="-60%" width="110%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b" />
          <feComposite in="SourceGraphic" in2="b" operator="over" />
        </filter>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={path} fill="none" stroke={color} strokeWidth={stroke * 2.2}
        strokeLinecap="round" strokeLinejoin="round" opacity="0.22" filter={`url(#${fid})`} />
      <path d={path} fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round" strokeLinejoin="round" opacity="0.90" />
      <circle cx={lx} cy={ly} r={stroke * 3.5} fill={color} opacity="0.15" />
      <circle cx={lx} cy={ly} r={stroke * 1.2} fill={color} opacity="0.95" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  LIVE badge + elapsed time
// ─────────────────────────────────────────────────────────────────────────────

function LiveBadge({ lastFetch }: { lastFetch: Date | null }) {
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      if (lastFetch) setSecs(Math.round((Date.now() - lastFetch.getTime()) / 1000));
    }, 1_000);
    return () => clearInterval(id);
  }, [lastFetch]);

  const label = !lastFetch ? ""
    : secs < 5  ? "Vừa cập nhật"
    : secs < 60 ? `${secs}s trước`
    : `${Math.floor(secs / 60)}p trước`;

  return (
    <div className="flex items-center gap-2.5">
      <span className="flex items-center gap-1.5">
        <span className="w-[5px] h-[5px] rounded-full animate-pulse"
          style={{ background: "#4AFF91", boxShadow: "0 0 6px #4AFF9180" }} />
        <span className="text-[10px] font-semibold tracking-[0.16em] uppercase"
          style={{ color: "#4AFF91" }}>LIVE</span>
      </span>
      {label && (
        <span className="text-[10px] tabular-nums" style={{ color: "#475569" }}>{label}</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Index KPI (VN-Index / VN30 / HNX-Index)
// ─────────────────────────────────────────────────────────────────────────────

function IndexKPI({
  label,
  data,
  sparkline,
}: {
  label:     string;
  data:      IndexData | null;
  sparkline?: number[];
}) {
  // Guard against undefined value at runtime (hnx may have breadth-only shape)
  const safeData: IndexData | null =
    data && typeof data.value === "number" ? data : null;

  const animated = useCountUp(safeData?.value ?? null);
  const color    = indexColor(safeData?.change);
  const isUp     = (safeData?.change ?? 0) >= 0;

  return (
    <div className="flex flex-col">
      {/* Label */}
      <div className="text-[10px] font-medium uppercase tracking-[0.15em] mb-2"
        style={{ color: "#475569" }}>
        {label}
      </div>

      {/* Value */}
      <div className="text-[22px] sm:text-[28px] font-mono font-bold leading-none tabular-nums"
        style={{ color: safeData ? "#FFFFFF" : "#1E293B" }}>
        {safeData && animated !== null
          ? animated.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : "--"}
      </div>

      {/* Change */}
      <div className="text-[11px] sm:text-xs font-mono font-semibold mt-1 tabular-nums"
        style={{ color: safeData ? color : "#1E293B" }}>
        {safeData
          ? `${isUp ? "+" : ""}${safeData.change.toFixed(2)}   ${isUp ? "+" : ""}${safeData.change_pct.toFixed(2)}%`
          : "--  (--)"}
      </div>

      {/* Mini sparkline — only when data provided */}
      {sparkline && sparkline.length >= 2 && (
        <div className="mt-3">
          <Sparkline data={sparkline} color={color} height={28} stroke={1.2} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Health score bar
// ─────────────────────────────────────────────────────────────────────────────

function HealthScore({ score }: { score: number | null }) {
  const animated = useCountUp(score);
  const s   = score ?? 0;
  const meta = healthMeta(s);

  return (
    <div className="flex flex-col gap-3">
      {/* Row: label ── score + status */}
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.15em]"
          style={{ color: "#475569" }}>
          Sức khỏe thị trường
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-mono font-bold" style={{ color: "#FFFFFF" }}>
            {score !== null && animated !== null ? Math.round(animated) : "--"}
          </span>
          <span className="text-[10px]" style={{ color: "#334155" }}>/100</span>
          <span className="text-[11px] font-semibold" style={{ color: meta.color }}>
            {meta.label}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{
            width:      `${s}%`,
            background: meta.color,
            boxShadow:  `0 0 10px ${meta.color}50`,
          }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Compact metric (no card — just text in a grid)
// ─────────────────────────────────────────────────────────────────────────────

function Metric({
  label,
  value,
  color,
  note,
}: {
  label: string;
  value: React.ReactNode;
  color?: string;
  note?:  string;
}) {
  return (
    <div className="flex flex-col gap-[3px]">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em]"
        style={{ color: "#475569" }}>
        {label}
      </div>
      <div className="text-sm sm:text-[15px] font-mono font-semibold tabular-nums leading-tight"
        style={{ color: color ?? "#FFFFFF" }}>
        {value}
      </div>
      {note && (
        <div className="text-[10px] font-mono" style={{ color: "#334155" }}>{note}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Loading skeleton
// ─────────────────────────────────────────────────────────────────────────────

function Skeleton() {
  const shimmer = "rounded-md animate-pulse";
  const bg0 = "rgba(255,255,255,0.04)";
  const bg1 = "rgba(255,255,255,0.07)";

  return (
    <div className="space-y-9">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-8">
        {[1, 0, 0].map((withChart, i) => (
          <div key={i} className="space-y-2.5">
            <div className={shimmer} style={{ height: 8, width: 48, background: bg0 }} />
            <div className={shimmer} style={{ height: 28, width: 120, background: bg1 }} />
            <div className={shimmer} style={{ height: 10, width: 88, background: bg0 }} />
            {withChart === 1 && (
              <div className={shimmer} style={{ height: 28, width: "100%", background: bg0, marginTop: 10 }} />
            )}
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }} />

      {/* Health */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <div className={shimmer} style={{ height: 8, width: 120, background: bg0 }} />
          <div className={shimmer} style={{ height: 18, width: 80, background: bg1 }} />
        </div>
        <div className={shimmer} style={{ height: 3, width: "100%", background: bg0 }} />
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        {[0,1,2,3].map(i => (
          <div key={i} className="space-y-2">
            <div className={shimmer} style={{ height: 8, width: 64, background: bg0 }} />
            <div className={shimmer} style={{ height: 16, width: 80, background: bg1 }} />
          </div>
        ))}
      </div>

      {/* Wide chart */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 24 }}>
        <div className={shimmer} style={{ height: 72, width: "100%", background: bg0, borderRadius: 10 }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main component
// ─────────────────────────────────────────────────────────────────────────────

export function MarketOverview() {
  const [data,       setData]       = useState<MarketData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [lastFetch,  setLastFetch]  = useState<Date | null>(null);
  const [visible,    setVisible]    = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/market", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          setData(json.data as MarketData);
          setLastFetch(new Date());
        }
      }
    } catch { /* keep stale data */ } finally {
      setLoading(false);
      requestAnimationFrame(() => setVisible(true));
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 20_000); // every 20s
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived values
  const sl        = data?.sparklines;
  const vnIdx     = data?.vnindex;
  const vnIdxClr  = indexColor(vnIdx?.change);
  const hose      = data?.hose;
  const breadthTot = hose ? hose.advance + hose.decline + hose.unchanged : 0;

  const ff        = data?.foreignFlow;
  const ffColor   = ff == null ? MUTED : ff >= 0 ? POS : NEG;
  const ffStr     = ff == null
    ? "--"
    : `${ff >= 0 ? "+" : ""}${Math.abs(ff).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} tỷ`;

  // Breadth display
  const breadthNode = hose ? (
    <span>
      <span style={{ color: POS }}>+{hose.advance}</span>
      <span style={{ color: "#334155" }}> / {hose.unchanged} / </span>
      <span style={{ color: NEG }}>−{hose.decline}</span>
    </span>
  ) : "--";

  const breadthNote = breadthTot > 0
    ? `${Math.round((hose!.advance / breadthTot) * 100)}% tăng giá`
    : undefined;

  return (
    <div
      className={cn(
        "w-full max-w-4xl mx-auto transition-all duration-700",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
      )}
    >
      <div
        className="rounded-[28px] border px-7 py-6 sm:px-10 sm:py-8"
        style={{
          background:   "rgba(11,16,21,0.94)",
          borderColor:  "rgba(126,255,74,0.14)",
          backdropFilter: "blur(28px)",
        }}
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-8">
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: "#64748B" }}
          >
            Tổng quan thị trường
          </span>
          <LiveBadge lastFetch={lastFetch} />
        </div>

        {loading ? <Skeleton /> : (
          <div className="space-y-8">

            {/* ── Row 1: Three KPIs ─────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-6 sm:gap-10">
              {/* VN-Index — primary focus, with mini sparkline */}
              <IndexKPI
                label="VN-Index"
                data={vnIdx ?? null}
                sparkline={sl?.vnindex}
              />
              {/* VN30 — numbers only */}
              <IndexKPI
                label="VN30"
                data={data?.vn30 ?? null}
              />
              {/* HNX-Index — numbers only */}
              <IndexKPI
                label="HNX-Index"
                data={data?.hnx ?? null}
              />
            </div>

            {/* ── Divider ───────────────────────────────────────────────── */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }} />

            {/* ── Row 2: Market Health Score ────────────────────────────── */}
            <HealthScore score={data?.healthScore ?? null} />

            {/* ── Row 3: Four compact metrics ───────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-5">
              <Metric
                label="Thanh khoản"
                value={data?.liquidity != null
                  ? `${data.liquidity.toLocaleString("vi-VN", { maximumFractionDigits: 0 })} tỷ`
                  : "--"}
                note="VND · HOSE"
              />
              <Metric
                label="Khối lượng"
                value={data?.volume != null
                  ? `${data.volume.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`
                  : "--"}
                note="Triệu CP · HOSE"
              />
              <Metric
                label="Độ rộng TT"
                value={breadthNode}
                note={breadthNote}
              />
              <Metric
                label="NN Ròng"
                value={ffStr}
                color={ffColor}
                note={ff != null ? "Tỷ VND" : undefined}
              />
            </div>

            {/* ── Bottom: Full-width VNIndex sparkline ──────────────────── */}
            {sl?.vnindex && sl.vnindex.length >= 2 && (
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 24 }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] uppercase tracking-[0.14em]"
                    style={{ color: "#334155" }}>
                    VN-Index · 27 ngày
                  </span>
                  {vnIdx && (
                    <span className="text-[10px] font-mono tabular-nums"
                      style={{ color: vnIdxClr }}>
                      {(vnIdx.change >= 0 ? "+" : "")}{vnIdx.change.toFixed(2)}
                      {"  "}
                      {(vnIdx.change_pct >= 0 ? "+" : "")}{vnIdx.change_pct.toFixed(2)}%
                    </span>
                  )}
                </div>
                <Sparkline
                  data={sl.vnindex}
                  color={vnIdxClr}
                  height={72}
                  stroke={1.8}
                />
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}

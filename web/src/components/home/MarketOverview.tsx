"use client";

import { useEffect, useId, useRef, useState } from "react";
import { TrendingUp, BarChart3, CandlestickChart, Wallet, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface IndexData {
  value: number;
  change: number;
  change_pct: number;
}

interface BreadthData {
  advance: number;
  decline: number;
  unchanged: number;
}

interface SparklineData {
  vnindex:  number[];
  hnxindex: number[];
  volume:   number[];
}

interface MarketData {
  vnindex:    IndexData | null;
  hose:       BreadthData | null;
  hnx:        (IndexData & BreadthData) | null;
  liquidity:  number | null;
  volume:     number | null;
  sparklines?: SparklineData;
  errors:     string[];
}

// ── Animated counter ──────────────────────────────────────────────────────────

function useCountUp(target: number | null, duration = 900): number | null {
  const [current, setCurrent] = useState<number | null>(null);
  const raf   = useRef<number>(0);
  const t0    = useRef<number>(0);
  const from  = useRef<number>(0);

  useEffect(() => {
    if (target === null) { setCurrent(null); return; }
    cancelAnimationFrame(raf.current);
    t0.current   = performance.now();
    from.current = current ?? target * 0.8;

    const tick = (ts: number) => {
      const p    = Math.min((ts - t0.current) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setCurrent(from.current + (target - from.current) * ease);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else        setCurrent(target);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return current;
}

// ── Sparkline SVG ─────────────────────────────────────────────────────────────

const PROFIT = "#7CFF3B";
const LOSS   = "#FF5A76";

function Sparkline({ data, color = PROFIT }: { data?: number[]; color?: string }) {
  const id = useId();
  if (!data || data.length < 2) return <div style={{ height: 38 }} />;

  const W = 200, H = 38;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  // Map values → SVG coords (2 px vertical padding)
  const pts: [number, number][] = data.map((v, i) => [
    (i / (data.length - 1)) * W,
    H - 2 - ((v - min) / range) * (H - 4),
  ]);

  // Catmull-Rom → cubic Bézier for smooth curve
  let line = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[Math.max(0, i - 2)];
    const [x1, y1] = pts[i - 1];
    const [x2, y2] = pts[i];
    const [x3, y3] = pts[Math.min(pts.length - 1, i + 1)];
    const cp1x = (x1 + (x2 - x0) / 6).toFixed(2);
    const cp1y = (y1 + (y2 - y0) / 6).toFixed(2);
    const cp2x = (x2 - (x3 - x1) / 6).toFixed(2);
    const cp2y = (y2 - (y3 - y1) / 6).toFixed(2);
    line += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${x2.toFixed(2)},${y2.toFixed(2)}`;
  }

  const [lx, ly] = pts[pts.length - 1];
  const area = `${line} L${lx},${H} L0,${H} Z`;
  const gradId = `${id}g`;
  const filtId = `${id}f`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height: H, display: "block", marginTop: 6 }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.30" />
          <stop offset="75%"  stopColor={color} stopOpacity="0.06" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <filter id={filtId} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      {/* Gradient area fill */}
      <path d={area} fill={`url(#${gradId})`} />
      {/* Glow pass */}
      <path
        d={line} fill="none" stroke={color} strokeWidth="3"
        strokeLinecap="round" strokeLinejoin="round"
        opacity="0.3" filter={`url(#${filtId})`}
      />
      {/* Crisp line */}
      <path
        d={line} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.9"
      />
      {/* Terminal dot */}
      <circle cx={lx} cy={ly} r="4"   fill={color} opacity="0.18" />
      <circle cx={lx} cy={ly} r="2.2" fill={color} opacity="0.95" />
    </svg>
  );
}

// ── Widget shell ──────────────────────────────────────────────────────────────

function Widget({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col gap-1.5 p-3.5 sm:p-4 rounded-2xl border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_24px_rgba(163,255,18,0.09)] overflow-hidden"
      style={{ background: "rgba(255,255,255,0.028)", borderColor: "rgba(163,255,18,0.13)" }}
    >
      {children}
    </div>
  );
}

function Label({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex items-center gap-1.5 text-slate-500 text-[10px] sm:text-xs font-medium">
      <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-accent shrink-0" />
      <span className="truncate">{text}</span>
    </div>
  );
}

function IndexVal({ data }: { data: IndexData | null }) {
  const animated = useCountUp(data?.value ?? null);
  const isUp     = (data?.change ?? 0) >= 0;

  return (
    <>
      <div className={cn("font-mono font-bold text-base sm:text-lg leading-none", data ? "text-white" : "text-slate-600")}>
        {data && animated !== null
          ? animated.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : "--"}
      </div>
      {data ? (
        <div className={cn("text-[10px] sm:text-xs font-mono font-semibold", isUp ? "text-profit" : "text-loss")}>
          {isUp ? "▲" : "▼"} {Math.abs(data.change).toFixed(2)} ({isUp ? "+" : ""}{data.change_pct.toFixed(2)}%)
        </div>
      ) : (
        <div className="text-[10px] text-slate-700">-- / --%</div>
      )}
    </>
  );
}

function BreadthBar({ data }: { data: BreadthData | null }) {
  const total   = data ? (data.advance + data.decline + data.unchanged) || 1 : 1;
  const advPct  = data ? (data.advance   / total) * 100 : 0;
  const decPct  = data ? (data.decline   / total) * 100 : 0;
  const unchPct = data ? (data.unchanged / total) * 100 : 0;

  return data ? (
    <>
      <div className="flex h-1 rounded-full overflow-hidden gap-[1px] mt-0.5">
        <div className="rounded-full bg-profit transition-all duration-700" style={{ width: `${advPct}%` }} />
        <div className="rounded-full bg-slate-700 transition-all duration-700" style={{ width: `${unchPct}%` }} />
        <div className="rounded-full bg-loss   transition-all duration-700" style={{ width: `${decPct}%` }} />
      </div>
      <div className="flex gap-2 text-[9px] sm:text-[10px] font-mono">
        <span className="text-profit">▲{data.advance}</span>
        <span className="text-slate-600">—{data.unchanged}</span>
        <span className="text-loss">▼{data.decline}</span>
      </div>
    </>
  ) : (
    <>
      <div className="h-1 rounded-full bg-slate-800 mt-0.5" />
      <div className="text-[10px] text-slate-700">--/--/--</div>
    </>
  );
}

// ── The 5 widgets ─────────────────────────────────────────────────────────────

function VNIndexWidget({ data, sparkline }: { data: IndexData | null; sparkline?: number[] }) {
  const color = (data?.change ?? 0) >= 0 ? PROFIT : LOSS;
  return (
    <Widget>
      <Label icon={TrendingUp} text="VN-Index" />
      <IndexVal data={data} />
      <Sparkline data={sparkline} color={color} />
    </Widget>
  );
}

function HOSEWidget({ data, sparkline }: { data: BreadthData | null; sparkline?: number[] }) {
  const color = data ? (data.advance >= data.decline ? PROFIT : LOSS) : PROFIT;
  return (
    <Widget>
      <Label icon={BarChart3} text="HOSE" />
      <div className={cn("font-mono font-bold text-base sm:text-lg leading-none", data ? "text-white" : "text-slate-600")}>
        {data ? `${data.advance + data.decline + data.unchanged} mã` : "--"}
      </div>
      <BreadthBar data={data} />
      <Sparkline data={sparkline} color={color} />
    </Widget>
  );
}

function HNXWidget({ data, sparkline }: { data: (IndexData & BreadthData) | null; sparkline?: number[] }) {
  const color = (data?.change ?? 0) >= 0 ? PROFIT : LOSS;
  return (
    <Widget>
      <Label icon={CandlestickChart} text="HNX-Index" />
      <IndexVal data={data} />
      <Sparkline data={sparkline} color={color} />
    </Widget>
  );
}

function LiquidityWidget({ value, sparkline }: { value: number | null; sparkline?: number[] }) {
  const animated = useCountUp(value);
  const color = sparkline && sparkline.length >= 2
    ? (sparkline[sparkline.length - 1] >= sparkline[sparkline.length - 2] ? PROFIT : LOSS)
    : PROFIT;
  return (
    <Widget>
      <Label icon={Wallet} text="Thanh khoản" />
      <div className={cn("font-mono font-bold text-base sm:text-lg leading-none", value !== null ? "text-white" : "text-slate-600")}>
        {value !== null && animated !== null
          ? `${animated.toLocaleString("vi-VN", { maximumFractionDigits: 0 })} tỷ`
          : "--"}
      </div>
      <div className="text-[10px] text-slate-600 font-mono">VND · HOSE</div>
      <Sparkline data={sparkline} color={color} />
    </Widget>
  );
}

function VolumeWidget({ value, sparkline }: { value: number | null; sparkline?: number[] }) {
  const animated = useCountUp(value);
  const color = sparkline && sparkline.length >= 2
    ? (sparkline[sparkline.length - 1] >= sparkline[sparkline.length - 2] ? PROFIT : LOSS)
    : PROFIT;
  return (
    <Widget>
      <Label icon={BarChart2} text="Khối lượng" />
      <div className={cn("font-mono font-bold text-base sm:text-lg leading-none", value !== null ? "text-white" : "text-slate-600")}>
        {value !== null && animated !== null
          ? `${animated.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`
          : "--"}
      </div>
      <div className="text-[10px] text-slate-600 font-mono">triệu CP · HOSE</div>
      <Sparkline data={sparkline} color={color} />
    </Widget>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function WidgetSkeleton() {
  return (
    <div
      className="flex flex-col gap-2 p-3.5 sm:p-4 rounded-2xl border animate-pulse"
      style={{ background: "rgba(255,255,255,0.018)", borderColor: "rgba(163,255,18,0.07)" }}
    >
      <div className="h-2.5 w-16 bg-slate-800 rounded-full" />
      <div className="h-5 w-20 bg-slate-700 rounded-full" />
      <div className="h-2   w-14 bg-slate-800 rounded-full" />
      <div className="h-9   w-full bg-slate-800/50 rounded-lg mt-1" />
    </div>
  );
}

// ── Freshness label ───────────────────────────────────────────────────────────

function useFreshness(lastFetch: Date | null): string | null {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      if (lastFetch) setSecs(Math.round((Date.now() - lastFetch.getTime()) / 1000));
    }, 5_000);
    return () => clearInterval(id);
  }, [lastFetch]);
  if (!lastFetch) return null;
  if (secs < 10) return "Vừa cập nhật";
  if (secs < 60) return `${secs}s trước`;
  return `${Math.floor(secs / 60)}p trước`;
}

// ── Main component ────────────────────────────────────────────────────────────

export function MarketOverview() {
  const [data,      setData]      = useState<MarketData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [visible,   setVisible]   = useState(false);
  const freshness = useFreshness(lastFetch);

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
    } catch {
      // keep previous data — degrade gracefully
    } finally {
      setLoading(false);
      requestAnimationFrame(() => setVisible(true));
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sl = data?.sparklines;

  return (
    <div
      className={cn(
        "w-full max-w-3xl mx-auto px-4 sm:px-0 transition-all duration-500",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
      )}
    >
      <div
        className="rounded-[20px] border p-3.5 sm:p-4 backdrop-blur-xl"
        style={{
          background: "rgba(10,13,18,0.72)",
          borderColor: "rgba(163,255,18,0.15)",
          boxShadow: "0 0 0 1px rgba(163,255,18,0.05), 0 8px 40px rgba(163,255,18,0.04)",
        }}
      >
        {/* Header row */}
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-slow" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-accent/70">
            Tổng quan thị trường
          </span>
          {!loading && freshness && (
            <span className="ml-auto text-[10px] text-slate-700 tabular-nums">{freshness}</span>
          )}
        </div>

        {/* 5 widgets: 2-col mobile → 3-col sm → 5-col lg */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <WidgetSkeleton key={i} />)
          ) : (
            <>
              <VNIndexWidget  data={data?.vnindex   ?? null} sparkline={sl?.vnindex} />
              <HOSEWidget     data={data?.hose       ?? null} sparkline={sl?.vnindex} />
              <HNXWidget      data={data?.hnx        ?? null} sparkline={sl?.hnxindex} />
              <LiquidityWidget value={data?.liquidity ?? null} sparkline={sl?.volume} />
              <VolumeWidget    value={data?.volume    ?? null} sparkline={sl?.volume} />
            </>
          )}
        </div>

        {/* Backend errors (dev-visible, non-intrusive) */}
        {data?.errors?.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {data.errors.map((e, i) => (
              <span key={i} className="text-[9px] text-slate-700 bg-slate-900 px-2 py-0.5 rounded-full truncate max-w-[200px]">
                {e}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

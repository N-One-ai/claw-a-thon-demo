"use client";

import { useEffect, useRef, useState } from "react";
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

interface MarketData {
  vnindex: IndexData | null;
  hnxindex: IndexData | null;
  vn30: IndexData | null;
  hose_breadth: BreadthData | null;
  hnx_breadth: BreadthData | null;
  liquidity_ty: number | null;
  liquidity_prev_ty: number | null;
  volume_mn_shares: number | null;
}

// ── Animated counter ─────────────────────────────────────────────────────────

function useCountUp(target: number | null, duration = 900): number | null {
  const [current, setCurrent] = useState<number | null>(null);
  const raf = useRef<number>(0);
  const startTs = useRef<number>(0);
  const startVal = useRef<number>(0);

  useEffect(() => {
    if (target === null) { setCurrent(null); return; }
    cancelAnimationFrame(raf.current);
    startTs.current = performance.now();
    startVal.current = current ?? 0;

    const animate = (ts: number) => {
      const progress = Math.min((ts - startTs.current) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const val = startVal.current + (target - startVal.current) * ease;
      setCurrent(val);
      if (progress < 1) raf.current = requestAnimationFrame(animate);
      else setCurrent(target);
    };
    raf.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return current;
}

// ── Widget shell ─────────────────────────────────────────────────────────────

function Widget({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 p-3.5 sm:p-4 rounded-2xl border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_24px_rgba(163,255,18,0.09)]",
        className,
      )}
      style={{ background: "rgba(255,255,255,0.028)", borderColor: "rgba(163,255,18,0.13)" }}
    >
      {children}
    </div>
  );
}

function WidgetLabel({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-slate-500 text-[10px] sm:text-xs font-medium">
      <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-accent shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}

// ── VN-Index widget ───────────────────────────────────────────────────────────

function IndexWidget({
  label, icon: Icon, data,
}: {
  label: string;
  icon: React.ElementType;
  data: IndexData | null;
}) {
  const animated = useCountUp(data?.value ?? null);
  const isUp = (data?.change ?? 0) >= 0;
  const displayVal = animated !== null
    ? animated.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "--";

  return (
    <Widget>
      <WidgetLabel icon={Icon} label={label} />
      <div className={cn("font-mono font-bold text-base sm:text-lg leading-none", data ? "text-white" : "text-slate-600")}>
        {displayVal}
      </div>
      {data ? (
        <div className={cn("text-[10px] sm:text-xs font-mono font-semibold", isUp ? "text-profit" : "text-loss")}>
          {isUp ? "▲" : "▼"} {Math.abs(data.change).toFixed(2)} ({isUp ? "+" : ""}{data.change_pct.toFixed(2)}%)
        </div>
      ) : (
        <div className="text-[10px] text-slate-700">-- / --%</div>
      )}
    </Widget>
  );
}

// ── Breadth widget ────────────────────────────────────────────────────────────

function BreadthWidget({
  label, icon: Icon, data, indexData,
}: {
  label: string;
  icon: React.ElementType;
  data: BreadthData | null;
  indexData?: IndexData | null;
}) {
  const total = data ? (data.advance + data.decline + data.unchanged) || 1 : 1;
  const advPct = data ? (data.advance / total) * 100 : 0;
  const decPct = data ? (data.decline / total) * 100 : 0;
  const unchPct = data ? (data.unchanged / total) * 100 : 0;

  const animated = useCountUp(indexData?.value ?? null);
  const isUp = (indexData?.change ?? 0) >= 0;
  const displayVal = animated !== null
    ? animated.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : null;

  return (
    <Widget>
      <WidgetLabel icon={Icon} label={label} />

      {/* Index value if provided */}
      {indexData !== undefined && (
        <div className={cn("font-mono font-bold text-base sm:text-lg leading-none", indexData ? "text-white" : "text-slate-600")}>
          {displayVal ?? "--"}
        </div>
      )}
      {indexData && (
        <div className={cn("text-[10px] font-mono font-semibold", isUp ? "text-profit" : "text-loss")}>
          {isUp ? "▲" : "▼"} {Math.abs(indexData.change).toFixed(2)} ({isUp ? "+" : ""}{indexData.change_pct.toFixed(2)}%)
        </div>
      )}

      {/* Breadth bar */}
      {data ? (
        <>
          <div className="flex h-1 rounded-full overflow-hidden gap-[1px] mt-0.5">
            <div className="rounded-full bg-profit transition-all duration-700" style={{ width: `${advPct}%` }} />
            <div className="rounded-full bg-slate-700 transition-all duration-700" style={{ width: `${unchPct}%` }} />
            <div className="rounded-full bg-loss transition-all duration-700" style={{ width: `${decPct}%` }} />
          </div>
          <div className="flex gap-2 text-[9px] sm:text-[10px] font-mono mt-0.5">
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
      )}
    </Widget>
  );
}

// ── Liquidity widget ──────────────────────────────────────────────────────────

function LiquidityWidget({ valueTy, prevTy }: { valueTy: number | null; prevTy: number | null }) {
  const animated = useCountUp(valueTy);
  const isUp = valueTy !== null && prevTy !== null ? valueTy >= prevTy : null;
  const displayVal = animated !== null
    ? animated.toLocaleString("vi-VN", { maximumFractionDigits: 0 })
    : null;

  return (
    <Widget>
      <WidgetLabel icon={Wallet} label="Thanh khoản" />
      <div className={cn("font-mono font-bold text-base sm:text-lg leading-none", valueTy !== null ? "text-white" : "text-slate-600")}>
        {displayVal !== null ? `${displayVal} tỷ` : "--"}
      </div>
      {isUp !== null ? (
        <div className={cn("text-[10px] sm:text-xs font-mono font-semibold", isUp ? "text-profit" : "text-loss")}>
          {isUp ? "▲" : "▼"} so hôm qua
        </div>
      ) : (
        <div className="text-[10px] text-slate-700">HOSE</div>
      )}
    </Widget>
  );
}

// ── Volume widget ─────────────────────────────────────────────────────────────

function VolumeWidget({ volumeMn }: { volumeMn: number | null }) {
  const animated = useCountUp(volumeMn);
  const displayVal = animated !== null
    ? animated.toLocaleString("vi-VN", { maximumFractionDigits: 1 })
    : null;

  return (
    <Widget>
      <WidgetLabel icon={BarChart2} label="Khối lượng" />
      <div className={cn("font-mono font-bold text-base sm:text-lg leading-none", volumeMn !== null ? "text-white" : "text-slate-600")}>
        {displayVal !== null ? `${displayVal} tr` : "--"}
      </div>
      <div className="text-[10px] text-slate-600 font-mono">triệu CP / HOSE</div>
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
      <div className="h-2 w-14 bg-slate-800 rounded-full" />
    </div>
  );
}

// ── Timestamp ─────────────────────────────────────────────────────────────────

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ── Main component ────────────────────────────────────────────────────────────

export function MarketOverview() {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [visible, setVisible] = useState(false);
  const now = useNow(10_000);

  const load = async () => {
    try {
      const res = await fetch("/api/market", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          setData(json.data);
          setLastFetch(new Date());
        }
      }
    } catch {
      // keep previous data, degrade gracefully
    } finally {
      setLoading(false);
      requestAnimationFrame(() => setVisible(true));
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000); // refresh mỗi 1 phút
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const secondsAgo = lastFetch
    ? Math.round((now.getTime() - lastFetch.getTime()) / 1000)
    : null;

  const freshnessLabel =
    secondsAgo === null ? null
    : secondsAgo < 10   ? "Vừa cập nhật"
    : secondsAgo < 60   ? `${secondsAgo}s trước`
    : `${Math.floor(secondsAgo / 60)}p trước`;

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
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-slow" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-accent/70">
            Tổng quan thị trường
          </span>
          {freshnessLabel && !loading && (
            <span className="ml-auto text-[10px] text-slate-700 tabular-nums">{freshnessLabel}</span>
          )}
        </div>

        {/* 5 widgets grid: 2-col mobile → 3-col sm → 5-col lg */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <WidgetSkeleton key={i} />)
          ) : (
            <>
              <IndexWidget
                label="VN-Index"
                icon={TrendingUp}
                data={data?.vnindex ?? null}
              />
              <BreadthWidget
                label="HOSE"
                icon={BarChart3}
                data={data?.hose_breadth ?? null}
              />
              <BreadthWidget
                label="HNX"
                icon={CandlestickChart}
                data={data?.hnx_breadth ?? null}
                indexData={data?.hnxindex ?? null}
              />
              <LiquidityWidget
                valueTy={data?.liquidity_ty ?? null}
                prevTy={data?.liquidity_prev_ty ?? null}
              />
              <VolumeWidget volumeMn={data?.volume_mn_shares ?? null} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

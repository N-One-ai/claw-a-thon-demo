"use client";

import { useEffect, useRef, useState } from "react";
import { LineChart, BarChart3, CandlestickChart, Wallet, Globe } from "lucide-react";
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
  foreign_net_ty: number | null;
}

// ── Animated counter ─────────────────────────────────────────────────────────

function useCountUp(target: number | null, duration = 1000): string {
  const [current, setCurrent] = useState<number>(0);
  const raf = useRef<number>(0);
  const startTs = useRef<number>(0);
  const startVal = useRef<number>(0);

  useEffect(() => {
    if (target === null) return;
    cancelAnimationFrame(raf.current);
    startTs.current = performance.now();
    startVal.current = current;

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

  if (target === null) return "--";
  return current.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

// ── Sub-components ───────────────────────────────────────────────────────────

function IndexWidget({
  label, icon: Icon, data,
}: {
  label: string;
  icon: React.ElementType;
  data: IndexData | null;
}) {
  const valueStr = useCountUp(data?.value ?? null);
  const isUp = (data?.change ?? 0) >= 0;

  return (
    <div className="market-widget group flex flex-col gap-1.5 p-4 rounded-2xl border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(163,255,18,0.08)]"
      style={{
        background: "rgba(255,255,255,0.03)",
        borderColor: "rgba(163,255,18,0.12)",
      }}
    >
      <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
        <Icon className="w-3.5 h-3.5 text-accent" />
        {label}
      </div>
      <div className={cn("font-mono font-bold text-lg leading-none", data ? "text-white" : "text-slate-600")}>
        {data ? valueStr : "--"}
      </div>
      {data ? (
        <div className={cn("text-xs font-mono font-semibold", isUp ? "text-profit" : "text-loss")}>
          {isUp ? "▲" : "▼"} {Math.abs(data.change).toFixed(2)} ({isUp ? "+" : ""}{data.change_pct.toFixed(2)}%)
        </div>
      ) : (
        <div className="text-xs text-slate-700">--</div>
      )}
    </div>
  );
}

function BreadthWidget({
  label, icon: Icon, data,
}: {
  label: string;
  icon: React.ElementType;
  data: BreadthData | null;
}) {
  const total = data ? (data.advance + data.decline + data.unchanged) || 1 : 1;
  const advPct = data ? (data.advance / total) * 100 : 0;
  const decPct = data ? (data.decline / total) * 100 : 0;
  const unchPct = data ? (data.unchanged / total) * 100 : 0;

  return (
    <div className="market-widget group flex flex-col gap-1.5 p-4 rounded-2xl border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(163,255,18,0.08)]"
      style={{
        background: "rgba(255,255,255,0.03)",
        borderColor: "rgba(163,255,18,0.12)",
      }}
    >
      <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
        <Icon className="w-3.5 h-3.5 text-accent" />
        {label}
      </div>

      {data ? (
        <>
          {/* Breadth bar */}
          <div className="flex h-1.5 rounded-full overflow-hidden gap-[1px] mt-1">
            <div className="rounded-full bg-profit transition-all duration-700" style={{ width: `${advPct}%` }} />
            <div className="rounded-full bg-slate-600 transition-all duration-700" style={{ width: `${unchPct}%` }} />
            <div className="rounded-full bg-loss transition-all duration-700" style={{ width: `${decPct}%` }} />
          </div>
          {/* Counts */}
          <div className="flex gap-2 text-[10px] font-mono mt-0.5">
            <span className="text-profit">▲ {data.advance}</span>
            <span className="text-slate-600">— {data.unchanged}</span>
            <span className="text-loss">▼ {data.decline}</span>
          </div>
        </>
      ) : (
        <>
          <div className="h-1.5 rounded-full bg-slate-800 mt-1" />
          <div className="text-xs text-slate-700 mt-0.5">-- / -- / --</div>
        </>
      )}
    </div>
  );
}

function LiquidityWidget({ valueTy, prevTy }: { valueTy: number | null; prevTy: number | null }) {
  const countedVal = useCountUp(valueTy);
  const isUp = valueTy !== null && prevTy !== null ? valueTy >= prevTy : null;

  return (
    <div className="market-widget group flex flex-col gap-1.5 p-4 rounded-2xl border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(163,255,18,0.08)]"
      style={{
        background: "rgba(255,255,255,0.03)",
        borderColor: "rgba(163,255,18,0.12)",
      }}
    >
      <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
        <Wallet className="w-3.5 h-3.5 text-accent" />
        Thanh khoản HOSE
      </div>
      <div className={cn("font-mono font-bold text-lg leading-none", valueTy !== null ? "text-white" : "text-slate-600")}>
        {valueTy !== null ? `${countedVal} tỷ` : "--"}
      </div>
      {isUp !== null ? (
        <div className={cn("text-xs font-mono font-semibold", isUp ? "text-profit" : "text-loss")}>
          {isUp ? "▲" : "▼"} so hôm qua
        </div>
      ) : (
        <div className="text-xs text-slate-700">--</div>
      )}
    </div>
  );
}

function ForeignWidget({ netTy }: { netTy: number | null }) {
  const counted = useCountUp(netTy !== null ? Math.abs(netTy) : null);
  const isNet = netTy !== null ? netTy >= 0 : null;

  return (
    <div className="market-widget group flex flex-col gap-1.5 p-4 rounded-2xl border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(163,255,18,0.08)]"
      style={{
        background: "rgba(255,255,255,0.03)",
        borderColor: "rgba(163,255,18,0.12)",
      }}
    >
      <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
        <Globe className="w-3.5 h-3.5 text-accent" />
        Khối ngoại (ròng)
      </div>
      <div className={cn(
        "font-mono font-bold text-lg leading-none",
        isNet === null ? "text-slate-600" : isNet ? "text-profit" : "text-loss",
      )}>
        {netTy !== null ? `${isNet ? "+" : "-"}${counted} tỷ` : "--"}
      </div>
      <div className={cn("text-xs font-mono font-semibold", isNet === null ? "text-slate-700" : isNet ? "text-profit" : "text-loss")}>
        {isNet === null ? "--" : isNet ? "Mua ròng" : "Bán ròng"}
      </div>
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function WidgetSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-4 rounded-2xl border animate-pulse"
      style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(163,255,18,0.07)" }}
    >
      <div className="h-3 w-20 bg-slate-800 rounded-full" />
      <div className="h-5 w-24 bg-slate-700 rounded-full" />
      <div className="h-3 w-16 bg-slate-800 rounded-full" />
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function MarketOverview() {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/market", { cache: "no-store" });
        if (!res.ok) throw new Error("API error");
        const json = await res.json();
        if (json?.data) setData(json.data);
      } catch {
        // show "--" for all widgets — graceful degradation
        setData({
          vnindex: null, hnxindex: null, vn30: null,
          hose_breadth: null, hnx_breadth: null,
          liquidity_ty: null, liquidity_prev_ty: null,
          foreign_net_ty: null,
        });
      } finally {
        setLoading(false);
        // Slight delay for fade-in after content is ready
        requestAnimationFrame(() => setVisible(true));
      }
    };
    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={cn(
        "w-full max-w-3xl mx-auto px-4 sm:px-0 transition-all duration-500",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
      )}
    >
      {/* Card */}
      <div
        className="rounded-[20px] border p-4 backdrop-blur-xl"
        style={{
          background: "rgba(10,13,18,0.7)",
          borderColor: "rgba(163,255,18,0.15)",
          boxShadow: "0 0 0 1px rgba(163,255,18,0.06), 0 4px 40px rgba(163,255,18,0.04)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-3.5">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-slow" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-accent/70">
            Tổng quan thị trường
          </span>
          {!loading && (
            <span className="ml-auto text-[10px] text-slate-700">
              Cập nhật mỗi 5 phút
            </span>
          )}
        </div>

        {/* Grid of widgets */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <WidgetSkeleton key={i} />)
          ) : (
            <>
              <IndexWidget label="VN-Index"  icon={LineChart}         data={data?.vnindex ?? null}  />
              <BreadthWidget label="HOSE"     icon={BarChart3}         data={data?.hose_breadth ?? null} />
              <BreadthWidget label="HNX"      icon={CandlestickChart}  data={data?.hnx_breadth ?? null} />
              <LiquidityWidget valueTy={data?.liquidity_ty ?? null}   prevTy={data?.liquidity_prev_ty ?? null} />
              <ForeignWidget   netTy={data?.foreign_net_ty ?? null} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

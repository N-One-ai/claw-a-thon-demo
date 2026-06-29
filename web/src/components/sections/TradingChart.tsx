"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type { OHLCVPoint } from "@/types/analysis";
import { formatVND } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const RANGES = [
  { label: "1T",  days: 22  },
  { label: "3T",  days: 66  },
  { label: "6T",  days: 130 },
  { label: "1N",  days: 200 },
] as const;

const CHART_HEIGHT = 520; // total px — panes divide this

// ── Types ─────────────────────────────────────────────────────────────────────

interface TooltipState {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  rsi?: number;
  macd?: number;
  macd_signal?: number;
  macd_histogram?: number;
}

interface TradingChartProps {
  data: OHLCVPoint[];  // oldest → newest
  ticker: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function formatChartTime(t: unknown): string {
  if (!t) return "";
  if (typeof t === "object" && t !== null && "year" in t) {
    const bd = t as { year: number; month: number; day: number };
    return `${bd.year}-${String(bd.month).padStart(2, "0")}-${String(bd.day).padStart(2, "0")}`;
  }
  return String(t);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TradingChart({ data, ticker }: TradingChartProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const chartApiRef   = useRef<any>(null);
  const [rangeIdx, setRangeIdx] = useState(2); // default 6T
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // ── Build chart ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !data.length) return;

    let cancelled = false;
    let chart: any = null;
    let observer: ResizeObserver | null = null;

    import("lightweight-charts").then((lc) => {
      if (cancelled || !containerRef.current) return;
      const container = containerRef.current;

      // ── Create chart ──────────────────────────────────────────────────────
      chart = lc.createChart(container, {
        width:  container.clientWidth,
        height: CHART_HEIGHT,
        layout: {
          background:  { type: lc.ColorType.Solid, color: "transparent" },
          textColor:   "#475569",
          fontFamily:  '"JetBrains Mono", "Inter", monospace',
          fontSize:    10,
        },
        grid: {
          vertLines: { color: "#1e2d3d" },
          horzLines: { color: "#1e2d3d" },
        },
        crosshair: {
          mode: lc.CrosshairMode.Normal,
          vertLine: {
            color: "#A3FF1280",
            width: 1,
            style: lc.LineStyle.Dashed,
            labelBackgroundColor: "#1e3a5f",
          },
          horzLine: {
            color: "#A3FF1280",
            width: 1,
            style: lc.LineStyle.Dashed,
            labelBackgroundColor: "#1e3a5f",
          },
        },
        rightPriceScale: { borderColor: "#1e2d3d" },
        timeScale: {
          borderColor:    "#1e2d3d",
          timeVisible:    true,
          secondsVisible: false,
          fixRightEdge:   true,
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
        handleScale:  { mouseWheel: true, pinch: true },
      });

      chartApiRef.current = chart;

      // ── Pane 0: Candlestick ───────────────────────────────────────────────
      const candleSeries = chart.addSeries(lc.CandlestickSeries, {
        upColor:         "#10b981",
        downColor:       "#f43f5e",
        borderUpColor:   "#10b981",
        borderDownColor: "#f43f5e",
        wickUpColor:     "#10b981",
        wickDownColor:   "#f43f5e",
        priceLineVisible: false,
      }, 0);

      // ── Pane 0: Volume (overlay bottom 20%) ───────────────────────────────
      const volSeries = chart.addSeries(lc.HistogramSeries, {
        priceFormat:      { type: "volume" },
        priceScaleId:     "vol",
        lastValueVisible: false,
        priceLineVisible: false,
      }, 0);
      chart.priceScale("vol", 0).applyOptions({
        scaleMargins: { top: 0.80, bottom: 0 },
        drawTicks: false,
        borderVisible: false,
      });

      // ── Pane 0: SMA overlays ──────────────────────────────────────────────
      const lineOpts = { priceLineVisible: false, lastValueVisible: false };
      const sma20Series  = chart.addSeries(lc.LineSeries, { ...lineOpts, color: "#f59e0b", lineWidth: 1 }, 0);
      const sma50Series  = chart.addSeries(lc.LineSeries, { ...lineOpts, color: "#8b5cf6", lineWidth: 1 }, 0);
      const sma200Series = chart.addSeries(lc.LineSeries, { ...lineOpts, color: "#ef4444", lineWidth: 1 }, 0);

      // ── Pane 1: RSI ───────────────────────────────────────────────────────
      const rsiSeries = chart.addSeries(lc.LineSeries, {
        color:            "#8b5cf6",
        lineWidth:        1.5,
        priceLineVisible: false,
        lastValueVisible: true,
        autoscaleInfoProvider: () => ({
          priceRange: { minValue: 0, maxValue: 100 },
          margins:    { above: 0.08, below: 0.08 },
        }),
      }, 1);
      rsiSeries.createPriceLine({ price: 70, color: "rgba(244,63,94,0.5)",  lineWidth: 1, lineStyle: lc.LineStyle.Dashed, axisLabelVisible: false, title: "" });
      rsiSeries.createPriceLine({ price: 50, color: "rgba(71,85,105,0.35)", lineWidth: 1, lineStyle: lc.LineStyle.Dotted, axisLabelVisible: false, title: "" });
      rsiSeries.createPriceLine({ price: 30, color: "rgba(16,185,129,0.5)", lineWidth: 1, lineStyle: lc.LineStyle.Dashed, axisLabelVisible: false, title: "" });

      // ── Pane 2: MACD histogram ────────────────────────────────────────────
      const macdHistSeries = chart.addSeries(lc.HistogramSeries, {
        priceLineVisible: false,
        lastValueVisible: false,
      }, 2);
      const macdLineSeries = chart.addSeries(lc.LineSeries, {
        color: "#A3FF12", lineWidth: 1.5,
        priceLineVisible: false, lastValueVisible: false,
      }, 2);
      const signalLineSeries = chart.addSeries(lc.LineSeries, {
        color: "#f59e0b", lineWidth: 1,
        priceLineVisible: false, lastValueVisible: false,
      }, 2);
      // zero baseline
      macdHistSeries.createPriceLine({ price: 0, color: "rgba(71,85,105,0.4)", lineWidth: 1, lineStyle: lc.LineStyle.Solid, axisLabelVisible: false, title: "" });

      // ── Set data ──────────────────────────────────────────────────────────
      candleSeries.setData(data.map(d => ({ time: d.date, open: d.open, high: d.high, low: d.low, close: d.close })));
      volSeries.setData(data.map(d => ({
        time:  d.date,
        value: d.volume,
        color: d.close >= d.open ? "rgba(16,185,129,0.45)" : "rgba(244,63,94,0.45)",
      })));
      sma20Series.setData( data.filter(d => d.sma20  != null).map(d => ({ time: d.date, value: d.sma20!  })));
      sma50Series.setData( data.filter(d => d.sma50  != null).map(d => ({ time: d.date, value: d.sma50!  })));
      sma200Series.setData(data.filter(d => d.sma200 != null).map(d => ({ time: d.date, value: d.sma200! })));
      rsiSeries.setData(data.filter(d => d.rsi != null).map(d => ({ time: d.date, value: d.rsi! })));
      macdHistSeries.setData(data.filter(d => d.macd_histogram != null).map(d => ({
        time:  d.date,
        value: d.macd_histogram!,
        color: d.macd_histogram! > 0 ? "rgba(16,185,129,0.7)" : "rgba(244,63,94,0.7)",
      })));
      macdLineSeries.setData( data.filter(d => d.macd         != null).map(d => ({ time: d.date, value: d.macd!         })));
      signalLineSeries.setData(data.filter(d => d.macd_signal != null).map(d => ({ time: d.date, value: d.macd_signal!  })));

      // ── Pane stretch (candle 55%, RSI 22.5%, MACD 22.5%) ─────────────────
      const panes = chart.panes();
      if (panes.length >= 3) {
        panes[0].setStretchFactor(4);
        panes[1].setStretchFactor(1.5);
        panes[2].setStretchFactor(1.5);
      }

      // ── Initial visible range: 6 months ───────────────────────────────────
      const initDays = RANGES[2].days;
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, data.length - initDays - 1),
        to:   data.length - 1,
      });

      // ── Crosshair tooltip ─────────────────────────────────────────────────
      chart.subscribeCrosshairMove((param: any) => {
        if (!param.point || !param.time || !param.seriesData?.size) {
          setTooltip(null);
          return;
        }
        const ohlc    = param.seriesData.get(candleSeries)     as any;
        const vol     = param.seriesData.get(volSeries)        as any;
        const rsi     = param.seriesData.get(rsiSeries)        as any;
        const macdH   = param.seriesData.get(macdHistSeries)   as any;
        const macdL   = param.seriesData.get(macdLineSeries)   as any;
        const sigL    = param.seriesData.get(signalLineSeries) as any;
        if (ohlc) {
          setTooltip({
            time:           formatChartTime(param.time),
            open:           ohlc.open,
            high:           ohlc.high,
            low:            ohlc.low,
            close:          ohlc.close,
            volume:         vol?.value  ?? 0,
            rsi:            rsi?.value,
            macd:           macdL?.value,
            macd_signal:    sigL?.value,
            macd_histogram: macdH?.value,
          });
        }
      });

      // ── Responsive resize ─────────────────────────────────────────────────
      observer = new ResizeObserver((entries) => {
        if (!cancelled && chart) {
          chart.applyOptions({ width: entries[0].contentRect.width });
        }
      });
      observer.observe(container);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      chart?.remove();
      chartApiRef.current = null;
    };
  }, [data]); // rebuild on data change

  // ── Range selector ─────────────────────────────────────────────────────────
  const handleRange = (idx: number) => {
    setRangeIdx(idx);
    const chart = chartApiRef.current;
    if (!chart || !data.length) return;
    const days = RANGES[idx].days;
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, data.length - days - 1),
      to:   data.length - 1,
    });
  };

  // ── Tooltip panel labels ───────────────────────────────────────────────────
  const isBull = tooltip ? tooltip.close >= tooltip.open : false;

  return (
    <div className="card overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-5">
          <span className="text-xs font-semibold text-slate-300 tracking-wide">{ticker}</span>
          <span className="flex items-center gap-1.5 text-[10px] text-amber-400">
            <span className="inline-block w-5 h-px bg-amber-400" /> SMA20
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-violet-400">
            <span className="inline-block w-5 h-px bg-violet-400" /> SMA50
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-red-400">
            <span className="inline-block w-5 h-px bg-red-400" /> SMA200
          </span>
        </div>

        {/* Range */}
        <div className="flex gap-1">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => handleRange(i)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors",
                i === rangeIdx
                  ? "bg-accent/15 text-accent border border-accent/30"
                  : "text-slate-500 hover:text-slate-300 border border-transparent hover:border-slate-700"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chart container (relative for tooltip overlay) ──────────────────── */}
      <div className="relative">

        {/* Floating OHLCV tooltip */}
        {tooltip && (
          <div className="absolute top-2 left-14 z-30 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-mono bg-bg-card/90 border border-border/60 backdrop-blur-sm rounded-lg px-3 py-1.5 pointer-events-none">
            <span className="text-slate-500 text-[10px]">{tooltip.time}</span>
            <span className="text-slate-500">O <span className="text-slate-200">{formatVND(tooltip.open)}</span></span>
            <span className="text-slate-500">H <span className="text-profit">{formatVND(tooltip.high)}</span></span>
            <span className="text-slate-500">L <span className="text-loss">{formatVND(tooltip.low)}</span></span>
            <span className={cn("text-slate-500")}>
              C <span className={isBull ? "text-profit" : "text-loss"}>{formatVND(tooltip.close)}</span>
            </span>
            <span className="text-slate-600 border-l border-border pl-2">
              Vol <span className="text-slate-400">{fmtVol(tooltip.volume)}</span>
            </span>
            {tooltip.rsi != null && (
              <span className="text-slate-600 border-l border-border pl-2">
                RSI <span className="text-violet-400">{tooltip.rsi.toFixed(1)}</span>
              </span>
            )}
            {tooltip.macd != null && (
              <>
                <span className="text-slate-600 border-l border-border pl-2">
                  MACD <span className="text-accent">{tooltip.macd.toFixed(0)}</span>
                </span>
                {tooltip.macd_signal != null && (
                  <span className="text-slate-600">
                    Sig <span className="text-amber-400">{tooltip.macd_signal.toFixed(0)}</span>
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {/* Panel labels (fixed left) */}
        <div
          className="absolute left-1 z-20 flex flex-col justify-around pointer-events-none"
          style={{ top: 4, height: CHART_HEIGHT - 4 }}
        >
          {/* These stack proportionally to match pane heights */}
          <div style={{ flex: 4 }} className="flex items-start pt-1">
            <span className="text-[9px] text-slate-700 uppercase tracking-widest writing-mode-vertical rotate-180 ml-0.5 select-none" style={{ writingMode: "vertical-rl" }}>
              {ticker}
            </span>
          </div>
          <div style={{ flex: 1.5 }} className="flex items-start pt-1 border-t border-border/40">
            <span className="text-[9px] text-violet-600 select-none ml-1">RSI</span>
          </div>
          <div style={{ flex: 1.5 }} className="flex items-start pt-1 border-t border-border/40">
            <span className="text-[9px] text-accent select-none ml-1">MACD</span>
          </div>
        </div>

        {/* lightweight-charts mount point */}
        <div ref={containerRef} className="w-full" />
      </div>

      {/* ── Legend footer ──────────────────────────────────────────────────── */}
      <div className="px-5 py-2.5 border-t border-border flex items-center gap-4 text-[10px] text-slate-600">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-profit inline-block" /> Tăng
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-loss inline-block" /> Giảm
        </span>
        <span className="text-slate-700">·</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-5 h-px bg-violet-500" /> RSI(14)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-5 h-px bg-accent" /> MACD(12,26,9)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-5 h-px bg-amber-500" /> Signal(9)
        </span>
        <span className="ml-auto text-slate-700 italic">Scroll để zoom · Kéo để pan</span>
      </div>
    </div>
  );
}

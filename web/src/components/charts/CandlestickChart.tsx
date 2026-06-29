"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { OHLCVPoint } from "@/types/analysis";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

// ── Constants ──────────────────────────────────────────────────────────────────

const COLORS = {
  bg:         "#080A0F",
  grid:       "rgba(255,255,255,0.05)",
  bull:       "#10B981",
  bear:       "#EF4444",
  bullVol:    "rgba(16,185,129,0.40)",
  bearVol:    "rgba(239,68,68,0.40)",
  sma20:      "#F59E0B",
  sma50:      "#8B5CF6",
  sma200:     "#EF4444",
  rsiLine:    "#8B5CF6",
  rsiOb:      "rgba(239,68,68,0.45)",
  rsiOs:      "rgba(16,185,129,0.45)",
  macdLine:   "#3B82F6",
  macdSig:    "#F59E0B",
  macdHistUp: "rgba(16,185,129,0.70)",
  macdHistDn: "rgba(239,68,68,0.70)",
  crosshair:  "#3B82F680",
  crossBg:    "#1E3A5F",
  text:       "#475569",
  border:     "#1E2D3D",
} as const;

const RANGES = [
  { label: "1T",  days: 22  },
  { label: "3T",  days: 66  },
  { label: "6T",  days: 130 },
  { label: "1N",  days: 200 },
] as const;

// ── Mock data ──────────────────────────────────────────────────────────────────

function generateMockData(numDays = 200, seedPrice = 45000): OHLCVPoint[] {
  const today = new Date();
  const data: OHLCVPoint[] = [];
  let close = seedPrice;

  // raw price history for indicator calculation
  const closes: number[] = [];

  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    // skip weekends
    if (d.getDay() === 0 || d.getDay() === 6) continue;

    const volatility = 0.018 + Math.random() * 0.01;
    const drift      = (Math.random() - 0.48) * volatility;
    close = Math.max(seedPrice * 0.4, close * (1 + drift));

    const range  = close * (0.01 + Math.random() * 0.025);
    const open   = close * (1 + (Math.random() - 0.5) * 0.01);
    const high   = Math.max(open, close) + range * Math.random();
    const low    = Math.min(open, close) - range * Math.random();
    const volume = Math.round((800_000 + Math.random() * 3_200_000));

    closes.push(close);

    const idx  = closes.length - 1;
    const sma  = (n: number) =>
      idx >= n - 1
        ? closes.slice(idx - n + 1, idx + 1).reduce((a, b) => a + b, 0) / n
        : null;

    data.push({
      date:   d.toISOString().slice(0, 10),
      open:   Math.round(open),
      high:   Math.round(high),
      low:    Math.round(low),
      close:  Math.round(close),
      volume,
      sma20:  sma(20)  != null ? Math.round(sma(20)!)  : null,
      sma50:  sma(50)  != null ? Math.round(sma(50)!)  : null,
      sma200: sma(200) != null ? Math.round(sma(200)!) : null,
      rsi:    computeRSI(closes, idx, 14),
      macd:            computeMACD(closes, idx).macd,
      macd_signal:     computeMACD(closes, idx).signal,
      macd_histogram:  computeMACD(closes, idx).histogram,
    });
  }
  return data;
}

function computeRSI(closes: number[], idx: number, period = 14): number | null {
  if (idx < period) return null;
  let gains = 0, losses = 0;
  for (let i = idx - period + 1; i <= idx; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains  += diff;
    else          losses -= diff;
  }
  const rs = losses === 0 ? 100 : gains / losses;
  return 100 - 100 / (1 + rs);
}

function computeMACD(closes: number[], idx: number) {
  const ema = (n: number, i: number): number | null => {
    if (i < n - 1) return null;
    const k = 2 / (n + 1);
    let v = closes.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n;
    for (let j = i - n + 1; j <= i; j++) v = closes[j] * k + v * (1 - k);
    return v;
  };
  const e12 = ema(12, idx);
  const e26 = ema(26, idx);
  if (e12 == null || e26 == null) return { macd: null, signal: null, histogram: null };
  const macd = e12 - e26;
  const signal = ema(9, Math.max(0, idx - 9));
  const histogram = signal != null ? macd - signal : null;
  return { macd, signal, histogram };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtVND(v: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(v));
}

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

function fmtTime(t: unknown): string {
  if (!t) return "";
  if (typeof t === "object" && t !== null && "year" in t) {
    const b = t as { year: number; month: number; day: number };
    return `${b.year}-${String(b.month).padStart(2, "0")}-${String(b.day).padStart(2, "0")}`;
  }
  return String(t);
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface TooltipState {
  time: string;
  open: number;
  high: number;
  low:  number;
  close: number;
  volume: number;
  rsi?: number | null;
  macd?: number | null;
  macd_signal?: number | null;
  macd_histogram?: number | null;
}

export interface CandlestickChartProps {
  /** Real OHLCV data from backend. Falls back to mock data when empty/undefined. */
  data?: OHLCVPoint[];
  ticker?: string;
  /** Seed price for mock data generator (VND). Default 45 000. */
  mockSeedPrice?: number;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function CandlestickChart({
  data: rawData,
  ticker = "DEMO",
  mockSeedPrice = 45_000,
}: CandlestickChartProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<any>(null);
  const seriesRef    = useRef<Record<string, any>>({});

  const [rangeIdx,    setRangeIdx]    = useState(2);
  const [tooltip,     setTooltip]     = useState<TooltipState | null>(null);
  const [isMock,      setIsMock]      = useState(false);
  const [chartHeight, setChartHeight] = useState(520); // updated on mount

  // Resolve data: use real data or fall back to mock
  const data: OHLCVPoint[] = rawData && rawData.length > 0
    ? rawData
    : [];

  // ── Build / rebuild chart ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    // Determine chart height based on screen width
    const mobile = window.innerWidth < 768;
    const height = mobile ? 400 : 600;
    setChartHeight(height);

    // Resolve effective data
    let effectiveData = rawData && rawData.length > 0 ? rawData : null;
    if (!effectiveData) {
      effectiveData = generateMockData(200, mockSeedPrice);
      setIsMock(true);
    } else {
      setIsMock(false);
    }

    let cancelled  = false;
    let chart: any = null;
    let observer: ResizeObserver | null = null;

    import("lightweight-charts").then((lc) => {
      if (cancelled || !containerRef.current) return;
      const container = containerRef.current;

      // ── Create chart ───────────────────────────────────────────────────────
      chart = lc.createChart(container, {
        width:  container.clientWidth,
        height,
        layout: {
          background: { type: lc.ColorType.Solid, color: COLORS.bg },
          textColor:  COLORS.text,
          fontFamily: '"JetBrains Mono", "Inter", monospace',
          fontSize:   10,
        },
        grid: {
          vertLines: { color: COLORS.grid },
          horzLines: { color: COLORS.grid },
        },
        crosshair: {
          mode: lc.CrosshairMode.Normal,
          vertLine: {
            color: COLORS.crosshair,
            width: 1,
            style: lc.LineStyle.Dashed,
            labelBackgroundColor: COLORS.crossBg,
          },
          horzLine: {
            color: COLORS.crosshair,
            width: 1,
            style: lc.LineStyle.Dashed,
            labelBackgroundColor: COLORS.crossBg,
          },
        },
        rightPriceScale: { borderColor: COLORS.border },
        timeScale: {
          borderColor:    COLORS.border,
          timeVisible:    true,
          secondsVisible: false,
          fixRightEdge:   true,
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
        handleScale:  { mouseWheel: true, pinch: true },
      });

      chartRef.current = chart;

      // ── Pane 0: Candlestick ────────────────────────────────────────────────
      const candle = chart.addSeries(lc.CandlestickSeries, {
        upColor:         COLORS.bull,
        downColor:       COLORS.bear,
        borderUpColor:   COLORS.bull,
        borderDownColor: COLORS.bear,
        wickUpColor:     COLORS.bull,
        wickDownColor:   COLORS.bear,
        priceLineVisible: false,
      }, 0);

      // ── Pane 0: Volume ─────────────────────────────────────────────────────
      const vol = chart.addSeries(lc.HistogramSeries, {
        priceFormat:      { type: "volume" },
        priceScaleId:     "vol",
        lastValueVisible: false,
        priceLineVisible: false,
      }, 0);
      chart.priceScale("vol", 0).applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
        drawTicks:    false,
        borderVisible: false,
      });

      // ── Pane 0: SMA overlays ───────────────────────────────────────────────
      const lineBase = { priceLineVisible: false, lastValueVisible: false };
      const sma20  = chart.addSeries(lc.LineSeries, { ...lineBase, color: COLORS.sma20,  lineWidth: 1 }, 0);
      const sma50  = chart.addSeries(lc.LineSeries, { ...lineBase, color: COLORS.sma50,  lineWidth: 1 }, 0);
      const sma200 = chart.addSeries(lc.LineSeries, { ...lineBase, color: COLORS.sma200, lineWidth: 1 }, 0);

      // ── Pane 1: RSI ────────────────────────────────────────────────────────
      const rsi = chart.addSeries(lc.LineSeries, {
        color:            COLORS.rsiLine,
        lineWidth:        1.5,
        priceLineVisible: false,
        lastValueVisible: true,
        autoscaleInfoProvider: () => ({
          priceRange: { minValue: 0, maxValue: 100 },
          margins:    { above: 0.08, below: 0.08 },
        }),
      }, 1);
      rsi.createPriceLine({ price: 70, color: COLORS.rsiOb,          lineWidth: 1, lineStyle: lc.LineStyle.Dashed, axisLabelVisible: false, title: "" });
      rsi.createPriceLine({ price: 50, color: "rgba(71,85,105,0.35)", lineWidth: 1, lineStyle: lc.LineStyle.Dotted, axisLabelVisible: false, title: "" });
      rsi.createPriceLine({ price: 30, color: COLORS.rsiOs,          lineWidth: 1, lineStyle: lc.LineStyle.Dashed, axisLabelVisible: false, title: "" });

      // ── Pane 2: MACD ───────────────────────────────────────────────────────
      const macdHist = chart.addSeries(lc.HistogramSeries, {
        priceLineVisible: false, lastValueVisible: false,
      }, 2);
      const macdLine = chart.addSeries(lc.LineSeries, {
        color: COLORS.macdLine, lineWidth: 1.5,
        priceLineVisible: false, lastValueVisible: false,
      }, 2);
      const signalLine = chart.addSeries(lc.LineSeries, {
        color: COLORS.macdSig, lineWidth: 1,
        priceLineVisible: false, lastValueVisible: false,
      }, 2);
      macdHist.createPriceLine({ price: 0, color: "rgba(71,85,105,0.4)", lineWidth: 1, lineStyle: lc.LineStyle.Solid, axisLabelVisible: false, title: "" });

      // ── Load data ──────────────────────────────────────────────────────────
      candle.setData(effectiveData!.map(d => ({ time: d.date, open: d.open, high: d.high, low: d.low, close: d.close })));
      vol.setData(effectiveData!.map(d => ({
        time:  d.date,
        value: d.volume,
        color: d.close >= d.open ? COLORS.bullVol : COLORS.bearVol,
      })));
      sma20.setData( effectiveData!.filter(d => d.sma20  != null).map(d => ({ time: d.date, value: d.sma20!  })));
      sma50.setData( effectiveData!.filter(d => d.sma50  != null).map(d => ({ time: d.date, value: d.sma50!  })));
      sma200.setData(effectiveData!.filter(d => d.sma200 != null).map(d => ({ time: d.date, value: d.sma200! })));
      rsi.setData(   effectiveData!.filter(d => d.rsi    != null).map(d => ({ time: d.date, value: d.rsi!    })));
      macdHist.setData(effectiveData!.filter(d => d.macd_histogram != null).map(d => ({
        time:  d.date,
        value: d.macd_histogram!,
        color: d.macd_histogram! > 0 ? COLORS.macdHistUp : COLORS.macdHistDn,
      })));
      macdLine.setData(  effectiveData!.filter(d => d.macd        != null).map(d => ({ time: d.date, value: d.macd!        })));
      signalLine.setData(effectiveData!.filter(d => d.macd_signal != null).map(d => ({ time: d.date, value: d.macd_signal! })));

      // ── Pane stretch: candle 55% / RSI 22.5% / MACD 22.5% ────────────────
      const panes = chart.panes();
      if (panes.length >= 3) {
        panes[0].setStretchFactor(4);
        panes[1].setStretchFactor(1.5);
        panes[2].setStretchFactor(1.5);
      }

      // ── Initial visible range: 6 months ───────────────────────────────────
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, effectiveData!.length - RANGES[2].days - 1),
        to:   effectiveData!.length - 1,
      });

      // ── Save series refs for range selector ───────────────────────────────
      seriesRef.current = { candle, vol, rsi, macdHist, macdLine, signalLine, sma20, sma50, sma200 };

      // ── Crosshair tooltip ──────────────────────────────────────────────────
      chart.subscribeCrosshairMove((param: any) => {
        if (!param.point || !param.time || !param.seriesData?.size) {
          setTooltip(null);
          return;
        }
        const ohlc  = param.seriesData.get(candle)      as any;
        const volD  = param.seriesData.get(vol)         as any;
        const rsiD  = param.seriesData.get(rsi)         as any;
        const macdH = param.seriesData.get(macdHist)    as any;
        const macdL = param.seriesData.get(macdLine)    as any;
        const sigL  = param.seriesData.get(signalLine)  as any;
        if (ohlc) {
          setTooltip({
            time:           fmtTime(param.time),
            open:           ohlc.open,
            high:           ohlc.high,
            low:            ohlc.low,
            close:          ohlc.close,
            volume:         volD?.value   ?? 0,
            rsi:            rsiD?.value,
            macd:           macdL?.value,
            macd_signal:    sigL?.value,
            macd_histogram: macdH?.value,
          });
        }
      });

      // ── Responsive resize ──────────────────────────────────────────────────
      observer = new ResizeObserver((entries) => {
        if (!cancelled && chart) {
          const w  = entries[0].contentRect.width;
          const h  = w < 768 ? 400 : 600;
          chart.applyOptions({ width: w, height: h });
          setChartHeight(h);
        }
      });
      observer.observe(container);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      chart?.remove();
      chartRef.current  = null;
      seriesRef.current = {};
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData, mockSeedPrice]);

  // ── Range selector ─────────────────────────────────────────────────────────
  const handleRange = useCallback((idx: number) => {
    setRangeIdx(idx);
    const chart = chartRef.current;
    if (!chart) return;
    // effectiveData length: we don't store it in a ref, use chart's logical range max
    chart.timeScale().fitContent();
    // then zoom in to last N days
    const bars = chart.timeScale().getVisibleLogicalRange();
    if (!bars) { chart.timeScale().fitContent(); return; }
    const total = Math.round(bars.to) + 1;
    const days  = RANGES[idx].days;
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, total - days - 1),
      to:   total - 1,
    });
  }, []);

  const isBull = tooltip ? tooltip.close >= tooltip.open : false;

  return (
    <div className="card overflow-hidden" style={{ background: COLORS.bg }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="px-3 sm:px-4 pt-3 pb-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b" style={{ borderColor: COLORS.border }}>
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-200 tracking-wide font-mono">{ticker}</span>
            {isMock && (
              <span className="text-[9px] text-amber-500 border border-amber-500/30 rounded px-1.5 py-0.5 bg-amber-500/5">
                DEMO
              </span>
            )}
          </div>
          <Swatch color={COLORS.sma20}  label="SMA20"  />
          <Swatch color={COLORS.sma50}  label="SMA50"  />
          <Swatch color={COLORS.sma200} label="SMA200" />
        </div>

        {/* Range buttons */}
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

      {/* ── Chart area ────────────────────────────────────────────────────── */}
      <div className="relative">

        {/* Floating OHLCV tooltip */}
        {tooltip && (
          <div className="absolute top-2 left-2 sm:left-14 right-2 sm:right-auto z-30 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] sm:text-[11px] font-mono bg-black/80 border border-white/[0.06] backdrop-blur-sm rounded-lg px-2 sm:px-3 py-1.5 pointer-events-none">
            <span className="text-slate-500 text-[10px]">{tooltip.time}</span>
            <OHLCField label="O" value={fmtVND(tooltip.open)}  cls="text-slate-200" />
            <OHLCField label="H" value={fmtVND(tooltip.high)}  cls="text-profit"    />
            <OHLCField label="L" value={fmtVND(tooltip.low)}   cls="text-loss"      />
            <OHLCField
              label="C"
              value={fmtVND(tooltip.close)}
              cls={isBull ? "text-profit" : "text-loss"}
            />
            <span className="border-l border-white/[0.08] pl-2 text-slate-500">
              Vol <span className="text-slate-300">{fmtVol(tooltip.volume)}</span>
            </span>
            {tooltip.rsi != null && (
              <span className="border-l border-white/[0.08] pl-2 text-slate-500">
                RSI <span className="text-violet-400">{tooltip.rsi.toFixed(1)}</span>
              </span>
            )}
            {tooltip.macd != null && (
              <>
                <span className="border-l border-white/[0.08] pl-2 text-slate-500">
                  MACD <span className="text-accent">{tooltip.macd.toFixed(0)}</span>
                </span>
                {tooltip.macd_signal != null && (
                  <span className="text-slate-500">
                    Sig <span className="text-amber-400">{tooltip.macd_signal.toFixed(0)}</span>
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {/* Pane labels */}
        <PaneLabels height={chartHeight} ticker={ticker} />

        {/* lightweight-charts mount point */}
        <div ref={containerRef} className="w-full" />
      </div>

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      <div
        className="px-3 sm:px-4 py-2 flex items-center gap-3 sm:gap-4 text-[9px] sm:text-[10px] flex-wrap"
        style={{ borderTop: `1px solid ${COLORS.border}`, color: COLORS.text }}
      >
        <LegendItem color={COLORS.bull}     shape="square" label={t.technical.legendUp} />
        <LegendItem color={COLORS.bear}     shape="square" label={t.technical.legendDown} />
        <span style={{ color: COLORS.border }}>·</span>
        <LegendItem color={COLORS.rsiLine}  shape="line"   label="RSI(14)" />
        <LegendItem color={COLORS.macdLine} shape="line"   label="MACD(12,26,9)" />
        <LegendItem color={COLORS.macdSig}  shape="line"   label="Signal(9)" />
        <span className="ml-auto italic" style={{ color: COLORS.text }}>
          {t.technical.scrollHint}
        </span>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5" style={{ color }}>
      <span className="inline-block w-5 h-px" style={{ background: color }} />
      <span className="text-[10px]">{label}</span>
    </span>
  );
}

function OHLCField({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <span className="text-slate-500">
      {label} <span className={cls}>{value}</span>
    </span>
  );
}

function LegendItem({ color, shape, label }: { color: string; shape: "square" | "line"; label: string }) {
  return (
    <span className="flex items-center gap-1">
      {shape === "square"
        ? <span className="w-2 h-2 rounded-sm inline-block" style={{ background: color }} />
        : <span className="inline-block w-5 h-px"           style={{ background: color }} />
      }
      <span>{label}</span>
    </span>
  );
}

function PaneLabels({ height, ticker }: { height: number; ticker: string }) {
  return (
    <div
      className="absolute left-1 z-20 flex flex-col justify-around pointer-events-none"
      style={{ top: 4, height: height - 4 }}
    >
      <div style={{ flex: 4 }} className="flex items-start pt-1">
        <span
          className="text-[9px] select-none"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", color: "#374151" }}
        >
          {ticker}
        </span>
      </div>
      <div style={{ flex: 1.5 }} className="flex items-start pt-1" >
        <span className="text-[9px] select-none ml-1" style={{ color: COLORS.rsiLine }}>RSI</span>
      </div>
      <div style={{ flex: 1.5 }} className="flex items-start pt-1">
        <span className="text-[9px] select-none ml-1" style={{ color: COLORS.macdLine }}>MACD</span>
      </div>
    </div>
  );
}

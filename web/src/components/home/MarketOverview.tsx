"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface IndexData   { value: number; change: number; change_pct: number }
interface BreadthData { advance: number; decline: number; unchanged: number }
interface SparklineData { vnindex: number[]; hnxindex: number[]; vn30: number[]; volume: number[] }
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

// ── Design tokens ─────────────────────────────────────────────────────────────
const POS   = "#7CFF4A";
const NEG   = "#FF5C7A";
const WARN  = "#FFB020";
const MUTED = "#64748B";

function priceColor(v?: number | null) { return (v ?? 0) >= 0 ? POS : NEG; }

// ── AI Insights (derived client-side from market data) ────────────────────────
interface Insights {
  score:             number;
  risk:              string;
  riskColor:         string;
  sentiment:         string;
  sentimentColor:    string;
  recommendation:    string[];
}

function deriveInsights(d: MarketData): Insights {
  const score = d.healthScore ?? 50;

  const risk           = score >= 65 ? "Thấp"    : score < 40 ? "Cao"       : "Trung bình";
  const riskColor      = score >= 65 ? POS        : score < 40 ? NEG         : WARN;
  const sentiment      = score >= 60 ? "Tích cực" : score < 40 ? "Tiêu cực" : "Trung lập";
  const sentimentColor = score >= 60 ? POS        : score < 40 ? NEG         : MUTED;

  const recommendation = score >= 65
    ? ["Tiếp tục nắm giữ doanh nghiệp chất lượng.", "Tích lũy từng phần ở vùng giá hợp lý."]
    : score >= 50
    ? ["Duy trì danh mục hiện tại, thận trọng với vị thế mới.", "Ưu tiên cổ phiếu cơ bản tốt, thanh khoản cao."]
    : ["Giảm tỷ trọng rủi ro, nâng tỷ lệ tiền mặt.", "Chờ tín hiệu xác nhận trước khi mua thêm."];

  return { score, risk, riskColor, sentiment, sentimentColor, recommendation };
}

// ── useCountUp ────────────────────────────────────────────────────────────────
function useCountUp(target: number | null, ms = 820): number | null {
  const [cur,  setCur]  = useState<number | null>(null);
  const raf   = useRef<number>(0);
  const t0    = useRef<number>(0);
  const from  = useRef<number>(0);

  useEffect(() => {
    if (target === null) { setCur(null); return; }
    cancelAnimationFrame(raf.current);
    t0.current   = performance.now();
    from.current = cur ?? target * 0.92;
    const tick = (ts: number) => {
      const p = Math.min((ts - t0.current) / ms, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setCur(from.current + (target - from.current) * e);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else        setCur(target);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return cur;
}

// ── LIVE badge ────────────────────────────────────────────────────────────────
function LiveBadge({ lastFetch }: { lastFetch: Date | null }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      if (lastFetch) setSecs(Math.round((Date.now() - lastFetch.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [lastFetch]);

  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1.5">
        <span
          className="w-[5px] h-[5px] rounded-full animate-pulse"
          style={{ background: "#4AFF91", boxShadow: "0 0 6px #4AFF9180" }}
        />
        <span className="text-[9px] font-bold tracking-[0.22em] uppercase" style={{ color: "#4AFF91" }}>
          LIVE
        </span>
      </span>
      {lastFetch && (
        <span className="text-[10px]" style={{ color: "#334155" }}>
          Cập nhật {secs < 5 ? "vừa xong" : `${secs}s trước`}
        </span>
      )}
    </div>
  );
}

// ── Interactive VN-Index chart ────────────────────────────────────────────────
function PremiumChart({ data, color = POS }: { data: number[]; color?: string }) {
  const uid      = useId();
  const svgRef   = useRef<SVGSVGElement>(null);
  const [hIdx,   setHIdx] = useState<number | null>(null);

  if (!data || data.length < 2) {
    return (
      <div className="flex items-center justify-center h-full text-sm" style={{ color: MUTED }}>
        Đang tải dữ liệu biểu đồ...
      </div>
    );
  }

  const W = 600; const H = 260;
  const PL = 8; const PR = 8; const PT = 16; const PB = 8;
  const CW = W - PL - PR; const CH = H - PT - PB;

  const rawMin = Math.min(...data); const rawMax = Math.max(...data);
  const pad    = (rawMax - rawMin) * 0.08;
  const lo     = rawMin - pad;    const hi  = rawMax + pad;
  const rng    = hi - lo;

  const toX = (i: number) => PL + (i / (data.length - 1)) * CW;
  const toY = (v: number) => PT + (1 - (v - lo) / rng) * CH;

  const pts: [number, number][] = data.map((v, i) => [toX(i), toY(v)]);

  let linePath = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[Math.max(0, i - 2)];
    const [x1, y1] = pts[i - 1];
    const [x2, y2] = pts[i];
    const [x3, y3] = pts[Math.min(pts.length - 1, i + 1)];
    linePath += ` C${(x1+(x2-x0)/6).toFixed(2)},${(y1+(y2-y0)/6).toFixed(2)} ${(x2-(x3-x1)/6).toFixed(2)},${(y2-(y3-y1)/6).toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)}`;
  }

  const [lx, ly] = pts[pts.length - 1];
  const areaPath  = `${linePath} L${lx},${H - PB} L${PL},${H - PB} Z`;

  const gId  = `${uid}g`;
  const glow = `${uid}gw`;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const idx  = Math.max(0, Math.min(data.length - 1,
      Math.round(((svgX - PL) / CW) * (data.length - 1))
    ));
    setHIdx(idx);
  };

  // 4 Y-axis grid lines
  const yTicks = Array.from({ length: 4 }, (_, i) => {
    const v = lo + (i / 3) * rng;
    return { y: toY(v), label: Math.round(v).toLocaleString("vi-VN") };
  });

  const hx = hIdx !== null ? pts[hIdx][0] : null;
  const hy = hIdx !== null ? pts[hIdx][1] : null;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full h-full"
      style={{ display: "block", cursor: hIdx !== null ? "crosshair" : "default" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHIdx(null)}
    >
      <defs>
        <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.24" />
          <stop offset="60%"  stopColor={color} stopOpacity="0.05" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <filter id={glow} x="-5%" y="-40%" width="110%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b" />
          <feComposite in="SourceGraphic" in2="b" operator="over" />
        </filter>
      </defs>

      {/* Grid lines + Y labels (right-aligned, inside chart) */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={PL} y1={t.y} x2={W - PR} y2={t.y}
            stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          {i > 0 && i < 3 && (
            <text x={W - PR - 4} y={t.y - 4} textAnchor="end"
              fontSize="9" fill="#334155" fontFamily="ui-monospace,monospace">
              {t.label}
            </text>
          )}
        </g>
      ))}

      {/* Area */}
      <path d={areaPath} fill={`url(#${gId})`} />

      {/* Glow line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth="5"
        strokeLinecap="round" strokeLinejoin="round"
        opacity="0.18" filter={`url(#${glow})`} />

      {/* Main line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.92" />

      {/* Resting end-dot */}
      {hIdx === null && (
        <>
          <circle cx={lx} cy={ly} r="6"   fill={color} opacity="0.14" />
          <circle cx={lx} cy={ly} r="2.5" fill={color} opacity="0.9"  />
        </>
      )}

      {/* Hover state */}
      {hIdx !== null && hx !== null && hy !== null && (
        <g>
          <line x1={hx} y1={PT} x2={hx} y2={H - PB}
            stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="4,3" />
          <circle cx={hx} cy={hy} r="8"   fill={color} opacity="0.12" />
          <circle cx={hx} cy={hy} r="2.5" fill={color} opacity="0.95" />

          {/* Tooltip */}
          {(() => {
            const bw = 122; const bh = 40;
            const bx = Math.max(PL + 2, Math.min(W - PR - bw - 2, hx - bw / 2));
            const by = Math.max(PT + 2, hy - bh - 12);
            const val = data[hIdx].toLocaleString("vi-VN", {
              minimumFractionDigits: 2, maximumFractionDigits: 2,
            });
            const daysAgo = data.length - 1 - hIdx;
            const d = new Date();
            d.setDate(d.getDate() - daysAgo);
            const dateStr = `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
            return (
              <g>
                <rect x={bx} y={by} width={bw} height={bh} rx="7"
                  fill="rgba(8,12,20,0.96)" stroke="rgba(255,255,255,0.10)" strokeWidth="0.5" />
                <text x={bx + bw / 2} y={by + 16} textAnchor="middle"
                  fontSize="13" fill="#FFFFFF" fontWeight="700" fontFamily="ui-monospace,monospace">
                  {val}
                </text>
                <text x={bx + bw / 2} y={by + 31} textAnchor="middle"
                  fontSize="10" fill={MUTED} fontFamily="ui-sans-serif,sans-serif">
                  {dateStr}
                </text>
              </g>
            );
          })()}
        </g>
      )}
    </svg>
  );
}

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ score }: { score: number }) {
  const animated = useCountUp(score);
  const color    = score >= 65 ? POS : score < 40 ? NEG : WARN;

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.16em]"
          style={{ color: MUTED }}>
          AI Market Score
        </span>
        <div className="flex items-baseline gap-1">
          <span className="text-[22px] font-mono font-bold" style={{ color: "#FFFFFF" }}>
            {animated !== null ? Math.round(animated) : "--"}
          </span>
          <span className="text-[11px] font-mono" style={{ color: "#334155" }}>/100</span>
        </div>
      </div>
      <div className="w-full h-[3px] rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${score}%`, background: color, boxShadow: `0 0 8px ${color}55` }}
        />
      </div>
    </div>
  );
}

// ── Bottom KPI item ───────────────────────────────────────────────────────────
function KpiItem({
  label, value, color, sub,
}: {
  label: string;
  value: React.ReactNode;
  color?: string;
  sub?:   string;
}) {
  return (
    <div className="flex flex-col gap-[3px] min-w-[72px]">
      <div className="text-[9px] font-medium uppercase tracking-[0.14em]"
        style={{ color: "#334155" }}>
        {label}
      </div>
      <div className="text-[12px] font-mono font-semibold tabular-nums leading-tight"
        style={{ color: color ?? "#FFFFFF" }}>
        {value}
      </div>
      {sub && (
        <div className="text-[9px] font-mono" style={{ color: "#1E293B" }}>{sub}</div>
      )}
    </div>
  );
}

// ── Separator ─────────────────────────────────────────────────────────────────
function Sep() {
  return (
    <div className="flex-shrink-0"
      style={{ width: 1, height: 28, background: "rgba(255,255,255,0.05)" }} />
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton() {
  const bg0 = "rgba(255,255,255,0.04)";
  const bg1 = "rgba(255,255,255,0.07)";
  const s = "rounded animate-pulse";

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-[45fr_55fr]">
        {/* Left */}
        <div className="p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className={s} style={{ width: 32, height: 32, borderRadius: 10, background: bg0 }} />
            <div className={s} style={{ height: 10, width: 140, background: bg0 }} />
          </div>
          <div className="space-y-2.5">
            {[1,.9,.85,.7].map((w, i) => (
              <div key={i} className={s} style={{ height: 11, width: `${w * 100}%`, background: bg0 }} />
            ))}
          </div>
          <div className={s} style={{ height: 3, background: bg0 }} />
          <div className="space-y-2">
            <div className="flex justify-between">
              <div className={s} style={{ height: 9, width: 80, background: bg0 }} />
              <div className={s} style={{ height: 20, width: 48, background: bg1 }} />
            </div>
            <div className={s} style={{ height: 3, background: bg0 }} />
          </div>
          <div className={s} style={{ height: 3, background: bg0 }} />
          <div className="grid grid-cols-2 gap-4">
            {[0,1].map(i => (
              <div key={i} className="space-y-1.5">
                <div className={s} style={{ height: 8, width: 48, background: bg0 }} />
                <div className={s} style={{ height: 14, width: 64, background: bg1 }} />
              </div>
            ))}
            <div className="col-span-2 space-y-1.5">
              <div className={s} style={{ height: 8, width: 72, background: bg0 }} />
              <div className={s} style={{ height: 11, background: bg0 }} />
              <div className={s} style={{ height: 11, width: "80%", background: bg0 }} />
            </div>
          </div>
        </div>
        {/* Right */}
        <div className="p-8 space-y-5">
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <div className={s} style={{ height: 9, width: 60, background: bg0 }} />
              <div className={s} style={{ height: 32, width: 140, background: bg1 }} />
            </div>
            <div className={s} style={{ height: 24, width: 72, background: bg0 }} />
          </div>
          <div className={s} style={{ height: 220, borderRadius: 8, background: bg0 }} />
          <div className="flex justify-between">
            <div className={s} style={{ height: 8, width: 48, background: bg0 }} />
            <div className={s} style={{ height: 8, width: 40, background: bg0 }} />
          </div>
        </div>
      </div>
      {/* Bottom */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="flex gap-8 px-8 py-5">
          {[0,1,2,3,4,5].map(i => (
            <div key={i} className="space-y-1.5 min-w-[72px]">
              <div className={s} style={{ height: 8, width: 44, background: bg0 }} />
              <div className={s} style={{ height: 14, width: 64, background: bg1 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function MarketOverview() {
  const [data,      setData]      = useState<MarketData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [visible,   setVisible]   = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/market", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          setData(json.data as MarketData);
          setLastFetch(new Date());
        }
      }
    } catch { /* keep stale */ } finally {
      setLoading(false);
      requestAnimationFrame(() => setVisible(true));
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [load]);

  // Derived
  const insights   = data ? deriveInsights(data) : null;
  const sl         = data?.sparklines;
  const vnIdx      = data?.vnindex;
  const chartColor = vnIdx ? priceColor(vnIdx.change) : POS;

  const ff       = data?.foreignFlow;
  const ffColor  = ff == null ? MUTED : ff >= 0 ? POS : NEG;
  const ffStr    = ff == null
    ? "--"
    : `${ff >= 0 ? "+" : ""}${Math.abs(ff).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} tỷ`;

  const hose         = data?.hose;
  const breadthTotal = hose ? hose.advance + hose.decline + hose.unchanged : 0;

  return (
    <div
      className={cn(
        "w-full max-w-5xl mx-auto transition-all duration-700",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
      )}
    >
      <div
        className="rounded-[28px] border overflow-hidden"
        style={{
          background:     "rgba(9,13,20,0.96)",
          borderColor:    "rgba(126,255,74,0.11)",
          backdropFilter: "blur(32px)",
          boxShadow:      "0 0 80px rgba(126,255,74,0.04), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        {loading ? <Skeleton /> : (
          <>
            {/* ── Two-column section ─────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-[45fr_55fr]">

              {/* ── LEFT: AI Summary ──────────────────────────────────────── */}
              <div
                className="flex flex-col gap-5 p-6 sm:p-7"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              >
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      background: "rgba(124,255,74,0.09)",
                      border:     "1px solid rgba(124,255,74,0.16)",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M8 1.5L9.8 6.2L14.5 8L9.8 9.8L8 14.5L6.2 9.8L1.5 8L6.2 6.2L8 1.5Z"
                        fill="#7CFF4A" opacity="0.92"
                      />
                    </svg>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em]"
                      style={{ color: "#94A3B8" }}>
                      AI ĐÁNH GIÁ THỊ TRƯỜNG
                    </div>
                    <LiveBadge lastFetch={lastFetch} />
                  </div>
                </div>

                {/* Score */}
                {insights && <ScoreBar score={insights.score} />}

                {/* Risk / Sentiment / Recommendation */}
                {insights && (
                  <>
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }} />
                    <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                      <div className="space-y-1">
                        <div className="text-[9px] font-medium uppercase tracking-[0.16em]"
                          style={{ color: "#334155" }}>Rủi ro</div>
                        <div className="text-[13px] font-semibold" style={{ color: insights.riskColor }}>
                          {insights.risk}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[9px] font-medium uppercase tracking-[0.16em]"
                          style={{ color: "#334155" }}>Tâm lý</div>
                        <div className="text-[13px] font-semibold" style={{ color: insights.sentimentColor }}>
                          {insights.sentiment}
                        </div>
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <div className="text-[9px] font-medium uppercase tracking-[0.16em]"
                          style={{ color: "#334155" }}>Khuyến nghị</div>
                        {insights.recommendation.map((r, i) => (
                          <div key={i} className="text-[12px] leading-snug"
                            style={{ color: "#64748B" }}>{r}</div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* ── RIGHT: Chart ──────────────────────────────────────────── */}
              <div
                className="flex flex-col gap-4 p-6 sm:p-7"
                style={{
                  borderLeft:   "1px solid rgba(255,255,255,0.04)",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                {/* Chart header */}
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="text-[9px] font-medium uppercase tracking-[0.18em]"
                      style={{ color: "#334155" }}>
                      VN-Index · 27 ngày
                    </div>
                    {vnIdx && (
                      <div className="text-[28px] sm:text-[32px] font-mono font-bold leading-none"
                        style={{ color: "#FFFFFF" }}>
                        {vnIdx.value.toLocaleString("vi-VN", {
                          minimumFractionDigits: 2, maximumFractionDigits: 2,
                        })}
                      </div>
                    )}
                  </div>
                  {vnIdx && (
                    <div className="flex flex-col items-end gap-1.5 pt-1">
                      <span className="text-[15px] font-mono font-semibold tabular-nums"
                        style={{ color: chartColor }}>
                        {vnIdx.change >= 0 ? "+" : ""}{vnIdx.change.toFixed(2)}
                      </span>
                      <span
                        className="text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full tabular-nums"
                        style={{
                          color:      chartColor,
                          background: `${chartColor}18`,
                          border:     `1px solid ${chartColor}22`,
                        }}
                      >
                        {vnIdx.change_pct >= 0 ? "+" : ""}{vnIdx.change_pct.toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Chart container */}
                <div className="relative flex-1" style={{ minHeight: 160 }}>
                  {sl?.vnindex && sl.vnindex.length >= 2 ? (
                    <PremiumChart data={sl.vnindex} color={chartColor} />
                  ) : (
                    <div className="flex items-center justify-center h-full text-sm"
                      style={{ color: MUTED }}>
                      Không có dữ liệu biểu đồ
                    </div>
                  )}
                </div>

                {/* X-axis time labels */}
                <div className="flex justify-between text-[9px] font-mono"
                  style={{ color: "#1E293B" }}>
                  <span>−27 ngày</span>
                  <span>Hôm nay</span>
                </div>
              </div>
            </div>

            {/* ── BOTTOM KPI ROW ─────────────────────────────────────────── */}
            <div
              className="flex items-center gap-5 sm:gap-8 px-6 sm:px-7 py-4 overflow-x-auto"
              style={{ scrollbarWidth: "none" }}
            >
              <KpiItem
                label="VN-Index"
                value={vnIdx
                  ? vnIdx.value.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : "--"}
                color={vnIdx ? priceColor(vnIdx.change) : MUTED}
                sub={vnIdx ? `${vnIdx.change >= 0 ? "+" : ""}${vnIdx.change_pct.toFixed(2)}%` : undefined}
              />
              <Sep />
              <KpiItem
                label="VN30"
                value={data?.vn30
                  ? data.vn30.value.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : "--"}
                color={data?.vn30 ? priceColor(data.vn30.change) : MUTED}
                sub={data?.vn30 ? `${data.vn30.change >= 0 ? "+" : ""}${data.vn30.change_pct.toFixed(2)}%` : undefined}
              />
              <Sep />
              <KpiItem
                label="HNX-Index"
                value={data?.hnx
                  ? data.hnx.value.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : "--"}
                color={data?.hnx ? priceColor(data.hnx.change) : MUTED}
                sub={data?.hnx ? `${data.hnx.change >= 0 ? "+" : ""}${data.hnx.change_pct.toFixed(2)}%` : undefined}
              />
              <Sep />
              <KpiItem
                label="Thanh khoản"
                value={data?.liquidity != null
                  ? `${data.liquidity.toLocaleString("vi-VN", { maximumFractionDigits: 0 })} tỷ`
                  : "--"}
                sub="HOSE"
              />
              <Sep />
              <KpiItem
                label="NN Ròng"
                value={ffStr}
                color={ffColor}
                sub={ff !== null ? "Tỷ VND" : undefined}
              />
              <Sep />
              <KpiItem
                label="Độ rộng"
                value={
                  hose ? (
                    <span>
                      <span style={{ color: POS }}>+{hose.advance}</span>
                      <span style={{ color: "#1E293B" }}> / </span>
                      <span style={{ color: NEG }}>−{hose.decline}</span>
                    </span>
                  ) : "--"
                }
                sub={
                  breadthTotal > 0
                    ? `${Math.round((hose!.advance / breadthTotal) * 100)}% tăng giá`
                    : undefined
                }
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

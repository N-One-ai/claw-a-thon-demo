"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { InvestmentGauge } from "./InvestmentGauge";

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
const MUTED = "#64748B";

function priceColor(v?: number | null) { return (v ?? 0) >= 0 ? POS : NEG; }

// ── Gauge prop helpers ────────────────────────────────────────────────────────

function gaugeRec(score: number): string {
  if (score < 20) return "BÁN MẠNH";
  if (score < 40) return "BÁN";
  if (score < 60) return "TRUNG LẬP";
  if (score < 80) return "MUA";
  return "MUA MẠNH";
}

function gaugeConfidence(data: MarketData): number {
  const score   = data.healthScore ?? 50;
  const sources = [data.vnindex, data.vn30, data.hnx, data.liquidity, data.foreignFlow, data.hose]
    .filter(v => v != null).length;
  const dataConf    = (sources / 6) * 20;
  const conviction  = Math.abs(score - 50) * 0.7;
  return Math.round(Math.min(95, 44 + dataConf + conviction));
}

function gaugeReasoning(data: MarketData): string[] {
  const bullets: string[] = [];
  const ff   = data.foreignFlow;
  const liq  = data.liquidity;
  const sl   = data.sparklines?.vnindex ?? [];
  const hose = data.hose;

  if (ff !== null)
    bullets.push(ff >= 0
      ? "Khối ngoại đang mua ròng trong phiên."
      : "Khối ngoại bán ròng trong phiên giao dịch.");

  if (liq !== null)
    bullets.push(liq >= 8000
      ? "Thanh khoản duy trì trên mức trung bình 20 phiên."
      : "Thanh khoản đang thấp hơn mức trung bình 20 phiên.");

  if (sl.length >= 10) {
    const ra = sl.slice(-5).reduce((s, v) => s + v, 0) / 5;
    const oa = sl.slice(-10, -5).reduce((s, v) => s + v, 0) / 5;
    if      (ra > oa * 1.01) bullets.push("VN-Index duy trì xu hướng tăng trong trung hạn.");
    else if (ra < oa * 0.99) bullets.push("Sóng ngắn hạn có dấu hiệu suy yếu nhẹ.");
    else                      bullets.push("Không phát hiện tín hiệu phân phối đáng kể.");
  } else if (hose) {
    const total = hose.advance + hose.decline + hose.unchanged;
    const pct   = total > 0 ? (hose.advance / total) * 100 : 50;
    bullets.push(pct >= 50
      ? "Độ rộng thị trường nghiêng về chiều tăng."
      : "Độ rộng thị trường phân hóa; chọn lọc cổ phiếu là chủ đạo.");
  }

  return bullets.slice(0, 3);
}

function gaugeInsight(score: number): string {
  if (score >= 80) return "Tín hiệu tích cực trên diện rộng — môi trường thuận lợi để xây dựng danh mục dài hạn.";
  if (score >= 60) return "Điều kiện hiện tại phù hợp tích lũy dần, không nên mua đuổi mạnh.";
  if (score >= 40) return "Thị trường đang phân hóa — ưu tiên cổ phiếu chất lượng cao, thanh khoản tốt.";
  if (score >= 20) return "Nên thận trọng; cân nhắc giảm tỷ trọng các vị thế có rủi ro cao.";
  return "Ưu tiên bảo toàn vốn. Chờ thêm tín hiệu phục hồi rõ ràng trước khi tái cơ cấu danh mục.";
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
function PremiumChart({ data, color = POS, endValue, endChange, endChangePct }: {
  data: number[]; color?: string; endValue?: number; endChange?: number; endChangePct?: number;
}) {
  const uid    = useId();
  const animNm = `ep${uid.replace(/[^a-zA-Z0-9]/g, '')}`;
  const svgRef       = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hIdx, setHIdx] = useState<number | null>(null);
  const [W, setW] = useState(0);
  const [H, setH] = useState(0);

  // Measure actual container pixel dimensions so SVG coords = CSS pixels (no distortion)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) { setW(width); setH(height); }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hasData = data != null && data.length >= 2;
  const hasSize = W > 0 && H > 0;

  if (!hasData || !hasSize) {
    return (
      <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
        {!hasData && (
          <div className="flex items-center justify-center h-full text-sm" style={{ color: MUTED }}>
            Đang tải dữ liệu biểu đồ...
          </div>
        )}
      </div>
    );
  }

  // W and H are actual CSS pixels — SVG coordinate system is 1:1 with screen pixels
  const PL = 8; const PR = 24; const PT = 16; const PB = 8;
  const CW = W - PL - PR; const CH = H - PT - PB;

  const rawMin = Math.min(...data); const rawMax = Math.max(...data);
  const pad = (rawMax - rawMin) * 0.08;
  const lo  = rawMin - pad; const hi = rawMax + pad;
  const rng = hi - lo;

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
  const areaPath = `${linePath} L${lx},${H - PB} L${PL},${H - PB} Z`;

  const gId    = `${uid}g`;
  const glowId = `${uid}gw`;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    // No viewBox — SVG units = CSS pixels, so clientX offset is the SVG coordinate
    const svgX = e.clientX - rect.left;
    const idx  = Math.max(0, Math.min(data.length - 1,
      Math.round(((svgX - PL) / CW) * (data.length - 1))
    ));
    setHIdx(idx);
  };

  const yTicks = Array.from({ length: 4 }, (_, i) => {
    const v = lo + (i / 3) * rng;
    return { y: toY(v), label: Math.round(v).toLocaleString("vi-VN") };
  });

  const hx = hIdx !== null ? pts[hIdx][0] : null;
  const hy = hIdx !== null ? pts[hIdx][1] : null;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <style>{`
        @keyframes ${animNm} {
          0%   { transform: scale(1);   opacity: 0.70; }
          65%  { opacity: 0.08; }
          100% { transform: scale(3.2); opacity: 0; }
        }
      `}</style>
      {/*
        No viewBox on this SVG — coordinate system is 1:1 with CSS pixels.
        W and H come from ResizeObserver, so scaleX = scaleY = 1.
        SVG <circle> elements are perfectly round; no preserveAspectRatio distortion.
      */}
      <svg
        ref={svgRef}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          display: 'block', overflow: 'visible',
          cursor: hIdx !== null ? 'crosshair' : 'default',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHIdx(null)}
      >
        <defs>
          <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity="0.24" />
            <stop offset="60%"  stopColor={color} stopOpacity="0.05" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b" />
            <feComposite in="SourceGraphic" in2="b" operator="over" />
          </filter>
        </defs>

        {yTicks.map((t, i) => (
          <line key={i} x1={PL} y1={t.y} x2={W - PR} y2={t.y}
            stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
        ))}

        <path d={areaPath} fill={`url(#${gId})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="5"
          strokeLinecap="round" strokeLinejoin="round"
          opacity="0.18" filter={`url(#${glowId})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" opacity="0.92" />

        {/* Endpoint marker — SVG circles, no distortion because coords = CSS pixels */}
        {hIdx === null && (
          <g>
            <line x1={lx} y1={ly} x2={lx} y2={H - PB}
              stroke={color} strokeWidth="1"
              strokeDasharray="3 4" strokeLinecap="round"
              opacity="0.18"
            />
            {/* Glow halo */}
            <circle cx={lx} cy={ly} r={10}
              fill={color} opacity="0.14"
              filter={`url(#${glowId})`}
            />
            {/* Pulse ring — transform-box keeps scale origin at circle center */}
            <circle cx={lx} cy={ly} r={6}
              fill="none" stroke={color} strokeWidth="1.5"
              style={{
                transformBox: 'fill-box',
                transformOrigin: 'center',
                animation: `${animNm} 2.6s ease-out infinite`,
              } as React.CSSProperties}
            />
            {/* Main dot */}
            <circle cx={lx} cy={ly} r={5}
              fill={color}
              stroke="rgba(255,255,255,0.90)"
              strokeWidth="1.5"
            />
          </g>
        )}

        {/* Hover crosshair + dot — SVG circles, perfectly round */}
        {hIdx !== null && hx !== null && hy !== null && (
          <g>
            <line x1={hx} y1={PT} x2={hx} y2={H - PB}
              stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="4,3" />
            <circle cx={hx} cy={hy} r={8} fill={color} opacity="0.12" />
            <circle cx={hx} cy={hy} r={3} fill={color} opacity="0.95" />
          </g>
        )}
      </svg>

      {/* Y-axis tick labels — HTML, positioned in CSS pixels */}
      {yTicks.slice(1, 3).map((tick, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            right: PR + 4,
            top: tick.y,
            transform: 'translateY(-100%)',
            paddingBottom: 2,
            fontSize: 9,
            lineHeight: 1,
            color: '#334155',
            fontFamily: 'ui-monospace, monospace',
            pointerEvents: 'none',
            userSelect: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {tick.label}
        </div>
      ))}

      {/* Hover tooltip — HTML outside SVG, positioned in CSS pixels */}
      {hIdx !== null && hx !== null && hy !== null && (() => {
        const daysAgo = data.length - 1 - hIdx;
        const d = new Date();
        d.setDate(d.getDate() - daysAgo);
        const dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        const val = data[hIdx].toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return (
          <div
            style={{
              position: 'absolute',
              left: hx,
              top: hy,
              transform: 'translate(-50%, calc(-100% - 10px))',
              background: 'rgba(8, 12, 20, 0.96)',
              border: '0.5px solid rgba(255,255,255,0.10)',
              borderRadius: 7,
              padding: '7px 13px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            <div style={{
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'ui-monospace, monospace',
              lineHeight: 1.3,
              textAlign: 'center',
            }}>
              {val}
            </div>
            <div style={{
              color: MUTED,
              fontSize: 10,
              fontFamily: 'ui-sans-serif, sans-serif',
              lineHeight: 1.3,
              marginTop: 3,
              textAlign: 'center',
            }}>
              {dateStr}
            </div>
          </div>
        );
      })()}

      {/* Price badge — HTML outside SVG, floats left of the endpoint dot */}
      {hIdx === null && endValue != null && (
        <div
          style={{
            position: 'absolute',
            left: lx,
            top: ly,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: 'calc(100% + 14px)',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'rgba(8, 12, 20, 0.90)',
              border: '0.5px solid rgba(255,255,255,0.08)',
              borderLeft: `2px solid ${color}80`,
              borderRadius: 8,
              padding: '6px 14px 6px 11px',
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'ui-monospace, monospace',
              lineHeight: 1.45,
            }}>
              {endValue.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {endChange != null && endChangePct != null && (
              <div style={{
                color,
                fontSize: 10.5,
                fontWeight: 500,
                fontFamily: 'ui-monospace, monospace',
                lineHeight: 1.4,
                marginTop: 3,
                opacity: 0.85,
              }}>
                {`${endChange >= 0 ? '+' : ''}${endChange.toFixed(2)}`}
                {'  '}
                {`${endChangePct >= 0 ? '+' : ''}${endChangePct.toFixed(2)}%`}
              </div>
            )}
          </div>
        </div>
      )}
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
    <div className="flex flex-col items-center gap-[3px] text-center">
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

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton() {
  const bg0 = "rgba(255,255,255,0.04)";
  const bg1 = "rgba(255,255,255,0.07)";
  const s = "rounded animate-pulse";

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-[45fr_55fr]">
        {/* Left — gauge placeholder */}
        <div className="p-6 sm:p-7 space-y-5">
          <div className="flex items-center gap-3">
            <div className={s} style={{ width: 28, height: 28, borderRadius: 8, background: bg0 }} />
            <div className="space-y-1.5">
              <div className={s} style={{ height: 9, width: 130, background: bg0 }} />
              <div className={s} style={{ height: 8, width: 80, background: bg0 }} />
            </div>
          </div>
          {/* Gauge arc placeholder */}
          <div className={s} style={{ height: 120, borderRadius: 12, background: bg0 }} />
          {/* Rec */}
          <div className="flex flex-col items-center gap-1.5">
            <div className={s} style={{ height: 8, width: 60, background: bg0 }} />
            <div className={s} style={{ height: 22, width: 100, background: bg1 }} />
          </div>
          {/* Confidence */}
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <div className={s} style={{ height: 8, width: 72, background: bg0 }} />
              <div className={s} style={{ height: 8, width: 28, background: bg0 }} />
            </div>
            <div className={s} style={{ height: 2, background: bg0 }} />
          </div>
          {/* Bullets */}
          {[1, 0.9, 0.75].map((w, i) => (
            <div key={i} className="flex gap-2">
              <div className={s} style={{ height: 8, width: 8, background: bg0, flexShrink: 0 }} />
              <div className={s} style={{ height: 8, width: `${w * 100}%`, background: bg0 }} />
            </div>
          ))}
        </div>
        {/* Right — chart placeholder */}
        <div className="p-6 sm:p-7 space-y-4">
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <div className={s} style={{ height: 8, width: 60, background: bg0 }} />
              <div className={s} style={{ height: 28, width: 140, background: bg1 }} />
            </div>
            <div className={s} style={{ height: 22, width: 72, background: bg0 }} />
          </div>
          <div className={s} style={{ height: 200, borderRadius: 8, background: bg0 }} />
          <div className="flex justify-between">
            <div className={s} style={{ height: 8, width: 48, background: bg0 }} />
            <div className={s} style={{ height: 8, width: 40, background: bg0 }} />
          </div>
        </div>
      </div>
      {/* Bottom row */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="grid grid-cols-3 sm:grid-cols-6 py-4">
          {[0,1,2,3,4,5].map(i => (
            <div key={i} className="flex justify-center px-3 py-1">
              <div className="space-y-1.5 text-center">
                <div className={s} style={{ height: 7, width: 44, background: bg0 }} />
                <div className={s} style={{ height: 13, width: 60, background: bg1 }} />
              </div>
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

  // Derived values
  const score    = data?.healthScore ?? 50;
  const sl       = data?.sparklines;
  const vnIdx    = data?.vnindex;
  const chartColor = vnIdx ? priceColor(vnIdx.change) : POS;

  const ff           = data?.foreignFlow;
  const ffColor      = ff == null ? MUTED : ff >= 0 ? POS : NEG;
  const ffStr        = ff == null
    ? "--"
    : `${ff >= 0 ? "+" : ""}${Math.abs(ff).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} tỷ`;

  const hose         = data?.hose;
  const breadthTotal = hose ? hose.advance + hose.decline + hose.unchanged : 0;

  return (
    <div
      className={cn(
        "w-full max-w-5xl mx-auto transition-opacity duration-700",
        visible ? "opacity-100" : "opacity-0",
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
            {/* ── Two-column main area ─────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-[36fr_64fr]">

              {/* ── LEFT: Investment Gauge ─────────────────────────────── */}
              <div
                className="flex flex-col gap-1 p-4 sm:p-5"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              >
                {/* Header */}
                <div className="flex items-center gap-3 mb-3">
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

                {/* Investment Gauge */}
                {data && (
                  <InvestmentGauge
                    score={score}
                    recommendation={gaugeRec(score)}
                    confidence={gaugeConfidence(data)}
                    reasoning={gaugeReasoning(data)}
                    insight={gaugeInsight(score)}
                  />
                )}
              </div>

              {/* ── RIGHT: Chart ───────────────────────────────────────── */}
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

                {/* Chart */}
                <div className="relative flex-1" style={{ minHeight: 160 }}>
                  {sl?.vnindex && sl.vnindex.length >= 2 ? (
                    <PremiumChart
                    data={sl.vnindex}
                    color={chartColor}
                    endValue={vnIdx?.value}
                    endChange={vnIdx?.change}
                    endChangePct={vnIdx?.change_pct}
                  />
                  ) : (
                    <div className="flex items-center justify-center h-full text-sm"
                      style={{ color: MUTED }}>
                      Không có dữ liệu biểu đồ
                    </div>
                  )}
                </div>

                {/* X-axis labels */}
                <div className="flex justify-between text-[9px] font-mono"
                  style={{ color: "#1E293B" }}>
                  <span>−27 ngày</span>
                  <span>Hôm nay</span>
                </div>
              </div>
            </div>

            {/* ── BOTTOM KPI ROW ──────────────────────────────────────── */}
            <div className="grid grid-cols-3 sm:grid-cols-6">
              {[
                {
                  label: "VN-Index",
                  value: vnIdx
                    ? vnIdx.value.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : "--",
                  color: vnIdx ? priceColor(vnIdx.change) : MUTED,
                  sub: vnIdx ? `${vnIdx.change >= 0 ? "+" : ""}${vnIdx.change_pct.toFixed(2)}%` : undefined,
                },
                {
                  label: "VN30",
                  value: data?.vn30
                    ? data.vn30.value.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : "--",
                  color: data?.vn30 ? priceColor(data.vn30.change) : MUTED,
                  sub: data?.vn30 ? `${data.vn30.change >= 0 ? "+" : ""}${data.vn30.change_pct.toFixed(2)}%` : undefined,
                },
                {
                  label: "HNX-Index",
                  value: data?.hnx
                    ? data.hnx.value.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : "--",
                  color: data?.hnx ? priceColor(data.hnx.change) : MUTED,
                  sub: data?.hnx ? `${data.hnx.change >= 0 ? "+" : ""}${data.hnx.change_pct.toFixed(2)}%` : undefined,
                },
                {
                  label: "Thanh khoản",
                  value: data?.liquidity != null
                    ? `${data.liquidity.toLocaleString("vi-VN", { maximumFractionDigits: 0 })} tỷ`
                    : "--",
                  sub: "HOSE",
                },
                {
                  label: "NN Ròng",
                  value: ffStr,
                  color: ffColor,
                  sub: ff !== null ? "Tỷ VND" : undefined,
                },
                {
                  label: "Độ rộng",
                  value: hose ? (
                    <span>
                      <span style={{ color: POS }}>+{hose.advance}</span>
                      <span style={{ color: "#1E293B" }}> / </span>
                      <span style={{ color: NEG }}>−{hose.decline}</span>
                    </span>
                  ) : "--",
                  sub: breadthTotal > 0
                    ? `${Math.round((hose!.advance / breadthTotal) * 100)}% tăng giá`
                    : undefined,
                },
              ].map((item, i, arr) => (
                <div
                  key={i}
                  className="flex justify-center py-4 px-3"
                  style={{
                    borderRight: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                  }}
                >
                  <KpiItem
                    label={item.label}
                    value={item.value}
                    color={item.color}
                    sub={item.sub}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

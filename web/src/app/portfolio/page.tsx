"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  PlusCircle, X, TrendingUp, TrendingDown, Wallet, BarChart3,
  Star, Briefcase, PieChart as PieChartIcon, Shield, Brain,
  CheckCircle, AlertTriangle, Target, Activity, Layers, ChevronRight,
  Pencil, Plus, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { analyzeTicker } from "@/lib/api";
import { translateSector } from "@/lib/sectors";
import type { AnalysisResponse } from "@/types/analysis";
import { riskBg, computeInvestmentScore } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PortfolioItem {
  ticker: string;
  shares: number;
  avgCost: number;
  data?: AnalysisResponse;
  loading?: boolean;
  error?: string;
}

type ModalState =
  | { type: "none" }
  | { type: "edit"; ticker: string }
  | { type: "add"; ticker: string }
  | { type: "delete"; ticker: string };

const COLORS = ["#A3FF12", "#7CFF3B", "#FFB020", "#FF5A76", "#A855F7", "#22D3EE", "#F97316", "#60A5FA"];
function gc(s: number) { return s >= 65 ? "#7CFF3B" : s >= 40 ? "#FFB020" : "#FF5A76"; }

// ── Component ──────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [input, setInput] = useState({ ticker: "", shares: "", avgCost: "" });
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const { t, formatCurrency, formatPercent, translateLabel } = useTranslation();
  const tp = t.portfolio;

  // ── CRUD (unchanged logic) ───────────────────────────────────────────────
  const add = async () => {
    const ticker = input.ticker.trim().toUpperCase();
    const shares = parseFloat(input.shares);
    const avgCost = parseFloat(input.avgCost);
    if (!ticker || isNaN(shares) || shares <= 0) return;
    if (items.find((i) => i.ticker === ticker)) return;
    const item: PortfolioItem = { ticker, shares, avgCost: isNaN(avgCost) ? 0 : avgCost, loading: true };
    setItems((prev) => [...prev, item]);
    setInput({ ticker: "", shares: "", avgCost: "" });
    setLoading(true);
    try {
      const data = await analyzeTicker(ticker, { report: false });
      setItems((prev) => prev.map((i) => (i.ticker === ticker ? { ...i, data, loading: false } : i)));
    } catch (e) {
      setItems((prev) => prev.map((i) => i.ticker === ticker ? { ...i, loading: false, error: (e as Error).message } : i));
    } finally { setLoading(false); }
  };
  const remove = (ticker: string) => { setItems((prev) => prev.filter((i) => i.ticker !== ticker)); setModal({ type: "none" }); };

  const updateItem = useCallback((ticker: string, shares: number, avgCost: number) => {
    setItems(prev => prev.map(i => i.ticker === ticker ? { ...i, shares, avgCost } : i));
    setModal({ type: "none" });
  }, []);

  const addShares = useCallback((ticker: string, newShares: number, buyPrice: number) => {
    setItems(prev => prev.map(i => {
      if (i.ticker !== ticker) return i;
      const totalOldCost = i.avgCost * i.shares;
      const totalNewCost = buyPrice * newShares;
      const totalShares = i.shares + newShares;
      const newAvg = totalShares > 0 ? (totalOldCost + totalNewCost) / totalShares : 0;
      return { ...i, shares: totalShares, avgCost: Math.round(newAvg) };
    }));
    setModal({ type: "none" });
  }, []);

  // ── Computed (unchanged logic) ───────────────────────────────────────────
  const totalValue = items.reduce((s, i) => s + (i.data?.current_price ?? i.avgCost) * i.shares, 0);
  const totalCost = items.reduce((s, i) => s + (i.avgCost || 0) * i.shares, 0);
  const totalPnL = totalCost > 0 ? totalValue - totalCost : null;
  const pnlPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : null;

  const sectorMap: Record<string, number> = {};
  items.forEach((i) => { if (!i.data) return; const s = translateSector(i.data.company.sector) || tp.sectorOther; const v = (i.data.current_price ?? 0) * i.shares; sectorMap[s] = (sectorMap[s] ?? 0) + v; });
  const pieData = Object.entries(sectorMap).map(([name, value]) => ({ name, value }));

  const scores = items.filter((i) => i.data?.valuation && i.data?.risk).map((i) => computeInvestmentScore(i.data!.valuation!.discount_pct, i.data!.risk!.overall_risk));
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const scoreColor = avgScore != null ? gc(avgScore) : "#475569";

  const riskDist = useMemo(() => {
    const d = { low: 0, med: 0, high: 0 };
    items.forEach(i => { const r = i.data?.risk?.overall_risk; if (r === "Thấp" || r === "LOW") d.low++; else if (r === "Cao" || r === "HIGH" || r === "Rất cao" || r === "VERY_HIGH") d.high++; else if (r) d.med++; });
    return d;
  }, [items]);
  const riskTotal = riskDist.low + riskDist.med + riskDist.high;

  const ranked = useMemo(() => {
    return items.filter(i => i.data && i.avgCost > 0).map(i => {
      const price = i.data!.current_price ?? 0;
      return { ticker: i.ticker, name: i.data!.company.name, pnl: ((price - i.avgCost) / i.avgCost) * 100, price };
    }).sort((a, b) => b.pnl - a.pnl);
  }, [items]);

  const insights: Array<{ text: string; positive: boolean }> = [];
  if (pieData.length >= 3) insights.push({ text: "Danh mục đa dạng hóa tốt với " + pieData.length + " ngành", positive: true });
  if (pieData.length === 1) insights.push({ text: "Danh mục tập trung vào 1 ngành — rủi ro cao", positive: false });
  if (riskDist.low > riskDist.high) insights.push({ text: "Phần lớn danh mục có rủi ro thấp", positive: true });
  if (riskDist.high > riskDist.low) insights.push({ text: "Nhiều cổ phiếu rủi ro cao hơn rủi ro thấp", positive: false });
  if (pnlPct != null && pnlPct > 0) insights.push({ text: `Danh mục đang lãi ${pnlPct.toFixed(1)}%`, positive: true });
  if (pnlPct != null && pnlPct < 0) insights.push({ text: `Danh mục đang lỗ ${Math.abs(pnlPct).toFixed(1)}%`, positive: false });

  const modalItem = modal.type !== "none" ? items.find(i => i.ticker === modal.ticker) : null;

  return (
    <div className="space-y-4 animate-slide-up">
      <div><h1 className="text-xl font-bold text-white">{tp.title}</h1><p className="text-sm text-slate-500">{tp.subtitle}</p></div>

      {/* ═══ ADD FORM ═══ */}
      <div className="card p-5">
        <SectionHeader icon={PlusCircle} title={tp.addStockTitle} color="lime" className="mb-4" />
        <div className="flex gap-2 flex-wrap">
          <input value={input.ticker} onChange={(e) => setInput((p) => ({ ...p, ticker: e.target.value.toUpperCase() }))} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={tp.tickerPh}
            className="flex-1 min-w-24 bg-white/[0.02] border border-white/[0.04] rounded-xl px-4 py-2.5 text-sm font-mono text-slate-200 placeholder:text-slate-600 outline-none focus:border-accent/40 transition-colors min-h-0" />
          <input value={input.shares} onChange={(e) => setInput((p) => ({ ...p, shares: e.target.value }))} placeholder={tp.sharesPh} type="number" min="1"
            className="w-28 bg-white/[0.02] border border-white/[0.04] rounded-xl px-4 py-2.5 text-sm font-mono text-slate-200 placeholder:text-slate-600 outline-none focus:border-accent/40 transition-colors min-h-0" />
          <input value={input.avgCost} onChange={(e) => setInput((p) => ({ ...p, avgCost: e.target.value }))} placeholder={tp.avgCostPh} type="number"
            className="w-36 bg-white/[0.02] border border-white/[0.04] rounded-xl px-4 py-2.5 text-sm font-mono text-slate-200 placeholder:text-slate-600 outline-none focus:border-accent/40 transition-colors min-h-0" />
          <button onClick={add} disabled={!input.ticker || !input.shares || loading}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-bold text-sm text-[#0A0D12] disabled:brightness-[0.6] disabled:cursor-not-allowed transition-all min-h-0"
            style={{ background: "linear-gradient(90deg,#A3FF12,#7CFF3B)" }}>
            <PlusCircle className="w-4 h-4" /> {tp.addBtn}
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card p-16 flex flex-col items-center justify-center gap-3 text-center">
          <Briefcase className="w-12 h-12 text-slate-700" /><p className="text-slate-500 text-sm">{tp.empty}</p>
        </div>
      ) : (
        <>
          {/* ═══ KPI ═══ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <KPICard icon={Wallet} color="#A3FF12" label={tp.portfolioValue} value={formatCurrency(totalValue)} />
            <KPICard icon={totalPnL != null && totalPnL >= 0 ? TrendingUp : TrendingDown} color={totalPnL != null && totalPnL >= 0 ? "#7CFF3B" : "#FF5A76"}
              label={tp.pnl} value={totalPnL != null ? `${totalPnL > 0 ? "+" : ""}${formatCurrency(totalPnL)}` : "—"} sub={pnlPct != null ? formatPercent(pnlPct) : undefined} semantic />
            <KPICard icon={Star} color={scoreColor} label={tp.portfolioScore} value={avgScore != null ? `${avgScore}/100` : "—"} pct={avgScore ?? undefined} />
            <KPICard icon={BarChart3} color="#22D3EE" label={tp.numTickers} value={String(items.length)} />
          </div>

          {/* ═══ HEALTH ═══ */}
          {avgScore != null && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="card p-5 sm:p-6 flex flex-col sm:flex-row items-center gap-6">
                <ScoreGauge value={avgScore} color={scoreColor} label={avgScore >= 65 ? "Tốt" : avgScore >= 40 ? "TB" : "Yếu"} />
                <div className="flex-1 space-y-3">
                  <h3 className="text-sm font-semibold text-white">{tp.portfolioScore}</h3>
                  {insights.slice(0, 5).map((ins, i) => (
                    <div key={i} className="flex items-start gap-2">
                      {ins.positive ? <CheckCircle className="w-3.5 h-3.5 text-profit mt-0.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-warn mt-0.5 shrink-0" />}
                      <span className="text-xs text-slate-400 leading-relaxed">{ins.text}</span>
                    </div>
                  ))}
                </div>
              </div>
              {riskTotal > 0 && (
                <div className="card p-5">
                  <SectionHeader icon={Shield} title="Phân bổ rủi ro" color="red" className="mb-4" />
                  <div className="space-y-3">
                    <RiskBar label="Rủi ro thấp" count={riskDist.low} total={riskTotal} color="#7CFF3B" />
                    <RiskBar label="Rủi ro TB" count={riskDist.med} total={riskTotal} color="#FFB020" />
                    <RiskBar label="Rủi ro cao" count={riskDist.high} total={riskTotal} color="#FF5A76" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ HOLDINGS + PIE ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
            <div className="lg:col-span-3 card p-5">
              <SectionHeader icon={Briefcase} title={tp.holdingsTitle(items.length)} color="lime" className="mb-4" />
              <div className="space-y-2">
                {items.map((item) => {
                  const price = item.data?.current_price ?? 0;
                  const value = price * item.shares;
                  const pct = totalValue > 0 ? (value / totalValue) * 100 : 0;
                  const pnl = item.avgCost > 0 ? ((price - item.avgCost) / item.avgCost) * 100 : null;
                  const score = item.data?.valuation && item.data?.risk ? computeInvestmentScore(item.data.valuation.discount_pct, item.data.risk.overall_risk) : null;
                  return (
                    <div key={item.ticker} className="group flex items-center gap-3 p-3 rounded-xl border border-white/[0.03] bg-white/[0.01] hover:bg-white/[0.025] transition-all">
                      <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/15 flex items-center justify-center font-mono text-xs font-bold text-accent shrink-0">
                        {item.ticker.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-sm text-white">{item.ticker}</span>
                          {item.loading && <span className="text-[10px] text-slate-600 animate-pulse">{tp.loading}</span>}
                          {item.data?.risk && <span className={cn("text-[9px] px-1.5 py-0.5 rounded border", riskBg(item.data.risk.overall_risk))}>{translateLabel(item.data.risk.overall_risk)}</span>}
                          {score != null && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${gc(score)}12`, color: gc(score) }}>{score}</span>}
                        </div>
                        <p className="text-[10px] text-slate-600 truncate">{item.data?.company.name ?? "—"} · {item.shares.toLocaleString()} {tp.sharesUnit} · {pct.toFixed(1)}%</p>
                      </div>
                      <div className="text-right text-xs font-mono shrink-0">
                        <p className="text-slate-200">{formatCurrency(price)}</p>
                        {pnl != null && <p className={pnl >= 0 ? "text-profit" : "text-loss"}>{formatPercent(pnl)}</p>}
                      </div>
                      {/* Action icons */}
                      <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <ActionBtn icon={Pencil} title="Sửa" onClick={() => setModal({ type: "edit", ticker: item.ticker })} />
                        <ActionBtn icon={Plus} title="Thêm" onClick={() => setModal({ type: "add", ticker: item.ticker })} />
                        <ActionBtn icon={Trash2} title="Xóa" onClick={() => setModal({ type: "delete", ticker: item.ticker })} danger />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pie */}
            <div className="lg:col-span-2 card p-5">
              <SectionHeader icon={PieChartIcon} title={tp.sectorAlloc} color="purple" className="mb-4" />
              {mounted && pieData.length > 0 ? (
                <>
                  <div className="relative h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" strokeWidth={0}>
                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie><Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: 12, fontSize: 11, color: "#E2E8F0" }} formatter={(v: number) => [formatCurrency(v), ""]} /></PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-lg font-bold text-white font-mono">{pieData.length}</span><span className="text-[8px] text-slate-500 uppercase">ngành</span>
                    </div>
                  </div>
                  <div className="space-y-1.5 mt-3">{pieData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-slate-400 flex-1 truncate">{d.name}</span>
                      <span className="font-mono text-slate-300">{totalValue > 0 ? ((d.value / totalValue) * 100).toFixed(1) : 0}%</span>
                    </div>
                  ))}</div>
                </>
              ) : <div className="h-48 flex items-center justify-center text-slate-700 text-sm">{tp.noSector}</div>}
            </div>
          </div>

          {/* ═══ TOP CONTRIBUTORS ═══ */}
          {ranked.length >= 2 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="card p-5"><SectionHeader icon={TrendingUp} title="Top tăng giá" color="green" className="mb-3" />
                {ranked.filter(r => r.pnl > 0).slice(0, 3).map((r, i) => (
                  <div key={r.ticker} className="flex items-center gap-3 py-2 border-b border-white/[0.03] last:border-0">
                    <span className="text-[10px] font-bold text-slate-600 w-5">{i + 1}</span>
                    <span className="font-mono text-sm text-white font-semibold flex-1">{r.ticker}</span>
                    <span className="font-mono text-sm font-bold text-profit">+{r.pnl.toFixed(1)}%</span>
                  </div>
                ))}{ranked.filter(r => r.pnl > 0).length === 0 && <p className="text-xs text-slate-600">—</p>}
              </div>
              <div className="card p-5"><SectionHeader icon={TrendingDown} title="Top giảm giá" color="red" className="mb-3" />
                {ranked.filter(r => r.pnl < 0).slice(-3).reverse().map((r, i) => (
                  <div key={r.ticker} className="flex items-center gap-3 py-2 border-b border-white/[0.03] last:border-0">
                    <span className="text-[10px] font-bold text-slate-600 w-5">{i + 1}</span>
                    <span className="font-mono text-sm text-white font-semibold flex-1">{r.ticker}</span>
                    <span className="font-mono text-sm font-bold text-loss">{r.pnl.toFixed(1)}%</span>
                  </div>
                ))}{ranked.filter(r => r.pnl < 0).length === 0 && <p className="text-xs text-slate-600">—</p>}
              </div>
            </div>
          )}

          {/* ═══ AI INSIGHTS ═══ */}
          {insights.length > 0 && (
            <div className="card p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-[10px] bg-[rgba(34,211,238,0.08)] border border-[rgba(34,211,238,0.15)] flex items-center justify-center"><Brain className="w-[18px] h-[18px] text-[#22D3EE]" strokeWidth={2} /></div>
                <h3 className="text-[13px] font-bold uppercase tracking-[0.06em] text-slate-300">AI Insights</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{insights.map((ins, i) => (
                <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl border border-white/[0.03] bg-white/[0.01]">
                  {ins.positive ? <CheckCircle className="w-4 h-4 text-profit mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-warn mt-0.5 shrink-0" />}
                  <span className="text-xs text-slate-400 leading-relaxed">{ins.text}</span>
                </div>
              ))}</div>
            </div>
          )}
        </>
      )}

      {/* ═══ MODALS ═══ */}
      {modal.type === "edit" && modalItem && (
        <EditModal item={modalItem} onSave={updateItem} onClose={() => setModal({ type: "none" })} />
      )}
      {modal.type === "add" && modalItem && (
        <AddModal ticker={modalItem.ticker} onSave={addShares} onClose={() => setModal({ type: "none" })} />
      )}
      {modal.type === "delete" && modalItem && (
        <DeleteModal ticker={modalItem.ticker} onConfirm={() => remove(modalItem.ticker)} onClose={() => setModal({ type: "none" })} />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ActionBtn({ icon: Icon, title, onClick, danger }: { icon: React.ElementType; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title}
      className={cn("p-1.5 rounded-lg transition-colors min-h-0", danger ? "hover:bg-loss/10 hover:text-loss text-slate-700" : "hover:bg-white/[0.06] hover:text-white text-slate-700")}>
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative card p-6 w-full max-w-md animate-fade-in" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function ModalInput({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-white text-sm font-mono placeholder:text-slate-600 outline-none focus:border-accent/40 transition-colors min-h-0" />
    </div>
  );
}

function EditModal({ item, onSave, onClose }: { item: PortfolioItem; onSave: (ticker: string, shares: number, avgCost: number) => void; onClose: () => void }) {
  const [shares, setShares] = useState(String(item.shares));
  const [avgCost, setAvgCost] = useState(String(item.avgCost));
  const [notes, setNotes] = useState("");
  return (
    <ModalOverlay onClose={onClose}>
      <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Pencil className="w-4 h-4 text-accent" /> Sửa vị thế — {item.ticker}</h2>
      <div className="space-y-3">
        <ModalInput label="Mã cổ phiếu" value={item.ticker} onChange={() => {}} />
        <ModalInput label="Số lượng" value={shares} onChange={setShares} type="number" placeholder="Số CP" />
        <ModalInput label="Giá vốn trung bình (₫)" value={avgCost} onChange={setAvgCost} type="number" placeholder="VD: 85000" />
        <ModalInput label="Ghi chú" value={notes} onChange={setNotes} placeholder="Ghi chú tùy chọn..." />
      </div>
      <div className="flex gap-2 mt-5">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-400 bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors min-h-0">Hủy</button>
        <button onClick={() => { const s = parseFloat(shares); const c = parseFloat(avgCost); if (s > 0) onSave(item.ticker, s, isNaN(c) ? 0 : c); }}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold text-[#0A0D12] min-h-0" style={{ background: "linear-gradient(90deg,#A3FF12,#7CFF3B)" }}>Lưu</button>
      </div>
    </ModalOverlay>
  );
}

function AddModal({ ticker, onSave, onClose }: { ticker: string; onSave: (ticker: string, shares: number, price: number) => void; onClose: () => void }) {
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  return (
    <ModalOverlay onClose={onClose}>
      <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Plus className="w-4 h-4 text-accent" /> Mua thêm — {ticker}</h2>
      <div className="space-y-3">
        <ModalInput label="Số lượng mua thêm" value={shares} onChange={setShares} type="number" placeholder="VD: 100" />
        <ModalInput label="Giá mua (₫)" value={price} onChange={setPrice} type="number" placeholder="VD: 92000" />
      </div>
      <div className="flex gap-2 mt-5">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-400 bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors min-h-0">Hủy</button>
        <button onClick={() => { const s = parseFloat(shares); const p = parseFloat(price); if (s > 0 && p > 0) onSave(ticker, s, p); }}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold text-[#0A0D12] min-h-0" style={{ background: "linear-gradient(90deg,#A3FF12,#7CFF3B)" }}>Mua thêm</button>
      </div>
    </ModalOverlay>
  );
}

function DeleteModal({ ticker, onConfirm, onClose }: { ticker: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <ModalOverlay onClose={onClose}>
      <div className="text-center py-4">
        <div className="w-14 h-14 rounded-2xl bg-loss/10 border border-loss/20 flex items-center justify-center mx-auto mb-4">
          <Trash2 className="w-6 h-6 text-loss" />
        </div>
        <h2 className="text-lg font-bold text-white mb-2">Xóa vị thế {ticker}?</h2>
        <p className="text-sm text-slate-500 mb-6">Hành động này không thể hoàn tác. Toàn bộ dữ liệu của {ticker} sẽ bị xóa khỏi danh mục.</p>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-400 bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors min-h-0">Hủy</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-loss hover:brightness-110 transition-all min-h-0">Xóa</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function KPICard({ icon: Icon, color, label, value, sub, pct, semantic }: {
  icon: React.ElementType; color: string; label: string; value: string; sub?: string; pct?: number; semantic?: boolean;
}) {
  return (
    <div className="card card-hover p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color}12`, color }}><Icon className="w-4 h-4" /></div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <p className="text-xl font-mono font-extrabold" style={semantic ? { color } : undefined}>{value}</p>
      {sub && <p className="text-xs mt-0.5 font-mono font-semibold" style={semantic ? { color } : { color: "#64748B" }}>{sub}</p>}
      {pct != null && (
        <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden mt-2">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
        </div>
      )}
    </div>
  );
}

function ScoreGauge({ value, color, label }: { value: number; color: string; label: string }) {
  const r = 50; const circ = 2 * Math.PI * r; const arcLen = circ * 0.75;
  const filled = arcLen * (Math.max(0, Math.min(100, value)) / 100);
  return (
    <svg viewBox="0 0 128 110" className="w-[150px] h-[128px] shrink-0">
      <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="8" strokeDasharray={`${arcLen} ${circ - arcLen}`} strokeLinecap="round" transform="rotate(135 64 64)" />
      <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="8" strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round" transform="rotate(135 64 64)"
        className="transition-all duration-700" style={{ filter: `drop-shadow(0 0 6px ${color}40)` }} />
      <text x="64" y="58" textAnchor="middle" fill="white" fontSize="26" fontWeight="800" fontFamily="JetBrains Mono, monospace">{value}</text>
      <text x="64" y="78" textAnchor="middle" fill={color} fontSize="10" fontWeight="600">{label}</text>
    </svg>
  );
}

function RiskBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-slate-500 w-24 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-white/[0.04] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[11px] font-mono text-slate-400 w-10 text-right">{count} ({pct.toFixed(0)}%)</span>
    </div>
  );
}

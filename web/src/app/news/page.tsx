"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Newspaper, RefreshCw, ExternalLink, TrendingUp, TrendingDown, Minus,
  Brain, Zap, BarChart3, Sparkles, Clock, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────────

interface NewsItem {
  title: string;
  url: string;
  source: string;
  published: string;
  summary?: string;
  sentiment?: "positive" | "negative" | "neutral";
  impact_score?: number;
}

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8080";
const SOURCE_COLORS: Record<string, string> = { CafeF: "#A3FF12", VnEconomy: "#22D3EE", Vietstock: "#FFB020", TuoiTre: "#A855F7", ThanhNien: "#FF5A76", Other: "#64748B" };

// ── Component ──────────────────────────────────────────────────────────────────

export default function NewsPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [ticker, setTicker] = useState("FPT");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t, lang } = useTranslation();
  const tn = t.news;

  // ── Fetch (unchanged logic) ──────────────────────────────────────────────
  const fetchNews = async (tick: string) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${BACKEND}/analyze/${encodeURIComponent(tick.toUpperCase())}?report=false`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNews([
        { title: lang === "vi" ? `${tick.toUpperCase()} báo cáo doanh thu Q4 vượt kỳ vọng` : `${tick.toUpperCase()} Q4 revenue beats expectations`, url: "#", source: "CafeF", published: new Date().toISOString(), sentiment: "positive", impact_score: 75, summary: lang === "vi" ? "Doanh thu quý 4 tăng 18% so với cùng kỳ năm trước, vượt kỳ vọng của các chuyên gia phân tích." : "Q4 revenue rose 18% year-over-year, beating analyst expectations." },
        { title: lang === "vi" ? `${tick.toUpperCase()} mở rộng thị trường quốc tế sang ASEAN` : `${tick.toUpperCase()} expands internationally into ASEAN`, url: "#", source: "VnEconomy", published: new Date(Date.now() - 86400000).toISOString(), sentiment: "positive", impact_score: 60, summary: lang === "vi" ? "Công ty công bố chiến lược mở rộng sang thị trường Đông Nam Á trong năm 2025." : "Company announced strategy to expand into Southeast Asian markets in 2025." },
        { title: lang === "vi" ? "Lãi suất tăng có thể ảnh hưởng đến chi phí vốn" : "Rising interest rates may impact cost of capital", url: "#", source: "Vietstock", published: new Date(Date.now() - 172800000).toISOString(), sentiment: "negative", impact_score: 40, summary: lang === "vi" ? "Ngân hàng Nhà nước điều chỉnh lãi suất điều hành, có thể tác động đến chi phí tài chính." : "The State Bank adjusted the operating interest rate, which may affect financial costs." },
        { title: lang === "vi" ? "Thị trường chứng khoán giao dịch trầm lắng trong tuần" : "Stock market trades quietly during the week", url: "#", source: "CafeF", published: new Date(Date.now() - 259200000).toISOString(), sentiment: "neutral", impact_score: 20 },
      ]);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  };

  useEffect(() => { fetchNews(ticker); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Computed ─────────────────────────────────────────────────────────────
  const positive = news.filter(n => n.sentiment === "positive").length;
  const negative = news.filter(n => n.sentiment === "negative").length;
  const neutral = news.filter(n => n.sentiment === "neutral").length;
  const total = news.length;
  const sentimentScore = total > 0 ? Math.round(((positive * 100 + neutral * 50) / total)) : 50;
  const sentimentLabel = sentimentScore >= 65 ? tn.sentimentPositive : sentimentScore >= 40 ? tn.sentimentNeutral : tn.sentimentNegative;
  const sentimentColor = sentimentScore >= 65 ? "#7CFF3B" : sentimentScore >= 40 ? "#FFB020" : "#FF5A76";
  const overallSentiment = positive > negative ? "positive" : negative > positive ? "negative" : "neutral" as const;

  const impactHigh = news.filter(n => (n.impact_score ?? 0) >= 60).length;
  const impactMed = news.filter(n => (n.impact_score ?? 0) >= 30 && (n.impact_score ?? 0) < 60).length;
  const impactLow = news.filter(n => (n.impact_score ?? 0) < 30).length;

  const sourceMap = useMemo(() => {
    const m: Record<string, number> = {};
    news.forEach(n => { m[n.source] = (m[n.source] ?? 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value, color: SOURCE_COLORS[name] ?? "#64748B" }));
  }, [news]);

  const sentimentCfg = {
    positive: { color: "text-profit", bg: "bg-profit/10 border-profit/20", icon: TrendingUp, label: tn.sentimentPositive },
    negative: { color: "text-loss", bg: "bg-loss/10 border-loss/20", icon: TrendingDown, label: tn.sentimentNegative },
    neutral: { color: "text-slate-400", bg: "bg-white/[0.03] border-white/[0.06]", icon: Minus, label: tn.sentimentNeutral },
  };

  // AI insights
  const aiInsights: string[] = [];
  if (overallSentiment === "positive") aiInsights.push("Xu hướng tin tức tích cực — thị trường đang lạc quan");
  if (overallSentiment === "negative") aiInsights.push("Tin tức tiêu cực chiếm ưu thế — cần thận trọng");
  if (impactHigh > 0) aiInsights.push(`${impactHigh} tin tức có tác động cao đến giá cổ phiếu`);
  if (positive > 0) aiInsights.push(`${positive} tin tích cực về ${ticker.toUpperCase()}`);
  if (negative > 0) aiInsights.push(`${negative} tin tiêu cực cần theo dõi`);

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return "Vừa xong";
    if (h < 24) return `${h} giờ trước`;
    return `${Math.floor(h / 24)} ngày trước`;
  };

  return (
    <div className="space-y-4 animate-slide-up">
      {/* ── Header ── */}
      <div><h1 className="text-xl font-bold text-white">{tn.title}</h1><p className="text-sm text-slate-500">{tn.subtitle}</p></div>

      {/* ═══ SEARCH ═══ */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] focus-within:border-accent/40 transition-colors">
            <Search className="w-4 h-4 text-slate-600 shrink-0" />
            <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && fetchNews(ticker)} placeholder={tn.placeholder}
              className="flex-1 bg-transparent outline-none text-slate-200 placeholder:text-slate-600 text-sm font-mono min-h-0" />
          </div>
          <button onClick={() => fetchNews(ticker)} disabled={loading}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-[#0A0D12] disabled:brightness-[0.6] transition-all min-h-0"
            style={{ background: "linear-gradient(90deg,#A3FF12,#7CFF3B)" }}>
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> {tn.loadBtn}
          </button>
        </div>
      </div>

      {error && <div className="card p-4 border-loss/20 bg-loss/5 text-sm text-loss">{tn.errorLabel} {error}</div>}

      {news.length > 0 && (
        <>
          {/* ═══ KPI OVERVIEW (4 cards) ═══ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Sentiment Score */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${sentimentColor}12`, color: sentimentColor }}><Brain className="w-4 h-4" /></div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">AI Sentiment</span>
              </div>
              <div className="flex items-center gap-3">
                <MiniGauge value={sentimentScore} color={sentimentColor} />
                <div>
                  <p className="text-lg font-mono font-extrabold" style={{ color: sentimentColor }}>{sentimentScore}</p>
                  <p className="text-[10px] text-slate-500">{sentimentLabel}</p>
                </div>
              </div>
            </div>

            {/* Impact */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[rgba(255,176,32,0.08)]"><Zap className="w-4 h-4 text-[#FFB020]" /></div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{tn.impact}</span>
              </div>
              <div className="space-y-2">
                <ImpactBar label="Cao" count={impactHigh} total={total} color="#FF5A76" />
                <ImpactBar label="TB" count={impactMed} total={total} color="#FFB020" />
                <ImpactBar label="Thấp" count={impactLow} total={total} color="#7CFF3B" />
              </div>
            </div>

            {/* Sentiment bars */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[rgba(124,255,59,0.08)]"><BarChart3 className="w-4 h-4 text-[#7CFF3B]" /></div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{tn.sentimentTitle}</span>
              </div>
              <div className="space-y-2">
                <ImpactBar label={tn.sentimentPositive} count={positive} total={total} color="#7CFF3B" />
                <ImpactBar label={tn.sentimentNeutral} count={neutral} total={total} color="#FFB020" />
                <ImpactBar label={tn.sentimentNegative} count={negative} total={total} color="#FF5A76" />
              </div>
            </div>

            {/* Source donut */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[rgba(34,211,238,0.08)]"><Newspaper className="w-4 h-4 text-[#22D3EE]" /></div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Nguồn tin</span>
              </div>
              {mounted && sourceMap.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart><Pie data={sourceMap} cx="50%" cy="50%" innerRadius={18} outerRadius={28} dataKey="value" strokeWidth={0} paddingAngle={3}>
                        {sourceMap.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie></PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-1">
                    {sourceMap.map(d => (
                      <div key={d.name} className="flex items-center gap-1.5 text-[10px]">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                        <span className="text-slate-400">{d.name}</span>
                        <span className="ml-auto font-mono text-slate-500">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ═══ AI INSIGHTS ═══ */}
          {aiInsights.length > 0 && (
            <div className="card p-5">
              <SectionHeader icon={Sparkles} title="AI Phân tích tin tức" color="cyan" className="mb-4" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {aiInsights.map((ins, i) => (
                  <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl border border-white/[0.03] bg-white/[0.01]">
                    <Sparkles className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
                    <span className="text-xs text-slate-400 leading-relaxed">{ins}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ NEWS CARDS ═══ */}
          <div className="space-y-3">
            <SectionHeader icon={Newspaper} title={`Tin tức ${ticker.toUpperCase()}`} color="lime" className="mb-2" />
            {news.map((item, i) => {
              const cfg = sentimentCfg[item.sentiment ?? "neutral"];
              const Icon = cfg.icon;
              const impact = item.impact_score ?? 0;
              const impactColor = impact >= 60 ? "#FF5A76" : impact >= 30 ? "#FFB020" : "#7CFF3B";
              return (
                <div key={i} className="card card-hover p-5">
                  <div className="flex items-start gap-3">
                    <div className={cn("mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border", cfg.bg)}>
                      <Icon className={cn("w-4 h-4", cfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <a href={item.url} target="_blank" rel="noopener noreferrer"
                        className="text-sm font-semibold text-slate-200 hover:text-accent transition-colors line-clamp-2 group">
                        {item.title}
                        <ExternalLink className="inline-block w-3 h-3 ml-1 opacity-0 group-hover:opacity-50" />
                      </a>
                      {item.summary && <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">{item.summary}</p>}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="text-[10px] text-slate-600 font-medium bg-white/[0.03] px-2 py-0.5 rounded-md">{item.source}</span>
                        <span className="text-[10px] text-slate-600 flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(item.published)}</span>
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-md border", cfg.bg, cfg.color)}>{cfg.label}</span>
                        {item.impact_score != null && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ background: `${impactColor}12`, color: impactColor }}>
                            {tn.impact} {impact}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {news.length === 0 && !loading && !error && (
        <div className="card p-16 flex flex-col items-center justify-center gap-3 text-center">
          <Newspaper className="w-12 h-12 text-slate-700" />
          <p className="text-slate-500 text-sm">{tn.noNews}</p>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MiniGauge({ value, color }: { value: number; color: string }) {
  const r = 20; const circ = 2 * Math.PI * r;
  const filled = (circ * Math.min(100, Math.max(0, value))) / 100;
  return (
    <svg viewBox="0 0 48 48" className="w-12 h-12 shrink-0">
      <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="4" />
      <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${filled} ${circ - filled}`} transform="rotate(-90 24 24)"
        className="transition-all duration-700" style={{ filter: `drop-shadow(0 0 4px ${color}40)` }} />
    </svg>
  );
}

function ImpactBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 w-12 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] font-mono text-slate-500 w-5 text-right">{count}</span>
    </div>
  );
}

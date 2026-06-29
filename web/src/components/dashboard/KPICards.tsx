"use client";

import { TrendingUp, TrendingDown, Shield, Target, Activity } from "lucide-react";
import type { AnalysisResponse } from "@/types/analysis";
import { riskBg, labelColor, computeInvestmentScore } from "@/lib/utils";
import { BarGauge } from "@/components/ui/GaugeChart";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

interface KPICardsProps {
  data: AnalysisResponse;
}

export function KPICards({ data }: KPICardsProps) {
  const { t, formatCurrency, formatPercent, translateLabel } = useTranslation();
  const { valuation, risk, technical, company } = data;
  const price = data.current_price;
  const discount = valuation?.discount_pct ?? null;
  const fairValue = valuation?.consensus_value ?? null;
  const riskLevel = risk?.overall_risk ?? "—";
  const label = valuation?.label ?? "";

  const investScore =
    discount != null && riskLevel !== "—"
      ? computeInvestmentScore(discount, riskLevel)
      : null;

  const isPositive = (discount ?? 0) > 0;

  return (
    <div className="animate-slide-up">
      <div className="flex items-baseline gap-3 mb-4">
        <span className="font-mono font-bold text-2xl text-white">{company.ticker}</span>
        <span className="text-slate-400 text-sm">{company.name}</span>
        <span className="text-xs text-slate-600 border border-border rounded-md px-2 py-0.5">
          {company.exchange} · {company.sector}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3">
        <KPICard
          icon={<Activity className="w-4 h-4 text-accent" />}
          label={t.kpi.investmentScore}
          value={investScore != null ? `${investScore}/100` : "—"}
          sub={
            investScore != null ? (
              <div className="mt-2">
                <BarGauge
                  value={investScore}
                  color={investScore >= 70 ? "green" : investScore >= 50 ? "blue" : "red"}
                />
              </div>
            ) : null
          }
          accent="blue"
        />

        <KPICard
          icon={<Target className="w-4 h-4 text-accent" />}
          label={t.kpi.fairValue}
          value={fairValue != null ? formatCurrency(fairValue) : "—"}
          sub={
            price != null ? (
              <span className="text-xs text-slate-500">
                {t.kpi.vsCurrentPrice}: {formatCurrency(price)}
              </span>
            ) : null
          }
          accent="blue"
          mono
        />

        <KPICard
          icon={
            isPositive
              ? <TrendingUp className="w-4 h-4 text-profit" />
              : <TrendingDown className="w-4 h-4 text-loss" />
          }
          label={t.kpi.upsideDownside}
          value={discount != null ? formatPercent(discount) : "—"}
          valueClass={cn("num", isPositive ? "text-profit" : "text-loss")}
          sub={
            label ? (
              <span className={cn("text-xs font-medium", labelColor(label))}>
                {translateLabel(label)}
              </span>
            ) : null
          }
          accent={isPositive ? "green" : "red"}
        />

        <KPICard
          icon={<Shield className="w-4 h-4 text-slate-400" />}
          label={t.kpi.riskLevel}
          value={
            riskLevel !== "—" ? (
              <span className={cn("px-2.5 py-1 rounded-lg text-sm font-semibold border", riskBg(riskLevel))}>
                {translateLabel(riskLevel)}
              </span>
            ) : (
              "—"
            )
          }
          sub={
            risk?.beta != null ? (
              <span className="text-xs text-slate-500">
                {t.kpi.beta} {risk.beta.toFixed(2)}
              </span>
            ) : null
          }
          accent="neutral"
        />
      </div>

      {technical && (
        <div className="mt-3 card flex items-center gap-4 sm:gap-6 px-3 sm:px-5 py-3 text-xs overflow-x-auto scrollbar-none">
          <span className="text-slate-600 uppercase tracking-wider text-[10px] font-medium shrink-0">
            {t.kpi.technical}
          </span>
          <TechChip
            label={t.technical.rsiTitle}
            value={technical.rsi_14?.toFixed(0) ?? "—"}
            sub={translateLabel(technical.rsi_label)}
          />
          <div className="w-px h-4 bg-border" />
          <TechChip label="MACD" value={translateLabel(technical.macd_label)} />
          <div className="w-px h-4 bg-border" />
          <TechChip label={t.kpi.trend} value={translateLabel(technical.price_trend)} />
          {technical.position_52w_pct != null && (
            <>
              <div className="w-px h-4 bg-border" />
              <TechChip
                label={t.kpi.week52}
                value={`${technical.position_52w_pct.toFixed(0)}%`}
                sub={t.kpi.position}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TechChip({
  label, value, sub,
}: {
  label: string; value: string | React.ReactNode; sub?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-slate-600 text-[10px] uppercase tracking-wider">{label}</span>
      <span className="text-slate-300 font-mono font-medium">{value}</span>
      {sub && <span className="text-slate-600">({sub})</span>}
    </div>
  );
}

function KPICard({
  icon, label, value, valueClass = "text-white", sub, accent = "blue", mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  valueClass?: string;
  sub?: React.ReactNode;
  accent?: "blue" | "green" | "red" | "neutral";
  mono?: boolean;
}) {
  const accentBorder: Record<string, string> = {
    blue: "hover:border-accent/30",
    green: "hover:border-profit/30",
    red: "hover:border-loss/30",
    neutral: "hover:border-slate-600/50",
  };

  return (
    <div className={cn("card card-hover p-4 sm:p-5 flex flex-col gap-2", accentBorder[accent])}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm sm:text-xs font-medium tracking-wider uppercase text-slate-500">{label}</span>
      </div>
      <div className={cn("text-2xl sm:text-xl font-bold", mono && "font-mono", valueClass)}>
        {value}
      </div>
      {sub && <div className="text-sm sm:text-xs">{sub}</div>}
    </div>
  );
}

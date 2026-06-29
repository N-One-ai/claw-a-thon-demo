"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AnalysisResponse, AnalysisTab } from "@/types/analysis";
import { ValuationSection } from "@/components/sections/ValuationSection";
import { FinancialHealthSection } from "@/components/sections/FinancialHealthSection";
import { RiskSection } from "@/components/sections/RiskSection";
import { TechnicalSection } from "@/components/sections/TechnicalSection";
import { ScenarioCards } from "@/components/sections/ScenarioCards";
import { AIReport } from "@/components/sections/AIReport";
import { useTranslation } from "@/hooks/useTranslation";
import { BarChart3, HeartPulse, ShieldAlert, Activity, GitBranch, FileText } from "lucide-react";

// ── Tab button (UNCHANGED from previous version) ──────────────────────────────

function TabButton({
  active, disabled, icon: Icon, label, onClick,
}: {
  active: boolean;
  disabled: boolean;
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center gap-2 h-14 rounded-2xl text-sm font-semibold whitespace-nowrap transition-all duration-200 min-h-0 border flex-1",
        active
          ? "text-accent border-accent/20 shadow-[0_0_16px_rgba(163,255,18,0.08)]"
          : disabled
            ? "text-[#4A5568] border-transparent cursor-not-allowed opacity-50"
            : "text-[#8A97A8] border-transparent hover:border-[rgba(163,255,18,0.15)] hover:bg-[rgba(163,255,18,0.03)] hover:text-[#D8E2F0]"
      )}
      style={
        active
          ? { background: "rgba(163,255,18,0.06)" }
          : disabled
            ? { background: "transparent" }
            : { background: "transparent" }
      }
    >
      <Icon className={cn("w-5 h-5 shrink-0", active ? "text-accent" : "")} strokeWidth={2} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface AnalysisTabsProps {
  data: AnalysisResponse;
}

export function AnalysisTabs({ data }: AnalysisTabsProps) {
  const [active, setActive] = useState<AnalysisTab>("valuation");
  const { t } = useTranslation();

  const TABS: {
    id: AnalysisTab;
    label: string;
    icon: React.ElementType;
    disabled?: (d: AnalysisResponse) => boolean;
  }[] = [
    { id: "valuation",  label: t.tabs.valuation,  icon: BarChart3 },
    { id: "health",     label: t.tabs.health,     icon: HeartPulse },
    { id: "risk",       label: t.tabs.risk,       icon: ShieldAlert },
    { id: "technical",  label: t.tabs.technical,  icon: Activity,   disabled: (d) => !d.technical },
    { id: "scenarios",  label: t.tabs.scenarios,  icon: GitBranch,  disabled: (d) => !d.valuation?.scenarios?.length },
    { id: "report",     label: t.tabs.aiReport,   icon: FileText },
  ];

  return (
    <div className="mt-6 animate-fade-in">
      {/* ── Navigation Container ── */}
      <div className="card p-2 mb-6 overflow-x-auto scrollbar-none">
        <div className="flex gap-1 min-w-[480px]">
          {TABS.map(({ id, label, icon, disabled }) => {
            const isDisabled = disabled?.(data) ?? false;
            return (
              <TabButton
                key={id}
                active={active === id}
                disabled={isDisabled}
                icon={icon}
                label={label}
                onClick={() => !isDisabled && setActive(id)}
              />
            );
          })}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div key={active}>
        {active === "valuation" && data.valuation && <ValuationSection valuation={data.valuation} />}
        {active === "valuation" && !data.valuation && <Empty label={t.empty.valuation} />}
        {active === "health" && <FinancialHealthSection data={data} />}
        {active === "risk" && (data.risk ? <RiskSection risk={data.risk} ticker={data.ticker} /> : <Empty label={t.empty.risk} />)}
        {active === "technical" && (data.technical ? <TechnicalSection technical={data.technical} ticker={data.ticker} /> : <Empty label={t.empty.technical} />)}
        {active === "scenarios" && data.valuation?.scenarios?.length ? (
          <ScenarioCards scenarios={data.valuation.scenarios} currentPrice={data.current_price ?? 0} probabilityWeightedValue={data.valuation.probability_weighted_value} />
        ) : active === "scenarios" ? <Empty label={t.empty.scenarios} /> : null}
        {active === "report" && <AIReport ticker={data.ticker} initialReport={data.report} data={data} />}
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-20 text-slate-600 text-sm">
      {label}
    </div>
  );
}

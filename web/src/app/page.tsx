"use client";

import { HeroBanner } from "@/components/dashboard/HeroBanner";
import { TickerSearch } from "@/components/dashboard/TickerSearch";
import { ExecutiveSummary } from "@/components/dashboard/ExecutiveSummary";
import { AnalysisTabs } from "@/components/dashboard/AnalysisTabs";
import { LoadingOverlay, ErrorState } from "@/components/ui/LoadingState";
import { useAnalysis } from "@/hooks/useAnalysis";

export default function DashboardPage() {
  const { state, analyze, reset, retry } = useAnalysis();

  const isIdle = state.status === "idle";

  return (
    <div>
      {isIdle && (
        <div className="-mt-4 sm:-mt-8 -mx-4 sm:-mx-6 lg:-mx-8">
          <HeroBanner onAnalyze={analyze} isLoading={false} />
        </div>
      )}

      {!isIdle && (
        <div className="mb-8">
          <TickerSearch
            onAnalyze={analyze}
            isLoading={state.status === "loading"}
          />
        </div>
      )}

      {state.status === "loading" && <LoadingOverlay />}

      {state.status === "error" && (
        <ErrorState message={state.message} ticker={state.ticker} onRetry={retry} onReset={reset} />
      )}

      {state.status === "success" && (
        <div className="space-y-4 animate-fade-in">
          <ExecutiveSummary data={state.data} />
          <AnalysisTabs data={state.data} />
        </div>
      )}
    </div>
  );
}

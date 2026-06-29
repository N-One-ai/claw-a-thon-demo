"use client";

import { useState, useCallback } from "react";
import type { AnalysisResponse } from "@/types/analysis";
import { analyzeTicker, APIError } from "@/lib/api";

export type AnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: AnalysisResponse }
  | { status: "error"; message: string };

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({ status: "idle" });

  const analyze = useCallback(async (ticker: string) => {
    if (!ticker.trim()) return;

    setState({ status: "loading" });
    try {
      const data = await analyzeTicker(ticker.trim().toUpperCase(), {
        report: false,
      });
      setState({ status: "success", data });
    } catch (err) {
      if (err instanceof APIError) {
        setState({
          status: "error",
          message: `[${err.status}] ${err.message}`,
        });
      } else if (err instanceof Error) {
        setState({ status: "error", message: err.message });
      } else {
        setState({
          status: "error",
          message: "Lỗi không xác định. Vui lòng thử lại.",
        });
      }
    }
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  return { state, analyze, reset };
}

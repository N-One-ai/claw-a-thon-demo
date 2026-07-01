"use client";

import { useState, useCallback, useRef } from "react";
import type { AnalysisResponse } from "@/types/analysis";
import { analyzeTicker, APIError } from "@/lib/api";

export type AnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: AnalysisResponse }
  | { status: "error"; message: string; ticker: string };

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({ status: "idle" });
  const lastTickerRef = useRef<string>("");

  const analyze = useCallback(async (ticker: string) => {
    if (!ticker.trim()) return;
    const tick = ticker.trim().toUpperCase();
    lastTickerRef.current = tick;

    setState({ status: "loading" });
    try {
      const data = await analyzeTicker(tick, { report: false });
      setState({ status: "success", data });
    } catch (err) {
      let msg = "Lỗi không xác định. Vui lòng thử lại.";
      if (err instanceof APIError) {
        msg = `[${err.status}] ${err.message}`;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setState({ status: "error", message: msg, ticker: tick });
    }
  }, []);

  const reset = useCallback(() => setState({ status: "idle" }), []);

  const retry = useCallback(() => {
    const tick = lastTickerRef.current;
    if (tick) analyze(tick);
    else setState({ status: "idle" });
  }, [analyze]);

  return { state, analyze, reset, retry };
}

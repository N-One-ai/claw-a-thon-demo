"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Download, FileJson, Loader2, Sparkles } from "lucide-react";
import { streamReport } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AnalysisResponse } from "@/types/analysis";
import { useTranslation } from "@/hooks/useTranslation";

interface AIReportProps {
  ticker: string;
  initialReport: string | null;
  data: AnalysisResponse;
}

export function AIReport({ ticker, initialReport, data }: AIReportProps) {
  const [report, setReport] = useState(initialReport ?? "");
  const [streaming, setStreaming] = useState(false);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const tr = t.report;

  const startStream = useCallback(async () => {
    if (streaming) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setReport("");
    setStreaming(true);
    try {
      for await (const event of streamReport(ticker, abortRef.current.signal)) {
        if (event.type === "chunk") {
          setReport((prev) => prev + event.text);
        } else if (event.type === "done" || event.type === "error") {
          break;
        }
      }
    } catch {
      // aborted or network error — keep whatever we have
    } finally {
      setStreaming(false);
    }
  }, [ticker, streaming]);

  useEffect(() => {
    if (streaming) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [report, streaming]);

  const copyReport = async () => {
    if (!report) return;
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportJSON = () => {
    const payload = {
      ticker,
      generated_at: data.generated_at,
      report,
      valuation: data.valuation,
      technical: data.technical,
      risk: data.risk,
      data_quality: data.data_quality,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ticker}_analysis.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportMD = () => {
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ticker}_report.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 animate-slide-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-slate-200">{tr.title}</span>
          {streaming && (
            <div className="flex items-center gap-1.5 text-xs text-accent">
              <Loader2 className="w-3 h-3 animate-spin" />
              {tr.generating}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!initialReport && !report && (
            <button
              onClick={startStream}
              disabled={streaming}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/20 hover:bg-accent/30 text-accent text-xs font-medium border border-accent/20 transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              {tr.generateBtn}
            </button>
          )}
          <button
            onClick={copyReport}
            disabled={!report}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
              report
                ? "bg-white/[0.04] hover:bg-white/[0.07] text-slate-400 border-border hover:text-slate-200"
                : "opacity-30 cursor-not-allowed text-slate-600 border-border"
            )}
          >
            <Copy className="w-3 h-3" />
            {copied ? tr.copied : tr.copy}
          </button>
          <button
            onClick={exportMD}
            disabled={!report}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
              report
                ? "bg-white/[0.04] hover:bg-white/[0.07] text-slate-400 border-border hover:text-slate-200"
                : "opacity-30 cursor-not-allowed text-slate-600 border-border"
            )}
          >
            <Download className="w-3 h-3" />
            MD
          </button>
          <button
            onClick={exportJSON}
            disabled={!report}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
              report
                ? "bg-white/[0.04] hover:bg-white/[0.07] text-slate-400 border-border hover:text-slate-200"
                : "opacity-30 cursor-not-allowed text-slate-600 border-border"
            )}
          >
            <FileJson className="w-3 h-3" />
            JSON
          </button>
        </div>
      </div>

      <div className="card p-6 min-h-64">
        {!report && !streaming ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-sm text-slate-300 font-medium">{tr.notLoaded}</p>
              <p className="text-xs text-slate-600 mt-1">{tr.notLoadedSub}</p>
            </div>
            <button
              onClick={startStream}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent/20 hover:bg-accent/30 text-accent text-sm font-medium border border-accent/20 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              {tr.generateStreaming}
            </button>
          </div>
        ) : (
          <div className="report-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
            {streaming && (
              <span className="inline-block w-2 h-4 bg-accent animate-pulse rounded-sm ml-1 align-middle" />
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>
    </div>
  );
}

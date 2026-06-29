import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatVND(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "decimal",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPct(
  value: number | null | undefined,
  decimals = 1
): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatNumber(
  value: number | null | undefined,
  decimals = 2
): string {
  if (value == null) return "—";
  return value.toFixed(decimals);
}

export function riskColor(risk: string): string {
  const map: Record<string, string> = {
    "Thấp": "text-profit",
    LOW: "text-profit",
    "Trung bình": "text-warn",
    MEDIUM: "text-warn",
    "Cao": "text-loss",
    HIGH: "text-loss",
    "Rất cao": "text-loss",
    VERY_HIGH: "text-loss",
  };
  return map[risk] ?? "text-slate-400";
}

export function riskBg(risk: string): string {
  const map: Record<string, string> = {
    "Thấp": "bg-profit/10 text-profit border-profit/20",
    LOW: "bg-profit/10 text-profit border-profit/20",
    "Trung bình": "bg-warn/10 text-warn border-warn/20",
    MEDIUM: "bg-warn/10 text-warn border-warn/20",
    "Cao": "bg-loss/10 text-loss border-loss/20",
    HIGH: "bg-loss/10 text-loss border-loss/20",
    "Rất cao": "bg-loss/10 text-loss border-loss/20",
    VERY_HIGH: "bg-loss/10 text-loss border-loss/20",
  };
  return map[risk] ?? "bg-slate-800 text-slate-400 border-slate-700";
}

export function labelColor(label: string): string {
  const map: Record<string, string> = {
    "Rất hấp dẫn": "text-profit",
    "Hấp dẫn": "text-profit",
    "Trung lập": "text-warn",
    "Đắt": "text-loss",
    "Rất đắt": "text-loss",
  };
  return map[label] ?? "text-slate-400";
}

export function scoreToStars(score: number): string {
  const filled = Math.round(score / 20);
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

export function computeInvestmentScore(
  discountPct: number,
  riskLevel: string
): number {
  let base = 50 + discountPct * 1.5;
  const riskPenalty: Record<string, number> = {
    "Thấp": 0,
    LOW: 0,
    "Trung bình": -5,
    MEDIUM: -5,
    "Cao": -15,
    HIGH: -15,
    "Rất cao": -25,
    VERY_HIGH: -25,
  };
  base += riskPenalty[riskLevel] ?? 0;
  return Math.max(0, Math.min(100, Math.round(base)));
}

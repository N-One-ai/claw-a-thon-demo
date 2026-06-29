"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { Language, SupportedLanguage, Translations } from "@/locales/types";
import { vi } from "@/locales/vi";
import { en } from "@/locales/en";

/* ── Constants ────────────────────────────────────────────────────────────── */

const STORAGE_KEY = "n-one-language";

const LOCALES: Record<SupportedLanguage, Translations> = { vi, en };

function detectLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return "vi";
  const stored = localStorage.getItem(STORAGE_KEY) as SupportedLanguage | null;
  if (stored === "vi" || stored === "en") return stored;
  const nav = (navigator.language ?? "").toLowerCase();
  return nav.startsWith("vi") ? "vi" : "en";
}

/* ── Context ──────────────────────────────────────────────────────────────── */

interface LanguageContextValue {
  lang: SupportedLanguage;
  setLang: (l: SupportedLanguage) => void;
  t: Translations;
  formatCurrency: (value: number | null | undefined) => string;
  formatPercent: (
    value: number | null | undefined,
    decimals?: number,
    showSign?: boolean
  ) => string;
  translateLabel: (label: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/* ── Label map (backend VI strings → translation key) ────────────────────── */

const LABEL_KEY_MAP: Record<string, keyof Translations["labels"]> = {
  // Recommendation
  "Rất hấp dẫn": "veryAttractive",
  "Hấp dẫn": "attractive",
  "Trung lập": "neutral",
  Đắt: "expensive",
  "Rất đắt": "veryExpensive",
  // Risk level
  Thấp: "low",
  "Trung bình": "medium",
  Cao: "high",
  "Rất cao": "veryHigh",
  // Scenario
  "Bi quan": "pessimistic",
  "Cơ sở": "base",
  "Lạc quan": "optimistic",
  // Price trend
  "Tăng mạnh": "strongUp",
  "Tích lũy": "accumulate",
  Giảm: "down",
  // MACD
  Mua: "buy",
  Bán: "sell",
  Chờ: "wait",
  // RSI
  "Quá mua": "overbought",
  "Quá bán": "oversold",
  // Stability
  // "Cao" already mapped to "high", handle stability separately below
};

// Stability uses same VI strings as risk level — we check call-site context,
// but for translateLabel we fall through to the stability keys via prefix trick.
// Components that need stability labels call translateStability() from the hook.

/* ── Provider ─────────────────────────────────────────────────────────────── */

export function LanguageProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [lang, setLangState] = useState<SupportedLanguage>("vi");

  useEffect(() => {
    const detected = detectLanguage();
    setLangState(detected);
    document.documentElement.lang = detected;
  }, []);

  const setLang = useCallback((l: SupportedLanguage) => {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l;
  }, []);

  const t = LOCALES[lang];

  const formatCurrency = useCallback(
    (value: number | null | undefined): string => {
      if (value == null) return "—";
      if (lang === "vi") {
        return (
          new Intl.NumberFormat("vi-VN", {
            style: "decimal",
            maximumFractionDigits: 0,
          }).format(value) + " ₫"
        );
      }
      return (
        "₫" +
        new Intl.NumberFormat("en-US", {
          style: "decimal",
          maximumFractionDigits: 0,
        }).format(value)
      );
    },
    [lang]
  );

  const formatPercent = useCallback(
    (
      value: number | null | undefined,
      decimals = 1,
      showSign = true
    ): string => {
      if (value == null) return "—";
      const sign = showSign && value > 0 ? "+" : "";
      if (lang === "vi") {
        return `${sign}${value.toFixed(decimals).replace(".", ",")}%`;
      }
      return `${sign}${value.toFixed(decimals)}%`;
    },
    [lang]
  );

  const translateLabel = useCallback(
    (label: string): string => {
      if (lang === "vi") return label;
      const key = LABEL_KEY_MAP[label];
      if (key) return t.labels[key];
      return label; // unknown label — pass through
    },
    [lang, t]
  );

  return (
    <LanguageContext.Provider
      value={{ lang, setLang, t, formatCurrency, formatPercent, translateLabel }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

/* ── Hook ─────────────────────────────────────────────────────────────────── */

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used inside <LanguageProvider>");
  }
  return ctx;
}

export type { Language, SupportedLanguage, Translations };

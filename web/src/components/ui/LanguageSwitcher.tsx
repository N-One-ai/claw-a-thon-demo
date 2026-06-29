"use client";

import { useEffect, useRef, useState } from "react";
import { Globe, Check } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { SupportedLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface LangOption {
  code: SupportedLanguage;
  label: string;
  flag: string;
  nativeName: string;
}

const OPTIONS: LangOption[] = [
  { code: "vi", label: "Vietnamese", flag: "🇻🇳", nativeName: "Tiếng Việt" },
  { code: "en", label: "English", flag: "🇺🇸", nativeName: "English" },
];

export function LanguageSwitcher() {
  const { lang, setLang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = OPTIONS.find((o) => o.code === lang) ?? OPTIONS[0];

  // Close on outside click
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  // Close on ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t.nav.language}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium",
          "border transition-all duration-200",
          open
            ? "border-accent/40 bg-accent/10 text-accent"
            : "border-border text-slate-400 hover:text-slate-200 hover:border-slate-600 hover:bg-white/[0.04]"
        )}
      >
        <Globe className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">{current.flag} {current.nativeName}</span>
        <span className="sm:hidden">{current.flag}</span>
        <span
          className={cn(
            "w-2 h-2 border-t border-r border-current transition-transform duration-200",
            open ? "rotate-[315deg] -translate-y-0.5" : "rotate-[135deg] translate-y-[-2px]"
          )}
          style={{ display: "inline-block", borderWidth: "1.5px" }}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t.nav.language}
          className={cn(
            "absolute right-0 top-full mt-2 w-44 z-50",
            "rounded-xl border border-white/[0.08] overflow-hidden",
            "shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
          )}
          style={{
            background:
              "linear-gradient(135deg, rgba(15,23,42,0.97) 0%, rgba(10,15,30,0.97) 100%)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          {OPTIONS.map((opt) => {
            const isActive = opt.code === lang;
            return (
              <button
                key={opt.code}
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  setLang(opt.code);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left",
                  "transition-colors duration-150",
                  isActive
                    ? "bg-accent/15 text-accent"
                    : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
                )}
              >
                <span className="text-base leading-none">{opt.flag}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-xs leading-none mb-0.5">
                    {opt.nativeName}
                  </p>
                  <p className="text-[10px] text-slate-600 leading-none">
                    {opt.label}
                  </p>
                </div>
                {isActive && <Check className="w-3.5 h-3.5 shrink-0 text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

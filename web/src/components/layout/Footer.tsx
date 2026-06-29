"use client";

import { useTranslation } from "@/hooks/useTranslation";

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-border py-4 sm:py-4 text-center text-sm sm:text-xs text-slate-600 px-4">
      {t.footer}
    </footer>
  );
}

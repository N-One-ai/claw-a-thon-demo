"use client";

import type { LucideIcon } from "lucide-react";

type IconColor = "amber" | "lime" | "blue" | "purple" | "red" | "green" | "cyan";

const ICON_COLORS: Record<IconColor, { bg: string; border: string; glow: string; text: string }> = {
  amber:  { bg: "rgba(255,176,32,0.08)",   border: "rgba(255,176,32,0.15)",   glow: "rgba(255,176,32,0.08)",   text: "#FFB020" },
  lime:   { bg: "rgba(163,255,18,0.08)",   border: "rgba(163,255,18,0.15)",   glow: "rgba(163,255,18,0.08)",   text: "#A3FF12" },
  blue:   { bg: "rgba(59,130,246,0.08)",   border: "rgba(59,130,246,0.15)",   glow: "rgba(59,130,246,0.08)",   text: "#60A5FA" },
  purple: { bg: "rgba(168,85,247,0.08)",   border: "rgba(168,85,247,0.15)",   glow: "rgba(168,85,247,0.08)",   text: "#A855F7" },
  red:    { bg: "rgba(255,90,118,0.08)",   border: "rgba(255,90,118,0.15)",   glow: "rgba(255,90,118,0.08)",   text: "#FF5A76" },
  green:  { bg: "rgba(124,255,59,0.08)",   border: "rgba(124,255,59,0.15)",   glow: "rgba(124,255,59,0.08)",   text: "#7CFF3B" },
  cyan:   { bg: "rgba(34,211,238,0.08)",   border: "rgba(34,211,238,0.15)",   glow: "rgba(34,211,238,0.08)",   text: "#22D3EE" },
};

interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  color?: IconColor;
  className?: string;
}

export function SectionHeader({ icon: Icon, title, color = "lime", className = "mb-5" }: SectionHeaderProps) {
  const c = ICON_COLORS[color];
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 transition-transform duration-200 hover:scale-105"
        style={{ background: c.bg, border: `1px solid ${c.border}`, boxShadow: `0 0 18px ${c.glow}` }}
      >
        <Icon className="w-[18px] h-[18px]" style={{ color: c.text }} strokeWidth={2} />
      </div>
      <h3 className="text-[13px] font-bold uppercase tracking-[0.06em] text-slate-300">{title}</h3>
    </div>
  );
}

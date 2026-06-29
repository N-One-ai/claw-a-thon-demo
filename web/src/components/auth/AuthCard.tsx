"use client";

import Link from "next/link";
import { TrendingUp } from "lucide-react";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: "var(--bg-base)" }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-2.5 mb-8 group">
          <div className="w-10 h-10 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-accent" />
          </div>
          <span className="font-bold text-lg tracking-tight">
            <span className="text-white">Stock</span>
            <span className="text-accent">Mind AI</span>
          </span>
        </Link>

        {/* Card */}
        <div className="card p-6 sm:p-8">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-white">{title}</h1>
            {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
          </div>
          {children}
        </div>

        {footer && <div className="text-center mt-4 text-sm text-slate-500">{footer}</div>}
      </div>
    </div>
  );
}

export function AuthInput({
  label, type = "text", placeholder, value, onChange, required = true,
}: {
  label: string; type?: string; placeholder?: string;
  value: string; onChange: (v: string) => void; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-white text-sm placeholder:text-slate-600 outline-none focus:border-accent/40 transition-colors min-h-0"
      />
    </div>
  );
}

export function AuthButton({ children, loading, onClick, type = "submit" }: {
  children: React.ReactNode; loading?: boolean; onClick?: () => void; type?: "submit" | "button";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading}
      className="w-full py-3 rounded-xl font-bold text-sm text-[#0A0D12] transition-all disabled:brightness-[0.6] disabled:cursor-not-allowed min-h-0"
      style={{ background: "linear-gradient(90deg,#A3FF12,#7CFF3B)", boxShadow: "0 0 20px rgba(163,255,18,0.15)" }}
    >
      {loading ? "..." : children}
    </button>
  );
}

export function OAuthButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-slate-300 font-medium hover:bg-white/[0.06] hover:border-white/[0.10] transition-all min-h-0"
    >
      <span className="text-lg">{icon}</span>
      {label}
    </button>
  );
}

export function Divider() {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px bg-white/[0.06]" />
      <span className="text-xs text-slate-600">hoặc</span>
      <div className="flex-1 h-px bg-white/[0.06]" />
    </div>
  );
}

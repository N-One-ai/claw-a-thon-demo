"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart2, TrendingUp, Newspaper, Activity, Menu, X, User, History, Eye, FileText, CreditCard, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/contexts/AuthContext";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";

export function Navbar() {
  const path = usePathname();
  const router = useRouter();
  const { t } = useTranslation();
  const { user, signOut, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setUserMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const NAV = [
    { href: "/", label: t.nav.dashboard, icon: Activity },
    { href: "/portfolio", label: t.nav.portfolio, icon: BarChart2 },
    { href: "/news", label: t.nav.news, icon: Newspaper },
  ];

  const name = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "";
  const avatar = user?.user_metadata?.avatar_url;
  const initial = name.charAt(0).toUpperCase() || "U";

  const handleLogout = async () => {
    setUserMenu(false);
    await signOut();
    router.push("/");
  };

  const USER_MENU = [
    { icon: User, label: "Hồ sơ", href: "/auth/profile" },
    { icon: History, label: "Lịch sử phân tích", href: "/auth/profile" },
    { icon: Eye, label: "Danh sách theo dõi", href: "/auth/profile" },
    { icon: FileText, label: "Báo cáo đã lưu", href: "/auth/profile" },
    { icon: CreditCard, label: "Gói đăng ký", href: "/auth/profile" },
    { icon: Settings, label: "Cài đặt", href: "/auth/profile" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg-base/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="w-7 h-7 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center group-hover:bg-accent/30 transition-colors">
              <TrendingUp className="w-4 h-4 text-accent" />
            </div>
            <span className="font-semibold text-sm tracking-tight">
              <span className="text-white">Stock</span>
              <span className="text-accent">Mind AI</span>
            </span>
            <span className="hidden md:block text-xs text-slate-600 font-normal border-l border-border pl-2.5 ml-0.5">
              {t.nav.logoTagline}
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-1 ml-auto">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  path === href ? "bg-accent/15 text-accent border border-accent/20" : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                )}>
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="hidden sm:flex items-center gap-2">
            <LanguageSwitcher />
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-600">
              <span className="w-1.5 h-1.5 rounded-full bg-profit animate-pulse-slow" />
              {t.nav.apiOnline}
            </div>

            {/* Auth: avatar or login button */}
            {!loading && (
              user ? (
                <div className="relative" ref={menuRef}>
                  <button onClick={() => setUserMenu(!userMenu)}
                    className="flex items-center gap-2 ml-2 p-0.5 rounded-full border border-transparent hover:border-accent/20 transition-colors min-h-0">
                    {avatar ? (
                      <img src={avatar} alt={name} className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center text-accent text-xs font-bold">
                        {initial}
                      </div>
                    )}
                  </button>

                  {userMenu && (
                    <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-white/[0.06] bg-bg-card shadow-lg py-1 z-50"
                      style={{ boxShadow: "0 8px 30px rgba(0,0,0,0.4)" }}>
                      <div className="px-4 py-3 border-b border-white/[0.04]">
                        <p className="text-sm font-medium text-white truncate">{name}</p>
                        <p className="text-xs text-slate-500 truncate">{user.email}</p>
                      </div>
                      {USER_MENU.map(({ icon: Icon, label, href }) => (
                        <Link key={label} href={href} onClick={() => setUserMenu(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-white/[0.03] transition-colors">
                          <Icon className="w-4 h-4" /> {label}
                        </Link>
                      ))}
                      <div className="border-t border-white/[0.04] mt-1">
                        <button onClick={handleLogout}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-loss hover:bg-loss/5 transition-colors min-h-0">
                          <LogOut className="w-4 h-4" /> Đăng xuất
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Link href="/auth/login"
                  className="ml-2 px-4 py-1.5 rounded-lg text-xs font-semibold text-[#0A0D12] min-h-0"
                  style={{ background: "linear-gradient(90deg,#A3FF12,#7CFF3B)" }}>
                  Đăng nhập
                </Link>
              )
            )}
          </div>

          {/* Mobile hamburger */}
          <button onClick={() => setOpen(!open)}
            className="sm:hidden ml-auto p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
            aria-label="Menu">
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="sm:hidden border-t border-border bg-bg-surface/95 backdrop-blur-xl">
          <nav className="px-4 py-3 space-y-1">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-colors",
                  path === href ? "bg-accent/15 text-accent" : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                )}>
                <Icon className="w-4 h-4" /> {label}
              </Link>
            ))}
            <div className="pt-3 border-t border-border mt-2 px-4">
              {user ? (
                <div className="flex items-center gap-3 py-2">
                  <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center text-accent text-xs font-bold">{initial}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{name}</p>
                    <p className="text-xs text-slate-600 truncate">{user.email}</p>
                  </div>
                  <button onClick={handleLogout} className="text-loss text-xs min-h-0">Thoát</button>
                </div>
              ) : (
                <Link href="/auth/login" onClick={() => setOpen(false)}
                  className="flex items-center justify-center py-2.5 rounded-xl text-sm font-bold text-[#0A0D12] min-h-0"
                  style={{ background: "linear-gradient(90deg,#A3FF12,#7CFF3B)" }}>
                  Đăng nhập
                </Link>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

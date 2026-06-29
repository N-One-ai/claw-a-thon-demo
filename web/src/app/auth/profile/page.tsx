"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { User, History, Eye, FileText, CreditCard, Settings, LogOut } from "lucide-react";
import { AuthCard } from "@/components/auth/AuthCard";

const MENU = [
  { icon: User, label: "Hồ sơ", href: "#" },
  { icon: History, label: "Lịch sử phân tích", href: "#" },
  { icon: Eye, label: "Danh sách theo dõi", href: "#" },
  { icon: FileText, label: "Báo cáo đã lưu", href: "#" },
  { icon: CreditCard, label: "Gói đăng ký", href: "#" },
  { icon: Settings, label: "Cài đặt", href: "#" },
];

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await signOut();
    router.push("/");
  };

  const name = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const avatar = user?.user_metadata?.avatar_url;

  return (
    <AuthCard title="Tài khoản" subtitle={user?.email ?? ""}>
      <div className="flex flex-col items-center mb-6">
        {avatar ? (
          <img src={avatar} alt={name} className="w-16 h-16 rounded-full border-2 border-accent/30 mb-3" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center text-accent text-xl font-bold mb-3">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <p className="text-white font-semibold">{name}</p>
      </div>

      <div className="space-y-1">
        {MENU.map(({ icon: Icon, label, href }) => (
          <a key={label} href={href}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/[0.03] transition-colors">
            <Icon className="w-4 h-4" />
            {label}
          </a>
        ))}
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-loss hover:bg-loss/5 transition-colors min-h-0">
          <LogOut className="w-4 h-4" />
          Đăng xuất
        </button>
      </div>
    </AuthCard>
  );
}

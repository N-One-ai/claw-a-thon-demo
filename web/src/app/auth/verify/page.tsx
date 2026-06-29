"use client";

import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";

export default function VerifyPage() {
  return (
    <AuthCard title="Xác minh email" subtitle="Tài khoản của bạn đã được xác minh">
      <div className="text-center py-8">
        <div className="w-16 h-16 rounded-2xl bg-profit/10 border border-profit/20 flex items-center justify-center mx-auto mb-4 text-3xl">
          ✓
        </div>
        <p className="text-sm text-slate-400 mb-4">Email đã được xác minh thành công.</p>
        <Link href="/auth/login" className="inline-flex px-6 py-2.5 rounded-xl text-sm font-bold text-[#0A0D12] min-h-0"
          style={{ background: "linear-gradient(90deg,#A3FF12,#7CFF3B)" }}>
          Đăng nhập ngay
        </Link>
      </div>
    </AuthCard>
  );
}

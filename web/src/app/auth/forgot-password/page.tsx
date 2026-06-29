"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { AuthCard, AuthInput, AuthButton } from "@/components/auth/AuthCard";

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await resetPassword(email);
    setLoading(false);
    if (error) setError(error);
    else setSent(true);
  };

  if (sent) {
    return (
      <AuthCard title="Email đã gửi" subtitle="Kiểm tra hộp thư để đặt lại mật khẩu">
        <div className="text-center py-6">
          <p className="text-sm text-slate-400 mb-4">
            Link đặt lại mật khẩu đã gửi đến <span className="text-white font-medium">{email}</span>
          </p>
          <Link href="/auth/login" className="text-sm text-accent hover:underline">Quay lại đăng nhập</Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Quên mật khẩu"
      subtitle="Nhập email để nhận link đặt lại mật khẩu"
      footer={<Link href="/auth/login" className="text-accent hover:underline">Quay lại đăng nhập</Link>}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthInput label="Email" type="email" placeholder="you@example.com" value={email} onChange={setEmail} />
        {error && <p className="text-xs text-loss bg-loss/10 border border-loss/20 rounded-lg px-3 py-2">{error}</p>}
        <AuthButton loading={loading}>Gửi email khôi phục</AuthButton>
      </form>
    </AuthCard>
  );
}

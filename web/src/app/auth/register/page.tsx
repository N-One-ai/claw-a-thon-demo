"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { AuthCard, AuthInput, AuthButton, OAuthButton, Divider } from "@/components/auth/AuthCard";

export default function RegisterPage() {
  const { signUpWithEmail, signInWithGoogle, signInWithFacebook } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await signUpWithEmail(email, password, name);
    setLoading(false);
    if (error) setError(error);
    else setSuccess(true);
  };

  if (success) {
    return (
      <AuthCard title="Kiểm tra hộp thư" subtitle="Email xác minh đã được gửi">
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-4 text-3xl">
            ✉️
          </div>
          <p className="text-sm text-slate-400 mb-2">
            Email xác minh đã được gửi đến{" "}
            <span className="text-white font-medium">{email}</span>
          </p>
          <p className="text-xs text-slate-500 mb-6">
            Nhấn vào link trong email để kích hoạt tài khoản. Không thấy email? Kiểm tra thư mục{" "}
            <span className="text-slate-300">Spam / Junk</span>.
          </p>
          <Link href="/auth/login" className="text-sm text-accent hover:underline">
            Quay lại đăng nhập
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Đăng ký tài khoản"
      subtitle="Tạo tài khoản để sử dụng đầy đủ tính năng"
      footer={
        <span>
          Đã có tài khoản?{" "}
          <Link href="/auth/login" className="text-accent hover:underline">Đăng nhập</Link>
        </span>
      }
    >
      <div className="space-y-3">
        <OAuthButton icon="G" label="Đăng ký với Google" onClick={signInWithGoogle} />
        <OAuthButton icon="f" label="Đăng ký với Facebook" onClick={signInWithFacebook} />
      </div>

      <Divider />

      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthInput label="Họ và tên" placeholder="Nguyễn Văn A" value={name} onChange={setName} />
        <AuthInput label="Email" type="email" placeholder="you@example.com" value={email} onChange={setEmail} />
        <AuthInput label="Mật khẩu" type="password" placeholder="Tối thiểu 6 ký tự" value={password} onChange={setPassword} />
        {error && (
          <p className="text-xs text-loss bg-loss/10 border border-loss/20 rounded-lg px-3 py-2">{error}</p>
        )}
        <AuthButton loading={loading}>Đăng ký</AuthButton>
      </form>
    </AuthCard>
  );
}

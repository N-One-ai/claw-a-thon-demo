"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { AuthCard, AuthInput, AuthButton, OAuthButton, Divider } from "@/components/auth/AuthCard";

export default function LoginPage() {
  const { signInWithEmail, signInWithGoogle, signInWithFacebook, resendVerification } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const showResend = error === "EMAIL_NOT_CONFIRMED_OR_WRONG_PASSWORD";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResendSuccess(false);
    setLoading(true);
    const { error } = await signInWithEmail(email, password);
    setLoading(false);
    if (error) setError(error);
    else router.push("/");
  };

  const handleResend = async () => {
    if (!email) { setError("Vui lòng nhập email trước khi gửi lại."); return; }
    setResendLoading(true);
    await resendVerification(email);
    setResendLoading(false);
    setResendSuccess(true);
  };

  return (
    <AuthCard
      title="Đăng nhập"
      subtitle="Đăng nhập để truy cập phân tích cổ phiếu AI"
      footer={
        <span>
          Chưa có tài khoản?{" "}
          <Link href="/auth/register" className="text-accent hover:underline">Đăng ký</Link>
        </span>
      }
    >
      <div className="space-y-3">
        <OAuthButton icon="G" label="Tiếp tục với Google" onClick={signInWithGoogle} />
        <OAuthButton icon="f" label="Tiếp tục với Facebook" onClick={signInWithFacebook} />
      </div>

      <Divider />

      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthInput label="Email" type="email" placeholder="you@example.com" value={email} onChange={setEmail} />
        <AuthInput label="Mật khẩu" type="password" placeholder="••••••••" value={password} onChange={setPassword} />

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
              className="w-4 h-4 rounded border-white/[0.1] bg-white/[0.03] accent-accent" />
            <span className="text-xs text-slate-500">Ghi nhớ đăng nhập</span>
          </label>
          <Link href="/auth/forgot-password" className="text-xs text-accent hover:underline">Quên mật khẩu?</Link>
        </div>

        {showResend && (
          <div className="text-xs bg-loss/10 border border-loss/20 rounded-lg px-3 py-2 space-y-2">
            <p className="text-loss">Email hoặc mật khẩu không đúng.</p>
            <p className="text-slate-400">
              Nếu bạn vừa đăng ký, hãy kiểm tra hộp thư (kể cả thư mục spam) để xác minh email trước khi đăng nhập.
            </p>
            {resendSuccess ? (
              <p className="text-accent font-medium">✓ Đã gửi lại email xác minh. Kiểm tra hộp thư (và spam).</p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resendLoading}
                className="text-accent hover:underline disabled:opacity-50"
              >
                {resendLoading ? "Đang gửi..." : "Gửi lại email xác minh →"}
              </button>
            )}
          </div>
        )}

        {error && !showResend && (
          <p className="text-xs text-loss bg-loss/10 border border-loss/20 rounded-lg px-3 py-2">{error}</p>
        )}

        <AuthButton loading={loading}>Đăng nhập</AuthButton>
      </form>
    </AuthCard>
  );
}

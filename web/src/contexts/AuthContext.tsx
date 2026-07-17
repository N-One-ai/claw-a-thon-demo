"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getSupabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<void>;
  signInWithFacebook: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  resendVerification: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const sb = getSupabase();
      sb.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }).catch(() => setLoading(false));

      const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      });

      return () => subscription.unsubscribe();
    } catch {
      setLoading(false);
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (!error) return { error: null };
    const msg = error.message.toLowerCase();
    if (msg.includes("invalid login credentials") || msg.includes("invalid credentials")) {
      return { error: "EMAIL_NOT_CONFIRMED_OR_WRONG_PASSWORD" };
    }
    if (msg.includes("email not confirmed")) {
      return { error: "EMAIL_NOT_CONFIRMED_OR_WRONG_PASSWORD" };
    }
    if (msg.includes("too many requests")) {
      return { error: "Quá nhiều lần thử. Vui lòng đợi vài phút rồi thử lại." };
    }
    return { error: error.message };
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string, name: string) => {
    // Try server-side admin registration (auto-confirms, no verification email needed)
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const json = await res.json();
      if (json.error === "SERVICE_KEY_MISSING") {
        // Fallback: use client-side signUp (requires email confirmation)
        const { error } = await getSupabase().auth.signUp({
          email, password, options: { data: { full_name: name } },
        });
        if (!error) return { error: null };
        const msg = error.message.toLowerCase();
        if (msg.includes("already registered") || msg.includes("user already exists")) {
          return { error: "Email này đã được đăng ký. Vui lòng đăng nhập." };
        }
        return { error: error.message };
      }
      if (json.error) return { error: json.error };
      return { error: null };
    } catch {
      return { error: "Không thể kết nối đến máy chủ. Vui lòng thử lại." };
    }
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    const { error } = await getSupabase().auth.resend({ type: "signup", email });
    return { error: error?.message ?? null };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await getSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }, []);

  const signInWithFacebook = useCallback(async () => {
    await getSupabase().auth.signInWithOAuth({
      provider: "facebook",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithFacebook, resetPassword, resendVerification, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

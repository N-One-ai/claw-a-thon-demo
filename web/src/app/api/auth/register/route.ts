import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

function verificationEmailHtml(name: string, confirmUrl: string): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0A0D12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0D12;padding:40px 20px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#111827;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.06)">
        <!-- Header -->
        <tr>
          <td style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.06)">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:rgba(163,255,18,0.15);border:1px solid rgba(163,255,18,0.3);border-radius:10px;width:36px;height:36px;text-align:center;vertical-align:middle">
                  <span style="font-size:18px">📈</span>
                </td>
                <td style="padding-left:10px;font-size:16px;font-weight:700">
                  <span style="color:#ffffff">Stock</span><span style="color:#A3FF12">Mind AI</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px 40px">
            <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff">Xác minh email của bạn</p>
            <p style="margin:0 0 24px;font-size:14px;color:#64748B;line-height:1.6">
              Xin chào${name ? " <strong style='color:#CBD5E1'>" + name + "</strong>" : ""}, cảm ơn bạn đã đăng ký StockMind AI.<br>
              Nhấn nút bên dưới để xác minh địa chỉ email và kích hoạt tài khoản.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 0 28px">
              <tr>
                <td style="border-radius:10px;background:linear-gradient(90deg,#A3FF12,#7CFF3B)">
                  <a href="${confirmUrl}"
                    style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:700;color:#0A0D12;text-decoration:none;letter-spacing:0.02em">
                    Xác minh email
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 6px;font-size:12px;color:#475569">Link có hiệu lực trong <strong style="color:#CBD5E1">24 giờ</strong>.</p>
            <p style="margin:0;font-size:12px;color:#475569">Nếu bạn không đăng ký tài khoản này, hãy bỏ qua email này.</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.06)">
            <p style="margin:0;font-size:11px;color:#334155">© 2026 StockMind AI · Nền tảng phân tích cổ phiếu bằng AI</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const resendKey  = process.env.RESEND_API_KEY ?? "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? "https://web-eight-alpha-diczp93pvi.vercel.app";
  const fromEmail  = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

  // If keys not configured, fall back to Supabase built-in (requires email confirm)
  if (!serviceKey || !resendKey || !supabaseUrl) {
    return NextResponse.json({ error: "SERVICE_KEY_MISSING" }, { status: 503 });
  }

  let body: { email?: string; password?: string; name?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { email, password, name } = body;
  if (!email || !password) {
    return NextResponse.json({ error: "Email và mật khẩu không được để trống." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Mật khẩu phải có ít nhất 6 ký tự." }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Create user — unconfirmed
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    user_metadata: { full_name: name ?? "" },
    email_confirm: false,
  });

  if (createErr) {
    const msg = createErr.message.toLowerCase();
    if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("duplicate")) {
      return NextResponse.json({ error: "Email này đã được đăng ký. Vui lòng đăng nhập." }, { status: 409 });
    }
    return NextResponse.json({ error: "Không thể tạo tài khoản: " + createErr.message }, { status: 400 });
  }

  // Generate Supabase confirmation link
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: { redirectTo: `${appUrl}/auth/callback` },
  });

  if (linkErr || !linkData?.properties?.action_link) {
    // Clean up orphan user
    if (created?.user?.id) await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: "Không thể tạo link xác minh. Vui lòng thử lại." }, { status: 500 });
  }

  // Send via Resend
  const resend = new Resend(resendKey);
  const { error: emailErr } = await resend.emails.send({
    from: `StockMind AI <${fromEmail}>`,
    to: email,
    subject: "Xác minh email — StockMind AI",
    html: verificationEmailHtml(name ?? "", linkData.properties.action_link),
  });

  if (emailErr) {
    if (created?.user?.id) await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: "Không thể gửi email xác minh. Vui lòng thử lại." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

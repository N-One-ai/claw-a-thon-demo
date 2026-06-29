import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "StockMind AI | Phân Tích Cổ Phiếu",
  description:
    "Phân tích định giá cổ phiếu Việt Nam bằng AI — Định giá, Rủi ro, Kỹ thuật, Báo cáo AI",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="dark">
      <body className="min-h-screen bg-bg-base text-slate-200 antialiased">
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div
          className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center top, rgba(163,255,18,0.025) 0%, transparent 70%)",
          }}
        />
        <AuthProvider>
          <LanguageProvider>
            <div className="relative z-10 flex flex-col min-h-screen">
              <Navbar />
              <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
                {children}
              </main>
              <Footer />
            </div>
          </LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

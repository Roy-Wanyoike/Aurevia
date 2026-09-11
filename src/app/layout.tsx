import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster as SonnerToaster } from "sonner";
import { ThemeProvider } from "@/components/aurevia/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aurevia — Market Intelligence Infrastructure",
  description:
    "Market intelligence, analysis, strategy backtesting, risk management, and controlled paper trading infrastructure.",
  keywords: ["Aurevia", "market intelligence", "trading", "backtesting", "risk engine", "quant"],
  authors: [{ name: "Aurevia Engineering" }],
  icons: { icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}
          {/* Sonner toaster — REQUIRED for toast() calls from views (FE-P0-001).
              The previous layout mounted the shadcn Toaster from @/components/ui/toaster,
              but every view imports { toast } from "sonner" — so toasts were silently dropped. */}
          <SonnerToaster
            position="bottom-right"
            richColors
            closeButton
            toastOptions={{
              style: {
                background: "oklch(0.205 0.014 250)",
                border: "1px solid oklch(1 0 0 / 10%)",
                color: "oklch(0.95 0.005 250)",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster as SonnerToaster } from "sonner";
import { ThemeProvider } from "@/components/aurevia/theme-provider";
import { AuthProvider } from "@/components/aurevia/auth-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // metadataBase is REQUIRED when metadata references relative URLs (icons,
  // openGraph images, etc.). Without it, Next.js tries to resolve them
  // against process.env.NEXT_PUBLIC_APP_URL — and if that's an empty
  // string (e.g. on Vercel without the env var set), `new URL('')` throws
  // `TypeError: Invalid URL` during SSG of /_not-found, breaking the build.
  // We fall back to localhost for dev and let production set the real URL.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ),
  title: "Aurevia — Market Intelligence Infrastructure",
  description:
    "Market intelligence, analysis, strategy backtesting, risk management, and controlled paper trading infrastructure.",
  keywords: ["Aurevia", "market intelligence", "trading", "backtesting", "risk engine", "quant"],
  authors: [{ name: "Aurevia Engineering" }],
  icons: { icon: "/branding/aurevia-icon.png" },
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
          <AuthProvider>
            {children}
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
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

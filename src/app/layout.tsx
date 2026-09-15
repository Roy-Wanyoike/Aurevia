import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster as SonnerToaster } from "sonner";
import { ThemeProvider } from "@/components/aurevia/theme-provider";
import { AuthProvider } from "@/components/aurevia/auth-provider";

// CRITICAL: The root layout must be dynamic, not statically generated.
// On Vercel, SSG of /_not-found tries to render the SessionProvider (which
// fetches /api/auth/session). If DATABASE_URL or NEXTAUTH_URL is not
// available at build time, this throws TypeError: Invalid URL, breaking
// the entire build. Making the layout dynamic forces server-side rendering
// at request time, where env vars are available. (#99)
export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Safe URL fallback — never pass an empty string to new URL(). (#98)
function safeMetadataBase(): URL {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (raw && raw.length > 0) {
    try {
      return new URL(raw);
    } catch {
      // Malformed URL — fall back to localhost
    }
  }
  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: safeMetadataBase(),
  title: "Aurevia — Market Intelligence Infrastructure",
  description:
    "Market intelligence, analysis, strategy backtesting, risk management, and controlled paper trading infrastructure.",
  keywords: ["Aurevia", "market intelligence", "trading", "backtesting", "risk engine", "quant"],
  authors: [{ name: "Aurevia Engineering" }],
  icons: { icon: "/branding/aurevia-icon.png" },
};

// Issue #140 / FE-008 — Next.js 16 requires a separate `export const viewport`
// to set the <meta name="viewport"> tag. Without it, Next falls back to
// defaults without `viewport-fit=cover`, so on iPhone X+ in PWA mode (or any
// full-screen mobile browser), content renders under the notch and home
// indicator. Adding `viewportFit: "cover"` enables `env(safe-area-inset-*)`
// CSS env vars so the Topbar and mobile Sheet can pad themselves.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0e1a" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={true}>
          <AuthProvider>
            {children}
            {/*
              Issue #139 / FE-007 — Sonner toaster no longer hardcodes dark-mode
              oklch colors. `theme="system"` makes Sonner inherit the resolved
              next-themes class on <html>, so toasts render correctly in both
              dark and light themes. `richColors` keeps the success/error/info
              color accents.
            */}
            <SonnerToaster
              position="bottom-right"
              theme="system"
              richColors
              closeButton
            />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

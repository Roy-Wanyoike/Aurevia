"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Aurevia forgot-password page.
//
// Posts to /api/v1/auth/forgot-password, which mints a single-use reset
// token (1h TTL) for the email IF a user exists. The API always returns the
// same 200 body to prevent email enumeration, so the UI shows a generic
// "if the email exists, a reset link has been sent" success state regardless.
//
// In dev, the token is logged to the server console — the operator copies it
// into the reset-password page's `?token=…` query param.
// ---------------------------------------------------------------------------

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Request failed");
        setLoading(false);
        return;
      }
      // Always show the same success state — the API is enumeration-safe and
      // we don't want the UI to leak whether the email exists either.
      setSent(true);
      toast.success("Reset link sent (if account exists)");
    } catch {
      toast.error("Request failed");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-6">
        <div className="mb-6 text-center">
          <img
            src="/branding/aurevia-logo.svg"
            alt="Aurevia"
            className="mx-auto h-12 w-12"
          />
          <h1 className="mt-2 text-xl font-semibold">Reset your password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your account email and we&apos;ll send a reset link.
          </p>
        </div>

        {sent ? (
          <Alert className="border-emerald-500/30 bg-emerald-500/5 text-emerald-500">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              If an account exists for <span className="font-medium">{email}</span>, a reset link has been sent. Check your inbox (and the dev server log in development) for the link.
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="trader@aurevia.io"
                  autoComplete="email"
                  className="pl-9"
                />
              </div>
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}

        <div className="mt-6 text-center">
          <a
            href="/auth/signin"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </a>
        </div>
      </Card>
    </div>
  );
}

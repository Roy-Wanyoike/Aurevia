"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Lock, ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";

// ---------------------------------------------------------------------------
// Aurevia reset-password page.
//
// Expects `?token=…` in the URL query (provided by the reset email link, or
// pasted by the operator in dev after reading the server log). The form
// collects a new password + confirmation; on submit it POSTs to
// /api/v1/auth/reset-password with { token, password }.
//
// On success, the user is redirected to /auth/signin so they can authenticate
// with their new credentials. The single-use token is consumed server-side.
// ---------------------------------------------------------------------------

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      toast.error("Missing reset token in URL");
    }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      toast.error("Missing reset token — check your reset link");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Reset failed");
        setLoading(false);
        return;
      }
      toast.success("Password updated — sign in to continue");
      setDone(true);
      // Brief delay so the user sees the success state before redirect.
      setTimeout(() => {
        router.push("/auth/signin");
      }, 1200);
    } catch {
      toast.error("Reset failed");
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
          <h1 className="mt-2 text-xl font-semibold">Set a new password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a new password for your Aurevia account.
          </p>
        </div>

        {!token ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No reset token</AlertTitle>
            <AlertDescription>
              The reset link is missing its token. Open the link from your email, or request a new reset link.
            </AlertDescription>
          </Alert>
        ) : done ? (
          <Alert className="border-emerald-500/30 bg-emerald-500/5 text-emerald-500">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Password updated. Redirecting to sign in…
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="pl-9"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Minimum 8 characters.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="confirm"
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="pl-9"
                />
              </div>
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Resetting…" : "Reset password"}
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

export default function ResetPasswordPage() {
  // useSearchParams() must be wrapped in <Suspense> at the page boundary in
  // Next.js 16 App Router — otherwise the route opts out of static rendering
  // and emits a build-time warning.
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

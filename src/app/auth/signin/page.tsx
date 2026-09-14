"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Aurevia Sign-In page.
//
// NextAuth's `auth-options.ts` declares `pages.signIn: "/auth/signin"` so any
// unauthenticated access to a session-gated route bounces here. Until this
// file existed, that bounce 404'd — leaving operators with no way to log in.
//
// The form posts to NextAuth's `credentials` provider via `signIn()` from
// `next-auth/react`. On success it hard-navigates to "/" so the new session
// cookie is visible to the server-rendered dashboard shell.
// ---------------------------------------------------------------------------

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) {
        toast.error("Invalid credentials");
      } else {
        toast.success("Signed in");
        window.location.href = "/";
      }
    } catch {
      toast.error("Sign-in failed");
    }
    setLoading(false);
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
          <h1 className="mt-2 text-xl font-semibold">Sign in to Aurevia</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Market Intelligence Infrastructure
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="trader@aurevia.io"
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <div className="mt-4 rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-500/80">
          Demo credentials: <code className="font-mono">demo@aurevia.io</code> /{" "}
          <code className="font-mono">aurevia123</code> — run{" "}
          <code className="font-mono">curl -X POST /api/v1/auth/seed-demo</code>{" "}
          first.
        </div>
        <div className="mt-4 text-center text-xs text-muted-foreground">
          No account?{" "}
          <a
            href="/auth/register"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Create one
          </a>
        </div>
      </Card>
    </div>
  );
}

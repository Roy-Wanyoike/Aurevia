"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Aurevia self-service registration page.
//
// Posts to /api/v1/auth/register, which provisions a User row + default
// Organization + owner Membership. On success, redirect to /auth/signin so
// the operator can immediately authenticate with the credentials they just
// created.
//
// Client-side validation mirrors the server schema (email + 8-char password).
// The server is the source of truth; this just avoids a round-trip on obvious
// mistakes like empty fields or short passwords.
// ---------------------------------------------------------------------------

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: name || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Registration failed");
        setLoading(false);
        return;
      }
      toast.success("Account created — sign in to continue");
      window.location.href = "/auth/signin";
    } catch {
      toast.error("Registration failed");
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
          <h1 className="mt-2 text-xl font-semibold">Create your Aurevia account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Market Intelligence Infrastructure
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name (optional)</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Trader Name"
              autoComplete="name"
            />
          </div>
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
              autoComplete="new-password"
            />
            <p className="text-[11px] text-muted-foreground">
              Minimum 8 characters.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <div className="mt-4 text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <a
            href="/auth/signin"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </a>
        </div>
      </Card>
    </div>
  );
}

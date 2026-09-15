import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Aurevia NextAuth configuration.
//
// Multi-tenant auth: Users belong to Organizations via Memberships, and
// optionally to Teams within those organizations. Fine-grained capabilities
// (not just roles) gate dangerous actions — `trading.live` is extremely
// privileged.
//
// In dev: CredentialsProvider with email/password (bcrypt-hashed).
// In prod: add Google/GitHub OAuth providers + enterprise SSO (SAML).
//
// CRITICAL: This file is evaluated during Vercel's "Collecting page data"
// phase at build time. If `secret` is resolved eagerly and NEXTAUTH_SECRET
// is not set during build (it's a runtime env var on Vercel), the build
// crashes. The fix is to use the `secret` from env at call time, not at
// module load time. NextAuth resolves `secret` lazily when set as a
// function — but since NextAuthOptions.secret is typed as string, we use
// a getter pattern via `getAuthOptions()` instead.
// ---------------------------------------------------------------------------

/**
 * Resolve the NextAuth signing secret.
 *
 * In dev: falls back to "dev-secret-change-in-production" so local dev
 * works without env config.
 *
 * In production (Issue #135 / SEC-013): THROWS if NEXTAUTH_SECRET is unset.
 * The prior behavior returned a placeholder string, silently signing JWTs
 * with a publicly-known secret — that allowed full session forgery and
 * account takeover. We now fail-closed at request time (NOT at module load,
 * so Vercel's build-time "Collecting page data" phase still succeeds).
 *
 * The throw is caught by NextAuth's request pipeline and surfaces as a 500
 * with a server-side log entry; the operator sees the misconfiguration
 * immediately on first request rather than discovering it after a breach.
 */
function getNextAuthSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    // Fail-closed — never sign JWTs with the dev placeholder in prod.
    // Logged server-side; the throw bubbles up to NextAuth's error handler.
    console.error(
      "[auth] CRITICAL: NEXTAUTH_SECRET not set in production. " +
        "Refusing to sign JWTs with the dev placeholder. Set NEXTAUTH_SECRET in your environment.",
    );
    throw new Error("NEXTAUTH_SECRET is required in production");
  }
  return "dev-secret-change-in-production";
}

/**
 * Build auth options lazily. This prevents the module-level evaluation
 * that crashes Vercel builds when NEXTAUTH_SECRET is a runtime-only env var.
 */
export function getAuthOptions(): NextAuthOptions {
  return {
    adapter: PrismaAdapter(db),
    session: {
      strategy: "jwt",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    pages: {
      signIn: "/auth/signin",
    },
    providers: [
      CredentialsProvider({
        name: "credentials",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          if (!credentials?.email || !credentials?.password) return null;
          const user = await db.user.findUnique({
            where: { email: credentials.email },
            include: {
              memberships: {
                include: { organization: true, team: true },
              },
            },
          });
          if (!user || !user.hashedPassword) return null;
          const valid = await bcrypt.compare(credentials.password, user.hashedPassword);
          if (!valid) return null;
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          } as any;
        },
      }),
      // In production, add:
      // GoogleProvider({ clientId: process.env.GOOGLE_ID, clientSecret: process.env.GOOGLE_SECRET }),
      // GitHubProvider({ clientId: process.env.GITHUB_ID, clientSecret: process.env.GITHUB_SECRET }),
    ],
    callbacks: {
      async jwt({ token, user }) {
        if (user) {
          token.id = user.id;
          token.role = (user as any).role ?? "trader";
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          (session.user as any).id = token.id;
          (session.user as any).role = token.role;
        }
        return session;
      },
    },
    secret: getNextAuthSecret(),
  };
}

// Backward-compatible export — evaluates lazily on first access.
// This allows existing `import { authOptions }` to keep working
// without crashing at module load time during Vercel build.
let _authOptions: NextAuthOptions | null = null;
export const authOptions: NextAuthOptions = new Proxy({} as NextAuthOptions, {
  get(_target, prop) {
    if (!_authOptions) _authOptions = getAuthOptions();
    return (_authOptions as any)[prop];
  },
});

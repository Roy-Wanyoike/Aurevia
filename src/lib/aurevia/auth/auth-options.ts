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
// ---------------------------------------------------------------------------

/**
 * Resolve the NextAuth signing secret.
 *
 * Throws in production when NEXTAUTH_SECRET is unset — the previous silent
 * fallback to "dev-secret-change-in-production" let anyone forge JWTs by
 * reading the public source code. In dev the fallback is retained so local
 * dev continues to work without env config.
 *
 * See GitHub issue #59.
 */
function getNextAuthSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXTAUTH_SECRET is not configured. Set it in your Vercel project " +
        "settings (Settings → Environment Variables) to a random string of " +
        "at least 32 characters (e.g. `openssl rand -base64 32`).",
    );
  }
  return "dev-secret-change-in-production";
}

export const authOptions: NextAuthOptions = {
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

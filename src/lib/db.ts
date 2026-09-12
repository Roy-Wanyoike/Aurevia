import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Issue #83 — previously `log: ['query']` was on unconditionally. In
// production that floods stdout with 5-20 query logs per request, risks
// PII leak (user emails in WHERE clauses), and bloats log-aggregation
// bills. Production now logs ONLY errors (no warn, no query). Dev keeps
// the full set so engineers can see the SQL during local iteration.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production'
      ? ['error']
      : ['query', 'error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
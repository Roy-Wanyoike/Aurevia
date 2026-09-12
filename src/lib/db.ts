import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Issue #83: previously `log: ['query']` was on unconditionally — in
// production this floods stdout with 5-20 query logs per request, risks
// PII leak (user emails in WHERE clauses), and bloats log-aggregation
// bills. Only enable query logging in non-production.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production'
      ? ['error', 'warn']
      : ['query', 'error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
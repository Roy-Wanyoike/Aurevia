# syntax=docker/dockerfile:1.7

# ─── Stage 1: deps ──────────────────────────────────────────────────────────
# Install all dependencies (including dev) with a frozen lockfile so the
# build is reproducible. Bun's lockfile is `bun.lock`; `--frozen-lockfile`
# fails the build if the lockfile is out of sync with `package.json`.
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ─── Stage 2: builder ───────────────────────────────────────────────────────
# Generates the Prisma client and builds the Next.js standalone output.
# The standalone output (`output: "standalone"` in next.config.ts) bundles
# only the production server modules — no dev dependencies in the artifact.
FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma client must be generated BEFORE the build (next.config.ts imports
# it transitively through src/lib/db.ts).
RUN bun run db:generate
RUN bun run build

# ─── Stage 3: runner ────────────────────────────────────────────────────────
# Minimal runtime image. Copies the standalone server, static assets, public
# folder, and the prisma engine binaries (which live under node_modules).
FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production
# NextAuth requires a secret — fail-fast if unset rather than silently
# using a dev fallback (see src/lib/aurevia/auth/auth-options.ts).
ENV NEXTAUTH_URL=http://localhost:3000
ENV TRADING_MODE=PAPER

# Run as a non-root user for defense-in-depth. The oven/bun image ships a
# `bun` user with uid 1000; we chown the app dir to it.
RUN addgroup --system --gid 1001 node && \
    adduser --system --uid 1001 --ingroup node bun
RUN chown -R bun:bun /app
USER bun

COPY --from=builder --chown=bun:bun /app/.next/standalone ./
COPY --from=builder --chown=bun:bun /app/.next/static ./.next/static
COPY --from=builder --chown=bun:bun /app/public ./public
# node_modules is needed for the Prisma client + engine binaries at runtime.
COPY --from=builder --chown=bun:bun /app/node_modules ./node_modules
COPY --from=builder --chown=bun:bun /app/package.json ./

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Healthcheck — hit the public /api/v1/health endpoint. The standalone server
# listens on PORT/HOSTNAME above. We give it 30s to start + 10s between
# probes; 3 consecutive failures mark the container unhealthy.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||'3000')+'/api/v1/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["bun", ".next/standalone/server.js"]

# syntax=docker/dockerfile:1
# Multi-stage production image for the Next.js console.
# Build context: the repository root (`docker build -f apps/web/Dockerfile .`).
#
# Build-time ARGs (NEXT_PUBLIC_* are inlined into the client bundle and are not
# secret): NEXT_PUBLIC_API_URL, NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED.
# Runtime env (never baked into a layer): INTERNAL_API_URL, AUTH_JWT_SECRET_FOR_PROXY.

# ── Stage 1: base ───────────────────────────────────────────────────────────
FROM node:24-slim AS base
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate

# ── Stage 2: deps ───────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /workspace
# Copy the workspace manifests so pnpm can resolve the full dependency graph.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile --ignore-scripts

# ── Stage 3: build ──────────────────────────────────────────────────────────
FROM deps AS build
WORKDIR /workspace

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED=false
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED=$NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
# Server-only secrets are provided inline so they never persist as an image
# layer; real values are injected exclusively at container run time.
RUN INTERNAL_API_URL=http://build-placeholder:4000 \
    AUTH_JWT_SECRET_FOR_PROXY=00000000000000000000000000000000 \
    pnpm --filter web run build

# ── Stage 4: runtime ────────────────────────────────────────────────────────
FROM node:24-slim AS runtime
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 --ingroup nodejs nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# The Next.js standalone output (with outputFileTracingRoot at the monorepo root)
# places the server entry under apps/web within the traced tree.
COPY --chown=nextjs:nodejs --from=build /workspace/apps/web/.next/standalone ./
COPY --chown=nextjs:nodejs --from=build /workspace/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000
USER nextjs
WORKDIR /app/apps/web
CMD ["node", "server.js"]

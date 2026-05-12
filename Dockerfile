# Production Dockerfile for Next.js with shadcn/ui using Bun

# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy manifest + lockfile first for layer caching
COPY package.json bun.lock ./

# Install all dependencies (devDeps included — needed for the build)
RUN bun install --frozen-lockfile

# Copy source
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN bun run build

# Ensure public folder exists even when the repo ships without one
RUN mkdir -p public

# Production image
FROM oven/bun:1-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Standalone server output (server.js + minimal node_modules)
COPY --from=builder --chown=bun:bun /app/.next-build/standalone ./
COPY --from=builder --chown=bun:bun /app/.next-build/static ./.next-build/static
COPY --from=builder --chown=bun:bun /app/public ./public

USER bun

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "server.js"]

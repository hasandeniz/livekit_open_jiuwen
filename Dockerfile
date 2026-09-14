# syntax=docker/dockerfile:1.7

# Layers are ordered from least to most frequently changing so CI (GitHub Actions cache)
# can skip them:
#   base          -> Node image / pnpm version
#   dependencies  -> package.json, lockfile, patches, vendor, scripts (~2 min when rebuilt)
#   builder       -> any source change (~1 min)
#   runner        -> public assets, server bundle, static chunks

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
COPY vendor ./vendor
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile

# Build on top of the dependencies stage instead of copying node_modules into a new layer.
FROM dependencies AS builder
COPY . .
# Speeds up repeated local builds; CI starts with an empty mount.
RUN --mount=type=cache,id=next-cache,target=/app/.next/cache \
    pnpm build

FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000
CMD ["node", "server.js"]

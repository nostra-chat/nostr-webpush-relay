# syntax=docker/dockerfile:1
# nostr-webpush-relay — AGPL-3.0-or-later

FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM node:20-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile && pnpm store prune
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
ENV DB_PATH=/data/relay.db
ENV PORT=8787
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:8787/healthz || exit 1
CMD ["node", "dist/src/index.js"]

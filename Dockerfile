# syntax=docker/dockerfile:1

# ---------- dependencies ----------
FROM node:20-bookworm-slim AS deps
WORKDIR /app

COPY web/package.json web/package-lock.json* ./web/
COPY server/package.json server/package-lock.json* ./server/

RUN npm --prefix web ci --no-audit --no-fund \
  && npm --prefix server ci --no-audit --no-fund

# ---------- build ----------
FROM deps AS build
WORKDIR /app

COPY web ./web
COPY server ./server

# Next.js static export -> web/out, TypeScript server -> server/dist
RUN npm --prefix web run build \
  && npm --prefix server run build \
  && npm --prefix server prune --omit=dev --no-audit --no-fund

# ---------- runtime ----------
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    TMP_DIR=/tmp \
    WEB_ROOT=/app/web/out

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     python3 \
     python3-pip \
     ffmpeg \
     ca-certificates \
     tini \
     curl \
  && rm -rf /var/lib/apt/lists/* \
  && pip3 install --no-cache-dir --break-system-packages --upgrade yt-dlp

WORKDIR /app

COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/out ./web/out

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/dist/index.js"]

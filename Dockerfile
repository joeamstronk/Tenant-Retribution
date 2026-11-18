FROM node:22-slim

WORKDIR /app

# Build tools required for better-sqlite3 native module if prebuild is unavailable
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  make \
  g++ \
  curl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

RUN mkdir -p /app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT:-3000}/api/health || exit 1

CMD ["node", "server.ts"]

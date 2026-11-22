# syntax=docker/dockerfile:1

# ---- 1. Build the frontend / フロントエンドをビルド ----
FROM node:22-trixie-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js eslint.config.js ./
COPY scripts ./scripts
COPY public ./public
COPY src ./src
RUN npm run build

# ---- 2. Server dependencies / サーバーの依存関係（sqlite3・sharp はビルド済みバイナリ） ----
FROM node:22-trixie-slim AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---- 3. Runtime / 実行 ----
FROM node:22-trixie-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data
WORKDIR /app
COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server ./server
COPY --from=web /app/dist ./dist
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
WORKDIR /app/server
CMD ["node", "index.js"]

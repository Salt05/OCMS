# ── Stage 1: Build router ──────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . ./
RUN npm run build

# ── Stage 2: Production image ────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

COPY package*.json ./
RUN npm install --omit=dev --no-audit

COPY --from=builder /app/dist ./dist

EXPOSE 3001

RUN chown -R node:node /app

USER node

CMD ["node", "dist/index.js"]


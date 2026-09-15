FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

COPY package.json ./
RUN npm install --omit=dev --no-audit

COPY dist/ ./dist/
COPY src/registry/routing-rules.json ./dist/registry/routing-rules.json
COPY src/registry/systems-registry.json ./dist/registry/systems-registry.json

EXPOSE 3001

RUN chown -R node:node /app

USER node

CMD ["node", "dist/index.js"]

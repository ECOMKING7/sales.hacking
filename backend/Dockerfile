# ---------- Stage 1: builder ----------
FROM node:20-alpine AS builder
WORKDIR /app

# Native build tooling for bcrypt.
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations

RUN npm run build
# Drop dev dependencies — keeps the compiled native bcrypt binary.
RUN npm prune --omit=dev

# ---------- Stage 2: production ----------
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/package.json ./package.json

EXPOSE 4000
CMD ["node", "dist/index.js"]

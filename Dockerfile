# Dockerfile for BxB Music Notebook (NAS / Linux Deployment)
FROM node:22-alpine AS base

# Install build dependencies for native sqlite3 bindings
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# Install dependencies based on the package lock
COPY package.json package-lock.json* ./
RUN npm ci

# Copy all source files
COPY . .

# Build Next.js (the database is NOT created or seeded at build time; it lives in /data)
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Production image
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV MUSIC_NOTEBOOK_DATA_DIR /data

RUN apk add --no-cache libc6-compat

# Copy built application and node_modules
COPY --from=base /app/.next ./.next
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/next.config.mjs ./next.config.mjs
COPY --from=base /app/scripts ./scripts
COPY --from=base /app/app/db ./app/db
COPY --from=base /app/app/lib ./app/lib
# Schema migrations: a fresh/empty database is initialized automatically; an existing
# database with pending migrations requires an explicit `npm run db:migrate` before start
# (see README "Docker & NAS Deployment — Upgrading an existing deployment").
COPY --from=base /app/drizzle ./drizzle

# Expose port
EXPOSE 3000
ENV PORT 3000
# Inside the container the server must listen on all container interfaces; whether it is
# reachable from your LAN is decided by the port mapping in docker-compose.yml
# (default: 127.0.0.1 only). There is no application login.
ENV HOSTNAME "0.0.0.0"

# Data volume for durable NAS storage
VOLUME ["/data"]

CMD ["npm", "run", "start:lan"]

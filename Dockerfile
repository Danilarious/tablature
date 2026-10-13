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

# Run database seed during build stage if needed or build Next.js
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
COPY --from=base /app/public ./public
COPY --from=base /app/.next ./.next
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/scripts ./scripts
COPY --from=base /app/app/db ./app/db
COPY --from=base /app/app/lib ./app/lib

# Expose port
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Data volume for durable NAS storage
VOLUME ["/data"]

CMD ["npm", "run", "start"]

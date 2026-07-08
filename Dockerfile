# --- Build Stage ---
FROM node:22-alpine AS builder
WORKDIR /app

# Copy configuration files
COPY package*.json tsconfig.json vite.config.ts index.html ./

# Install all dependencies (including devDependencies for bundling)
RUN npm ci

# Copy source code files
COPY src/ ./src/
COPY public/ ./public/
COPY server.ts ./server.ts

# Build React client bundle and bundle Node backend via esbuild
RUN npm run build

# --- Production Runtime Stage ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5150

# Install runtime utilities (like curl for optional healthchecks)
RUN apk add --no-cache curl

# Copy dependency configuration
COPY package*.json ./

# Install only production dependencies (installs native/platform-specific FFmpeg/FFprobe binaries for Alpine Linux)
RUN npm ci --only=production

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Create persisting data directory inside container
RUN mkdir -p /app/data

# Persist the dynamic local database files and system settings
VOLUME [ "/app/data" ]

# Expose server listener port
EXPOSE 5150

# Run the bundled production server
CMD ["npm", "run", "start"]

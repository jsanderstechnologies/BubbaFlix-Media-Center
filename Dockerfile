# --- Build Stage ---
FROM node:22-alpine AS builder
WORKDIR /app

# Copy dependency manifests & configs
COPY package*.json tsconfig.json vite.config.ts index.html ./

# Copy full source directory
COPY . .

# Install dependencies (ensures cross-platform esbuild binaries are resolved)
RUN npm install

# Build React client bundle and bundle Node backend via esbuild
RUN npm run build

# --- Production Runtime Stage ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5150

# Install runtime utilities and system ffmpeg
RUN apk add --no-cache curl ffmpeg

# Copy dependency configuration
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Create persisting data directory inside container
RUN mkdir -p /app/data

# Persist dynamic database files and system settings
VOLUME [ "/app/data" ]

# Expose server listener port
EXPOSE 5150

# Run the bundled production server directly
CMD ["node", "dist/server.cjs"]



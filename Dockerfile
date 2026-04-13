# Build stage
FROM oven/bun:1 AS base
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S appuser && \
    adduser -S -u 1001 -G appuser appuser

# Install minimal dependencies (ffmpeg for video processing)
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg ca-certificates && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --production

# Copy application files with proper ownership
COPY . .

# Set correct permissions
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Add health check for monitoring
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

# Expose application port
EXPOSE 4000

# Start the application
CMD ["bun", "run", "start"]
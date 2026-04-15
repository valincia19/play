FROM oven/bun:1 AS base
WORKDIR /app

# Install system FFmpeg (modern version with all codecs and protocol support)
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Point fluent-ffmpeg to system binaries instead of outdated npm package
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe

# Install packages
COPY package.json bun.lock ./
RUN bun install

# Copy application files
COPY . .

# Run default API
CMD ["bun", "run", "start"]

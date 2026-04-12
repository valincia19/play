FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies (ffmpeg is needed for video processing, so install it native)
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Install packages
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy application files
COPY . .

# Run default API
CMD ["bun", "run", "start"]

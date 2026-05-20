# Dockerfile — TykBot
# Base image: Node 20 trên Debian slim (canvas cần native libs)

FROM node:20-slim

# ── Cài native deps cho `canvas` ─────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      libcairo2-dev \
      libpango1.0-dev \
      libjpeg-dev \
      libgif-dev \
      librsvg2-dev \
      python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Cài dependencies trước (cache layer) ────────────────────────────────────
COPY package*.json ./
RUN npm ci --omit=dev

# ── Copy source code ──────────────────────────────────────────────────────────
COPY src/ ./src/

# ── Chạy bot ──────────────────────────────────────────────────────────────────
CMD ["node", "src/index.js"]

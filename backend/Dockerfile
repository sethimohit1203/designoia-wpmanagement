FROM node:20-slim

# Chromium runtime dependencies required by Puppeteer/whatsapp-web.js
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libasound2 \
    libxss1 \
    libgbm1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Skip Puppeteer's own Chromium download — use the apt-installed one above
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Build context is the repo root (Railway's dockerfilePath build), so paths are prefixed with backend/
COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/ .

EXPOSE 5000
CMD ["node", "src/server.js"]

FROM node:20-slim

# Baileys uses the WhatsApp multi-device WebSocket protocol directly.
# No Chromium/Puppeteer needed — the image stays tiny.
RUN apt-get update && apt-get install -y \
    git \
    ca-certificates \
    python3 \
    make \
    g++ \
    libvips-dev \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package*.json ./
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" && \
    npm install --omit=dev

COPY backend/ .

ENV TZ=Asia/Kolkata

EXPOSE 5000
CMD ["node", "src/server.js"]

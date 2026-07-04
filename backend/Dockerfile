FROM node:20-slim

# Baileys uses the WhatsApp multi-device WebSocket protocol directly.
# No Chromium/Puppeteer needed — the image stays tiny.
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/ .

EXPOSE 5000
CMD ["node", "src/server.js"]

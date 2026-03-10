FROM node:22-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends chromium && \
    rm -rf /var/lib/apt/lists/*

ENV CHROME_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app
COPY package.json yarn.lock ./
RUN npm install --production
COPY dist/ dist/

ENTRYPOINT ["node", "dist/index.js"]

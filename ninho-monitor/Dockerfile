FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY server.js ./
COPY public/ ./public/

USER node
EXPOSE 3000
CMD ["node", "server.js"]

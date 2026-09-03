# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Nilai VITE_* memang menjadi bagian bundle browser. Operator lock adalah kontrol
# kiosk lokal, bukan secret server.
ARG VITE_OPERATOR_PIN
ARG VITE_OPERATOR_TOKEN
ENV VITE_OPERATOR_PIN=${VITE_OPERATOR_PIN}
ENV VITE_OPERATOR_TOKEN=${VITE_OPERATOR_TOKEN}

RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install --yes --no-install-recommends cups-client ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/dist-server ./dist-server
COPY --chown=node:node deploy/docker/healthcheck.mjs ./deploy/docker/healthcheck.mjs

USER node

EXPOSE 3000

CMD ["node", "dist-server/server/local-server.js"]

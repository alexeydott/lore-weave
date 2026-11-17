FROM node:25-alpine AS build

WORKDIR /app
ARG VITE_API_BASE=http://localhost:3000
ENV VITE_API_BASE=$VITE_API_BASE
# 🔴 `npm ci` FROM A COMMITTED LOCKFILE (#254, adapted from upstream
# fix/v0.1.0-release-gaps 506ea5e59): copying `package.json` alone and running
# `npm install` resolved all floating ranges FRESH at build time — two builds of
# the same commit shipped different dependency graphs, and an upstream outage
# changed what a build produces. The lockfile is committed since 2026-11-18;
# `npm ci` is the only installer that refuses to drift from it.
COPY package.json package-lock.json ./
RUN npm config set strict-ssl false && \
    npm ci --no-audit --no-fund --loglevel=warn --maxsockets=3
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

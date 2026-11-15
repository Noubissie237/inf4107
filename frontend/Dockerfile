# Stage 1: build the static site (out/)
FROM node:24-alpine AS build
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Stage 2: serve out/ with an unprivileged Nginx (non-root, port 8080)
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
# Runs at every start: writes config.json from AUTH_API_URL and GRADES_API_URL
COPY --chmod=755 docker/40-write-config.sh /docker-entrypoint.d/40-write-config.sh
# The nginx user owns the files so the script can rewrite config.json
COPY --from=build --chown=nginx:nginx /app/out /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1

# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Optional build-time endpoint override; defaults to same-origin (/game-ws via the
# nginx proxy below) when unset. Never ships a development URL by default.
ARG VITE_BACKEND_URL=""
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}
RUN npm run build && npm run check:prod-urls

# Runtime stage
FROM nginx:1.27-alpine
COPY default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O - http://127.0.0.1/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
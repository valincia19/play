FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
# VITE_ environment variables must be available during build time
COPY . .
ARG VITE_API_BASE_URL
ARG VITE_APP_URL
ARG VITE_FRONTEND_URL
ARG VITE_SHARE_DOMAIN
ARG VITE_MAIN_DOMAIN

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_FRONTEND_URL=$VITE_FRONTEND_URL
ENV VITE_SHARE_DOMAIN=$VITE_SHARE_DOMAIN
ENV VITE_MAIN_DOMAIN=$VITE_MAIN_DOMAIN

RUN npm run build

# Web server stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

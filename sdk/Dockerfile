FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache git openssh-client
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
COPY package*.json ./
COPY --from=builder /app/dist ./dist
RUN npm ci --omit=dev

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/server/index.js"]

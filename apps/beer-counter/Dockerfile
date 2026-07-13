FROM node:26-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @deslop/beer-counter build

FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=5000
RUN mkdir -p /data
COPY --from=build /app/apps/beer-counter/dist ./dist
VOLUME ["/data"]
EXPOSE 5000
CMD ["node", "./dist/server.js"]

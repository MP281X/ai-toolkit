FROM oven/bun:alpine

WORKDIR /app

ENV NODE_ENV=production

COPY dist ./dist

CMD ["bun", "./dist/server.js"]

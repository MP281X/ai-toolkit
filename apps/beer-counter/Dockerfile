FROM node:26-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY dist ./dist

VOLUME ["/data"]

CMD ["node", "./dist/server.js"]

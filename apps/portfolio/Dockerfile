FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY dist ./dist

CMD ["node", "./dist/server.js"]

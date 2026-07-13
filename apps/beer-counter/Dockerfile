FROM node:26-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY dist ./dist

EXPOSE 5020
VOLUME ["/data"]

CMD ["./dist/server.js"]

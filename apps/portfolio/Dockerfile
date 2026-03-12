FROM oven/bun:slim

WORKDIR /app

ENV NODE_ENV=production

COPY dist ./dist

RUN chmod +x /app/dist/server

EXPOSE 3000

CMD ["./dist/server"]

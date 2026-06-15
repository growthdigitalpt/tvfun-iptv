# TV Fun — proxy IPTV + arquivos estáticos. Node puro, sem dependências npm.
FROM node:20-alpine
WORKDIR /app
COPY . .
ENV PORT=80
EXPOSE 80
CMD ["node", "server.js"]

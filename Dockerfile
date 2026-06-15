# TV Fun — proxy IPTV + arquivos estáticos. Node puro, sem dependências npm.
FROM node:20-alpine
WORKDIR /app
COPY . .
ENV PORT=3133
EXPOSE 3133
CMD ["node", "server.js"]

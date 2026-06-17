FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY . .

RUN NODE_OPTIONS=--max-old-space-size=3072 npm run build

EXPOSE 9000

CMD ["sh", "-c", "npx medusa db:migrate && npm run start"]

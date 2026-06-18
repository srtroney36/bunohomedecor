FROM node:20-alpine

WORKDIR /app

# Build stage: install full deps in /app and run medusa build
COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY . .

RUN NODE_OPTIONS=--max-old-space-size=3072 npm run build

# Runtime lives in the self-contained build output, which has its OWN package.json.
# Install its dependencies here so migration discovery + module resolution work.
WORKDIR /app/.medusa/server
RUN npm install --no-audit --no-fund

ENV NODE_ENV=production

EXPOSE 9000

# Run migrate + start from inside .medusa/server (cwd matters — this is what was missing)
CMD ["sh", "-c", "npx medusa db:migrate && npm run start"]

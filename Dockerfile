FROM node:24-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        ca-certificates \
        curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY scripts ./scripts
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production

EXPOSE 5000

# Heroku injects PORT and DATABASE_URL at runtime
CMD ["node", "index"]

FROM node:20-alpine

# Install build deps for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

# Create data directory (override with volume in production)
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "src/index.js"]

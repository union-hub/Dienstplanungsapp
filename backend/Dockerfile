FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/data
RUN node src/db/seed.js
EXPOSE 3001
CMD ["node", "server.js"]

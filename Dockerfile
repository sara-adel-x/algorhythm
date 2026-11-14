# AlgoRythm production image: the /api/nasa caching proxy plus the built app.
# The server uses Node built-ins only; the build stage compiles the frontend.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    NASA_CACHE_DIR=/tmp/nasa-cache
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY package.json ./
EXPOSE 3000
USER node
CMD ["node", "server/index.mjs"]

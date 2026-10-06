FROM node:22-alpine AS build

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install

COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist
# The API applies sql/init/001_initial.sql at startup (src/support/database-bootstrap.ts
# resolves it relative to dist/), so the runtime image must ship it.
COPY sql ./sql

EXPOSE 4000

CMD ["node", "dist/index.js"]
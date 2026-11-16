# Deployable API — accounts + property-scoped homes (EPIC 1).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/homeasset.sqlite
RUN addgroup -S homeasset && adduser -S homeasset -G homeasset \
  && mkdir -p /app/data && chown -R homeasset:homeasset /app/data
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER homeasset
EXPOSE 8787
VOLUME ["/app/data"]
CMD ["node", "dist/index.js"]

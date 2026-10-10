# One image for web, worker, indexer and migrations; Compose picks the command.
FROM node:24-slim AS base
# COREPACK_HOME outside /root so the non-root runtime user can use the pre-fetched pnpm.
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true COREPACK_HOME=/corepack
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @dn/web build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.mjs"]

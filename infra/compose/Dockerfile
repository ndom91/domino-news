# One image for web, worker, indexer and migrations; Compose picks the command.
FROM node:26-slim AS base
# COREPACK_HOME outside /root so the non-root runtime user can use the pre-fetched pnpm.
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true COREPACK_HOME=/corepack
# Node 25+ no longer bundles corepack; install it, then use the pnpm pinned in package.json.
# `pnpm -v` fetches pnpm 12's native binary now; the runtime user can't write the cache.
RUN npm install -g corepack@0.36.0 && corepack enable && corepack prepare pnpm@12.11.2 --activate \
  && pnpm -v && chown -R node:node "$COREPACK_HOME"
WORKDIR /app

FROM base AS build
COPY . .
# Host file modes are copied as-is; the runtime user must be able to read every source file.
RUN chmod -R a+rX /app
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @dn/web build

FROM base AS runtime
# Dependencies are frozen at build time; skip pnpm's pre-script install check.
ENV NODE_ENV=production pnpm_config_verify_deps_before_run=false
COPY --from=build /app /app
USER node
EXPOSE 4000
CMD ["node", "apps/web/server.mjs"]

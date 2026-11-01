# One image for web, worker, indexer and migrations; Compose picks the command.
FROM node:26-slim AS base
# COREPACK_HOME outside /root so the non-root runtime user can use the pre-fetched pnpm.
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true COREPACK_HOME=/corepack
# Node 25+ no longer bundles corepack; install it, then use the pnpm pinned in package.json.
# `pnpm -v` fetches pnpm 12's native binary now; the runtime user can't write the cache.
RUN npm install -g corepack@0.36.0 && corepack enable && corepack prepare pnpm@12.11.2 --activate \
  && pnpm -v && chown -R node:node "$COREPACK_HOME"
WORKDIR /app

# Host file modes are copied as-is. Fix source permissions before dependencies exist,
# so the recursive chmod never walks or copies the large node_modules tree.
FROM base AS source
COPY . .
RUN chmod -R a+rX /app

FROM base AS build
# Copy all workspace manifests before the source so code-only changes reuse the install layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mobile/package.json apps/mobile/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/design-tokens/package.json packages/design-tokens/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/inference/package.json packages/inference/package.json
COPY packages/jobs/package.json packages/jobs/package.json
COPY packages/queries/package.json packages/queries/package.json
COPY packages/schemas/package.json packages/schemas/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY playroom/package.json playroom/package.json
# Install the web and worker workspaces and their dependencies, not the mobile app.
RUN --mount=type=cache,id=domino-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --store-dir=/pnpm/store \
    --filter '@dn/web...' --filter '@dn/worker...'
COPY --from=source /app/ /app/
RUN pnpm --filter @dn/web build

FROM base AS runtime
# Dependencies are frozen at build time; skip pnpm's pre-script install check.
ENV NODE_ENV=production pnpm_config_verify_deps_before_run=false
COPY --from=build /app /app
USER node
EXPOSE 4000
CMD ["node", "apps/web/server.mjs"]

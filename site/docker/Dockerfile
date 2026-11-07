# syntax=docker/dockerfile:1
# The site's server image (ADR-0069, ADR-0086). Build context: the repository root.
#   docker compose -f site/compose.yml build
# A plain Node server, built natively on every architecture.

FROM node:26.12.1-alpine3.23@sha256:bc2b334006f15c7167bbeb2f08f28c2df883f7594a0470e04454ebe7560cfe68 AS build
# Alpine 3.21 and later no longer bring openssl with Node; Prisma's engine
# needs it, here to generate the client and in the final stage to run.
RUN apk add --no-cache openssl python3 build-base
WORKDIR /repo
COPY core/package.json core/package-lock.json core/
RUN cd core && npm ci --no-audit --no-fund
COPY core core
RUN cd core && npm run build
# The schema comes before the install: its postinstall generates the Prisma client.
COPY site/package.json site/package-lock.json site/.npmrc site/schema.prisma site/
RUN cd site && npm ci --no-audit --no-fund
COPY site site
# @agenthix/core is bundled into dist/server.js, so pruning drops it with the
# other development dependencies. The client is generated again in case the
# prune took it.
RUN cd site && npm run build \
 && npm prune --omit=dev --no-audit --no-fund \
 && node node_modules/prisma/build/index.js generate

FROM node:26.12.1-alpine3.23@sha256:bc2b334006f15c7167bbeb2f08f28c2df883f7594a0470e04454ebe7560cfe68 AS server
# git: the site server runs it itself, for a workspace's git status and for connecting and backing up repositories.
RUN apk --no-cache -U upgrade && apk add --no-cache openssl python3 docker-cli su-exec ripgrep git
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/site/node_modules ./node_modules
COPY --from=build /repo/site/dist ./dist
COPY --from=build /repo/site/package.json /repo/site/schema.prisma ./
COPY --from=build /repo/site/migrations ./migrations
COPY site/scripts/agenthix-site.mjs /usr/local/lib/agenthix-site.mjs
COPY site/docker/entrypoint.sh /usr/local/bin/agenthix-site-entrypoint
RUN adduser -D -s /bin/sh -u 1001 appuser \
 && chmod +x /usr/local/bin/agenthix-site-entrypoint \
 && printf '#!/bin/sh\nexec node /usr/local/lib/agenthix-site.mjs "$@"\n' > /usr/local/bin/agenthix-site \
 && chmod +x /usr/local/bin/agenthix-site \
 && mkdir -p /run/agenthix-site && chown appuser:appuser /run/agenthix-site \
 && chown -R appuser:appuser /app
# The control socket lives only inside the container, never in the mounted
# data folder, so only `docker compose exec` reaches it (spec §6.10).
ENV SITE_CONTROL_SOCKET=/run/agenthix-site/control.sock
EXPOSE 4201
# Starts as root only to give appuser the Docker socket, then drops to it.
ENTRYPOINT ["/usr/local/bin/agenthix-site-entrypoint"]
# Applies the committed migrations, then replaces the shell with node, so the
# server itself receives `docker stop`'s SIGTERM and shuts down (shutdown.ts).
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && exec node --enable-source-maps dist/server.js"]

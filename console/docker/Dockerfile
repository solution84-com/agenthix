# syntax=docker/dockerfile:1
# The Fleet Console's image, agenthix-console (host-management spec §7). Build context: the repository root.
#   docker build -f console/docker/Dockerfile -t agenthix-console .
# The host service runs it — on hq's machine at install, or elsewhere with `console install` — on a Docker network
# of its own, with its port published to the machine's 127.0.0.1 only and CONSOLE_LISTEN_HOST=container, so it
# listens on its address on that network and accepts a connection only from that network's gateway:
#   docker network create agenthix-console
#   docker run -d --network agenthix-console -p 127.0.0.1:4301:4301 -e CONSOLE_LISTEN_HOST=container \
#     --sysctl net.ipv4.conf.all.rp_filter=1 -e CONSOLE_HQ_ADDRESS=… agenthix-console
# Never publish it on another address, and never put another container on its network.

FROM node:24.14.1-alpine3.23 AS build
# The publishing workflow passes the release's version; a build made on a machine is `dev`.
ARG VERSION=dev
RUN printf '%s' "$VERSION" | grep -Eq '^(dev|[0-9]+\.[0-9]+\.[0-9]+(-(alpha|beta|rc)\.[0-9]+)?)$' \
 || { echo "VERSION must be dev or a published version such as 0.2.0 or 1.0.0-alpha.1 (got $VERSION)." >&2; exit 1; }
WORKDIR /repo
COPY core/package.json core/package-lock.json core/
RUN cd core && npm ci --no-audit --no-fund
COPY core core
RUN cd core && npm run build
# The screens: console-web, built against ui/ (its components and tokens) into console-web/dist.
COPY ui/package.json ui/package-lock.json ui/
RUN cd ui && npm ci --no-audit --no-fund
COPY console-web/package.json console-web/package-lock.json console-web/
RUN cd console-web && npm ci --no-audit --no-fund
COPY ui ui
COPY console-web console-web
# Help is built from the user guide's pages.
COPY docs/guide/running-agenthix docs/guide/running-agenthix
RUN cd console-web && npm run build
COPY console/package.json console/package-lock.json console/
RUN cd console && npm ci --no-audit --no-fund
COPY console console
# @agenthix/core is bundled into dist/console.js, so pruning drops it with the other development dependencies.
RUN cd console && CONSOLE_VERSION="$VERSION" npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24.14.1-alpine3.23 AS console
RUN apk --no-cache -U upgrade && apk add --no-cache tini
ARG VERSION=dev
LABEL org.opencontainers.image.version=$VERSION
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/console/node_modules ./node_modules
COPY --from=build /repo/console/dist ./dist
# Served by the server from /app/web (console/src/http/web.ts), beside dist/.
COPY --from=build /repo/console-web/dist ./web
COPY --from=build /repo/console/package.json ./
# The state folder: its keys, its credential to hq, the machines it pinned and the sessions. Owned by the user it
# runs as, so a new volume mounted here is too. No VOLUME: the host service names the one it mounts.
RUN mkdir -p /state && chown node:node /state && chmod 700 /state
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--enable-source-maps", "/app/dist/console.js"]

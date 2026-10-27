# syntax=docker/dockerfile:1
# The relay's image (adr-0153): the fleet's public door for files. Build context: the repository root.
#   docker build -f relay/docker/Dockerfile -t agenthix-relay .
# The host service runs it — on hq's machine in hq's compose set, reached through hq-web — with RELAY_HQ_ADDRESS,
# HQ_RELAY_SECRET, HQ_URL and FILES_ORIGIN set (relay/AGENTS.md); hq's relay also gets hq's storage folder mounted
# read-only and named by HQ_UPLOADS_ROOT. It holds no state of its own: no volume it writes, no database.

FROM node:24.14.1-alpine3.23@sha256:8510330d3eb72c804231a834b1a8ebb55cb3796c3e4431297a24d246b8add4d5 AS build
WORKDIR /repo
COPY core/package.json core/package-lock.json core/
RUN cd core && npm ci --no-audit --no-fund
COPY core core
RUN cd core && npm run build
COPY relay/package.json relay/package-lock.json relay/
RUN cd relay && npm ci --no-audit --no-fund
COPY relay relay
# The PDF viewer page's style takes ui's design tokens; nothing else of ui is used.
COPY ui/src/theme/tokens.css ui/src/theme/tokens.css
# @agenthix/core is bundled into dist/relay.js, and pdf.js into dist/viewer/pdf (the PDF viewer page, with its worker
# and data), so pruning drops both with the other development dependencies.
RUN cd relay && npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24.14.1-alpine3.23@sha256:8510330d3eb72c804231a834b1a8ebb55cb3796c3e4431297a24d246b8add4d5 AS relay
RUN apk --no-cache -U upgrade && apk add --no-cache tini
ENV NODE_ENV=production
# In its container it listens on its own network; Docker decides what reaches it.
ENV RELAY_LISTEN_HOST=0.0.0.0
WORKDIR /app
COPY --from=build /repo/relay/node_modules ./node_modules
COPY --from=build /repo/relay/dist ./dist
COPY --from=build /repo/relay/package.json ./
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--enable-source-maps", "/app/dist/relay.js"]

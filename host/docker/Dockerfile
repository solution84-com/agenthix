# syntax=docker/dockerfile:1
# The host service's image (host-management spec §6, adr-0107, adr-0069). Build context: the repository root.
#   docker build -f host/docker/Dockerfile -t agenthix-host .
# It runs as the container `agenthix-host` (`<namespace>-host`), with the machine's Docker socket and the state folder mounted:
#   docker run -d --name agenthix-host --restart unless-stopped \
#     -v /var/run/docker.sock:/var/run/docker.sock -v ~/.agenthix:/state \
#     -v agenthix-host-figures:/run/host-figures -e TZ=Europe/London \
#     --network host --cap-add NET_ADMIN \
#     --label com.docker.compose.project=agenthix-host agenthix-host
# The CLI is this image's command: docker exec -it agenthix-host agenthix <command>.
# Its second entry point is the launcher, node /app/dist/launcher.js, which the host service runs from this image
# to switch itself to a new version (adr-0118).

# Sigstore's cosign, which checks every image's signature before the host service fetches it (adr-0117), from
# Sigstore's own image, fixed by digest. The same version signs them (.github/workflows/publish-images.yml).
FROM ghcr.io/sigstore/cosign/cosign:v3.1.3@sha256:9e5c2f2edc34351160407ca3416c61855bdf9403c3c5936e0f0be7fc261611b8 AS cosign

FROM node:24.14.1-alpine3.23 AS build
WORKDIR /repo
COPY core/package.json core/package-lock.json core/
RUN cd core && npm ci --no-audit --no-fund
COPY core core
RUN cd core && npm run build
COPY host/package.json host/package-lock.json host/
RUN cd host && npm ci --no-audit --no-fund
COPY host host
# Everything is bundled, @agenthix/core included, so the final stage carries no node_modules.
RUN cd host && npm run build

FROM node:24.14.1-alpine3.23 AS host
# The docker CLI and its compose plugin: the host service drives Docker with them, and nothing else. nft applies the
# agent protections' firewall rules (src/protections/).
RUN apk --no-cache -U upgrade && apk add --no-cache docker-cli docker-cli-compose tini nftables
COPY --from=cosign /ko-app/cosign /usr/local/bin/cosign
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/host/dist/host.js /repo/host/dist/host.js.map /repo/host/dist/cli.js /repo/host/dist/cli.js.map \
     /repo/host/dist/launcher.js /repo/host/dist/launcher.js.map ./dist/
# The CLI's command, named from the branding module when it was built.
COPY --from=build /repo/host/dist/bin/ /usr/local/bin/
# The owner socket lives only inside the container, never in the state folder, so only `docker exec` reaches it.
RUN mkdir -p /run/host && chmod 700 /run/host
# No VOLUME: without the state folder mounted, install refuses and says so, rather than writing into a volume
# nobody named. An init process as PID 1 reaps the docker commands the service runs and passes on SIGTERM.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--enable-source-maps", "/app/dist/host.js"]

# syntax=docker/dockerfile:1
# hq's images (ADR-0067, ADR-0069). Build context: the repository root.
#   docker compose -f hq/compose.yml build
# The publishing workflow passes VERSION and COMMIT; a build made on a machine is `dev`.
# The Wasp CLI is the one hq pins in its package.json, installed with hq's
# other dependencies. Wasp 0.25 publishes its Linux CLI for ARM only for
# glibc, not for Alpine's musl, so the Wasp stage runs on Debian, on the
# platform of the machine that builds ($BUILDPLATFORM), where a CLI exists for
# both amd64 and arm64: nothing in it is emulated, whichever image is built.
# Its output is plain JavaScript, and every later stage is built for the
# image's own platform. Node 24.14.1 on Alpine 3.23, for those, is the base
# Wasp's own generated Dockerfile uses.

# The robots bundle (ADR-0187), a release asset of this repository rather than committed: downloaded from the pin in
# hq/src/pictures/robotsBundle.ts and checked against its SHA-256 and its manifest; a mismatch fails the build. Its
# own stage on the building machine's platform, as its output is the same pictures for every image. While the
# repository is private the download needs a GitHub token, passed as the build secret `github_token`
# (`--secret id=github_token,env=GH_TOKEN`); it is read only by this step and kept in no layer.
FROM --platform=$BUILDPLATFORM node:26.13.0-alpine3.23@sha256:44a3247313f9bc069a4ec25d01b66254ed7dc4d0408727d8720dc827f0753423 AS robots
WORKDIR /build
COPY hq/package.json hq/
COPY hq/src/pictures/robotsBundle.ts hq/src/pictures/
COPY scripts/robots scripts/robots
RUN --mount=type=secret,id=github_token,env=GH_TOKEN node scripts/robots/fetch.mjs --out /robots

FROM --platform=$BUILDPLATFORM node:26.13.0-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68 AS wasp
# No install or usage telemetry from the Wasp CLI, here or in web-build.
ENV WASP_TELEMETRY_DISABLE=1
WORKDIR /repo
COPY core/package.json core/package-lock.json* core/
RUN cd core && npm install --no-audit --no-fund
COPY core core
RUN cd core && npm run build
COPY ui/package.json ui/package-lock.json* ui/
RUN cd ui && npm install --legacy-peer-deps --no-audit --no-fund
COPY ui ui
COPY hq hq
# `wasp install` sets up Wasp's own packages (.wasp/spec, which main.wasp.ts
# imports) and installs again with them; `wasp build` refuses to run without it.
RUN cd hq && npm install --no-audit --no-fund && npx wasp install
# hq imports ui/src components (sessions, tasks, voice, primitives) whose
# peer deps — react, react-dom, lucide-react and their types — are declared
# on @agenthix/ui but deliberately not installed there (--legacy-peer-deps
# above); site never imports far enough into ui/src to need them, so its
# build never surfaced this. A *second* install of the same packages into
# ui/node_modules is not a fix: TypeScript treats two separate copies of
# @types/react as unrelated types (its ref-callback branding uses a unique
# symbol per install), which breaks every component that forwards a ref.
# Point ui at hq's own copies instead, so the whole program type-checks
# against one physical install. socket.io-client — ui's other peer dep — is
# deliberately left unlinked: it is also ui's own devDependency, genuinely
# installed by the `npm install` above (not skipped by --legacy-peer-deps,
# which only affects peers), hq never imports it directly, and it carries
# none of @types/react's nominal-typing trap — so ui's own copy is correct
# as-is, not a second install of the same problem.
#
# rm -rf before each link: if ui ever gains its own real install of one of
# these (or the link already exists from a previous layer), `ln -s` alone
# would either link *inside* that directory or silently do nothing useful —
# the intent here is always hq's copy, unconditionally. `-fn` on top makes
# `ln` itself replace a stale symlink instead of erroring on it. The `test`
# line after fails the build loudly if a link ever resolves to nothing,
# instead of leaving TypeScript to fail confusingly steps later.
RUN mkdir -p ui/node_modules/@types \
 && rm -rf ui/node_modules/react ui/node_modules/react-dom ui/node_modules/lucide-react ui/node_modules/@types/react ui/node_modules/@types/react-dom \
 && ln -sfn ../../hq/node_modules/react ui/node_modules/react \
 && ln -sfn ../../hq/node_modules/react-dom ui/node_modules/react-dom \
 && ln -sfn ../../hq/node_modules/lucide-react ui/node_modules/lucide-react \
 && ln -sfn ../../../hq/node_modules/@types/react ui/node_modules/@types/react \
 && ln -sfn ../../../hq/node_modules/@types/react-dom ui/node_modules/@types/react-dom \
 && test -e ui/node_modules/react/package.json \
 && test -e ui/node_modules/react-dom/package.json \
 && test -e ui/node_modules/lucide-react/package.json \
 && test -e ui/node_modules/@types/react/index.d.ts \
 && test -e ui/node_modules/@types/react-dom/index.d.ts
# The robots, where the picker's client code reads them from (spec, The robots).
COPY --from=robots /robots hq/assets/robots
# Building Wasp's SDK type-checks every operation, and has grown past Node's default heap (as in CI's checks).
RUN cd hq && NODE_OPTIONS=--max-old-space-size=4096 npx wasp build

FROM wasp AS web-build
# Wasp fixes the browser app's server address when it is built. It is built
# once, for every machine, with a placeholder that is a valid address nothing
# answers at; hq-web puts HQ's real address in its place when it starts
# (adr-0111, web-address.sh). The build fails if the placeholder does not
# reach the built files, as it would if Wasp changed how it embeds it.
RUN cd hq && NODE_OPTIONS=--max-old-space-size=4096 REACT_APP_API_URL=https://hq-address.invalid npx vite build \
 && grep -rqF https://hq-address.invalid .wasp/out/web-app/build

# The platform guide agents read (agent knowledge spec, part 1): the user guide's pages, its glossary and the tools
# reference, built from this same commit. The build fails on a page without a description, a glossary that does not
# parse, or anything else landing in the folder. Its own stage, so a guide change rebuilds only this.
FROM wasp AS platform-guide
COPY docs/guide /repo/docs/guide
RUN cd hq && node scripts/guide/build-platform-guide.mjs

FROM caddy:2-alpine@sha256:78bd35025c7ba85961dd149ae670315129954e77abe2383ac47c89106b35ade9 AS web
# The built app as the image holds it; web-address.sh copies it to /srv at each start.
COPY --from=web-build /repo/hq/.wasp/out/web-app/build /usr/share/hq-web
COPY hq/docker/Caddyfile /etc/caddy/Caddyfile
COPY --chmod=0755 hq/docker/web-address.sh /usr/local/bin/hq-web-address
COPY --chmod=0755 hq/docker/web-entrypoint.sh /usr/local/bin/hq-web-entrypoint
COPY --chmod=0755 hq/docker/web-files.sh /usr/local/bin/hq-web-files
COPY --chmod=0755 hq/docker/web-previews.sh /usr/local/bin/hq-web-previews
EXPOSE 4100
ENTRYPOINT ["/usr/local/bin/hq-web-entrypoint"]

# The local embedding model memory embeds with, fetched once here from its
# pinned revision and checked against its digests, so an install never fetches
# it itself (src/memory/embedding/). Its own stage: it is rebuilt only when the
# model's manifest changes. hq's package.json makes Node read the two
# TypeScript modules the script imports as ES modules.
FROM node:26.13.0-alpine3.23@sha256:44a3247313f9bc069a4ec25d01b66254ed7dc4d0408727d8720dc827f0753423 AS embedding-model
WORKDIR /build/hq
COPY hq/package.json ./
COPY hq/scripts/models scripts/models
COPY hq/src/memory/embedding/localModelManifest.ts hq/src/memory/embedding/localModelFiles.ts src/memory/embedding/
RUN node scripts/models/fetch-embedding-model.mjs /hq-models

# The same steps as Wasp's own generated Dockerfile, with the repository's
# packages at /core and /ui — where the app's `file:../core` and `file:../ui`
# resolve from /app — rather than copied in and patched.
FROM node:26.13.0-alpine3.23@sha256:44a3247313f9bc069a4ec25d01b66254ed7dc4d0408727d8720dc827f0753423 AS server-build
# The generated package.json still lists the Wasp CLI, so this install runs its postinstall too.
ENV WASP_TELEMETRY_DISABLE=1
# Alpine 3.21 and later no longer bring openssl with Node; Prisma's engine
# needs it, here to generate the client and in the final stage to run.
RUN apk add --no-cache openssl python3 build-base libtool autoconf automake
COPY --from=wasp /repo/core /core
COPY --from=wasp /repo/ui /ui
RUN rm -rf /core/node_modules /ui/node_modules
# Reinstall ui's own dependencies for this stage's platform (the wasp stage
# above is the building machine's, on glibc; this one is the image's) rather than keep
# what `rm -rf` just removed. site's copy of this stage skips this because
# site never imports past the surface of @agenthix/ui; hq does.
RUN cd /ui && npm install --legacy-peer-deps --no-audit --no-fund
WORKDIR /app
COPY --from=wasp /repo/hq/.wasp/out/src ./src
COPY --from=wasp /repo/hq/.wasp/out/package.json /repo/hq/.wasp/out/package-lock.json ./
COPY --from=wasp /repo/hq/.wasp/out/tsconfig*.json ./
COPY --from=wasp /repo/hq/.wasp/out/server .wasp/out/server
COPY --from=wasp /repo/hq/.wasp/out/sdk .wasp/out/sdk
COPY --from=wasp /repo/hq/.wasp/out/libs .wasp/out/libs
COPY --from=wasp /repo/hq/.wasp/out/db .wasp/out/db
COPY hq/.npmrc ./
RUN npm install && cd .wasp/out/server && npm install
# /app's package.json declares npm workspaces including .wasp/out/*. hq's
# dependency tree has no version conflict that forces anything nested under
# .wasp/out/server/node_modules (site's does, for @types alone), so npm
# hoists everything to /app/node_modules and never creates the directory at
# all — but the final stage below unconditionally COPYs it. Guarantee it
# exists (possibly empty) rather than let that COPY fail on a directory that
# npm had no reason to create.
RUN mkdir -p .wasp/out/server/node_modules
# Same fix as the wasp stage, and needed again here: this stage starts fresh
# (/ui/node_modules was just stripped above) and /app's own install is the
# only copy of react, react-dom and lucide-react in this stage. Point ui at
# it rather than installing a second, differently-pathed copy, which
# TypeScript would treat as unrelated types (see the wasp stage's note).
# socket.io-client is left unlinked here too, for the same reason: it is
# ui's own devDependency, already reinstalled by the `npm install` above.
# rm -rf + `-fn` + the test line: same defence as the wasp stage — always
# hq's copy, and a loud failure right here rather than a confusing
# TypeScript error steps later if a link ever resolves to nothing.
RUN mkdir -p /ui/node_modules/@types \
 && rm -rf /ui/node_modules/react /ui/node_modules/react-dom /ui/node_modules/lucide-react /ui/node_modules/@types/react /ui/node_modules/@types/react-dom \
 && ln -sfn /app/node_modules/react /ui/node_modules/react \
 && ln -sfn /app/node_modules/react-dom /ui/node_modules/react-dom \
 && ln -sfn /app/node_modules/lucide-react /ui/node_modules/lucide-react \
 && ln -sfn /app/node_modules/@types/react /ui/node_modules/@types/react \
 && ln -sfn /app/node_modules/@types/react-dom /ui/node_modules/@types/react-dom \
 && test -e /ui/node_modules/react/package.json \
 && test -e /ui/node_modules/react-dom/package.json \
 && test -e /ui/node_modules/lucide-react/package.json \
 && test -e /ui/node_modules/@types/react/index.d.ts \
 && test -e /ui/node_modules/@types/react-dom/index.d.ts
RUN cd .wasp/out/server && npx prisma generate --schema='../db/schema.prisma'
RUN cd .wasp/out/server && NODE_OPTIONS=--max-old-space-size=4096 npm run bundle

FROM node:26.13.0-alpine3.23@sha256:44a3247313f9bc069a4ec25d01b66254ed7dc4d0408727d8720dc827f0753423 AS server
# fontconfig and a sans font: sharp draws the Initials avatar's letters as SVG text, and Alpine brings no font.
RUN apk --no-cache -U upgrade && apk add --no-cache openssl python3 ripgrep fontconfig font-dejavu
ENV NODE_ENV=production
COPY --from=server-build /core /core
COPY --from=server-build /ui /ui
WORKDIR /app
COPY --from=server-build /app/node_modules ./node_modules
COPY --from=server-build /app/.wasp/out/server/node_modules .wasp/out/server/node_modules
COPY --from=server-build /app/.wasp/out/server/bundle .wasp/out/server/bundle
COPY --from=server-build /app/.wasp/out/server/package*.json .wasp/out/server/
COPY --from=server-build /app/.wasp/out/db .wasp/out/db
# Platform assets (skills, avatars, templates), read-only. Nothing for
# execution: no Docker or Claude Code tools — hq runs nothing (ADR-0050).
COPY hq/assets /app/assets
COPY --from=robots /robots /app/assets/robots
COPY --from=platform-guide /repo/hq/assets/platform-guide /app/assets/platform-guide
# The demo's scripts and voice clips (adr-0186), read-only; read only with DEMO_MODE=true.
COPY demo /demo
# The embedding model, read-only; hq reads it from here rather than its storage.
COPY --from=embedding-model /hq-models /hq-models
ENV HQ_BUNDLED_MODELS_DIR=/hq-models
RUN adduser -D -s /bin/sh -u 1001 appuser && mkdir -p /hq-storage && chown -R appuser:appuser /app /hq-storage
USER appuser
EXPOSE 4101
WORKDIR /app/.wasp/out/server
ENTRYPOINT ["npm", "run", "start-production"]

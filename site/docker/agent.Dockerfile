# syntax=docker/dockerfile:1
# Agent execution image: the two harnesses, Claude Code and OpenCode, the tools
# an agent's commands use, and the launcher every one of those commands runs
# through. No app server code, no secrets. Build context: the repository root.
#   docker build -t agenthix-agent -f site/docker/agent.Dockerfile .

# The command launcher (spec "Keeping the gate whole", item 3), linked
# statically so it needs nothing from the final image.
FROM alpine:3.23@sha256:ff7f0c727dd796aa36787bfcd9a64bf35a6ce72a73451b3359fde849b6703d63 AS launcher
RUN apk add --no-cache gcc musl-dev
WORKDIR /src
COPY site/docker/launcher/agenthix-contain.c site/docker/launcher/secret-env.list ./
RUN awk '/^[[:space:]]*(#|$)/ { next } \
      $1 !~ /^[A-Za-z_][A-Za-z0-9_]*$/ { print "secret-env.list: bad name " $1 > "/dev/stderr"; exit 1 } \
      { printf "\"%s\",\n", $1 }' secret-env.list > secret_env.h \
 && gcc -O2 -static -Wall -Wextra -Werror -o agenthix-contain agenthix-contain.c

# Agenthix's OpenCode plugin, bundled into one file with the core modules it uses.
FROM node:24.14.1-alpine3.23@sha256:8510330d3eb72c804231a834b1a8ebb55cb3796c3e4431297a24d246b8add4d5 AS plugin
WORKDIR /repo/site/opencode-plugin
COPY site/opencode-plugin/package.json site/opencode-plugin/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY core/src /repo/core/src
COPY site/opencode-plugin/tsconfig.json ./
COPY site/opencode-plugin/src ./src
RUN npm run build

FROM node:24.14.1-alpine3.23@sha256:8510330d3eb72c804231a834b1a8ebb55cb3796c3e4431297a24d246b8add4d5

# Pinned: the Claude Code CLI to the version the site's Claude Agent SDK
# bundles (its manifest.json), OpenCode to the v1 line the design was verified
# on. A unit test holds both to the site's own record (agentImage.ts).
ARG CLAUDE_CODE_VERSION=2.1.141
ARG OPENCODE_VERSION=1.18.32

# Shell and git tooling for agent commands. ripgrep because OpenCode otherwise
# downloads it from GitHub at its first search, and no setting stops that.
RUN apk add --no-cache bash git openssh-client curl ripgrep

# Both harnesses. Every model provider Agenthix offers on OpenCode (OpenRouter,
# OpenAI, Google, Anthropic, an OpenAI-compatible endpoint) is compiled into
# OpenCode's binary, so the server, which runs with npm offline, never has one
# to install. npm installs OpenCode's binary for every libc of this platform;
# its bin/ holds a hard link to the one it chose, so the rest are removed, and
# the version check fails the build should that ever stop being true.
RUN npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" "opencode-ai@${OPENCODE_VERSION}" \
 && rm -rf /usr/local/lib/node_modules/opencode-ai/node_modules \
 && test "$(opencode --version)" = "${OPENCODE_VERSION}" \
 && claude --version | grep -q "^${CLAUDE_CODE_VERSION} " \
 && npm cache clean --force

COPY site/docker/agenthix-git-credential /usr/local/bin/agenthix-git-credential
RUN chmod +x /usr/local/bin/agenthix-git-credential \
 && git config --system credential.helper '/usr/local/bin/agenthix-git-credential' \
 && git config --system credential.useHttpPath true

# Everything of Agenthix's own in the image, root-owned so nothing an agent
# runs can change it:
#   bin/agenthix-contain        the command launcher
#   bin/claude-shell-prefix     Claude Code's CLAUDE_CODE_SHELL_PREFIX
#   shell/bash                  OpenCode's `shell`
#   opencode/plugin/agenthix.js the OpenCode plugin
#   opencode/models.json        OpenCode's model catalogue, for OPENCODE_MODELS_PATH:
#                               the snapshot compiled into the pinned binary, so
#                               the catalogue cached in the writable home is never read
# and, ahead of the real /usr/bin/rg on the PATH, /usr/local/bin/rg, which runs
# it through the launcher: OpenCode's grep and glob, and Claude Code's Grep and
# Glob (USE_BUILTIN_RIPGREP=0), start `rg` from the PATH with the harness's own
# permissions and environment. Likewise /usr/local/bin/git, ahead of
# /usr/bin/git: both harnesses run `git` from the PATH in a project an agent
# can write, whose settings can name programs git runs; through the launcher
# those run with a command's reach, and a harness's git runs no hook or
# file-system monitor at all.
COPY --from=launcher --chmod=0755 /src/agenthix-contain /usr/local/lib/agenthix/bin/agenthix-contain
COPY --chmod=0755 site/docker/launcher/claude-shell-prefix /usr/local/lib/agenthix/bin/claude-shell-prefix
COPY --chmod=0755 site/docker/launcher/bash /usr/local/lib/agenthix/shell/bash
COPY --chmod=0755 site/docker/launcher/rg /usr/local/bin/rg
RUN test "$(command -v rg)" = /usr/local/bin/rg && test -x /usr/bin/rg
COPY --chmod=0755 site/docker/launcher/git /usr/local/bin/git
RUN test "$(command -v git)" = /usr/local/bin/git && test -x /usr/bin/git
COPY --from=plugin /repo/site/opencode-plugin/dist/agenthix.js /usr/local/lib/agenthix/opencode/plugin/agenthix.js
COPY site/docker/opencode/extract-models.mjs /tmp/extract-models.mjs
RUN node /tmp/extract-models.mjs /usr/local/lib/node_modules/opencode-ai/bin/opencode.exe /usr/local/lib/agenthix/opencode/models.json \
 && rm /tmp/extract-models.mjs \
 && chmod 0444 /usr/local/lib/agenthix/opencode/models.json /usr/local/lib/agenthix/opencode/plugin/agenthix.js \
 && chmod 0755 /usr/local/lib/agenthix/opencode /usr/local/lib/agenthix/opencode/plugin

# Create non-root user matching app container uid (1001) so volume file ownership aligns
RUN adduser -D -s /bin/bash -u 1001 appuser

# /home/appuser is the runner's harness home, bound whole from the site's disk
# at run time (ADR-0074): every runtime's private state (~/.claude/,
# ~/.claude.json, ~/.local/share/opencode/) lives there, beside storage,
# one folder per runner. The bind hides anything the image puts under it, so
# the image keeps nothing there — the site creates ~/.claude/ and seeds
# ~/.claude.json before the container starts.
#
# /home/agent is the agent's commands' own home: agenthix-contain sets HOME to
# it, since commands cannot reach the harness home. It lives and dies with the
# container.
RUN install -d -o appuser -g appuser -m 0700 /home/agent

USER appuser

# No ENTRYPOINT — the container runs `tail -f /dev/null` under docker's own
# init (`--init`), managed by AgentContainerManager

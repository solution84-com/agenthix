# syntax=docker/dockerfile:1
# Executor image: what a workflow step runs in. The tools an agent's commands use (the tools stage,
# shared with the agent image so the two cannot drift), plus `gh` and `push-bundle`. No harness, no
# command launcher and no git credential helper: a step that needs a credential is given it as a file
# in /run/secrets, and nothing here reads it unasked. Build context: the repository root.
#   docker build -t agenthix-executor -f site/docker/executor.Dockerfile .

# >>> tools stage: identical in agent.Dockerfile and executor.Dockerfile (a test holds the two to each other)
# The tools every command uses, in the agent and in a workflow step alike, so what
# the agent can run a step can run. Shell and git tooling; ripgrep because OpenCode
# otherwise downloads it from GitHub at its first search, and no setting stops that.
# uid 1001 matches the app containers' so volume file ownership aligns.
FROM node:26.13.0-alpine3.23@sha256:e6c03d42b46af3b1e98207e59f06a43cfe5efd3ec4b4d3d9802bddf04f833374 AS tools
RUN apk add --no-cache bash git openssh-client curl ripgrep \
 && adduser -D -s /bin/bash -u 1001 appuser
# <<< tools stage

FROM tools

# GitHub's command line, pinned to a release and to the checksum GitHub publishes for each
# architecture's archive; the build fails if the download differs.
ARG TARGETARCH
ARG GH_VERSION=2.103.2
ARG GH_SHA256_AMD64=62ccf747115ddc61237efffdde66a3c8f70ba249433dc64f70801089b59c59c8
ARG GH_SHA256_ARM64=4c3e99a50bd8b181a3fe9d69b25dd978bac768148d88f01507c6b4d1ef61a443
RUN case "${TARGETARCH}" in \
      amd64) sha="${GH_SHA256_AMD64}" ;; \
      arm64) sha="${GH_SHA256_ARM64}" ;; \
      *) echo "No gh checksum is pinned for ${TARGETARCH}." >&2; exit 1 ;; \
    esac \
 && curl -fsSL -o /tmp/gh.tar.gz "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${TARGETARCH}.tar.gz" \
 && echo "${sha}  /tmp/gh.tar.gz" | sha256sum -c - \
 && tar -xzf /tmp/gh.tar.gz -C /usr/local --strip-components=1 "gh_${GH_VERSION}_linux_${TARGETARCH}/bin/gh" \
 && rm /tmp/gh.tar.gz \
 && gh --version | grep -q "^gh version ${GH_VERSION} "

# Root-owned, so nothing a step runs can change it.
COPY --chmod=0755 site/docker/executor/push-bundle /usr/local/bin/push-bundle

# No credential helper in any git config, system or global: git asks for a credential only where a script
# supplies one (push-bundle's askpass). The build fails should a base ever bring one.
RUN test -z "$(git config --show-origin --get-all credential.helper 2>/dev/null || true)" \
 && test ! -e /etc/gitconfig

# A step runs with a read-only root: the home and the config folders of git, gh and the like are on /tmp,
# which the site mounts writable and empty for each step.
ENV HOME=/tmp/home \
    XDG_CONFIG_HOME=/tmp/home/.config \
    GH_CONFIG_DIR=/tmp/home/.config/gh

USER appuser

# No ENTRYPOINT: the site gives each step its command.

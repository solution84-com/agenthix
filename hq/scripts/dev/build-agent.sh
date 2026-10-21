#!/usr/bin/env bash
# Build the agent Docker image for dev.
set -euo pipefail

PROJECT_DIR="$(dirname "$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")")"
REPO_ROOT="$(dirname "$PROJECT_DIR")"

echo "==> Building agent image..."
cd "$REPO_ROOT"
# Context: the repository root — the image bundles the OpenCode plugin with
# the core modules it imports.
docker build -t agenthix-agent -f site/docker/agent.Dockerfile .

#!/usr/bin/env bash
# Build the agent image and start the dev environment in one step.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "$SCRIPT_DIR/build-agent.sh"
bash "$SCRIPT_DIR/start.sh"

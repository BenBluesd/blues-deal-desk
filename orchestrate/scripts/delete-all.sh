#!/usr/bin/env bash
# orchestrate/scripts/delete-all.sh
#
# Remove the Blues Deal Desk agent and tool from the active Orchestrate
# environment (reverse import order).
#
# Usage:
#   source venv/bin/activate
#   bash orchestrate/scripts/delete-all.sh

set -e
ORC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/venv/bin/orchestrate"

echo "==> Removing agent: blues_deal_desk ..."
"$ORC" agents remove -n blues_deal_desk --kind native || true

echo "==> Removing tool: size_flashsystem ..."
"$ORC" tools remove -n size_flashsystem || true

echo "==> Done."

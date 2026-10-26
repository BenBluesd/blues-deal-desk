#!/usr/bin/env bash
# orchestrate/scripts/import-all.sh
#
# Import Blues Deal Desk and Blues Site Advisor tools and agents into the
# active Orchestrate environment (hackathon by default).
#
# Usage:
#   cd <repo-root>
#   source venv/bin/activate
#   orchestrate env activate hackathon  # (if not already active)
#   bash orchestrate/scripts/import-all.sh

set -e
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ORC="${REPO}/venv/bin/orchestrate"

echo "==> Active environment:"
"$ORC" env list | grep "(active)" || true

echo ""
echo "==> Importing tool: size_flashsystem ..."
"$ORC" tools import -k python -f "${REPO}/orchestrate/tools/sizer.py"

echo ""
echo "==> Importing tool: submit_request ..."
"$ORC" tools import -k python \
  -f "${REPO}/orchestrate/tools/submit_request.py" \
  -r "${REPO}/orchestrate/tools/requirements.txt"

echo ""
echo "==> Importing tools: suggest_storage, create_customer_lead ..."
"$ORC" tools import -k python \
  -f "${REPO}/orchestrate/tools/site_tools.py" \
  -p "${REPO}/orchestrate/tools" \
  -r "${REPO}/orchestrate/tools/requirements.txt"

echo ""
echo "==> Importing agent: blues_deal_desk ..."
"$ORC" agents import -f "${REPO}/orchestrate/agents/blues_deal_desk.yaml"

echo ""
echo "==> Importing agent: blues_site_advisor ..."
"$ORC" agents import -f "${REPO}/orchestrate/agents/blues_site_advisor.yaml"

echo ""
echo ""
echo "==> Importing tools: analyze_request, price_quote ..."
"$ORC" tools import -k python \
  -f "${REPO}/orchestrate/tools/internal_tools.py" \
  -p "${REPO}/orchestrate/tools" \
  -r "${REPO}/orchestrate/tools/requirements.txt"

echo ""
echo "==> Importing agent: blues_quote_desk_internal ..."
"$ORC" agents import -f "${REPO}/orchestrate/agents/blues_quote_desk_internal.yaml"

echo ""
echo "==> Done. Verify with:"
echo "    orchestrate tools  list | grep size_flashsystem"
echo "    orchestrate tools  list | grep submit_request"
echo "    orchestrate tools  list | grep suggest_storage"
echo "    orchestrate tools  list | grep create_customer_lead"
echo "    orchestrate tools  list | grep analyze_request"
echo "    orchestrate tools  list | grep price_quote"
echo "    orchestrate agents list | grep blues_deal_desk"
echo "    orchestrate agents list | grep blues_site_advisor"
echo "    orchestrate agents list | grep blues_quote_desk_internal"

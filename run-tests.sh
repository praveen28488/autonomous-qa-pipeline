#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  run-tests.sh — run the full Day 1-3 test suite in one shot
#  Usage:  bash run-tests.sh
# ─────────────────────────────────────────────────────────────
set -e

# ── Gemini API key (passed inline to every command to avoid
#    inheritance issues when running bash from PowerShell) ─────
# Load GEMINI_API_KEY from .env.local (never committed to git)
if [ -f ".env.local" ]; then
  export GEMINI_API_KEY=$(grep -E '^\s*GEMINI_API_KEY\s*=' .env.local | cut -d'=' -f2- | tr -d '[:space:]')
fi
if [ -z "$GEMINI_API_KEY" ]; then
  echo "ERROR: GEMINI_API_KEY is not set."
  echo "  Create a file called .env.local in this folder with:"
  echo "  GEMINI_API_KEY=your_key_here"
  echo "  Get a free key at: https://aistudio.google.com/apikey"
  exit 1
fi
KEY="$GEMINI_API_KEY"

echo ""
echo "========================================================"
echo "     Autonomous QA Pipeline - Full Test Run"
echo "========================================================"
echo ""

# ── Step 1: Start Docker containers ──────────────────────────
echo ">>> Step 1: Starting infrastructure (Redis + ChromaDB)..."
docker compose -f infra/docker/docker-compose.yml up -d

echo "    Waiting 8 seconds for services to be healthy..."
sleep 8

REDIS_STATUS=$(docker inspect --format='{{.State.Health.Status}}' qa-redis 2>/dev/null || echo "not found")
CHROMA_STATUS=$(docker inspect --format='{{.State.Health.Status}}' qa-chromadb 2>/dev/null || echo "not found")

echo "    Redis:    $REDIS_STATUS"
echo "    ChromaDB: $CHROMA_STATUS"
echo ""

# ── Step 2: Day 2 smoke test ──────────────────────────────────
echo ">>> Step 2: Day 2 smoke test (Redis + Zod + Playwright MCP)..."
GEMINI_API_KEY="$KEY" npx tsx scripts/smoke-day2.ts
echo ""

# ── Step 3: Day 3 smoke test ──────────────────────────────────
echo ">>> Step 3: Day 3 smoke test (ChromaDB + quality gate + semantic search)..."
GEMINI_API_KEY="$KEY" npx tsx scripts/smoke-day3.ts
echo ""

# ── Step 4: Playwright browser tests ─────────────────────────
echo ">>> Step 4: Playwright browser tests..."
npx playwright test tests/generated/smoke.spec.ts --project=chromium
echo ""

# ── All done ──────────────────────────────────────────────────
echo "========================================================"
echo "     ALL TESTS PASSED"
echo "========================================================"
echo ""
echo "    To see the Playwright HTML report:"
echo "    npx playwright show-report"
echo ""

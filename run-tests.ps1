# run-tests.ps1 - Full Day 1-3 test suite
# Usage: .\run-tests.ps1  (from PowerShell inside VS Code)

$env:GEMINI_API_KEY = "REDACTED"

Write-Host ""
Write-Host "========================================================"
Write-Host "     Autonomous QA Pipeline - Full Test Run"
Write-Host "========================================================"
Write-Host ""

# Step 1: Start Docker containers
Write-Host ">>> Step 1: Starting infrastructure (Redis + ChromaDB)..."
docker compose -f infra/docker/docker-compose.yml up -d
Write-Host "    Waiting 8 seconds for services to be healthy..."
Start-Sleep -Seconds 8

$redisStatus  = (docker inspect --format="{{.State.Health.Status}}" qa-redis  2>$null)
$chromaStatus = (docker inspect --format="{{.State.Health.Status}}" qa-chromadb 2>$null)
Write-Host "    Redis:    $redisStatus"
Write-Host "    ChromaDB: $chromaStatus"
Write-Host ""

if ($redisStatus -ne "healthy" -or $chromaStatus -ne "healthy") {
    Write-Host "ERROR: Containers not healthy. Is Docker Desktop running?" -ForegroundColor Red
    exit 1
}

# Step 2: Day 2 smoke test
Write-Host ">>> Step 2: Day 2 smoke test (Redis + Zod + Playwright MCP)..."
npx tsx scripts/smoke-day2.ts
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: Day 2 smoke test" -ForegroundColor Red; exit 1 }
Write-Host ""

# Step 3: Day 3 smoke test
Write-Host ">>> Step 3: Day 3 smoke test (ChromaDB + quality gate + semantic search)..."
npx tsx scripts/smoke-day3.ts
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: Day 3 smoke test" -ForegroundColor Red; exit 1 }
Write-Host ""

# Step 4: Playwright browser tests
Write-Host ">>> Step 4: Playwright browser tests..."
npx playwright test tests/generated/smoke.spec.ts --project=chromium
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: Playwright tests" -ForegroundColor Red; exit 1 }
Write-Host ""

Write-Host "========================================================"
Write-Host "     ALL TESTS PASSED" -ForegroundColor Green
Write-Host "========================================================"
Write-Host ""
Write-Host "    To see the Playwright HTML report:"
Write-Host "    npx playwright show-report"
Write-Host ""

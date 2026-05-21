# Digital Relative — One-click deploy script
# Run this after downloading and extracting a new zip from Claude
# Usage: .\deploy.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Digital Relative Deploy Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Host "ERROR: Run this script from the legatum folder" -ForegroundColor Red
    exit 1
}

# 2. npm audit
Write-Host "Step 1/6: Running npm audit..." -ForegroundColor Yellow
$auditResult = npm audit 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED: npm audit found vulnerabilities:" -ForegroundColor Red
    Write-Host $auditResult
    Write-Host "Fix vulnerabilities before deploying." -ForegroundColor Red
    exit 1
}
Write-Host "  npm audit: clean" -ForegroundColor Green

# 3. Build
Write-Host "Step 2/6: Building..." -ForegroundColor Yellow
npm run build 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED: Build errors found. Run 'npm run build' to see details." -ForegroundColor Red
    exit 1
}
Write-Host "  Build: passed" -ForegroundColor Green

# 4. Git status
Write-Host "Step 3/6: Checking git status..." -ForegroundColor Yellow
$changes = git status --porcelain
if (-not $changes) {
    Write-Host "  No changes to deploy" -ForegroundColor Yellow
    exit 0
}
Write-Host "  Changes detected" -ForegroundColor Green

# 5. Commit message
Write-Host ""
$msg = Read-Host "Step 4/6: Enter commit message"
if (-not $msg) {
    $msg = "Deploy $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
}

# 6. Git add, commit, push
Write-Host "Step 5/6: Committing and pushing..." -ForegroundColor Yellow
git add .
git commit -m $msg
git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED: Git push failed" -ForegroundColor Red
    exit 1
}
Write-Host "  Pushed to GitHub - Vercel will auto-deploy frontend" -ForegroundColor Green

# 7. Check which edge functions changed and deploy them
Write-Host "Step 6/6: Checking for edge function changes..." -ForegroundColor Yellow

$changedFunctions = git diff HEAD~1 --name-only 2>/dev/null | Where-Object { $_ -match "supabase/functions/(.+)/index.ts" }

if ($changedFunctions) {
    Write-Host ""
    Write-Host "Edge functions changed - deploying:" -ForegroundColor Yellow
    
    $deployed = @()
    foreach ($file in $changedFunctions) {
        if ($file -match "supabase/functions/([^/]+)/index.ts") {
            $funcName = $matches[1]
            if ($funcName -ne "_shared" -and $funcName -notin $deployed) {
                $deployed += $funcName
                Write-Host "  Deploying $funcName..." -ForegroundColor Yellow
                if ($funcName -eq "stripe-webhook") {
                    supabase functions deploy stripe-webhook --no-verify-jwt
                } else {
                    supabase functions deploy $funcName
                }
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "  $funcName deployed" -ForegroundColor Green
                } else {
                    Write-Host "  WARNING: $funcName deploy failed - run manually" -ForegroundColor Red
                }
            }
        }
    }
} else {
    Write-Host "  No edge function changes" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Deploy complete!" -ForegroundColor Green
Write-Host "  Frontend: https://digitalrelative.co.uk" -ForegroundColor Cyan
Write-Host "  Vercel:   https://digital-relative.vercel.app" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

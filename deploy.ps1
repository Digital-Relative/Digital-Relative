# Digital Relative — One-click deploy script
# Usage: .\deploy.ps1

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Digital Relative Deploy Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path "package.json")) {
    Write-Host "ERROR: Run from the legatum folder" -ForegroundColor Red
    exit 1
}

# Step 1: npm audit
Write-Host "Step 1/5: Security audit..." -ForegroundColor Yellow
$audit = Start-Process "cmd.exe" -ArgumentList "/c npm audit --silent" -Wait -PassThru -NoNewWindow
if ($audit.ExitCode -ne 0) {
    Write-Host "  FAILED: Vulnerabilities found" -ForegroundColor Red
    exit 1
}
Write-Host "  Clean" -ForegroundColor Green

# Step 2: Install dependencies
Write-Host "Step 2/5: Installing dependencies..." -ForegroundColor Yellow
$install = Start-Process "cmd.exe" -ArgumentList "/c npm install --silent" -Wait -PassThru -NoNewWindow
if ($install.ExitCode -ne 0) {
    Write-Host "  FAILED: npm install failed" -ForegroundColor Red
    exit 1
}
Write-Host "  Done" -ForegroundColor Green

# Step 3: Build
Write-Host "Step 3/5: Building..." -ForegroundColor Yellow
$build = Start-Process "cmd.exe" -ArgumentList "/c npm run build > `"$env:TEMP\dr_build.txt`" 2>&1" -Wait -PassThru -NoNewWindow
if ($build.ExitCode -ne 0) {
    Write-Host "  FAILED: Build errors:" -ForegroundColor Red
    Get-Content "$env:TEMP\dr_build.txt" | Write-Host
    exit 1
}
Write-Host "  Build passed" -ForegroundColor Green

# Step 4: Check for changes
Write-Host "Step 4/5: Committing..." -ForegroundColor Yellow
$status = & cmd.exe /c "git status --porcelain" 2>&1
if (-not $status) {
    Write-Host "  No changes to deploy" -ForegroundColor Yellow
    exit 0
}

Write-Host ""
$msg = Read-Host "  Enter commit message"
if (-not $msg) { $msg = "Deploy $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }

# Run git commands via cmd.exe to avoid PowerShell stderr handling
$addResult    = Start-Process "cmd.exe" -ArgumentList "/c git add ." -Wait -PassThru -NoNewWindow
$commitResult = Start-Process "cmd.exe" -ArgumentList "/c git commit -m `"$msg`"" -Wait -PassThru -NoNewWindow
if ($commitResult.ExitCode -ne 0) {
    Write-Host "  FAILED: Commit failed" -ForegroundColor Red
    exit 1
}
$pushResult = Start-Process "cmd.exe" -ArgumentList "/c git push" -Wait -PassThru -NoNewWindow
if ($pushResult.ExitCode -ne 0) {
    Write-Host "  FAILED: Push failed" -ForegroundColor Red
    exit 1
}
Write-Host "  Pushed - Vercel deploying..." -ForegroundColor Green

# Step 5: Edge functions
Write-Host "Step 5/5: Edge functions..." -ForegroundColor Yellow
$changedFunctions = & cmd.exe /c "git diff HEAD~1 --name-only" 2>&1 | Where-Object { $_ -match "supabase/functions/([^/]+)/index\.ts" -and $_ -notmatch "_shared" }

if (-not $changedFunctions) {
    Write-Host "  No edge function changes" -ForegroundColor Green
} else {
    $deployed = @()
    foreach ($file in $changedFunctions) {
        if ($file -match "supabase/functions/([^/]+)/index\.ts") {
            $fn = $matches[1]
            if ($fn -notin $deployed) {
                $deployed += $fn
                Write-Host "  Deploying $fn..." -ForegroundColor Yellow
                if ($fn -eq "stripe-webhook") {
                    Start-Process "cmd.exe" -ArgumentList "/c supabase functions deploy stripe-webhook --no-verify-jwt" -Wait -PassThru -NoNewWindow | Out-Null
                } else {
                    Start-Process "cmd.exe" -ArgumentList "/c supabase functions deploy $fn" -Wait -PassThru -NoNewWindow | Out-Null
                }
                Write-Host "  $fn deployed" -ForegroundColor Green
            }
        }
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  All done!" -ForegroundColor Green
Write-Host "  Site: https://digitalrelative.co.uk" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ==============================================================================
# Zoho Catalyst Deployment Script
# This script prepares your project for deployment to Zoho Catalyst.
# It automatically handles the packaging of shared folders (like 'shared' and
# 'intelligence') into each function, ensuring they work perfectly in production
# without causing MODULE_NOT_FOUND errors.
# ==============================================================================

Write-Host "Starting deployment preparation..." -ForegroundColor Cyan

# 1. Build the React Client
Write-Host "`n[1/4] Building React frontend..." -ForegroundColor Yellow
Set-Location -Path .\client
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend build failed. Aborting." -ForegroundColor Red
    exit 1
}
Set-Location -Path ..

# 2. Create Staging Directory
$DeployDir = ".catalyst_deploy"
Write-Host "`n[2/4] Setting up deployment staging area ($DeployDir)..." -ForegroundColor Yellow
if (Test-Path $DeployDir) {
    Remove-Item -Recurse -Force $DeployDir
}
New-Item -ItemType Directory -Path $DeployDir | Out-Null

# Copy necessary root files
Copy-Item catalyst.json -Destination $DeployDir
Copy-Item .catalystrc -Destination $DeployDir -ErrorAction SilentlyContinue

# Copy client dist
New-Item -ItemType Directory -Path "$DeployDir\client" | Out-Null
Copy-Item -Recurse -Force "client\dist" -Destination "$DeployDir\client\dist"

# Copy functions
Copy-Item -Recurse -Force "functions" -Destination "$DeployDir\functions"

# 3. Inject Shared Dependencies into Functions
Write-Host "`n[3/4] Injecting shared modules into functions..." -ForegroundColor Yellow
$FunctionsList = @("intake-incident", "role-view", "flags", "review-decision", "dgp-summary")

foreach ($func in $FunctionsList) {
    $FuncPath = "$DeployDir\functions\$func"
    if (Test-Path $FuncPath) {
        Write-Host "  -> Processing $func" -ForegroundColor DarkGray
        
        # Copy 'shared' folder into this function
        Copy-Item -Recurse -Force "functions\shared" -Destination "$FuncPath\shared"
        
        # Update require statements in the function's .js files
        $JsFiles = Get-ChildItem -Path $FuncPath -Filter *.js -File
        foreach ($file in $JsFiles) {
            $content = Get-Content $file.FullName
            # Replace require('../shared/...') with require('./shared/...')
            $content = $content -replace "require\('\.\./shared/", "require('./shared/"
            Set-Content -Path $file.FullName -Value $content
        }

        # Special injection for role-view: It needs the Python scripts to run!
        if ($func -eq "role-view") {
            Write-Host "  -> Injecting Python intelligence scripts into role-view" -ForegroundColor DarkGray
            Copy-Item -Recurse -Force "intelligence" -Destination "$FuncPath\intelligence"
            
            # Update pythonBridge path resolution inside role-view/shared/pythonBridge.js
            $pyBridgePath = "$FuncPath\shared\pythonBridge.js"
            if (Test-Path $pyBridgePath) {
                $pyBridgeContent = Get-Content $pyBridgePath
                # In production, the intelligence folder is right next to shared
                # So __dirname is `.../role-view/shared`, we just need to go up one level (`..`)
                $pyBridgeContent = $pyBridgeContent -replace "path\.resolve\(__dirname, '\.\./\.\./\.\./'\)", "path.resolve(__dirname, '../')"
                $pyBridgeContent = $pyBridgeContent -replace "path\.resolve\(__dirname, '\.\./\.\./'\)", "path.resolve(__dirname, '../')"
                Set-Content -Path $pyBridgePath -Value $pyBridgeContent
            }
        }
    }
}

# 4. Deploy!
Write-Host "`n[4/4] Starting Zoho Catalyst Deployment..." -ForegroundColor Green
Set-Location -Path $DeployDir
catalyst deploy
$deployExit = $LASTEXITCODE

Set-Location -Path ..
Write-Host "`nCleaning up staging area..." -ForegroundColor DarkGray
Remove-Item -Recurse -Force $DeployDir

if ($deployExit -eq 0) {
    Write-Host "`nDeployment completed successfully! 🎉" -ForegroundColor Green
} else {
    Write-Host "`nDeployment encountered errors." -ForegroundColor Red
}

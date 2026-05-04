param(
    [string]$CaptureDate = (Get-Date -Format 'yyyy-MM-dd'),
    [string]$Scenario = 'rivergate',
    [string[]]$Scenarios,
    [int]$Port = 3000,
    [string]$BindHost = '127.0.0.1',
    [switch]$SkipTitle,
    [switch]$SmokeCheck
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path $PSScriptRoot -Parent
$workspaceRoot = Split-Path $repoRoot -Parent
$prepareScript = Join-Path $workspaceRoot 'prepare-civicrise-local.ps1'
$captureDir = Join-Path $workspaceRoot 'LOCAL-ONLY\captures\civicrise'
function Invoke-SmokeCheck {
    param([string]$ScenarioId)

    Write-Step "Running simulation smoke check for $ScenarioId"
    Push-Location $repoRoot
    try {
        Invoke-CmdChecked "npm run smoke:sim -- --scenario $ScenarioId"
    } finally {
        Pop-Location
    }
}

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Stop-ProcessTree {
    param([int]$ProcessId)

    $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ProcessId }
    foreach ($child in $children) {
        Stop-ProcessTree -ProcessId $child.ProcessId
    }

    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($process) {
        Stop-Process -Id $ProcessId -Force
    }
}

function Stop-PythonHttpServer {
    param(
        [int]$Port,
        [string]$DirectoryPattern
    )

    $matchingServers = Get-CimInstance Win32_Process | Where-Object {
        $_.Name -match '^python' -and
        $_.CommandLine -match 'http\.server' -and
        $_.CommandLine -match "(^|\s)$Port(\s|$)" -and
        (-not $DirectoryPattern -or $_.CommandLine -match [regex]::Escape($DirectoryPattern))
    }

    foreach ($server in $matchingServers) {
        Stop-ProcessTree -ProcessId $server.ProcessId
    }
}

function Wait-ForHttpOk {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 90
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 10
            if ($response.StatusCode -eq 200) {
                return $true
            }
        } catch {
            Start-Sleep -Milliseconds 700
            continue
        }
        Start-Sleep -Milliseconds 700
    }

    throw "Timed out waiting for $Url"
}

function Invoke-CmdChecked {
    param([string]$Command)

    cmd /c $Command
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $Command"
    }
}

function Invoke-PlaywrightScreenshot {
    param(
        [string]$Url,
        [string]$OutputPath,
        [string]$Device,
        [string]$Viewport,
        [switch]$FullPage
    )

    $npxLookup = Get-Command 'npx.cmd' -ErrorAction SilentlyContinue
    $npxCommand = if ($npxLookup) { $npxLookup.Source } else { $null }
    if (-not $npxCommand) {
        throw 'Could not find npx.cmd. Node.js is required to refresh the review pack.'
    }

    $command = "& '$npxCommand' --% playwright screenshot --browser chromium"

    if ($Device) {
        $command += " --device `"$Device`""
    }

    if ($Viewport) {
        $command += " --viewport-size $Viewport"
    }

    if ($FullPage) {
        $command += ' --full-page'
    }

    $command += " --wait-for-timeout 2600 `"$Url`" `"$OutputPath`""

    Push-Location $repoRoot
    try {
        Invoke-Expression $command
        if ($LASTEXITCODE -ne 0) {
            throw "Playwright screenshot capture failed with exit code $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }
}

if (-not (Test-Path $prepareScript)) {
    throw "Missing prepare script at $prepareScript"
}

New-Item -ItemType Directory -Force -Path $captureDir | Out-Null

$scenarioList = @()
if ($Scenarios) {
    $scenarioList = $Scenarios | ForEach-Object { $_ -split ',' }
} elseif ($Scenario) {
    $scenarioList = @($Scenario)
}

$scenarioList = $scenarioList |
    Where-Object { $_ -and $_.Trim() -ne '' } |
    ForEach-Object { $_.Trim() } |
    Select-Object -Unique

if (-not $scenarioList -or $scenarioList.Count -eq 0) {
    $scenarioList = @('rivergate')
}

if ($SmokeCheck) {
    foreach ($scenarioId in $scenarioList) {
        Invoke-SmokeCheck -ScenarioId $scenarioId
    }
}

Write-Step 'Preparing cached Civicrise build'
$outputDir = (& powershell -ExecutionPolicy Bypass -File $prepareScript | Select-Object -Last 1).Trim()
if (-not (Test-Path $outputDir)) {
    throw "Expected cached build output, got: $outputDir"
}

$titlePath = Join-Path $captureDir "title-$CaptureDate.png"
$localUrl = "http://${BindHost}:$Port/"

Stop-PythonHttpServer -Port $Port -DirectoryPattern $outputDir
$server = $null

try {
    Write-Step "Serving cached build from $outputDir"
    $server = Start-Process python -ArgumentList '-m', 'http.server', $Port, '--bind', $BindHost, '--directory', $outputDir -PassThru
    if (-not $SkipTitle) {
        Write-Step 'Capturing title route evidence'
        Wait-ForHttpOk -Url $localUrl | Out-Null
        Invoke-PlaywrightScreenshot -Url $localUrl -OutputPath $titlePath -Viewport '1600,980'
    }

    $indexEntries = @()

    foreach ($scenarioId in $scenarioList) {
        $scenarioSuffix = if ($scenarioList.Count -gt 1) { "-$scenarioId" } else { "" }
        $desktopPath = Join-Path $captureDir "review-desktop$scenarioSuffix-$CaptureDate.png"
        $mobilePath = Join-Path $captureDir "review-mobile$scenarioSuffix-$CaptureDate.png"
        $contractPath = Join-Path $captureDir "review-contract$scenarioSuffix-$CaptureDate.md"
        $manifestPath = Join-Path $captureDir "review-manifest$scenarioSuffix-$CaptureDate.json"

        $reviewUrl = "http://${BindHost}:$Port/?autostart=1&review=1"
        if ($scenarioId) {
            $reviewUrl = "$reviewUrl&scenario=$scenarioId"
        }

        Wait-ForHttpOk -Url $reviewUrl | Out-Null

        Write-Step "Capturing desktop review evidence ($scenarioId)"
        Invoke-PlaywrightScreenshot -Url $reviewUrl -OutputPath $desktopPath -Viewport '1600,980'

        Write-Step "Capturing mobile review evidence ($scenarioId)"
        Invoke-PlaywrightScreenshot -Url $reviewUrl -OutputPath $mobilePath -Device 'iPhone 13' -FullPage

        $queryParamLines = @(
            '- `autostart=1`',
            '- `review=1`'
        )
        if ($scenarioId) {
            $queryParamLines += ('- `scenario=' + $scenarioId + '`')
        }

        $evidenceLines = @()
        if (-not $SkipTitle) {
            $evidenceLines += ('- `' + $titlePath + '`')
        }
        $evidenceLines += ('- `' + $desktopPath + '`')
        $evidenceLines += ('- `' + $mobilePath + '`')

        $contractLines = @(
            '# Civicrise Review Contract',
            '',
            '- Game: `Civicrise`',
            "- Local launch URL: $localUrl",
            "- Review URL: $reviewUrl",
            '- Query params:'
        ) + $queryParamLines + @(
            "- Launch script: $prepareScript",
            "- Capture refresh script: $(Join-Path $repoRoot 'scripts\refresh-review-pack.ps1')",
            "- Simulation smoke check: npm run smoke:sim -- --scenario $scenarioId",
            '- Render class: `canvas`',
            '- Browser flags: none',
            '',
            '## Evidence',
            ''
        ) + $evidenceLines + @(
            '',
            '## Caveats',
            '',
            '- Review mode intentionally bypasses save load/write operations so capture runs cannot overwrite an in-progress district.',
            '- Deterministic review slices exist for `rivergate` and `north-quay`. Other scenarios can be captured through `-Scenario` or `-Scenarios`, but they may boot into a lighter review state.',
            '',
            '## Next improvement',
            '',
            '- Add a single manifest index for multi-scenario capture runs.'
        )

        Set-Content -LiteralPath $contractPath -Value ($contractLines -join [Environment]::NewLine)

        $manifest = [ordered]@{
            game = 'Civicrise'
            generatedAt = (Get-Date).ToString('o')
            localUrl = $localUrl
            reviewUrl = $reviewUrl
            reviewParams = @('autostart=1', 'review=1') + $(if ($scenarioId) { "scenario=$scenarioId" } else { @() })
            launchScript = $prepareScript
            captureScript = "$repoRoot\scripts\refresh-review-pack.ps1"
            smokeCheck = $SmokeCheck.IsPresent
            smokeCheckCommand = "npm run smoke:sim -- --scenario $scenarioId"
            renderClass = 'canvas'
            browserFlags = @()
            evidence = @(
                $(if (-not $SkipTitle) { @{ label = 'Title route'; path = $titlePath } } else { $null }),
                @{ label = 'Review desktop'; path = $desktopPath },
                @{ label = 'Review mobile'; path = $mobilePath }
            ) | Where-Object { $_ }
            caveats = @(
                'Review mode intentionally bypasses save load/write operations so capture runs cannot overwrite an in-progress district.',
                'Deterministic review slices exist for rivergate and north-quay. Other scenarios can be captured through -Scenario or -Scenarios, but they may boot into a lighter review state.'
            )
            nextImprovement = 'Add a single manifest index for multi-scenario capture runs.'
        }
        $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath

        $indexEntries += [ordered]@{
            scenario = $scenarioId
            reviewUrl = $reviewUrl
            reviewParams = $manifest.reviewParams
            contractPath = $contractPath
            manifestPath = $manifestPath
            evidence = $manifest.evidence
            smokeCheck = $SmokeCheck.IsPresent
        }

        Write-Host ""
        Write-Host ("Review pack refreshed for {0}:" -f $scenarioId) -ForegroundColor Green
        Write-Host "  $desktopPath"
        Write-Host "  $mobilePath"
        if (-not $SkipTitle) {
            Write-Host "  $titlePath"
        }
        Write-Host "  $contractPath"
        Write-Host "  $manifestPath"
    }

    if ($scenarioList.Count -gt 1) {
        $indexPath = Join-Path $captureDir "review-manifest-index-$CaptureDate.json"
        $index = [ordered]@{
            game = 'Civicrise'
            generatedAt = (Get-Date).ToString('o')
            scenarios = $scenarioList
            localUrl = $localUrl
            titlePath = $(if (-not $SkipTitle) { $titlePath } else { $null })
            launchScript = $prepareScript
            captureScript = "$repoRoot\scripts\refresh-review-pack.ps1"
            smokeCheck = $SmokeCheck.IsPresent
            entries = $indexEntries
        }
        $index | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $indexPath

        Write-Host ""
        Write-Host "Review manifest index refreshed:" -ForegroundColor Green
        Write-Host "  $indexPath"
    }
} finally {
    if ($server) {
        Stop-ProcessTree -ProcessId $server.Id
    }
}

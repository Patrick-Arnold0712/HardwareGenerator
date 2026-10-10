param(
  [switch]$SkipVerify
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host ''
Write-Host '=== 1. 生成可导入嘉立创的 .eprj3 工程 ===' -ForegroundColor Cyan
npm run generate
if ($LASTEXITCODE -ne 0) { throw '工程生成失败' }

$project = Join-Path $root 'dist\led-indicator\led-indicator.eprj3'
if (-not (Test-Path -LiteralPath $project)) { throw "工程不存在：$project" }

if (-not $SkipVerify) {
  Write-Host ''
  Write-Host '=== 2. 调用嘉立创 V4 客户端做真实解析验证 ===' -ForegroundColor Cyan
  node src/verify-client.js --project $project
  if ($LASTEXITCODE -ne 0) { throw '客户端验证失败' }
}

$cli = $env:LCEDA_CLI
if (-not $cli) {
  $candidates = @(
    'D:\lceda-pro-4.1.71\lceda-pro.exe',
    'D:\lceda-pro\lceda-pro.exe',
    (Join-Path $env:LOCALAPPDATA 'Programs\LCEDA-Pro\lceda-pro.exe'),
    'C:\Program Files\LCEDA-Pro\lceda-pro.exe'
  )
  $cli = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $cli) { throw '未找到 LCEDA Pro V4.1+。请设置 LCEDA_CLI 环境变量。' }

Write-Host ''
Write-Host '=== 3. 在嘉立创 EDA 专业版中打开工程 ===' -ForegroundColor Cyan
Start-Process -FilePath $cli -ArgumentList @($project)
Write-Host "项目：$project"
Write-Host "验证截图：$(Join-Path $root 'dist\led-indicator\verification')"
Write-Host "交付 ZIP：$(Join-Path $root 'dist\led-indicator-eprj3.zip')"
Write-Host ''
Write-Host '演示提示：在客户端左侧工程树中打开 Schematic1 和 PCB1，检查 TP1/R1/D1/TP2 以及 5V、LED_A、GND 三条走线。'

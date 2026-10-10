param(
  [switch]$SkipVerify,
  [ValidateSet('5v-led-indicator', 'rc-low-pass-filter')]
  [string]$Template = '5v-led-indicator'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$projectMap = @{
  '5v-led-indicator' = 'dist\led-indicator\led-indicator.eprj3'
  'rc-low-pass-filter' = 'dist\rc-low-pass-filter\rc-low-pass-filter.eprj3'
}
$requirementMap = @{
  '5v-led-indicator' = '5V LED 指示灯板'
  'rc-low-pass-filter' = 'RC 低通滤波器，输入输出测试点'
}

Write-Host ''
Write-Host '=== 1. 根据需求生成嘉立创 .eprj3 工程 ===' -ForegroundColor Cyan
node src/generate.js --template $Template --input $requirementMap[$Template] --out dist --force
if ($LASTEXITCODE -ne 0) { throw '工程生成失败' }

$project = Join-Path $root $projectMap[$Template]
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
Write-Host "模板：$Template"
Write-Host "项目：$project"
Write-Host "验证截图：$(Join-Path (Split-Path -Parent $project) 'verification')"
Write-Host ''
Write-Host '演示提示：在客户端中查看原理图需求文本、器件、网络和 PCB 走线。'

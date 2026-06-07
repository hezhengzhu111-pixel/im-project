Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$packageDir = Split-Path -Parent $scriptDir
$repoRoot = Resolve-Path (Join-Path $packageDir "..\..\..")

Push-Location (Join-Path $repoRoot "rust")
try {
  cargo build -p im-flutter-bridge --release
}
finally {
  Pop-Location
}

Push-Location $packageDir
try {
  $env:IM_RUST_BRIDGE_SMOKE = "1"
  flutter test test/rust_bridge_initializer_smoke_test.dart
}
finally {
  Remove-Item Env:\IM_RUST_BRIDGE_SMOKE -ErrorAction SilentlyContinue
  Pop-Location
}

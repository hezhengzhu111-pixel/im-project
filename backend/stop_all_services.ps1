$services = @(
    "com.im.registry.RegistryMonitorApplication",
    "com.im.GatewayApplication",
    "com.im.AuthServiceApplication",
    "com.im.UserServiceApplication",
    "com.im.GroupServiceApplication",
    "com.im.FileServiceApplication",
    "com.im.MessageServiceApplication",
    "com.im.ImServerApplication"
)

Write-Host "Stopping all IM backend services..."

# Use jps to find java processes
$jpsOutput = jps -l

foreach ($line in $jpsOutput) {
    if ($line -match "^\s*(\d+)\s+(.+)\s*$") {
        $pidStr = $matches[1]
        $className = $matches[2]
        
        if ($services -contains $className) {
            Write-Host "Killing $className (PID: $pidStr)..."
            Stop-Process -Id $pidStr -Force -ErrorAction SilentlyContinue
        }
    }
}

# Also try to kill any remaining maven processes running spring-boot:run
$mvnProcesses = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match "spring-boot:run" }
foreach ($proc in $mvnProcesses) {
    Write-Host "Killing maven spring-boot process (PID: $($proc.ProcessId))..."
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
}

Write-Host "All IM backend services have been stopped."

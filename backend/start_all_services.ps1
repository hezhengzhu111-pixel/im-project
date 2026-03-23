$services = @(
    "registry-monitor",
    "gateway",
    "auth-service",
    "user-service",
    "group-service",
    "file-service",
    "message-service",
    "im-server",
    "log-service",
    "admin-service"
)

Write-Host "Starting all IM backend services..."

foreach ($service in $services) {
    Write-Host "Starting $service..."
    $args = "spring-boot:run", "-pl", "$service", "-Dspring-boot.run.jvmArguments=-Dspring.config.location=classpath:/dev/"
    Start-Process -FilePath "mvn.cmd" -ArgumentList $args -WorkingDirectory "$PSScriptRoot" -WindowStyle Normal
    Start-Sleep -Seconds 5
}

Write-Host "All services have been instructed to start in new windows."

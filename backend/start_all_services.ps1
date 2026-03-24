$services = @(
    "registry-monitor",
    "gateway",
    "auth-service",
    "user-service",
    "group-service",
    "file-service",
    "message-service",
    "im-server",
    "log-service"
)

$defaultKafkaBootstrap = "localhost:9092"
if ([string]::IsNullOrWhiteSpace($env:IM_KAFKA_BOOTSTRAP_SERVERS) -or $env:IM_KAFKA_BOOTSTRAP_SERVERS -eq "localhost:9094") {
    $env:IM_KAFKA_BOOTSTRAP_SERVERS = $defaultKafkaBootstrap
}

Write-Host "Starting all IM backend services in dev mode..."
Write-Host "Using IM_KAFKA_BOOTSTRAP_SERVERS=$($env:IM_KAFKA_BOOTSTRAP_SERVERS)"

foreach ($service in $services) {
    Write-Host "Starting $service..."
    $args = @(
        "-pl",
        "$service",
        "clean",
        "spring-boot:run",
        "-Dspring-boot.run.arguments=--spring.config.location=classpath:/dev/"
    )
    Start-Process -FilePath "mvn.cmd" -ArgumentList $args -WorkingDirectory "$PSScriptRoot" -WindowStyle Normal
    Start-Sleep -Seconds 5
}

Write-Host "All services have been instructed to start in new windows."

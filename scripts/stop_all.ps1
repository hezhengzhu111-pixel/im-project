param()
$containers = @("nacos","nginx","mysql","redis","kafka","im-gateway","im-auth","im-user","im-group","im-message","im-file","im-server","im-frontend")
try {
    foreach ($c in $containers) {
        docker rm -f $c | Out-Null
    }
} catch {
    Write-Host "停止容器失败: $($_.Exception.Message)"
}

# 执行数据库初始化 SQL
$sqlFile = "C:\Users\10954\.openclaw\workspace\new-im-project\backend\sql\mysql8\init_all.sql"
$sqlContent = Get-Content $sqlFile -Raw

Write-Host "正在执行数据库初始化..."

# 逐行执行 SQL（因为 PowerShell 不支持重定向）
$commands = $sqlContent -split ';'

foreach ($cmd in $commands) {
    $cmd = $cmd.Trim()
    if ($cmd.Length -gt 10 -and -not $cmd.StartsWith('SET NAMES')) {
        try {
            $result = docker exec im-mysql mysql -uappuser -papp123456 -e $cmd 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Host "Error executing: $cmd"
                Write-Host $result
            }
        } catch {
            # 忽略警告
        }
    }
}

Write-Host "检查数据库..."
docker exec im-mysql mysql -uappuser -papp123456 -e "SHOW DATABASES;"

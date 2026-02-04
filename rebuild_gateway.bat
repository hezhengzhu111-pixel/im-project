@echo off
REM 编译并重启 IM 服务

echo 1. 停止旧容器
docker rm -f im-gateway 2>nul

echo 2. 编译 Gateway
cd /d %~dp0\backend\gateway
mvn clean package -DskipTests -q

echo 3. 构建 Docker 镜像
cd /d %~dp0
docker-compose -f docker-compose.yml build im-gateway

echo 4. 启动 Gateway
docker-compose -f docker-compose.yml up -d im-gateway

echo 完成！
docker ps | findstr gateway

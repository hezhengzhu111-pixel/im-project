# IM Project

一个基于 Java 微服务和 Vue 3 的即时通讯项目。

## 当前约束

- `auth-service` 是唯一的 Token 服务，负责签发、解析、刷新、吊销和 WebSocket ticket。
- `admin-service` 已从主工程移除，不再参与构建、启动和 CI。
- WebSocket 握手只接受短期一次性 `ticket`，不再支持把 JWT 放到 URL 查询参数中。

## 项目结构

- `backend/`: Spring Boot 微服务与公共模块
- `frontend/`: Vue 3 + Vite 前端
- `.github/workflows/`: 持续集成配置

## 环境变量

复制根目录的 `.env.example`，按你的环境注入这些值:

- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `IM_INTERNAL_SECRET`
- `IM_GATEWAY_AUTH_SECRET`
- `GROUP_SERVICE_DATASOURCE_PASSWORD`
- `MESSAGE_SERVICE_DATASOURCE_PASSWORD`
- `USER_SERVICE_DATASOURCE_PASSWORD`
- `IM_SERVER_DATASOURCE_PASSWORD`

## 本地开发

前端:

```powershell
cd frontend
npm ci
npm run dev
```

后端质量检查:

```powershell
mvn -f backend/pom.xml test
```

前端质量检查:

```powershell
cd frontend
npm run typecheck
npm run test
npm run build
```

批量启动后端服务:

```powershell
pwsh backend/start_all_services.ps1
```

## 常用命令

- `make backend-test`
- `make frontend-typecheck`
- `make frontend-test`
- `make frontend-build`
- `make quality`

## CI

仓库默认质量门禁会执行:

- `mvn -f backend/pom.xml test`
- `npm ci`
- `npm run typecheck`
- `npm run test`
- `npm run build`

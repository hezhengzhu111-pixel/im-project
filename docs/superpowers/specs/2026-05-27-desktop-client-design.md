# Windows / macOS / Linux 桌面客户端设计

**日期**: 2026-05-27
**状态**: 设计完成，待实施

## 概述

为 IM 平台新增 Tauri 桌面客户端，覆盖 Windows、macOS、Linux 三平台。采用「Web 壳 + 原生增强」策略：以现有 Vue 3 Web 应用为基础，通过 Tauri 嵌入 WebView，同时提供系统托盘、全局快捷键、桌面通知、文件拖拽等原生能力。E2EE 走 Rust 原生路径，复用已有 `e2ee-core` crate。

## 技术选型

| 决策项 | 选择 | 理由 |
|---|---|---|
| 框架 | Tauri v2 | 安装包小（5-10MB）、内存低、Rust 后端复用 e2ee-core |
| 集成方式 | 平台适配器模式 | 复用 shared-platform-ports 抽象层，架构清晰 |
| E2EE | Rust 原生 | 直接调用 e2ee-core，性能最优 |
| UI 策略 | 渐进适配 | 先原样嵌入 Web UI，后续迭代桌面专属布局 |
| 目标平台 | Windows + macOS + Linux | Tauri 原生支持 |
| 项目位置 | `frontend/apps/desktop/` | 与 web app 平级，共享 packages/ |

## 项目结构

```
frontend/apps/desktop/
├── src/
│   ├── main.rs                  # Tauri 入口，注册命令、初始化插件
│   ├── commands/                # Tauri IPC 命令
│   │   ├── mod.rs
│   │   ├── e2ee.rs              # E2EE 原生桥接（调用 e2ee-core）
│   │   ├── tray.rs              # 系统托盘操作
│   │   ├── notification.rs      # 原生通知
│   │   ├── shortcut.rs          # 全局快捷键
│   │   ├── storage.rs           # 安全存储（系统 keychain）
│   │   └── file.rs              # 文件拖拽处理
│   ├── plugins/                 # Tauri 插件配置
│   │   ├── tray.rs
│   │   ├── notification.rs
│   │   ├── global_shortcut.rs
│   │   └── deep_link.rs
│   └── e2ee/                    # E2EE 适配层
│       └── mod.rs
├── src-tauri/                   # Tauri 标准配置目录
│   ├── tauri.conf.json
│   ├── Cargo.toml
│   └── icons/
├── adapters/                    # Desktop 平台适配器（TypeScript）
│   ├── storage.adapter.ts       # SecureStoragePort → keychain
│   ├── http.adapter.ts          # HttpClientPort → axios (绝对 URL)
│   ├── notifier.adapter.ts      # NotifierPort → 系统通知
│   ├── lifecycle.adapter.ts     # LifecyclePort → Tauri app state
│   ├── network.adapter.ts       # NetworkStatusPort → 网络状态
│   └── index.ts                 # 统一注册
├── public/
├── index.html
├── vite.config.ts
├── package.json
└── tsconfig.json
```

## Rust 后端设计

### IPC 命令

| 命令 | 职责 |
|---|---|
| `secure_store_get/set/remove` | 读写系统 keychain（替代 localStorage 存储 token） |
| `e2ee_*` 系列 | X3DH 协商、Double Ratchet 加解密、密钥管理 |
| `show_notification` | 调用系统通知 API |
| `get_network_status` | 查询网络连接状态 |
| `pick_file` / `save_file` | 原生文件选择对话框 |

### Tauri 插件

- **tauri-plugin-tray**: 系统托盘（最小化、闪烁、右键菜单）
- **tauri-plugin-global-shortcut**: 全局快捷键注册
- **tauri-plugin-notification**: 原生系统通知 + 点击事件
- **tauri-plugin-network**: 在线/离线监听
- **tauri-plugin-updater**: 自动更新

### Cargo.toml 关键依赖

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-notification = "2"
tauri-plugin-global-shortcut = "2"
tauri-plugin-shell = "2"
e2ee-core = { path = "../e2ee-core" }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
keyring = "3"
```

## 平台适配器设计

每个适配器实现 `shared-platform-ports` 中对应的接口，通过 Tauri `invoke` 桥接到 Rust 后端。

| 适配器 | 实现接口 | 桥接到 |
|---|---|---|
| `storage.adapter.ts` | `SecureStoragePort` | Rust keychain (`keyring` crate) |
| `http.adapter.ts` | `HttpClientPort` | axios（Tauri WebView 支持），base URL 改为绝对地址 |
| `notifier.adapter.ts` | `NotifierPort` | `@tauri-apps/plugin-notification` |
| `lifecycle.adapter.ts` | `LifecyclePort` | `@tauri-apps/api/app` |
| `network.adapter.ts` | `NetworkStatusPort` | `@tauri-apps/plugin-network` |

适配器注册时机：`main.ts` 启动时根据 `isTauri()` 判断注入哪套适配器。

注意：`shared-platform-ports` 部分接口签名与 web 实现有差异（如 `StoragePort` 是同步的，Tauri `invoke` 是异步的）。解决方案是适配器内部做 async 包装，或调整 port 接口为 Promise-based。

## E2EE 集成

### 架构

```
Vue 3 前端 (shared-e2ee-core)
    ↓ invoke("e2ee_xxx")
Tauri Rust Backend
    ↓ 直接调用
e2ee-core crate
```

### 桥接命令

```rust
#[tauri::command]
async fn e2ee_generate_identity() -> Result<IdentityKeyPair, String>
async fn e2ee_encrypt(session_id: &str, plaintext: &[u8]) -> Result<Vec<u8>, String>
async fn e2ee_decrypt(session_id: &str, ciphertext: &[u8]) -> Result<Vec<u8>, String>
async fn e2ee_start_session(user_id: &str, their_identity: &str,
                             their_signed_prekey: &str,
                             their_one_time_prekey: Option<&str>) -> Result<(), String>
```

### 与 shared-e2ee-core 的关系

`shared-e2ee-core` 中的 TypeScript 实现保留作为参考实现和 Web 端回退。桌面端通过条件分支走 Rust 原生路径。会话 Ratchet 状态存储在 Rust 进程内存中，持久化通过 `secure_store` 写入系统 keychain。

## 原生功能

### 系统托盘

- 启动后最小化到托盘（可配置）
- 托盘图标：在线绿色，离线灰色，新消息闪烁
- 左键点击：恢复/隐藏窗口
- 右键菜单：显示窗口、退出、设置
- 窗口关闭时隐藏到托盘而非退出进程

### 桌面通知

- 收到新消息时弹出系统原生通知
- 通知内容：发送者名称 + 消息预览（截断 50 字）
- 点击通知 → 恢复窗口并跳转到对应会话
- 群消息显示群名称 + 发送者
- 可在设置中关闭

### 全局快捷键

- `Ctrl+Alt+M` → 显示/隐藏主窗口
- `Ctrl+Alt+S` → 截屏并发送
- 快捷键配置可自定义，存储在 keychain 中

### 文件拖拽

- 拖拽单个/多个文件到聊天窗口 → 确认后上传发送
- 拖拽图片 → 预览后作为图片消息发送
- 拖拽其他文件 → 作为文件消息发送
- 拖拽文本 → 插入到输入框

## 构建与分发

### 开发

```bash
cd frontend/apps/desktop
npm run tauri dev    # Vite dev server + Tauri 窗口
```

### 生产构建

```bash
npm run tauri build
# Windows: src-tauri/target/release/bundle/msi/NewIM.exe
# macOS:   src-tauri/target/release/bundle/dmg/NewIM.dmg
# Linux:   src-tauri/target/release/bundle/deb/newim.deb
```

### tauri.conf.json 关键配置

```json
{
  "productName": "NewIM",
  "identifier": "com.myhzz.newim.desktop",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:3000",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [{
      "title": "NewIM",
      "width": 1200,
      "height": 800,
      "minWidth": 900,
      "minHeight": 600
    }]
  }
}
```

### 自动更新

使用 `tauri-plugin-updater`，配置更新服务器 URL，客户端启动时检查版本。

### CI/CD

GitHub Actions 矩阵构建三平台产物，复用现有 `.github/workflows/` 结构。

## 范围

### 包含

- Tauri v2 项目脚手架
- 6 个平台适配器（Storage、HTTP、Notifier、Lifecycle、Network、Clock）
- E2EE Rust 原生桥接
- 系统托盘、桌面通知、全局快捷键、文件拖拽
- 三平台构建配置
- 自动更新基础

### 不包含（后续迭代）

- 桌面专属三栏布局（渐进适配，第二阶段）
- 本地 SQLite 消息缓存
- 离线消息队列
- 截屏功能的完整实现
- 快捷键自定义 UI

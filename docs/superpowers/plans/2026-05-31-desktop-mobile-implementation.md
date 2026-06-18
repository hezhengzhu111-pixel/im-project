# Flutter 多端应用实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Flutter Web 应用扩展到桌面端（Windows/macOS/Linux）和移动端（iOS/Android），采用 UI (Dart) + 服务 (Rust) 的混合架构

**Architecture:** Flutter Desktop/Mobile UI + Rust 服务层，通过 Flutter Rust Bridge 桥接。Rust 负责 E2EE、网络、存储等核心服务，Dart 负责 UI 渲染和状态管理。

**Tech Stack:** Flutter, Dart, Rust, flutter_rust_bridge, reqwest, tokio, rusqlite, e2ee-core

---

## 文件结构映射

### Rust 服务层文件

| 文件 | 职责 | 状态 |
|------|------|------|
| `flutter/native/rust/src/api/mod.rs` | 模块导出 | 修改 |
| `flutter/native/rust/src/api/network.rs` | 网络服务 | 新建 |
| `flutter/native/rust/src/api/storage.rs` | 本地存储 | 新建 |
| `flutter/native/rust/src/api/sync.rs` | 多端同步 | 新建 |
| `flutter/native/rust/src/api/secure_storage.rs` | 安全存储 | 新建 |
| `flutter/native/rust/Cargo.toml` | 依赖配置 | 修改 |

### 桌面端应用文件

| 文件 | 职责 | 状态 |
|------|------|------|
| `flutter/apps/desktop/pubspec.yaml` | 依赖配置 | 新建 |
| `flutter/apps/desktop/lib/main.dart` | 入口文件 | 新建 |
| `flutter/apps/desktop/lib/app.dart` | 应用组件 | 新建 |
| `flutter/apps/desktop/lib/adapters/desktop_network_adapter.dart` | 网络适配器 | 新建 |
| `flutter/apps/desktop/lib/adapters/desktop_storage_adapter.dart` | 存储适配器 | 新建 |
| `flutter/apps/desktop/lib/adapters/desktop_e2ee_adapter.dart` | E2EE 适配器 | 新建 |

### 移动端应用文件

| 文件 | 职责 | 状态 |
|------|------|------|
| `flutter/apps/mobile/pubspec.yaml` | 依赖配置 | 新建 |
| `flutter/apps/mobile/lib/main.dart` | 入口文件 | 新建 |
| `flutter/apps/mobile/lib/app.dart` | 应用组件 | 新建 |
| `flutter/apps/mobile/lib/adapters/mobile_network_adapter.dart` | 网络适配器 | 新建 |
| `flutter/apps/mobile/lib/adapters/mobile_storage_adapter.dart` | 存储适配器 | 新建 |
| `flutter/apps/mobile/lib/adapters/mobile_file_picker_adapter.dart` | 文件选择适配器 | 新建 |

---

## Task 1: 扩展 Rust 工作空间配置

**Files:**
- Create: `flutter/Cargo.toml`
- Modify: `flutter/native/rust/Cargo.toml`

- [ ] **Step 1: 创建 Rust 工作空间配置**

```toml
# flutter/Cargo.toml
[workspace]
members = ["native/rust"]
resolver = "2"
```

- [ ] **Step 2: 更新 Rust 桥接库依赖**

```toml
# flutter/native/rust/Cargo.toml
[package]
name = "im-rust-bridge"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "staticlib"]

[dependencies]
flutter_rust_bridge = "=2.12.0"
e2ee-core = { path = "../../../backend/e2ee-core" }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
bincode = "1"
anyhow = "1"
base64 = "0.22"
sha2 = "0.10"
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.11", features = ["json", "rustls-tls"] }
rusqlite = { version = "0.28", features = ["bundled"] }
keyring = "2"
aes-gcm = "0.10"
zeroize = "1"
uuid = { version = "1", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
lru = "0.11"
tokio-tungstenite = { version = "0.20", features = ["native-tls"] }
futures-util = "0.3"
```

- [ ] **Step 3: 验证 Cargo 配置**

Run: `cd flutter && cargo check --workspace`
Expected: 成功编译（可能有警告，但无错误）

- [ ] **Step 4: 提交**

```bash
git add flutter/Cargo.toml flutter/native/rust/Cargo.toml
git commit -m "feat: setup Rust workspace for desktop/mobile"
```

---

## Task 2: 实现 Rust 网络服务

**Files:**
- Create: `flutter/native/rust/src/api/network.rs`
- Modify: `flutter/native/rust/src/api/mod.rs`

- [ ] **Step 1: 创建网络服务模块**

```rust
// flutter/native/rust/src/api/network.rs

use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use std::sync::Arc;

/// HTTP 响应结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
}

/// 网络服务
pub struct NetworkService {
    base_url: String,
    auth_token: Arc<RwLock<Option<String>>>,
    http_client: reqwest::Client,
}

impl NetworkService {
    /// 创建新的网络服务实例
    pub fn new(base_url: String) -> Self {
        let http_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            base_url,
            auth_token: Arc::new(RwLock::new(None)),
            http_client,
        }
    }

    /// 设置认证令牌
    pub async fn set_auth_token(&self, token: Option<String>) {
        let mut auth_token = self.auth_token.write().await;
        *auth_token = token;
    }

    /// 获取认证令牌
    async fn get_auth_header(&self) -> Option<String> {
        let token = self.auth_token.read().await;
        token.clone().map(|t| format!("Bearer {}", t))
    }

    /// 发送 GET 请求
    pub async fn get(
        &self,
        path: String,
        query_params: Option<HashMap<String, String>>,
    ) -> Result<HttpResponse, String> {
        let url = format!("{}{}", self.base_url, path);
        
        let mut request = self.http_client.get(&url);
        
        if let Some(auth) = self.get_auth_header().await {
            request = request.header("Authorization", auth);
        }
        
        if let Some(params) = query_params {
            request = request.query(&params);
        }
        
        let response = request.send().await.map_err(|e| e.to_string())?;
        self.parse_response(response).await
    }

    /// 发送 POST 请求
    pub async fn post(
        &self,
        path: String,
        body: Option<Vec<u8>>,
    ) -> Result<HttpResponse, String> {
        let url = format!("{}{}", self.base_url, path);
        
        let mut request = self.http_client.post(&url);
        
        if let Some(auth) = self.get_auth_header().await {
            request = request.header("Authorization", auth);
        }
        
        if let Some(body) = body {
            request = request
                .header("Content-Type", "application/json")
                .body(body);
        }
        
        let response = request.send().await.map_err(|e| e.to_string())?;
        self.parse_response(response).await
    }

    /// 发送 PUT 请求
    pub async fn put(
        &self,
        path: String,
        body: Option<Vec<u8>>,
    ) -> Result<HttpResponse, String> {
        let url = format!("{}{}", self.base_url, path);
        
        let mut request = self.http_client.put(&url);
        
        if let Some(auth) = self.get_auth_header().await {
            request = request.header("Authorization", auth);
        }
        
        if let Some(body) = body {
            request = request
                .header("Content-Type", "application/json")
                .body(body);
        }
        
        let response = request.send().await.map_err(|e| e.to_string())?;
        self.parse_response(response).await
    }

    /// 发送 DELETE 请求
    pub async fn delete(&self, path: String) -> Result<HttpResponse, String> {
        let url = format!("{}{}", self.base_url, path);
        
        let mut request = self.http_client.delete(&url);
        
        if let Some(auth) = self.get_auth_header().await {
            request = request.header("Authorization", auth);
        }
        
        let response = request.send().await.map_err(|e| e.to_string())?;
        self.parse_response(response).await
    }

    /// 解析 HTTP 响应
    async fn parse_response(&self, response: reqwest::Response) -> Result<HttpResponse, String> {
        let status = response.status().as_u16();
        
        let mut headers = HashMap::new();
        for (key, value) in response.headers() {
            if let Ok(v) = value.to_str() {
                headers.insert(key.to_string(), v.to_string());
            }
        }
        
        let body = response.bytes().await.map_err(|e| e.to_string())?.to_vec();
        
        Ok(HttpResponse {
            status,
            headers,
            body,
        })
    }
}
```

- [ ] **Step 2: 更新模块导出**

```rust
// flutter/native/rust/src/api/mod.rs

mod e2ee;
mod network;

pub use e2ee::*;
pub use network::*;
```

- [ ] **Step 3: 编译验证**

Run: `cd flutter/native/rust && cargo check`
Expected: 成功编译

- [ ] **Step 4: 提交**

```bash
git add flutter/native/rust/src/api/network.rs flutter/native/rust/src/api/mod.rs
git commit -m "feat: implement Rust network service"
```

---

## Task 3: 实现 Rust 本地存储

**Files:**
- Create: `flutter/native/rust/src/api/storage.rs`
- Modify: `flutter/native/rust/src/api/mod.rs`

- [ ] **Step 1: 创建存储服务模块**

```rust
// flutter/native/rust/src/api/storage.rs

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

/// 消息结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub content: String,
    pub sender_id: String,
    pub timestamp: i64,
    pub message_type: String,
    pub media_url: Option<String>,
    pub thumbnail_url: Option<String>,
}

/// 会话结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub target_id: String,
    pub target_name: String,
    pub target_avatar: Option<String>,
    pub last_message: Option<Message>,
    pub unread_count: i32,
    pub conversation_type: String,
}

/// 联系人结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Contact {
    pub id: String,
    pub user_id: String,
    pub nickname: String,
    pub avatar: Option<String>,
    pub status: String,
}

/// 本地存储服务
pub struct LocalStorage {
    db: Mutex<Connection>,
}

impl LocalStorage {
    /// 创建新的本地存储实例
    pub fn new(db_path: String) -> Result<Self, String> {
        let db = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;
        
        // 创建表
        db.execute_batch(
            "CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                content TEXT NOT NULL,
                sender_id TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                message_type TEXT NOT NULL,
                media_url TEXT,
                thumbnail_url TEXT
            );
            
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                target_id TEXT NOT NULL,
                target_name TEXT NOT NULL,
                target_avatar TEXT,
                unread_count INTEGER DEFAULT 0,
                conversation_type TEXT NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS contacts (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                nickname TEXT NOT NULL,
                avatar TEXT,
                status TEXT NOT NULL
            );"
        ).map_err(|e| format!("Failed to create tables: {}", e))?;
        
        Ok(Self {
            db: Mutex::new(db),
        })
    }
    
    /// 保存消息
    pub fn save_message(&self, message: Message) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        
        db.execute(
            "INSERT OR REPLACE INTO messages (id, session_id, content, sender_id, timestamp, message_type, media_url, thumbnail_url) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                message.id,
                message.session_id,
                message.content,
                message.sender_id,
                message.timestamp,
                message.message_type,
                message.media_url,
                message.thumbnail_url,
            ],
        ).map_err(|e| format!("Failed to save message: {}", e))?;
        
        Ok(())
    }
    
    /// 获取消息
    pub fn get_messages(
        &self,
        session_id: String,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Message>, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        
        let mut stmt = db.prepare(
            "SELECT id, session_id, content, sender_id, timestamp, message_type, media_url, thumbnail_url 
             FROM messages WHERE session_id = ?1 ORDER BY timestamp DESC LIMIT ?2 OFFSET ?3"
        ).map_err(|e| format!("Failed to prepare statement: {}", e))?;
        
        let messages = stmt.query_map(params![session_id, limit, offset], |row| {
            Ok(Message {
                id: row.get(0)?,
                session_id: row.get(1)?,
                content: row.get(2)?,
                sender_id: row.get(3)?,
                timestamp: row.get(4)?,
                message_type: row.get(5)?,
                media_url: row.get(6)?,
                thumbnail_url: row.get(7)?,
            })
        }).map_err(|e| format!("Failed to query messages: {}", e))?
          .collect::<Result<Vec<_>, _>>()
          .map_err(|e| format!("Failed to collect messages: {}", e))?;
        
        Ok(messages)
    }
    
    /// 保存会话
    pub fn save_session(&self, session: Session) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        
        db.execute(
            "INSERT OR REPLACE INTO sessions (id, target_id, target_name, target_avatar, unread_count, conversation_type) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                session.id,
                session.target_id,
                session.target_name,
                session.target_avatar,
                session.unread_count,
                session.conversation_type,
            ],
        ).map_err(|e| format!("Failed to save session: {}", e))?;
        
        Ok(())
    }
    
    /// 获取会话
    pub fn get_sessions(&self) -> Result<Vec<Session>, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        
        let mut stmt = db.prepare(
            "SELECT id, target_id, target_name, target_avatar, unread_count, conversation_type 
             FROM sessions"
        ).map_err(|e| format!("Failed to prepare statement: {}", e))?;
        
        let sessions = stmt.query_map([], |row| {
            Ok(Session {
                id: row.get(0)?,
                target_id: row.get(1)?,
                target_name: row.get(2)?,
                target_avatar: row.get(3)?,
                last_message: None,
                unread_count: row.get(4)?,
                conversation_type: row.get(5)?,
            })
        }).map_err(|e| format!("Failed to query sessions: {}", e))?
          .collect::<Result<Vec<_>, _>>()
          .map_err(|e| format!("Failed to collect sessions: {}", e))?;
        
        Ok(sessions)
    }
    
    /// 保存联系人
    pub fn save_contact(&self, contact: Contact) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        
        db.execute(
            "INSERT OR REPLACE INTO contacts (id, user_id, nickname, avatar, status) 
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                contact.id,
                contact.user_id,
                contact.nickname,
                contact.avatar,
                contact.status,
            ],
        ).map_err(|e| format!("Failed to save contact: {}", e))?;
        
        Ok(())
    }
    
    /// 获取联系人
    pub fn get_contacts(&self) -> Result<Vec<Contact>, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        
        let mut stmt = db.prepare(
            "SELECT id, user_id, nickname, avatar, status FROM contacts"
        ).map_err(|e| format!("Failed to prepare statement: {}", e))?;
        
        let contacts = stmt.query_map([], |row| {
            Ok(Contact {
                id: row.get(0)?,
                user_id: row.get(1)?,
                nickname: row.get(2)?,
                avatar: row.get(3)?,
                status: row.get(4)?,
            })
        }).map_err(|e| format!("Failed to query contacts: {}", e))?
          .collect::<Result<Vec<_>, _>>()
          .map_err(|e| format!("Failed to collect contacts: {}", e))?;
        
        Ok(contacts)
    }
    
    /// 批量保存消息
    pub fn batch_save_messages(&self, messages: Vec<Message>) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        
        let transaction = db.transaction().map_err(|e| format!("Failed to start transaction: {}", e))?;
        
        for message in messages {
            transaction.execute(
                "INSERT OR REPLACE INTO messages (id, session_id, content, sender_id, timestamp, message_type, media_url, thumbnail_url) 
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    message.id,
                    message.session_id,
                    message.content,
                    message.sender_id,
                    message.timestamp,
                    message.message_type,
                    message.media_url,
                    message.thumbnail_url,
                ],
            ).map_err(|e| format!("Failed to insert message: {}", e))?;
        }
        
        transaction.commit().map_err(|e| format!("Failed to commit transaction: {}", e))?;
        
        Ok(())
    }
    
    /// 清空缓存
    pub fn clear_cache(&self) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;
        
        db.execute("DELETE FROM messages", []).map_err(|e| e.to_string())?;
        db.execute("DELETE FROM sessions", []).map_err(|e| e.to_string())?;
        db.execute("DELETE FROM contacts", []).map_err(|e| e.to_string())?;
        
        Ok(())
    }
}
```

- [ ] **Step 2: 更新模块导出**

```rust
// flutter/native/rust/src/api/mod.rs

mod e2ee;
mod network;
mod storage;

pub use e2ee::*;
pub use network::*;
pub use storage::*;
```

- [ ] **Step 3: 编译验证**

Run: `cd flutter/native/rust && cargo check`
Expected: 成功编译

- [ ] **Step 4: 提交**

```bash
git add flutter/native/rust/src/api/storage.rs flutter/native/rust/src/api/mod.rs
git commit -m "feat: implement Rust local storage service"
```

---

## Task 4: 实现 Rust 安全存储

**Files:**
- Create: `flutter/native/rust/src/api/secure_storage.rs`
- Modify: `flutter/native/rust/src/api/mod.rs`

- [ ] **Step 1: 创建安全存储模块**

```rust
// flutter/native/rust/src/api/secure_storage.rs

use keyring::Entry;
use aes_gcm::{Aes256Gcm, Key, Nonce};
use aes_gcm::aead::{Aead, NewAead};
use zeroize::Zeroize;

/// 安全存储服务
pub struct SecureKeyStore {
    service_name: String,
}

impl SecureKeyStore {
    /// 创建新的安全存储实例
    pub fn new(service_name: &str) -> Self {
        Self {
            service_name: service_name.to_string(),
        }
    }
    
    /// 从操作系统安全存储获取主密钥
    pub fn get_master_key(&self) -> Result<Vec<u8>, String> {
        let entry = Entry::new(&self.service_name, "master_key")
            .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
        
        let password = entry.get_password()
            .map_err(|e| format!("Failed to get master key: {}", e))?;
        
        Ok(password.into_bytes())
    }
    
    /// 保存主密钥到操作系统安全存储
    pub fn set_master_key(&self, key: &[u8]) -> Result<(), String> {
        let entry = Entry::new(&self.service_name, "master_key")
            .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
        
        entry.set_password(&String::from_utf8_lossy(key))
            .map_err(|e| format!("Failed to set master key: {}", e))?;
        
        Ok(())
    }
    
    /// 加密敏感数据
    pub fn encrypt(&self, data: &[u8], master_key: &[u8]) -> Result<Vec<u8>, String> {
        let key = Key::from_slice(master_key);
        let cipher = Aes256Gcm::new(key);
        
        // 生成随机 nonce
        let mut nonce_bytes = [0u8; 12];
        use rand_core::RngCore;
        let mut rng = rand_core::OsRng;
        rng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        
        let mut ciphertext = cipher.encrypt(nonce, data)
            .map_err(|e| format!("Encryption failed: {}", e))?;
        
        // 将 nonce 添加到密文前面
        let mut result = nonce_bytes.to_vec();
        result.append(&mut ciphertext);
        
        Ok(result)
    }
    
    /// 解密敏感数据
    pub fn decrypt(&self, ciphertext: &[u8], master_key: &[u8]) -> Result<Vec<u8>, String> {
        if ciphertext.len() < 12 {
            return Err("Invalid ciphertext".to_string());
        }
        
        let key = Key::from_slice(master_key);
        let cipher = Aes256Gcm::new(key);
        
        // 提取 nonce
        let nonce = Nonce::from_slice(&ciphertext[..12]);
        let actual_ciphertext = &ciphertext[12..];
        
        let plaintext = cipher.decrypt(nonce, actual_ciphertext)
            .map_err(|e| format!("Decryption failed: {}", e))?;
        
        Ok(plaintext)
    }
    
    /// 安全删除密钥
    pub fn delete_master_key(&self) -> Result<(), String> {
        let entry = Entry::new(&self.service_name, "master_key")
            .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
        
        entry.delete_password()
            .map_err(|e| format!("Failed to delete master key: {}", e))?;
        
        Ok(())
    }
}

/// 安全内存缓冲区
pub struct SecureBuffer {
    data: Vec<u8>,
}

impl SecureBuffer {
    /// 创建新的安全缓冲区
    pub fn new(data: Vec<u8>) -> Self {
        Self { data }
    }
    
    /// 安全清零内存
    pub fn secure_zero(&mut self) {
        self.data.zeroize();
    }
    
    /// 获取数据引用
    pub fn data(&self) -> &[u8] {
        &self.data
    }
}

impl Drop for SecureBuffer {
    fn drop(&mut self) {
        self.secure_zero();
    }
}
```

- [ ] **Step 2: 更新模块导出**

```rust
// flutter/native/rust/src/api/mod.rs

mod e2ee;
mod network;
mod storage;
mod secure_storage;

pub use e2ee::*;
pub use network::*;
pub use storage::*;
pub use secure_storage::*;
```

- [ ] **Step 3: 编译验证**

Run: `cd flutter/native/rust && cargo check`
Expected: 成功编译

- [ ] **Step 4: 提交**

```bash
git add flutter/native/rust/src/api/secure_storage.rs flutter/native/rust/src/api/mod.rs
git commit -m "feat: implement Rust secure storage service"
```

---

## Task 5: 生成 Flutter Rust Bridge 绑定

**Files:**
- Modify: `flutter/native/rust/flutter_rust_bridge.yaml`

- [ ] **Step 1: 更新 FRB 配置**

```yaml
# flutter/native/rust/flutter_rust_bridge.yaml
rust_input: crate::api
rust_root: native/rust/
dart_output: packages/core/lib/src/generated
```

- [ ] **Step 2: 生成绑定**

Run: `cd flutter && flutter_rust_bridge_codegen generate`
Expected: 成功生成 Dart 绑定文件

- [ ] **Step 3: 验证生成的文件**

Run: `ls flutter/packages/core/lib/src/generated/`
Expected: 看到 frb_generated.dart 等文件

- [ ] **Step 4: 提交**

```bash
git add flutter/packages/core/lib/src/generated/
git commit -m "feat: generate Flutter Rust Bridge bindings"
```

---

## Task 6: 创建桌面端应用框架

**Files:**
- Create: `flutter/apps/desktop/pubspec.yaml`
- Create: `flutter/apps/desktop/lib/main.dart`
- Create: `flutter/apps/desktop/lib/app.dart`

- [ ] **Step 1: 创建 pubspec.yaml**

```yaml
# flutter/apps/desktop/pubspec.yaml
name: im_desktop
description: IM Desktop Application
version: 0.1.0
publish_to: none

environment:
  sdk: '>=3.3.0 <4.0.0'

flutter:
  uses-material-design: true

dependencies:
  flutter:
    sdk: flutter
  flutter_localizations:
    sdk: flutter
  im_core:
    path: ../../packages/core
  im_ui:
    path: ../../packages/ui
  flutter_riverpod: ^2.4.9
  go_router: ^13.0.0
  dio: ^5.4.0
  freezed_annotation: ^2.4.1
  json_annotation: ^4.8.1
  intl: ">=0.19.0 <0.21.0"

dev_dependencies:
  flutter_test:
    sdk: flutter
  build_runner: ^2.4.8
  freezed: ^2.4.5
  json_serializable: ^6.7.1
  very_good_analysis: ^5.1.0
```

- [ ] **Step 2: 创建 main.dart**

```dart
// flutter/apps/desktop/lib/main.dart

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'app.dart';
import 'adapters/desktop_network_adapter.dart';
import 'adapters/desktop_storage_adapter.dart';
import 'adapters/desktop_e2ee_adapter.dart';
import 'core/di/platform_providers.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  
  const apiBase = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8082',
  );
  
  final networkService = DesktopNetworkService(baseUrl: apiBase);
  final storageService = DesktopStorageService();
  final e2eeService = DesktopE2eeService();
  
  runApp(ProviderScope(
    overrides: [
      // 平台能力适配器
      filePickerPortProvider.overrideWithValue(DesktopFilePickerAdapter()),
      notificationPortProvider.overrideWithValue(DesktopNotificationAdapter()),
      clipboardPortProvider.overrideWithValue(DesktopClipboardAdapter()),
      sharePortProvider.overrideWithValue(DesktopShareAdapter()),
      audioRecorderPortProvider.overrideWithValue(DesktopAudioRecorderAdapter()),
      // 网络和存储适配器
      httpClientProvider.overrideWithValue(networkService),
      storageProvider.overrideWithValue(storageService),
      secureStorageProvider.overrideWithValue(DesktopSecureStorageAdapter()),
      // E2EE 适配器
      e2eeAdapterProvider.overrideWithValue(e2eeService),
    ],
    child: const App(),
  ));
}
```

- [ ] **Step 3: 创建 app.dart**

```dart
// flutter/apps/desktop/lib/app.dart

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_ui/im_ui.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';

class App extends ConsumerWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final locale = ref.watch(languageProvider);
    final themeMode = ref.watch(themeModeProvider);

    return MaterialApp.router(
      title: 'IM Desktop',
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: themeMode,
      locale: Locale(locale),
      routerConfig: router,
      builder: (context, child) {
        return BreakpointScope(
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
  }
}
```

- [ ] **Step 4: 验证编译**

Run: `cd flutter/apps/desktop && flutter pub get && flutter analyze`
Expected: 无错误

- [ ] **Step 5: 提交**

```bash
git add flutter/apps/desktop/
git commit -m "feat: create desktop app framework"
```

---

## Task 7: 实现桌面端网络适配器

**Files:**
- Create: `flutter/apps/desktop/lib/adapters/desktop_network_adapter.dart`
- Create: `flutter/apps/desktop/lib/core/di/platform_providers.dart`

- [ ] **Step 1: 创建网络适配器**

```dart
// flutter/apps/desktop/lib/adapters/desktop_network_adapter.dart

import 'dart:convert';
import 'package:im_core/core.dart';
import 'package:im_core/src/generated/frb_generated.dart' as frb;

class DesktopNetworkService implements HttpClientPort {
  final String baseUrl;
  String? _authToken;

  DesktopNetworkService({required this.baseUrl});

  @override
  void setAuthToken(String? token) {
    _authToken = token;
  }

  @override
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final queryString = queryParameters != null
        ? '?${Uri(queryParameters: queryParameters).query}'
        : '';
    
    final response = await frb.networkGet(
      path: '$path$queryString',
      authToken: _authToken,
    );
    
    return _parseResponse(response, fromJson);
  }

  @override
  Future<ApiResponse<T>> post<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final bodyBytes = body != null ? utf8.encode(jsonEncode(body)) : null;
    
    final response = await frb.networkPost(
      path: path,
      body: bodyBytes,
      authToken: _authToken,
    );
    
    return _parseResponse(response, fromJson);
  }

  @override
  Future<ApiResponse<T>> put<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final bodyBytes = body != null ? utf8.encode(jsonEncode(body)) : null;
    
    final response = await frb.networkPut(
      path: path,
      body: bodyBytes,
      authToken: _authToken,
    );
    
    return _parseResponse(response, fromJson);
  }

  @override
  Future<ApiResponse<T>> delete<T>(
    String path, {
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final response = await frb.networkDelete(
      path: path,
      authToken: _authToken,
    );
    
    return _parseResponse(response, fromJson);
  }

  ApiResponse<T> _parseResponse<T>(
    frb.HttpResponse response,
    T Function(Map<String, dynamic>) fromJson,
  ) {
    final json = jsonDecode(utf8.decode(response.body));
    final data = json['data'];
    
    return ApiResponse<T>(
      code: response.status,
      message: json['message'] ?? '',
      data: fromJson(data),
    );
  }
}
```

- [ ] **Step 2: 创建平台 providers**

```dart
// flutter/apps/desktop/lib/core/di/platform_providers.dart

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';

// 平台能力 Providers
final filePickerPortProvider = Provider<FilePickerPort>((ref) {
  throw UnimplementedError('filePickerPortProvider must be overridden');
});

final notificationPortProvider = Provider<NotificationPort>((ref) {
  throw UnimplementedError('notificationPortProvider must be overridden');
});

final clipboardPortProvider = Provider<ClipboardPort>((ref) {
  throw UnimplementedError('clipboardPortProvider must be overridden');
});

final sharePortProvider = Provider<SharePort>((ref) {
  throw UnimplementedError('sharePortProvider must be overridden');
});

final audioRecorderPortProvider = Provider<AudioRecorderPort>((ref) {
  throw UnimplementedError('audioRecorderPortProvider must be overridden');
});

// 网络和存储 Providers
final httpClientProvider = Provider<HttpClientPort>((ref) {
  throw UnimplementedError('httpClientProvider must be overridden');
});

final storageProvider = Provider<StoragePort>((ref) {
  throw UnimplementedError('storageProvider must be overridden');
});

final secureStorageProvider = Provider<SecureStoragePort>((ref) {
  throw UnimplementedError('secureStorageProvider must be overridden');
});

// E2EE Provider
final e2eeAdapterProvider = Provider<E2eeBridge>((ref) {
  throw UnimplementedError('e2eeAdapterProvider must be overridden');
});

// 语言和主题 Providers
final languageProvider = StateProvider<String>((ref) => 'zh');
final themeModeProvider = StateProvider<ThemeMode>((ref) => ThemeMode.system);
```

- [ ] **Step 3: 验证编译**

Run: `cd flutter/apps/desktop && flutter analyze`
Expected: 无错误

- [ ] **Step 4: 提交**

```bash
git add flutter/apps/desktop/lib/adapters/ flutter/apps/desktop/lib/core/
git commit -m "feat: implement desktop network adapter"
```

---

## Task 8: 实现桌面端存储适配器

**Files:**
- Create: `flutter/apps/desktop/lib/adapters/desktop_storage_adapter.dart`

- [ ] **Step 1: 创建存储适配器**

```dart
// flutter/apps/desktop/lib/adapters/desktop_storage_adapter.dart

import 'package:im_core/core.dart';
import 'package:im_core/src/generated/frb_generated.dart' as frb;

class DesktopStorageService implements StoragePort {
  final _storage = frb.LocalStorage();

  @override
  Future<String?> getString(String key) async {
    try {
      final result = await _storage.getString(key: key);
      return result;
    } catch (e) {
      return null;
    }
  }

  @override
  Future<void> setString(String key, String value) async {
    await _storage.setString(key: key, value: value);
  }

  @override
  Future<void> remove(String key) async {
    await _storage.remove(key: key);
  }

  @override
  Future<void> clear() async {
    await _storage.clear();
  }

  @override
  Future<bool> containsKey(String key) async {
    try {
      final result = await _storage.getString(key: key);
      return result != null;
    } catch (e) {
      return false;
    }
  }
}

class DesktopSecureStorageAdapter implements SecureStoragePort {
  @override
  Future<String?> read(String key) async {
    try {
      final result = await frb.secureStorageRead(key: key);
      return result;
    } catch (e) {
      return null;
    }
  }

  @override
  Future<void> write(String key, String value) async {
    await frb.secureStorageWrite(key: key, value: value);
  }

  @override
  Future<void> delete(String key) async {
    await frb.secureStorageDelete(key: key);
  }

  @override
  Future<void> deleteAll() async {
    await frb.secureStorageDeleteAll();
  }

  @override
  Future<bool> containsKey(String key) async {
    try {
      final result = await frb.secureStorageRead(key: key);
      return result != null;
    } catch (e) {
      return false;
    }
  }
}
```

- [ ] **Step 2: 验证编译**

Run: `cd flutter/apps/desktop && flutter analyze`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add flutter/apps/desktop/lib/adapters/desktop_storage_adapter.dart
git commit -m "feat: implement desktop storage adapter"
```

---

## Task 9: 实现桌面端 E2EE 适配器

**Files:**
- Create: `flutter/apps/desktop/lib/adapters/desktop_e2ee_adapter.dart`

- [ ] **Step 1: 创建 E2EE 适配器**

```dart
// flutter/apps/desktop/lib/adapters/desktop_e2ee_adapter.dart

import 'dart:typed_data';
import 'package:im_core/core.dart';
import 'package:im_core/src/generated/frb_generated.dart' as frb;

class DesktopE2eeService implements E2eeBridge {
  @override
  Future<Uint8List> generateKeyBundle(int otkCount) async {
    return await frb.e2eeGenerateKeyBundle(otkCount: otkCount);
  }

  @override
  Future<Uint8List> x3dhInitiate(
    Uint8List identityKey,
    Uint8List signedPreKey,
    Uint8List? oneTimePreKey,
  ) async {
    return await frb.e2eeX3dhInitiate(
      identityKey: identityKey,
      signedPreKey: signedPreKey,
      oneTimePreKey: oneTimePreKey,
    );
  }

  @override
  Future<Uint8List> x3dhRespond(
    Uint8List identityKey,
    Uint8List ephemeralKey,
    Uint8List signedPreKey,
    Uint8List? oneTimePreKey,
  ) async {
    return await frb.e2eeX3dhRespond(
      identityKey: identityKey,
      ephemeralKey: ephemeralKey,
      signedPreKey: signedPreKey,
      oneTimePreKey: oneTimePreKey,
    );
  }

  @override
  Future<(Uint8List, Uint8List)> ratchetEncrypt(
    Uint8List state,
    Uint8List plaintext,
  ) async {
    return await frb.e2eeRatchetEncrypt(
      state: state,
      plaintext: plaintext,
    );
  }

  @override
  Future<(Uint8List, Uint8List)> ratchetDecrypt(
    Uint8List state,
    Uint8List ciphertext,
  ) async {
    return await frb.e2eeRatchetDecrypt(
      state: state,
      ciphertext: ciphertext,
    );
  }

  @override
  Future<Uint8List> exportState(Uint8List state) async {
    return await frb.e2eeExportState(state: state);
  }

  @override
  Future<Uint8List> restoreState(Uint8List state) async {
    return await frb.e2eeRestoreState(state: state);
  }
}
```

- [ ] **Step 2: 验证编译**

Run: `cd flutter/apps/desktop && flutter analyze`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add flutter/apps/desktop/lib/adapters/desktop_e2ee_adapter.dart
git commit -m "feat: implement desktop E2EE adapter"
```

---

## Task 10: 创建移动端应用框架

**Files:**
- Create: `flutter/apps/mobile/pubspec.yaml`
- Create: `flutter/apps/mobile/lib/main.dart`
- Create: `flutter/apps/mobile/lib/app.dart`

- [ ] **Step 1: 创建 pubspec.yaml**

```yaml
# flutter/apps/mobile/pubspec.yaml
name: im_mobile
description: IM Mobile Application
version: 0.1.0
publish_to: none

environment:
  sdk: '>=3.3.0 <4.0.0'

flutter:
  uses-material-design: true

dependencies:
  flutter:
    sdk: flutter
  flutter_localizations:
    sdk: flutter
  im_core:
    path: ../../packages/core
  im_ui:
    path: ../../packages/ui
  flutter_riverpod: ^2.4.9
  go_router: ^13.0.0
  dio: ^5.4.0
  freezed_annotation: ^2.4.1
  json_annotation: ^4.8.1
  intl: ">=0.19.0 <0.21.0"
  image_picker: ^1.0.4
  file_picker: ^6.1.1
  share_plus: ^7.2.1
  flutter_local_notifications: ^16.1.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  build_runner: ^2.4.8
  freezed: ^2.4.5
  json_serializable: ^6.7.1
  very_good_analysis: ^5.1.0
```

- [ ] **Step 2: 创建 main.dart**

```dart
// flutter/apps/mobile/lib/main.dart

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'app.dart';
import 'adapters/mobile_network_adapter.dart';
import 'adapters/mobile_storage_adapter.dart';
import 'adapters/mobile_file_picker_adapter.dart';
import 'core/di/platform_providers.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  
  const apiBase = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8082',
  );
  
  final networkService = MobileNetworkService(baseUrl: apiBase);
  final storageService = MobileStorageService();
  
  runApp(ProviderScope(
    overrides: [
      // 平台能力适配器
      filePickerPortProvider.overrideWithValue(MobileFilePickerAdapter()),
      notificationPortProvider.overrideWithValue(MobileNotificationAdapter()),
      clipboardPortProvider.overrideWithValue(MobileClipboardAdapter()),
      sharePortProvider.overrideWithValue(MobileShareAdapter()),
      audioRecorderPortProvider.overrideWithValue(MobileAudioRecorderAdapter()),
      // 网络和存储适配器
      httpClientProvider.overrideWithValue(networkService),
      storageProvider.overrideWithValue(storageService),
      secureStorageProvider.overrideWithValue(MobileSecureStorageAdapter()),
      // E2EE 适配器
      e2eeAdapterProvider.overrideWithValue(MobileE2eeService()),
    ],
    child: const App(),
  ));
}
```

- [ ] **Step 3: 创建 app.dart**

```dart
// flutter/apps/mobile/lib/app.dart

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_ui/im_ui.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';

class App extends ConsumerWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final locale = ref.watch(languageProvider);
    final themeMode = ref.watch(themeModeProvider);

    return MaterialApp.router(
      title: 'IM Mobile',
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: themeMode,
      locale: Locale(locale),
      routerConfig: router,
      builder: (context, child) {
        return BreakpointScope(
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
  }
}
```

- [ ] **Step 4: 验证编译**

Run: `cd flutter/apps/mobile && flutter pub get && flutter analyze`
Expected: 无错误

- [ ] **Step 5: 提交**

```bash
git add flutter/apps/mobile/
git commit -m "feat: create mobile app framework"
```

---

## Task 11: 实现移动端网络适配器

**Files:**
- Create: `flutter/apps/mobile/lib/adapters/mobile_network_adapter.dart`
- Create: `flutter/apps/mobile/lib/core/di/platform_providers.dart`

- [ ] **Step 1: 创建网络适配器**

```dart
// flutter/apps/mobile/lib/adapters/mobile_network_adapter.dart

import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:im_core/core.dart';

class MobileNetworkService implements HttpClientPort {
  late final Dio _dio;
  String? _authToken;

  MobileNetworkService({required String baseUrl}) {
    _dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 30),
    ));
    
    _dio.interceptors.add(AuthInterceptor());
    _dio.interceptors.add(LogInterceptor(
      requestBody: true,
      responseBody: true,
    ));
  }

  @override
  void setAuthToken(String? token) {
    _authToken = token;
  }

  @override
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final response = await _dio.get<Map<String, dynamic>>(
      path,
      queryParameters: queryParameters,
      options: _getOptions(),
    );
    
    return _parseResponse(response, fromJson);
  }

  @override
  Future<ApiResponse<T>> post<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      path,
      data: body,
      options: _getOptions(),
    );
    
    return _parseResponse(response, fromJson);
  }

  @override
  Future<ApiResponse<T>> put<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final response = await _dio.put<Map<String, dynamic>>(
      path,
      data: body,
      options: _getOptions(),
    );
    
    return _parseResponse(response, fromJson);
  }

  @override
  Future<ApiResponse<T>> delete<T>(
    String path, {
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final response = await _dio.delete<Map<String, dynamic>>(
      path,
      options: _getOptions(),
    );
    
    return _parseResponse(response, fromJson);
  }

  Options _getOptions() {
    if (_authToken != null) {
      return Options(
        headers: {'Authorization': 'Bearer $_authToken'},
      );
    }
    return Options();
  }

  ApiResponse<T> _parseResponse<T>(
    Response<Map<String, dynamic>> response,
    T Function(Map<String, dynamic>) fromJson,
  ) {
    final data = response.data!;
    
    return ApiResponse<T>(
      code: data['code'] as int? ?? 0,
      message: data['message'] as String? ?? '',
      data: fromJson(data['data']),
    );
  }
}

class AuthInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.response?.statusCode == 401) {
      // 处理 Token 过期
      // 这里可以添加 Token 刷新逻辑
    }
    handler.next(err);
  }
}
```

- [ ] **Step 2: 创建平台 providers**

```dart
// flutter/apps/mobile/lib/core/di/platform_providers.dart

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';

// 平台能力 Providers
final filePickerPortProvider = Provider<FilePickerPort>((ref) {
  throw UnimplementedError('filePickerPortProvider must be overridden');
});

final notificationPortProvider = Provider<NotificationPort>((ref) {
  throw UnimplementedError('notificationPortProvider must be overridden');
});

final clipboardPortProvider = Provider<ClipboardPort>((ref) {
  throw UnimplementedError('clipboardPortProvider must be overridden');
});

final sharePortProvider = Provider<SharePort>((ref) {
  throw UnimplementedError('sharePortProvider must be overridden');
});

final audioRecorderPortProvider = Provider<AudioRecorderPort>((ref) {
  throw UnimplementedError('audioRecorderPortProvider must be overridden');
});

// 网络和存储 Providers
final httpClientProvider = Provider<HttpClientPort>((ref) {
  throw UnimplementedError('httpClientProvider must be overridden');
});

final storageProvider = Provider<StoragePort>((ref) {
  throw UnimplementedError('storageProvider must be overridden');
});

final secureStorageProvider = Provider<SecureStoragePort>((ref) {
  throw UnimplementedError('secureStorageProvider must be overridden');
});

// E2EE Provider
final e2eeAdapterProvider = Provider<E2eeBridge>((ref) {
  throw UnimplementedError('e2eeAdapterProvider must be overridden');
});

// 语言和主题 Providers
final languageProvider = StateProvider<String>((ref) => 'zh');
final themeModeProvider = StateProvider<ThemeMode>((ref) => ThemeMode.system);
```

- [ ] **Step 3: 验证编译**

Run: `cd flutter/apps/mobile && flutter analyze`
Expected: 无错误

- [ ] **Step 4: 提交**

```bash
git add flutter/apps/mobile/lib/adapters/ flutter/apps/mobile/lib/core/
git commit -m "feat: implement mobile network adapter"
```

---

## Task 12: 实现移动端存储和文件选择适配器

**Files:**
- Create: `flutter/apps/mobile/lib/adapters/mobile_storage_adapter.dart`
- Create: `flutter/apps/mobile/lib/adapters/mobile_file_picker_adapter.dart`

- [ ] **Step 1: 创建存储适配器**

```dart
// flutter/apps/mobile/lib/adapters/mobile_storage_adapter.dart

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:im_core/core.dart';

class MobileStorageService implements StoragePort {
  final _storage = const FlutterSecureStorage();

  @override
  Future<String?> getString(String key) async {
    return await _storage.read(key: key);
  }

  @override
  Future<void> setString(String key, String value) async {
    await _storage.write(key: key, value: value);
  }

  @override
  Future<void> remove(String key) async {
    await _storage.delete(key: key);
  }

  @override
  Future<void> clear() async {
    await _storage.deleteAll();
  }

  @override
  Future<bool> containsKey(String key) async {
    return await _storage.containsKey(key: key);
  }
}

class MobileSecureStorageAdapter implements SecureStoragePort {
  final _storage = const FlutterSecureStorage();

  @override
  Future<String?> read(String key) async {
    return await _storage.read(key: key);
  }

  @override
  Future<void> write(String key, String value) async {
    await _storage.write(key: key, value: value);
  }

  @override
  Future<void> delete(String key) async {
    await _storage.delete(key: key);
  }

  @override
  Future<void> deleteAll() async {
    await _storage.deleteAll();
  }

  @override
  Future<bool> containsKey(String key) async {
    return await _storage.containsKey(key: key);
  }
}
```

- [ ] **Step 2: 创建文件选择适配器**

```dart
// flutter/apps/mobile/lib/adapters/mobile_file_picker_adapter.dart

import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:im_core/core.dart';

class MobileFilePickerAdapter implements FilePickerPort {
  final _imagePicker = ImagePicker();

  @override
  Future<Result<PickedFile>> pickImage({ImageSource source = ImageSource.gallery}) async {
    try {
      final pickedFile = await _imagePicker.pickImage(
        source: source == ImageSource.camera ? ImageSource.camera : ImageSource.gallery,
      );
      
      if (pickedFile == null) {
        return const Failure(OperationCancelled());
      }
      
      final bytes = await pickedFile.readAsBytes();
      return Success(PickedFile.fromBytes(
        name: pickedFile.name,
        mimeType: _getMimeType(pickedFile.name),
        bytes: bytes,
      ));
    } catch (e) {
      return const Failure(UnknownError('file_read_failed'));
    }
  }

  @override
  Future<Result<PickedFile>> pickFile({List<String>? allowedExtensions}) async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: allowedExtensions != null ? FileType.custom : FileType.any,
        allowedExtensions: allowedExtensions,
        withData: true,
      );
      
      if (result == null || result.files.isEmpty) {
        return const Failure(OperationCancelled());
      }
      
      final file = result.files.first;
      if (file.bytes == null) {
        return const Failure(UnknownError('file_read_failed'));
      }
      
      return Success(PickedFile.fromBytes(
        name: file.name,
        mimeType: _getMimeType(file.name),
        bytes: file.bytes!,
      ));
    } catch (e) {
      return const Failure(UnknownError('file_read_failed'));
    }
  }

  String _getMimeType(String fileName) {
    final ext = fileName.split('.').last.toLowerCase();
    const mimeTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'pdf': 'application/pdf',
      'mp3': 'audio/mpeg',
      'mp4': 'video/mp4',
    };
    return mimeTypes[ext] ?? 'application/octet-stream';
  }
}
```

- [ ] **Step 3: 验证编译**

Run: `cd flutter/apps/mobile && flutter analyze`
Expected: 无错误

- [ ] **Step 4: 提交**

```bash
git add flutter/apps/mobile/lib/adapters/mobile_storage_adapter.dart flutter/apps/mobile/lib/adapters/mobile_file_picker_adapter.dart
git commit -m "feat: implement mobile storage and file picker adapters"
```

---

## Task 13: 运行测试验证

**Files:**
- None (测试现有代码)

- [ ] **Step 1: 运行 Rust 测试**

Run: `cd flutter/native/rust && cargo test`
Expected: 所有测试通过

- [ ] **Step 2: 运行 Flutter 测试**

Run: `cd flutter && flutter test`
Expected: 所有测试通过

- [ ] **Step 3: 验证桌面端编译**

Run: `cd flutter/apps/desktop && flutter build windows`
Expected: 成功编译（Windows）

- [ ] **Step 4: 验证移动端编译**

Run: `cd flutter/apps/mobile && flutter build apk`
Expected: 成功编译（Android）

- [ ] **Step 5: 提交测试结果**

```bash
git add -A
git commit -m "test: verify all tests pass for desktop and mobile"
```

---

## Task 14: 创建文档

**Files:**
- Create: `docs/desktop-setup.md`
- Create: `docs/mobile-setup.md`

- [ ] **Step 1: 创建桌面端文档**

```markdown
# Desktop Setup Guide

## Prerequisites

- Flutter SDK 3.3.0+
- Rust toolchain
- Windows/macOS/Linux 开发环境

## 开发环境搭建

### 1. 安装依赖

```bash
cd flutter
flutter pub get
cd native/rust
cargo build
```

### 2. 生成 FRB 绑定

```bash
cd flutter
flutter_rust_bridge_codegen generate
```

### 3. 运行桌面端

```bash
cd apps/desktop
flutter run -d windows  # 或 macos/linux
```

## 构建发布版本

### Windows
```bash
flutter build windows
```

### macOS
```bash
flutter build macos
```

### Linux
```bash
flutter build linux
```
```

- [ ] **Step 2: 创建移动端文档**

```markdown
# Mobile Setup Guide

## Prerequisites

- Flutter SDK 3.3.0+
- Android Studio / Xcode
- Android SDK / iOS SDK

## 开发环境搭建

### 1. 安装依赖

```bash
cd flutter
flutter pub get
```

### 2. 运行移动端

```bash
cd apps/mobile
flutter run  # 连接设备或启动模拟器
```

## 构建发布版本

### Android
```bash
flutter build apk
# 或
flutter build appbundle
```

### iOS
```bash
flutter build ios
```
```

- [ ] **Step 3: 提交文档**

```bash
git add docs/desktop-setup.md docs/mobile-setup.md
git commit -m "docs: add desktop and mobile setup guides"
```

---

## 总结

这个实现计划包含了：

1. **Rust 服务层**：网络、存储、安全存储
2. **桌面端应用**：框架、适配器
3. **移动端应用**：框架、适配器
4. **测试验证**：确保所有代码正常工作
5. **文档**：开发环境搭建指南

总共 14 个任务，每个任务都包含：
- 具体的文件列表
- 完整的代码示例
- 编译验证步骤
- 提交命令

执行顺序：
1. Task 1-5: Rust 服务层
2. Task 6-9: 桌面端应用
3. Task 10-12: 移动端应用
4. Task 13: 测试验证
5. Task 14: 文档

预计总工作量：2-3 周

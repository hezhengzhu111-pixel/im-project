# Flutter 多端应用架构设计文档

## 1. 概述

### 1.1 项目背景

本项目旨在将现有的 Flutter Web 应用扩展到桌面端（Windows、macOS、Linux）和移动端（iOS、Android），实现多端统一的应用体验。

### 1.2 设计目标

1. **代码复用最大化**：充分利用现有 Flutter Web 代码，复用率目标 70%+
2. **性能最优**：桌面端采用 UI (Dart) + 服务 (Rust) 的混合架构
3. **安全性最高**：加密、密钥管理、敏感数据处理使用 Rust 实现
4. **跨平台一致性**：共享核心逻辑、UI 组件、状态管理
5. **平台特性支持**：每个平台支持其特有的功能（通知、托盘、快捷键等）

### 1.3 技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| **UI 层** | Flutter Desktop/Mobile + Dart | 跨平台 UI 渲染 |
| **状态管理** | Riverpod | 与 Web 端保持一致 |
| **路由** | go_router | 与 Web 端保持一致 |
| **Rust 桥接** | flutter_rust_bridge | 已有基础 |
| **网络层** | reqwest + tokio-tungstenite | Rust 异步网络 |
| **存储层** | rusqlite | Rust SQLite |
| **加密层** | e2ee-core | 已有 Rust 实现 |

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    多端应用架构                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Flutter UI Layer (Dart)                 │   │
│  │  • Web 端、桌面端、移动端共享 UI 组件                │   │
│  │  • 状态管理 (Riverpod)                               │   │
│  │  • 路由 (go_router)                                  │   │
│  │  • 平台特定 UI 适配                                  │   │
│  └─────────────────────┬───────────────────────────────┘   │
│                        │                                    │
│                        │ Flutter Rust Bridge                │
│                        │                                    │
│  ┌─────────────────────▼───────────────────────────────┐   │
│  │              Rust Service Layer                      │   │
│  │  • E2EE 加密/解密 (e2ee-core)                       │   │
│  │  • HTTP/WebSocket 客户端 (reqwest)                   │   │
│  │  • 本地数据库 (rusqlite)                             │   │
│  │  • 平台功能 (通知、托盘、快捷键)                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 项目结构

```
flutter/
├── packages/
│   ├── core/                    # 平台无关的核心逻辑（已有）
│   │   ├── lib/src/
│   │   │   ├── contracts/       # API 契约
│   │   │   ├── crypto/          # E2EE 接口
│   │   │   ├── models/          # 数据模型
│   │   │   ├── network/         # 网络接口
│   │   │   ├── ports/           # 平台能力抽象
│   │   │   └── storage/         # 存储接口
│   │   └── pubspec.yaml
│   ├── ui/                      # 共享 UI 组件（已有）
│   │   ├── lib/src/
│   │   │   ├── layouts/         # 响应式布局
│   │   │   ├── theme/           # 主题系统
│   │   │   └── widgets/         # UI 组件
│   │   └── pubspec.yaml
│   └── shared/                  # 新增：跨平台共享业务逻辑
│       ├── lib/src/
│       │   ├── auth/            # 认证逻辑
│       │   ├── chat/            # 聊天逻辑
│       │   ├── contacts/        # 联系人逻辑
│       │   ├── group/           # 群组逻辑
│       │   └── moments/         # 朋友圈逻辑
│       └── pubspec.yaml
├── apps/
│   ├── web/                     # Web 端（已有）
│   ├── desktop/                 # 新增：桌面端
│   │   ├── lib/
│   │   │   ├── main.dart
│   │   │   ├── app.dart
│   │   │   ├── adapters/        # Dart 适配器（调用 Rust）
│   │   │   ├── features/        # 桌面端特有功能
│   │   │   └── core/            # 桌面端核心配置
│   │   └── pubspec.yaml
│   └── mobile/                  # 新增：移动端
│       ├── lib/
│       │   ├── main.dart
│       │   ├── app.dart
│       │   ├── adapters/        # Dart 适配器
│       │   ├── features/        # 移动端特有功能
│       │   └── core/            # 移动端核心配置
│       └── pubspec.yaml
├── native/
│   └── rust/
│       ├── src/
│       │   ├── api/
│       │   │   ├── mod.rs
│       │   │   ├── e2ee.rs      # E2EE 加密（已有）
│       │   │   ├── network.rs   # 网络服务
│       │   │   ├── storage.rs   # 本地存储
│       │   │   ├── notifications.rs  # 通知
│       │   │   ├── tray.rs      # 系统托盘
│       │   │   ├── hotkeys.rs   # 全局快捷键
│       │   │   └── sync.rs      # 多端同步
│       │   └── lib.rs
│       ├── Cargo.toml
│       └── flutter_rust_bridge.yaml
└── Cargo.toml                   # Rust 工作空间配置
```

---

## 3. 模块详细设计

### 3.1 E2EE 加密模块

#### 3.1.1 现有代码复用

**文件位置：** `backend/e2ee-core/`

**模块列表：**
- `primitives/`：AES-GCM、Ed25519、X25519、HKDF
- `x3dh/`：X3DH 密钥协商
- `ratchet/`：Double Ratchet 加密
- `state/`：会话状态管理

**复用方式：** 直接复用，无需修改

#### 3.1.2 接口定义

```rust
// flutter/native/rust/src/api/e2ee.rs

pub struct E2eeService;

#[frb]
impl E2eeService {
    /// 生成密钥包
    pub async fn generate_key_bundle(otk_count: u32) -> Result<Vec<u8>, String>;
    
    /// X3DH 发起方
    pub async fn x3dh_initiate(
        identity_key: Vec<u8>,
        signed_pre_key: Vec<u8>,
        one_time_pre_key: Option<Vec<u8>>,
    ) -> Result<Vec<u8>, String>;
    
    /// X3DH 响应方
    pub async fn x3dh_respond(
        identity_key: Vec<u8>,
        ephemeral_key: Vec<u8>,
        signed_pre_key: Vec<u8>,
        one_time_pre_key: Option<Vec<u8>>,
    ) -> Result<Vec<u8>, String>;
    
    /// Double Ratchet 加密
    pub async fn ratchet_encrypt(
        state: Vec<u8>,
        plaintext: Vec<u8>,
    ) -> Result<(Vec<u8>, Vec<u8>), String>;
    
    /// Double Ratchet 解密
    pub async fn ratchet_decrypt(
        state: Vec<u8>,
        ciphertext: Vec<u8>,
    ) -> Result<(Vec<u8>, Vec<u8>), String>;
}
```

---

### 3.2 网络服务模块

#### 3.2.1 功能描述

- HTTP 客户端（GET、POST、PUT、DELETE）
- WebSocket 客户端（连接管理、消息收发）
- Token 刷新机制
- 请求重试（指数退避）
- 连接池管理

#### 3.2.2 接口定义

```rust
// flutter/native/rust/src/api/network.rs

pub struct NetworkService {
    base_url: String,
    auth_token: Option<String>,
}

#[frb]
impl NetworkService {
    pub fn new(base_url: String) -> Self;
    
    pub async fn get(
        &self,
        path: String,
        query_params: Option<HashMap<String, String>>,
    ) -> Result<HttpResponse, String>;
    
    pub async fn post(
        &self,
        path: String,
        body: Option<Vec<u8>>,
    ) -> Result<HttpResponse, String>;
    
    pub async fn put(
        &self,
        path: String,
        body: Option<Vec<u8>>,
    ) -> Result<HttpResponse, String>;
    
    pub async fn delete(
        &self,
        path: String,
    ) -> Result<HttpResponse, String>;
    
    pub async fn set_auth_token(&self, token: Option<String>);
    
    pub async fn connect_websocket(&self, path: String) -> Result<WebSocketConnection, String>;
}

pub struct HttpResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
}

pub struct WebSocketConnection {
    pub id: String,
}

#[frb]
impl WebSocketConnection {
    pub async fn send(&self, message: Vec<u8>) -> Result<(), String>;
    pub async fn receive(&self) -> Result<Vec<u8>, String>;
    pub async fn close(&self) -> Result<(), String>;
}
```

---

### 3.3 本地存储模块

#### 3.3.1 功能描述

- SQLite 数据库管理
- 消息缓存
- 会话状态存储
- 文件存储管理
- 批量读写操作

#### 3.3.2 接口定义

```rust
// flutter/native/rust/src/api/storage.rs

pub struct LocalStorage {
    db_path: String,
}

#[frb]
impl LocalStorage {
    pub fn new(db_path: String) -> Result<Self, String>;
    
    pub async fn save_message(&self, message: Message) -> Result<(), String>;
    pub async fn get_messages(
        &self,
        session_id: String,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Message>, String>;
    
    pub async fn save_session(&self, session: Session) -> Result<(), String>;
    pub async fn get_sessions(&self) -> Result<Vec<Session>, String>;
    
    pub async fn save_contact(&self, contact: Contact) -> Result<(), String>;
    pub async fn get_contacts(&self) -> Result<Vec<Contact>, String>;
    
    pub async fn batch_save_messages(&self, messages: Vec<Message>) -> Result<(), String>;
    
    pub async fn clear_cache(&self) -> Result<(), String>;
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Contact {
    pub id: String,
    pub user_id: String,
    pub nickname: String,
    pub avatar: Option<String>,
    pub status: String,
}
```

---

### 3.4 多端同步模块

#### 3.4.1 同步策略

1. **向量时钟**：检测并发修改
2. **增量同步**：只同步变化的数据
3. **离线队列**：网络断开时缓存操作
4. **冲突解决**：最后写入获胜 + 内容合并

#### 3.4.2 接口定义

```rust
// flutter/native/rust/src/api/sync.rs

pub struct SyncManager {
    device_id: String,
    local_clock: VectorClock,
    pending_syncs: Vec<SyncableMessage>,
}

#[frb]
impl SyncManager {
    pub fn new(device_id: String) -> Self;
    
    pub async fn create_message(
        &mut self,
        content: String,
        sender_id: String,
    ) -> SyncableMessage;
    
    pub async fn sync_remote_message(
        &mut self,
        message: SyncableMessage,
    ) -> SyncResult;
    
    pub async fn get_pending_syncs(&self) -> Vec<SyncableMessage>;
    pub async fn mark_synced(&mut self, message_id: String);
    
    pub async fn push_to_server(&self) -> Result<(), String>;
    pub async fn pull_from_server(&self) -> Result<Vec<SyncableMessage>, String>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorClock {
    clocks: HashMap<String, u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncableMessage {
    pub id: String,
    pub content: String,
    pub sender_id: String,
    pub timestamp: DateTime<Utc>,
    pub clock: VectorClock,
    pub is_deleted: bool,
}

pub enum SyncResult {
    New(SyncableMessage),
    Updated(SyncableMessage),
    Ignored,
    ConflictResolved(SyncableMessage),
}
```

---

### 3.5 平台功能模块

#### 3.5.1 通知系统

```rust
// flutter/native/rust/src/api/notifications.rs

pub struct NotificationManager;

#[frb]
impl NotificationManager {
    pub fn new(app_name: String) -> Self;
    
    pub async fn notify_new_message(
        &self,
        sender_name: String,
        content: String,
    ) -> Result<(), String>;
    
    pub async fn notify_group_message(
        &self,
        group_name: String,
        sender_name: String,
        content: String,
    ) -> Result<(), String>;
    
    pub async fn notify_file_transfer(
        &self,
        file_name: String,
        progress: u32,
    ) -> Result<(), String>;
}
```

#### 3.5.2 系统托盘

```rust
// flutter/native/rust/src/api/tray.rs

pub struct SystemTray;

#[frb]
impl SystemTray {
    pub fn new() -> Result<Self, String>;
    
    pub async fn set_tooltip(&self, tooltip: String) -> Result<(), String>;
    pub async fn set_icon(&self, icon_path: String) -> Result<(), String>;
    pub async fn show_notification(&self, title: String, message: String) -> Result<(), String>;
    pub async fn get_event(&self) -> Option<TrayEvent>;
}

pub enum TrayEvent {
    ShowWindow,
    HideWindow,
    Quit,
}
```

#### 3.5.3 全局快捷键

```rust
// flutter/native/rust/src/api/hotkeys.rs

pub struct HotkeyManager;

#[frb]
impl HotkeyManager {
    pub fn new() -> Result<Self, String>;
    
    pub async fn register(&self, id: String, key: String) -> Result<(), String>;
    pub async fn unregister(&self, id: String) -> Result<(), String>;
    pub async fn get_triggered(&self) -> Option<String>;
}
```

---

## 4. 平台适配设计

### 4.1 桌面端适配器

#### 4.1.1 HTTP 客户端适配器

```dart
// flutter/apps/desktop/lib/adapters/desktop_http_adapter.dart

import 'package:im_core/core.dart';
import 'package:im_rust_bridge/im_rust_bridge.dart';

class DesktopHttpClient implements HttpClientPort {
  final _rustNetwork = RustNetworkService();
  
  @override
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final response = await _rustNetwork.get(path, queryParameters);
    return _parseResponse(response, fromJson);
  }
  
  @override
  Future<ApiResponse<T>> post<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final response = await _rustNetwork.post(path, body);
    return _parseResponse(response, fromJson);
  }
  
  ApiResponse<T> _parseResponse<T>(
    HttpResponse response,
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

#### 4.1.2 存储适配器

```dart
// flutter/apps/desktop/lib/adapters/desktop_storage_adapter.dart

import 'package:im_core/core.dart';
import 'package:im_rust_bridge/im_rust_bridge.dart';

class DesktopStorageAdapter implements StoragePort {
  final _rustStorage = RustLocalStorage();
  
  @override
  Future<String?> getString(String key) async {
    return await _rustStorage.getString(key);
  }
  
  @override
  Future<void> setString(String key, String value) async {
    await _rustStorage.setString(key, value);
  }
  
  @override
  Future<void> remove(String key) async {
    await _rustStorage.remove(key);
  }
  
  @override
  Future<void> clear() async {
    await _rustStorage.clear();
  }
  
  @override
  Future<bool> containsKey(String key) async {
    return await _rustStorage.containsKey(key);
  }
}
```

#### 4.1.3 E2EE 适配器

```dart
// flutter/apps/desktop/lib/adapters/desktop_e2ee_adapter.dart

import 'dart:typed_data';
import 'package:im_core/core.dart';
import 'package:im_rust_bridge/im_rust_bridge.dart';

class DesktopE2eeAdapter implements E2eeBridge {
  final _rustE2ee = RustE2eeService();
  
  @override
  Future<Uint8List> generateKeyBundle(int otkCount) async {
    return await _rustE2ee.generateKeyBundle(otkCount);
  }
  
  @override
  Future<Uint8List> x3dhInitiate(
    Uint8List identityKey,
    Uint8List signedPreKey,
    Uint8List? oneTimePreKey,
  ) async {
    return await _rustE2ee.x3dhInitiate(
      identityKey,
      signedPreKey,
      oneTimePreKey,
    );
  }
  
  @override
  Future<(Uint8List, Uint8List)> ratchetEncrypt(
    Uint8List state,
    Uint8List plaintext,
  ) async {
    return await _rustE2ee.ratchetEncrypt(state, plaintext);
  }
  
  @override
  Future<(Uint8List, Uint8List)> ratchetDecrypt(
    Uint8List state,
    Uint8List ciphertext,
  ) async {
    return await _rustE2ee.ratchetDecrypt(state, ciphertext);
  }
}
```

---

### 4.2 移动端适配器

#### 4.2.1 HTTP 客户端适配器

```dart
// flutter/apps/mobile/lib/adapters/mobile_http_adapter.dart

import 'package:dio/dio.dart';
import 'package:im_core/core.dart';

class MobileHttpClient implements HttpClientPort {
  late final Dio _dio;
  
  MobileHttpClient({required String baseUrl}) {
    _dio = Dio(BaseOptions(baseUrl: baseUrl));
    _dio.interceptors.add(AuthInterceptor());
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
    );
    return _parseResponse(response, fromJson);
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
```

#### 4.2.2 文件选择适配器

```dart
// flutter/apps/mobile/lib/adapters/mobile_file_picker_adapter.dart

import 'package:file_picker/file_picker.dart';
import 'package:im_core/core.dart';

class MobileFilePickerAdapter implements FilePickerPort {
  @override
  Future<Result<PickedFile>> pickImage({ImageSource source = ImageSource.gallery}) async {
    try {
      final picker = ImagePicker();
      final pickedFile = await picker.pickImage(
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

---

## 5. 安全性设计

### 5.1 密钥管理架构

```
┌─────────────────────────────────────────────────────────────┐
│                    密钥管理层级                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Level 1: 主密钥 (Master Key)                               │
│  • 存储位置：操作系统安全存储                                │
│  • Windows: DPAPI / Credential Manager                      │
│  • macOS: Keychain                                          │
│  • Linux: Secret Service (gnome-keyring)                    │
│  • 用途：加密其他密钥                                        │
│                                                             │
│  Level 2: 身份密钥对 (Identity Key Pair)                    │
│  • 存储位置：加密的本地数据库                                │
│  • 用途：X3DH 密钥协商、消息签名                             │
│  • 生命周期：长期有效                                        │
│                                                             │
│  Level 3: 会话密钥 (Session Keys)                           │
│  • 存储位置：内存（运行时）                                  │
│  • 用途：Double Ratchet 加密                                │
│  • 生命周期：会话期间                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 安全存储实现

```rust
// flutter/native/rust/src/api/secure_storage.rs

use keyring::Entry;
use aes_gcm::{Aes256Gcm, Key, Nonce};
use aes_gcm::aead::{Aead, NewAead};
use zeroize::Zeroize;

pub struct SecureKeyStore {
    service_name: String,
}

impl SecureKeyStore {
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
        
        let nonce = Nonce::from_slice(b"unique nonce for each encryption");
        let ciphertext = cipher.encrypt(nonce, data)
            .map_err(|e| format!("Encryption failed: {}", e))?;
        
        Ok(ciphertext)
    }
    
    /// 解密敏感数据
    pub fn decrypt(&self, ciphertext: &[u8], master_key: &[u8]) -> Result<Vec<u8>, String> {
        let key = Key::from_slice(master_key);
        let cipher = Aes256Gcm::new(key);
        
        let nonce = Nonce::from_slice(b"unique nonce for each encryption");
        let plaintext = cipher.decrypt(nonce, ciphertext)
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

/// 安全内存处理
pub struct SecureBuffer {
    data: Vec<u8>,
}

impl SecureBuffer {
    pub fn new(data: Vec<u8>) -> Self {
        Self { data }
    }
    
    /// 安全清零内存
    pub fn secure_zero(&mut self) {
        self.data.zeroize();
    }
}

impl Drop for SecureBuffer {
    fn drop(&mut self) {
        self.secure_zero();
    }
}
```

---

## 6. 性能优化设计

### 6.1 异步处理架构

```rust
// flutter/native/rust/src/api/performance.rs

use tokio::sync::Semaphore;
use std::sync::Arc;

pub struct PerformanceManager {
    // 并发控制
    http_semaphore: Arc<Semaphore>,
    crypto_semaphore: Arc<Semaphore>,
    db_semaphore: Arc<Semaphore>,
    
    // 缓存管理
    message_cache: Arc<RwLock<LruCache<String, Message>>>,
    session_cache: Arc<RwLock<LruCache<String, Session>>>,
}

impl PerformanceManager {
    pub fn new() -> Self {
        Self {
            http_semaphore: Arc::new(Semaphore::new(10)),      // 最大 10 个并发 HTTP 请求
            crypto_semaphore: Arc::new(Semaphore::new(5)),     // 最大 5 个并发加密任务
            db_semaphore: Arc::new(Semaphore::new(3)),         // 最大 3 个并发数据库操作
            
            message_cache: Arc::new(RwLock::new(LruCache::new(1000))),
            session_cache: Arc::new(RwLock::new(LruCache::new(100))),
        }
    }
    
    /// 限制并发 HTTP 请求
    pub async fn execute_http<F, T>(&self, f: F) -> Result<T, String>
    where
        F: std::future::Future<Output = Result<T, String>> + Send + 'static,
        T: Send + 'static,
    {
        let permit = self.http_semaphore.clone().acquire_owned().await
            .map_err(|e| format!("Failed to acquire HTTP permit: {}", e))?;
        
        let result = f.await;
        drop(permit);
        
        result
    }
    
    /// 限制并发加密任务
    pub async fn execute_crypto<F, T>(&self, f: F) -> Result<T, String>
    where
        F: std::future::Future<Output = Result<T, String>> + Send + 'static,
        T: Send + 'static,
    {
        let permit = self.crypto_semaphore.clone().acquire_owned().await
            .map_err(|e| format!("Failed to acquire crypto permit: {}", e))?;
        
        let result = f.await;
        drop(permit);
        
        result
    }
    
    /// 批量数据库写入
    pub async fn batch_save_messages(&self, messages: Vec<Message>) -> Result<(), String> {
        let permit = self.db_semaphore.clone().acquire_owned().await
            .map_err(|e| format!("Failed to acquire DB permit: {}", e))?;
        
        // 批量插入
        let db = self.get_db_connection();
        let transaction = db.transaction().map_err(|e| format!("Failed to start transaction: {}", e))?;
        
        for message in messages {
            transaction.execute(
                "INSERT OR REPLACE INTO messages (id, session_id, content, sender_id, timestamp, message_type) 
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    message.id,
                    message.session_id,
                    message.content,
                    message.sender_id,
                    message.timestamp,
                    message.message_type,
                ],
            ).map_err(|e| format!("Failed to insert message: {}", e))?;
        }
        
        transaction.commit().map_err(|e| format!("Failed to commit transaction: {}", e))?;
        drop(permit);
        
        Ok(())
    }
    
    /// 消息缓存
    pub async fn get_cached_message(&self, message_id: &str) -> Option<Message> {
        let cache = self.message_cache.read().await;
        cache.get(message_id).cloned()
    }
    
    pub async fn cache_message(&self, message: Message) {
        let mut cache = self.message_cache.write().await;
        cache.put(message.id.clone(), message);
    }
}
```

---

## 7. 实现路径

### 7.1 阶段划分

| 阶段 | 任务 | 工作量 | 优先级 |
|------|------|--------|--------|
| **Phase 1** | 扩展 Rust 桥接层（网络、存储） | 1-2 周 | 🔴 高 |
| **Phase 2** | 实现 Rust 网络服务 | 1 周 | 🔴 高 |
| **Phase 3** | 实现 Rust 本地存储 | 1 周 | 🔴 高 |
| **Phase 4** | 桌面端 UI 框架搭建 | 1 周 | 🔴 高 |
| **Phase 5** | 桌面端 UI 适配（侧边栏） | 1-2 周 | 🟡 中 |
| **Phase 6** | 桌面端特有功能（托盘、快捷键） | 1-2 周 | 🟡 中 |
| **Phase 7** | 移动端适配器实现 | 2-3 周 | 🟡 中 |
| **Phase 8** | 移动端 UI 适配 | 1-2 周 | 🟡 中 |
| **Phase 9** | 多端同步实现 | 1-2 周 | 🟡 中 |
| **Phase 10** | 测试和优化 | 2-3 周 | 🟡 中 |

### 7.2 依赖关系

```
Phase 1 ──► Phase 2 ──► Phase 3
    │           │           │
    ▼           ▼           ▼
Phase 4 ──► Phase 5 ──► Phase 6
                        │
                        ▼
Phase 7 ──► Phase 8 ──► Phase 9
                        │
                        ▼
                    Phase 10
```

---

## 8. 测试策略

### 8.1 单元测试

- Rust 服务层单元测试
- Dart 适配器单元测试
- 业务逻辑单元测试

### 8.2 集成测试

- Rust 与 Flutter 集成测试
- 网络层集成测试
- 存储层集成测试

### 8.3 端到端测试

- 完整用户流程测试
- 多端同步测试
- 性能压力测试

---

## 9. 部署方案

### 9.1 桌面端

| 平台 | 打包格式 | 分发方式 |
|------|---------|---------|
| **Windows** | MSIX/EXE | Microsoft Store / 官网下载 |
| **macOS** | DMG/PKG | App Store / 官网下载 |
| **Linux** | DEB/RPM/AppImage | 官方仓库 / Flatpak |

### 9.2 移动端

| 平台 | 打包格式 | 分发方式 |
|------|---------|---------|
| **iOS** | IPA | App Store |
| **Android** | APK/AAB | Google Play / 官网下载 |

### 9.3 自动更新

```rust
// flutter/native/rust/src/api/updater.rs

pub struct AutoUpdater;

#[frb]
impl AutoUpdater {
    pub fn new() -> Self;
    
    pub async fn check_update(&self) -> Result<Option<UpdateInfo>, String>;
    pub async fn download_update(&self, update_info: UpdateInfo) -> Result<(), String>;
    pub async fn apply_update(&self) -> Result<(), String>;
}

pub struct UpdateInfo {
    pub version: String,
    pub download_url: String,
    pub checksum: String,
    pub release_notes: String,
}
```

---

## 10. 总结

### 10.1 架构优势

1. **代码复用最大化**：约 70% 的代码可以直接复用
2. **性能最优**：Rust 服务层提供高性能的加密、网络、存储
3. **安全性最高**：加密操作在 Rust 层，避免 Dart 层的安全风险
4. **维护成本低**：一套 Rust 代码，多端共用
5. **架构清晰**：UI 层和逻辑层完全分离

### 10.2 关键技术点

1. **Flutter Rust Bridge**：已有的 Rust 桥接基础
2. **e2ee-core**：已有的生产级 E2EE 实现
3. **端口模式**：平台能力抽象，易于扩展
4. **响应式 UI**：im_ui 组件库已支持多端

### 10.3 下一步行动

1. 审阅并确认设计文档
2. 创建详细的实现计划
3. 开始 Phase 1：扩展 Rust 桥接层
4. 逐步实现各模块

---

**文档版本：** 1.0  
**创建日期：** 2026-05-31  
**作者：** IM Development Team

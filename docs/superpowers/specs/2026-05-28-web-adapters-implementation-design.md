# Web Platform Adapters Implementation Design

**Date:** 2026-05-28
**Status:** Draft
**Scope:** 补齐 Web 平台 adapter 真实实现，修复 MessageInput 录音按钮

---

## 1. 背景与目标

### 当前痛点

- `WebAudioRecorderAdapter` 是占位符，`stopRecording()` 返回 `UnknownError('not_implemented')`
- `WebNotificationAdapter`、`WebShareAdapter`、`WebClipboardAdapter` 均为占位符
- `WebFilePickerAdapter` 的 catch 块使用 `UnknownError(e.toString())` 泄露异常详情
- `MessageInput` 录音按钮 `onPressed` 只做 `setState(() => _isRecording = !_isRecording)`，未调用 recorder
- 部分 adapter 的错误消息为硬编码中文（如 `'无法读取文件数据'`），无法国际化

### 目标

1. 实现 6 个 Web adapter 的真实浏览器 API 调用
2. 统一错误处理：错误码 + l10n，不泄露异常详情
3. 修复 MessageInput 录音按钮逻辑，接入 recorder
4. 上传中禁用附件、语音、发送按钮
5. 补齐测试：port 测试、adapter 测试、widget 测试

---

## 2. 架构决策

### 方案选择：各 adapter 自包含 js_interop

每个 adapter 文件内部直接使用 `@JSInterop` 注解和 `package:web` 调用浏览器 API。

**理由：**
- 与现有 `WebFilePickerAdapter` 模式一致
- 每个 adapter 独立可理解，无跨文件依赖
- adapter 数量有限（6 个），不需要额外抽象层

### 约束

- `dart:html` 不直接散落到 UI 层
- Web-only API 只存在于 adapters
- `packages/core` 只保留 port 接口和 Result 类型
- 单元测试使用 fake adapter，不依赖真实浏览器权限

---

## 3. 错误处理策略

### 原则

- `UnknownError` 的 `message` 字段使用**错误码**（如 `file_read_failed`），不包含 `e.toString()`
- UI 层通过 `switch` 匹配 `FailureError` 子类，错误码映射到 l10n key
- `stackTrace` 字段仅在开发日志中使用，不展示给用户

### 错误码到 l10n 映射

```dart
String _mapError(FailureError error, AppLocalizations loc) {
  return switch (error) {
    UnsupportedCapability(:final capability) => switch (capability) {
      'audio_recording' => loc.errorRecordingNotImplemented,
      'share' => loc.errorShareNotAvailable,
      'clipboard' => loc.errorClipboardNotAvailable,
      _ => loc.commonFailed,
    },
    PermissionDenied(:final capability) => switch (capability) {
      'notification' => loc.errorNotificationPermissionDenied,
      'microphone' => loc.errorMicrophonePermissionDenied,
      _ => loc.commonFailed,
    },
    OperationCancelled() => '', // 静默处理
    UnknownError(:final message) => switch (message) {
      'file_read_failed' => loc.errorFileReadFailed,
      'already_recording' => loc.errorAlreadyRecording,
      'not_recording' => loc.errorNotRecording,
      _ => loc.commonFailed,
    },
  };
}
```

### 新增 l10n key

| key | zh | en |
|---|---|---|
| `errorShareNotAvailable` | 当前浏览器不支持分享 | Sharing not available in this browser |
| `errorClipboardNotAvailable` | 当前浏览器不支持剪贴板 | Clipboard not available in this browser |
| `errorNotificationPermissionDenied` | 通知权限被拒绝 | Notification permission denied |
| `errorMicrophonePermissionDenied` | 麦克风权限被拒绝 | Microphone permission denied |
| `errorFileReadFailed` | 无法读取文件数据 | Failed to read file data |

已有 key（无需新增）：`errorAlreadyRecording`、`errorNotRecording`、`errorRecordingNotImplemented`

---

## 4. Adapter 实现设计

### 4.1 WebAudioRecorderAdapter

**文件：** `flutter/apps/web/lib/adapters/web_audio_recorder_adapter.dart`

**实现方案：** 使用 `package:web` 的 `MediaRecorder` API。

**数据流：**

```
getUserMedia(audio) → MediaRecorder → start()
                                      ↓
                              dataavailable event → chunks[]
                                      ↓
                                  stop() → Blob → PickedFile
```

**关键实现点：**

- `startRecording()`：调用 `navigator.mediaDevices.getUserMedia({'audio': true})`，创建 `MediaRecorder` 实例，监听 `dataavailable` 事件收集音频 chunks
- `stopRecording()`：调用 `MediaRecorder.stop()`，等待 `stop` 事件，合并 chunks 为 `Blob`，转换为 `Uint8List`，返回 `PickedFile`（mimeType 为 `audio/webm`）
- `cancelRecording()`：停止录制，丢弃 chunks，释放 MediaStream
- `isRecording()`：返回当前 `_isRecording` 状态

**错误映射：**

| 场景 | 错误类型 | 错误码 |
|---|---|---|
| getUserMedia 被拒绝 | `PermissionDenied` | `'microphone'` |
| 已在录音中 | `UnknownError` | `'already_recording'` |
| 未在录音中 | `UnknownError` | `'not_recording'` |
| 录制启动失败 | `UnknownError` | `'recording_start_failed'` |
| 录制停止失败 | `UnknownError` | `'recording_stop_failed'` |

**资源管理：** stopRecording/cancelRecording 中调用 `track.stop()` 释放麦克风。

### 4.2 WebNotificationAdapter

**文件：** `flutter/apps/web/lib/adapters/web_notification_adapter.dart`

**实现方案：** 使用 `package:web` 的 `Notification` API。

**关键实现点：**

- `requestPermission()`：调用 `web.Notification.requestPermission()`，将返回值 `'granted'`/`'denied'`/`'default'` 映射为 `Result<bool>`
- `showNotification()`：先检查权限，未授权返回 `PermissionDenied('notification')`，已授权则创建 `web.Notification` 实例

**错误映射：**

| 场景 | 错误类型 | 错误码 |
|---|---|---|
| 权限被拒绝 | `PermissionDenied` | `'notification'` |
| 权限请求失败 | `UnknownError` | `'notification_permission_failed'` |
| 通知创建失败 | `UnknownError` | `'notification_show_failed'` |

### 4.3 WebShareAdapter

**文件：** `flutter/apps/web/lib/adapters/web_share_adapter.dart`

**实现方案：** 使用 `package:web` 的 `navigator.share` API。

**关键实现点：**

- `isAvailable()`：检查 `web.window.navigator.canShare` 是否为 `null`
- `shareText(String text)`：调用 `navigator.share(ShareData(text: text))`，支持标题/文本/URL 可扩展结构
- `shareFile(...)`：保留 `UnsupportedCapability('share_file')` 返回（Web Share API 文件分享需要 `File` 对象，当前 scope 不实现）

**错误映射：**

| 场景 | 错误类型 | 错误码 |
|---|---|---|
| 浏览器不支持 | `UnsupportedCapability` | `'share'` |
| 用户取消分享 | `OperationCancelled` | - |
| 分享失败 | `UnknownError` | `'share_failed'` |
| 可用性检查失败 | `UnknownError` | `'share_check_failed'` |

### 4.4 WebClipboardAdapter

**文件：** `flutter/apps/web/lib/adapters/web_clipboard_adapter.dart`

**实现方案：** 使用 `package:web` 的 `navigator.clipboard` API。

**关键实现点：**

- `copy(String text)`：调用 `navigator.clipboard.writeText(text)`
- `paste()`：调用 `navigator.clipboard.readText()`，空字符串返回 `null`

**错误映射：**

| 场景 | 错误类型 | 错误码 |
|---|---|---|
| 复制失败 | `UnknownError` | `'clipboard_copy_failed'` |
| 粘贴失败 | `UnknownError` | `'clipboard_paste_failed'` |

### 4.5 WebFilePickerAdapter 修复

**文件：** `flutter/apps/web/lib/adapters/web_file_picker_adapter.dart`

**改动范围：** 仅修改错误处理，不改变功能逻辑。

**改动点：**

1. `pickImage()` 和 `pickFile()` 的 `bytes == null` 分支：
   - `UnknownError('无法读取文件数据')` → `UnknownError('file_read_failed')`

2. `pickImage()` 和 `pickFile()` 的 catch 块：
   - `UnknownError(e.toString())` → `UnknownError('file_read_failed')`

---

## 5. MessageInput 修复设计

**文件：** `flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart`

### 5.1 录音按钮逻辑

**当前问题：** `onPressed` 只做 `setState(() => _isRecording = !_isRecording)`。

**修复：**

```dart
onPressed: _isUploading ? null : () {
  if (_isRecording) {
    _stopRecordingAndSend();
  } else {
    _recordAndSendVoice();
  }
},
```

### 5.2 _recordAndSendVoice() 增强

- 调用 `audioRecorder.startRecording()`
- 失败时通过 `SnackBar` 展示本地化错误
- 成功时 `setState(() => _isRecording = true)`

### 5.3 _stopRecordingAndSend() 增强

- 调用 `audioRecorder.stopRecording()`
- 成功时调用 `_uploadAndSend(data, widget.onSendVoice)`
- 失败时通过 `SnackBar` 展示本地化错误
- 无论成功失败都 `setState(() => _isRecording = false)`

### 5.4 上传中禁用控制

三个按钮在 `_isUploading` 为 true 时 `onPressed` 设为 `null`：

- 附件按钮：`onPressed: _isUploading ? null : _showAttachmentMenu`
- 录音按钮：`onPressed: _isUploading ? null : ...`
- 发送按钮：`onPressed: _isUploading ? null : _handleSend`

### 5.5 _mapError 方法

在 `_MessageInputState` 中添加私有方法，将 `FailureError` 映射为本地化字符串（见第 3 节）。

---

## 6. 测试设计

### 6.1 新增 Port 测试

**文件：** `flutter/apps/web/test/ports/audio_recorder_port_test.dart`

使用 `MockAudioRecorderAdapter` 测试 port 契约：

- `startRecording()` 成功返回 `Success<void>`
- `startRecording()` 失败返回对应 `FailureError`
- `stopRecording()` 成功返回 `Success<PickedFile>`
- `stopRecording()` 未录音返回 `Failure`
- `cancelRecording()` 成功返回 `Success<void>`
- `isRecording()` 返回正确状态

### 6.2 Widget 测试

**文件：** `flutter/apps/web/test/features/chat/presentation/message_input_test.dart`

**用例：**

1. **mic 按钮调用 startRecording**：点击 mic → 验证 `audioRecorder.startRecording()` 被调用
2. **停止按钮调用 stopRecording**：录音中点击 stop → 验证 `audioRecorder.stopRecording()` 被调用
3. **startRecording 失败展示 SnackBar**：mock 返回 Failure → 验证 SnackBar 显示本地化错误
4. **上传中按钮禁用**：`_isUploading = true` → 验证三个按钮 `onPressed == null`
5. **file picker cancel 不触发上传**：mock 返回 OperationCancelled → 验证 `onSendFile` 未被调用

### 6.3 Adapter 测试

**文件：** `flutter/apps/web/test/adapters/web_audio_recorder_adapter_test.dart`

**用例：**

1. **error 不包含原始异常字符串**：触发异常 → 验证 `UnknownError.message` 不含 `e.toString()`
2. **unsupported 返回 UnsupportedCapability**

### 6.4 测试约束

- 使用现有 mock 类（`MockAudioRecorderAdapter` 等）
- 不依赖真实浏览器 API，通过 mock 注入
- Widget 测试使用 `ProviderScope` + override mock adapter

---

## 7. 改动文件清单

| 文件 | 改动类型 |
|---|---|
| `flutter/apps/web/lib/adapters/web_audio_recorder_adapter.dart` | 重写 |
| `flutter/apps/web/lib/adapters/web_notification_adapter.dart` | 重写 |
| `flutter/apps/web/lib/adapters/web_share_adapter.dart` | 重写 |
| `flutter/apps/web/lib/adapters/web_clipboard_adapter.dart` | 重写 |
| `flutter/apps/web/lib/adapters/web_file_picker_adapter.dart` | 修复错误处理 |
| `flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart` | 修复录音逻辑 + 错误展示 |
| `flutter/apps/web/lib/l10n/app_zh.arb` | 新增 5 个错误 key |
| `flutter/apps/web/lib/l10n/app_en.arb` | 新增 5 个错误 key |
| `flutter/apps/web/test/ports/audio_recorder_port_test.dart` | 新增 |
| `flutter/apps/web/test/adapters/web_audio_recorder_adapter_test.dart` | 新增 |
| `flutter/apps/web/test/features/chat/presentation/message_input_test.dart` | 新增 |

---

## 8. 验收标准

1. **MessageInput 录音流程**：点击 mic → 开始录音 → 点击 stop → 上传音频 → 发送
2. **错误展示**：所有 adapter 错误通过 SnackBar 展示本地化消息，不泄露异常详情
3. **上传禁用**：上传中附件、语音、发送按钮均禁用
4. **浏览器降级**：不支持的 API 返回 `UnsupportedCapability`，UI 展示对应提示
5. **测试通过**：所有新增测试用例通过
6. **无 e.toString() 泄露**：grep 确认 adapter 中无 `e.toString()` 使用

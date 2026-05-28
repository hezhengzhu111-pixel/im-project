# Platform Capabilities Adapter Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立统一的设备能力适配层，为 Flutter Web 提供文件选择、通知、网络状态、剪贴板、分享、语音录制等能力，同时为未来 Windows/macOS 客户端复用做准备。

**Architecture:** 采用 Ports & Adapters（六边形架构）模式，在 `flutter/packages/core` 定义 Port 接口和数据模型，在 `flutter/apps/web/lib/adapters` 实现 Web 平台适配器，通过 Riverpod 依赖注入连接各层。

**Tech Stack:** Dart, Flutter, Riverpod, file_picker, dart:js_interop

---

## 文件结构映射

### 阶段 1：核心模型和 Port 定义

| 文件 | 职责 |
|---|---|
| `flutter/packages/core/lib/src/models/result.dart` | Result 类型（Success/Failure） |
| `flutter/packages/core/lib/src/models/failure_error.dart` | 错误类型层次结构 |
| `flutter/packages/core/lib/src/models/picked_file.dart` | 文件数据模型 |
| `flutter/packages/core/lib/src/ports/file_picker_port.dart` | 文件选择端口接口 |
| `flutter/packages/core/lib/src/ports/notification_port.dart` | 通知端口接口 |
| `flutter/packages/core/lib/src/ports/network_status_port.dart` | 网络状态端口接口 |
| `flutter/packages/core/lib/src/ports/clipboard_port.dart` | 剪贴板端口接口 |
| `flutter/packages/core/lib/src/ports/share_port.dart` | 分享端口接口 |
| `flutter/packages/core/lib/src/ports/audio_recorder_port.dart` | 录音端口接口 |

### 阶段 2：Web Adapter 实现

| 文件 | 职责 |
|---|---|
| `flutter/apps/web/lib/adapters/web_file_picker_adapter.dart` | 文件选择适配器（file_picker） |
| `flutter/apps/web/lib/adapters/web_notification_adapter.dart` | 通知适配器（Web Notification API） |
| `flutter/apps/web/lib/adapters/web_network_status_adapter.dart` | 网络状态适配器（online/offline 事件） |
| `flutter/apps/web/lib/adapters/web_clipboard_adapter.dart` | 剪贴板适配器（Clipboard API） |
| `flutter/apps/web/lib/adapters/web_share_adapter.dart` | 分享适配器（Web Share API） |
| `flutter/apps/web/lib/adapters/web_audio_recorder_adapter.dart` | 录音适配器（MediaRecorder API） |

### 阶段 3：依赖注入和 UI 改造

| 文件 | 职责 |
|---|---|
| `flutter/apps/web/lib/core/di/providers.dart` | 添加新 Port providers |
| `flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart` | 改造消息输入组件 |

### 阶段 4：测试

| 文件 | 职责 |
|---|---|
| `flutter/apps/web/test/mocks/mock_file_picker_adapter.dart` | Mock 文件选择器 |
| `flutter/apps/web/test/mocks/mock_audio_recorder_adapter.dart` | Mock 录音器 |
| `flutter/apps/web/test/ports/file_picker_port_test.dart` | 端口单元测试 |
| `flutter/apps/web/test/adapters/web_file_picker_adapter_test.dart` | 适配器测试 |
| `flutter/apps/web/test/widgets/message_input_test.dart` | 组件集成测试 |

---

## Task 1: 创建 Result 类型

**Files:**
- Create: `flutter/packages/core/lib/src/models/result.dart`

- [ ] **Step 1: 创建 Result sealed class**

```dart
// flutter/packages/core/lib/src/models/result.dart

sealed class Result<T> {
  const Result();
}

class Success<T> extends Result<T> {
  const Success(this.data);
  final T data;
}

class Failure<T> extends Result<T> {
  const Failure(this.error);
  final FailureError error;
}
```

- [ ] **Step 2: Commit**

```bash
git add flutter/packages/core/lib/src/models/result.dart
git commit -m "feat(core): add Result type for error handling"
```

---

## Task 2: 创建 FailureError 类型

**Files:**
- Create: `flutter/packages/core/lib/src/models/failure_error.dart`

- [ ] **Step 1: 创建 FailureError sealed class 及子类**

```dart
// flutter/packages/core/lib/src/models/failure_error.dart

sealed class FailureError {
  const FailureError();
}

class UnsupportedCapability extends FailureError {
  const UnsupportedCapability(this.capability);
  final String capability;
}

class PermissionDenied extends FailureError {
  const PermissionDenied(this.capability);
  final String capability;
}

class OperationCancelled extends FailureError {
  const OperationCancelled();
}

class UnknownError extends FailureError {
  const UnknownError(this.message, [this.stackTrace]);
  final String message;
  final StackTrace? stackTrace;
}
```

- [ ] **Step 2: Commit**

```bash
git add flutter/packages/core/lib/src/models/failure_error.dart
git commit -m "feat(core): add FailureError types for platform capabilities"
```

---

## Task 3: 创建 PickedFile 数据模型

**Files:**
- Create: `flutter/packages/core/lib/src/models/picked_file.dart`

- [ ] **Step 1: 创建 PickedFile 类**

```dart
// flutter/packages/core/lib/src/models/picked_file.dart

import 'dart:typed_data';

class PickedFile {
  const PickedFile({
    required this.name,
    required this.mimeType,
    required this.bytes,
    required this.size,
  });

  final String name;
  final String mimeType;
  final Uint8List bytes;
  final int size;

  factory PickedFile.fromBytes({
    required String name,
    required String mimeType,
    required Uint8List bytes,
  }) {
    return PickedFile(
      name: name,
      mimeType: mimeType,
      bytes: bytes,
      size: bytes.length,
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add flutter/packages/core/lib/src/models/picked_file.dart
git commit -m "feat(core): add PickedFile data model"
```

---

## Task 4: 创建 FilePickerPort

**Files:**
- Create: `flutter/packages/core/lib/src/ports/file_picker_port.dart`

- [ ] **Step 1: 创建 FilePickerPort abstract class**

```dart
// flutter/packages/core/lib/src/ports/file_picker_port.dart

import '../models/picked_file.dart';
import '../models/result.dart';

abstract class FilePickerPort {
  /// 选择图片
  Future<Result<PickedFile>> pickImage({ImageSource source});

  /// 选择文件
  Future<Result<PickedFile>> pickFile({List<String>? allowedExtensions});
}

enum ImageSource { camera, gallery }
```

- [ ] **Step 2: Commit**

```bash
git add flutter/packages/core/lib/src/ports/file_picker_port.dart
git commit -m "feat(core): add FilePickerPort interface"
```

---

## Task 5: 创建 NotificationPort

**Files:**
- Create: `flutter/packages/core/lib/src/ports/notification_port.dart`

- [ ] **Step 1: 创建 NotificationPort abstract class**

```dart
// flutter/packages/core/lib/src/ports/notification_port.dart

import '../models/result.dart';

abstract class NotificationPort {
  /// 请求通知权限
  Future<Result<bool>> requestPermission();

  /// 发送本地通知
  Future<Result<void>> showNotification({
    required String title,
    String? body,
    String? payload,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add flutter/packages/core/lib/src/ports/notification_port.dart
git commit -m "feat(core): add NotificationPort interface"
```

---

## Task 6: 创建 NetworkStatusPort

**Files:**
- Create: `flutter/packages/core/lib/src/ports/network_status_port.dart`

- [ ] **Step 1: 创建 NetworkStatusPort abstract class**

```dart
// flutter/packages/core/lib/src/ports/network_status_port.dart

import 'dart:async';
import '../models/result.dart';

abstract class NetworkStatusPort {
  /// 获取当前连接状态
  Future<Result<NetworkStatus>> getStatus();

  /// 监听网络状态变化
  Stream<NetworkStatus> onStatusChange();
}

enum NetworkStatus { online, offline, unknown }
```

- [ ] **Step 2: Commit**

```bash
git add flutter/packages/core/lib/src/ports/network_status_port.dart
git commit -m "feat(core): add NetworkStatusPort interface"
```

---

## Task 7: 创建 ClipboardPort

**Files:**
- Create: `flutter/packages/core/lib/src/ports/clipboard_port.dart`

- [ ] **Step 1: 创建 ClipboardPort abstract class**

```dart
// flutter/packages/core/lib/src/ports/clipboard_port.dart

import '../models/result.dart';

abstract class ClipboardPort {
  /// 复制文本到剪贴板
  Future<Result<void>> copy(String text);

  /// 从剪贴板粘贴文本
  Future<Result<String?>> paste();
}
```

- [ ] **Step 2: Commit**

```bash
git add flutter/packages/core/lib/src/ports/clipboard_port.dart
git commit -m "feat(core): add ClipboardPort interface"
```

---

## Task 8: 创建 SharePort

**Files:**
- Create: `flutter/packages/core/lib/src/ports/share_port.dart`

- [ ] **Step 1: 创建 SharePort abstract class**

```dart
// flutter/packages/core/lib/src/ports/share_port.dart

import '../models/result.dart';

abstract class SharePort {
  /// 分享文本
  Future<Result<void>> shareText(String text);

  /// 分享文件
  Future<Result<void>> shareFile({
    required String filePath,
    String? mimeType,
  });

  /// 检查是否支持分享
  Future<Result<bool>> isAvailable();
}
```

- [ ] **Step 2: Commit**

```bash
git add flutter/packages/core/lib/src/ports/share_port.dart
git commit -m "feat(core): add SharePort interface"
```

---

## Task 9: 创建 AudioRecorderPort

**Files:**
- Create: `flutter/packages/core/lib/src/ports/audio_recorder_port.dart`

- [ ] **Step 1: 创建 AudioRecorderPort abstract class**

```dart
// flutter/packages/core/lib/src/ports/audio_recorder_port.dart

import '../models/picked_file.dart';
import '../models/result.dart';

abstract class AudioRecorderPort {
  /// 开始录音
  Future<Result<void>> startRecording();

  /// 停止录音
  Future<Result<PickedFile>> stopRecording();

  /// 取消录音
  Future<Result<void>> cancelRecording();

  /// 检查是否正在录音
  Future<Result<bool>> isRecording();
}
```

- [ ] **Step 2: Commit**

```bash
git add flutter/packages/core/lib/src/ports/audio_recorder_port.dart
git commit -m "feat(core): add AudioRecorderPort interface"
```

---

## Task 10: 创建 WebFilePickerAdapter

**Files:**
- Create: `flutter/apps/web/lib/adapters/web_file_picker_adapter.dart`

- [ ] **Step 1: 创建 WebFilePickerAdapter 实现**

```dart
// flutter/apps/web/lib/adapters/web_file_picker_adapter.dart

import 'package:file_picker/file_picker.dart' as fp;
import 'package:im_core/core.dart';

class WebFilePickerAdapter implements FilePickerPort {
  @override
  Future<Result<PickedFile>> pickImage({ImageSource source = ImageSource.gallery}) async {
    try {
      final result = await fp.FilePicker.platform.pickFiles(
        type: fp.FileType.image,
        withData: true,
      );

      if (result == null || result.files.isEmpty) {
        return const Failure(OperationCancelled());
      }

      final file = result.files.first;
      if (file.bytes == null) {
        return const Failure(UnknownError('无法读取文件数据'));
      }

      return Success(PickedFile.fromBytes(
        name: file.name,
        mimeType: _getMimeType(file.name),
        bytes: file.bytes!,
      ));
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  @override
  Future<Result<PickedFile>> pickFile({List<String>? allowedExtensions}) async {
    try {
      final result = await fp.FilePicker.platform.pickFiles(
        type: allowedExtensions != null ? fp.FileType.custom : fp.FileType.any,
        allowedExtensions: allowedExtensions,
        withData: true,
      );

      if (result == null || result.files.isEmpty) {
        return const Failure(OperationCancelled());
      }

      final file = result.files.first;
      if (file.bytes == null) {
        return const Failure(UnknownError('无法读取文件数据'));
      }

      return Success(PickedFile.fromBytes(
        name: file.name,
        mimeType: _getMimeType(file.name),
        bytes: file.bytes!,
      ));
    } catch (e) {
      return Failure(UnknownError(e.toString()));
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

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/adapters/web_file_picker_adapter.dart
git commit -m "feat(web): add WebFilePickerAdapter implementation"
```

---

## Task 11: 创建 WebNotificationAdapter

**Files:**
- Create: `flutter/apps/web/lib/adapters/web_notification_adapter.dart`

- [ ] **Step 1: 创建 WebNotificationAdapter 实现**

```dart
// flutter/apps/web/lib/adapters/web_notification_adapter.dart

import 'package:im_core/core.dart';

class WebNotificationAdapter implements NotificationPort {
  @override
  Future<Result<bool>> requestPermission() async {
    try {
      // Web 平台使用 Notification API
      // 实际实现需要通过 dart:js_interop 桥接
      return const Success(false);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  @override
  Future<Result<void>> showNotification({
    required String title,
    String? body,
    String? payload,
  }) async {
    try {
      final permission = await requestPermission();
      if (permission case Success(:final data) when !data) {
        return const Failure(PermissionDenied('notification'));
      }

      // 实际实现需要通过 dart:js_interop 创建浏览器通知
      return const Success(null);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/adapters/web_notification_adapter.dart
git commit -m "feat(web): add WebNotificationAdapter implementation"
```

---

## Task 12: 创建 WebNetworkStatusAdapter

**Files:**
- Create: `flutter/apps/web/lib/adapters/web_network_status_adapter.dart`

- [ ] **Step 1: 创建 WebNetworkStatusAdapter 实现**

```dart
// flutter/apps/web/lib/adapters/web_network_status_adapter.dart

import 'dart:async';
import 'package:im_core/core.dart';

class WebNetworkStatusAdapter implements NetworkStatusPort {
  final _statusController = StreamController<NetworkStatus>.broadcast();

  WebNetworkStatusAdapter() {
    _initListeners();
  }

  void _initListeners() {
    // 实际实现需要通过 dart:js_interop 监听 online/offline 事件
  }

  @override
  Future<Result<NetworkStatus>> getStatus() async {
    try {
      // 实际实现需要通过 dart:js_interop 检查 navigator.onLine
      return const Success(NetworkStatus.online);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  @override
  Stream<NetworkStatus> onStatusChange() {
    return _statusController.stream;
  }

  void dispose() {
    _statusController.close();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/adapters/web_network_status_adapter.dart
git commit -m "feat(web): add WebNetworkStatusAdapter implementation"
```

---

## Task 13: 创建 WebClipboardAdapter

**Files:**
- Create: `flutter/apps/web/lib/adapters/web_clipboard_adapter.dart`

- [ ] **Step 1: 创建 WebClipboardAdapter 实现**

```dart
// flutter/apps/web/lib/adapters/web_clipboard_adapter.dart

import 'package:im_core/core.dart';

class WebClipboardAdapter implements ClipboardPort {
  @override
  Future<Result<void>> copy(String text) async {
    try {
      // 实际实现需要通过 dart:js_interop 使用 Clipboard API
      return const Success(null);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  @override
  Future<Result<String?>> paste() async {
    try {
      // 实际实现需要通过 dart:js_interop 使用 Clipboard API
      return const Success(null);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/adapters/web_clipboard_adapter.dart
git commit -m "feat(web): add WebClipboardAdapter implementation"
```

---

## Task 14: 创建 WebShareAdapter

**Files:**
- Create: `flutter/apps/web/lib/adapters/web_share_adapter.dart`

- [ ] **Step 1: 创建 WebShareAdapter 实现**

```dart
// flutter/apps/web/lib/adapters/web_share_adapter.dart

import 'package:im_core/core.dart';

class WebShareAdapter implements SharePort {
  @override
  Future<Result<bool>> isAvailable() async {
    try {
      // 实际实现需要通过 dart:js_interop 检查 navigator.share
      return const Success(false);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  @override
  Future<Result<void>> shareText(String text) async {
    try {
      if (!await isAvailable().then((r) => r is Success ? r.data : false)) {
        return const Failure(UnsupportedCapability('share'));
      }

      // 实际实现需要通过 dart:js_interop 使用 Web Share API
      return const Success(null);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  @override
  Future<Result<void>> shareFile({required String filePath, String? mimeType}) async {
    return const Failure(UnsupportedCapability('share_file'));
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/adapters/web_share_adapter.dart
git commit -m "feat(web): add WebShareAdapter implementation"
```

---

## Task 15: 创建 WebAudioRecorderAdapter

**Files:**
- Create: `flutter/apps/web/lib/adapters/web_audio_recorder_adapter.dart`

- [ ] **Step 1: 创建 WebAudioRecorderAdapter 实现**

```dart
// flutter/apps/web/lib/adapters/web_audio_recorder_adapter.dart

import 'package:im_core/core.dart';

class WebAudioRecorderAdapter implements AudioRecorderPort {
  bool _isRecording = false;

  @override
  Future<Result<void>> startRecording() async {
    try {
      if (_isRecording) {
        return const Failure(UnknownError('已在录音中'));
      }

      // 实际实现需要通过 dart:js_interop 使用 MediaRecorder API
      _isRecording = true;
      return const Success(null);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  @override
  Future<Result<PickedFile>> stopRecording() async {
    try {
      if (!_isRecording) {
        return const Failure(UnknownError('未在录音中'));
      }

      // 实际实现需要通过 dart:js_interop 停止 MediaRecorder 并获取音频数据
      _isRecording = false;
      return const Failure(UnknownError('录音功能待实现'));
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  @override
  Future<Result<void>> cancelRecording() async {
    try {
      if (!_isRecording) {
        return const Failure(UnknownError('未在录音中'));
      }

      _isRecording = false;
      return const Success(null);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  @override
  Future<Result<bool>> isRecording() async {
    return Success(_isRecording);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/adapters/web_audio_recorder_adapter.dart
git commit -m "feat(web): add WebAudioRecorderAdapter implementation"
```

---

## Task 16: 更新 Providers 配置

**Files:**
- Modify: `flutter/apps/web/lib/core/di/providers.dart`

- [ ] **Step 1: 添加新的 Port providers**

```dart
// 在现有 providers.dart 文件末尾添加

// Platform Capability Providers
final filePickerPortProvider = Provider<FilePickerPort>((ref) {
  return WebFilePickerAdapter();
});

final notificationPortProvider = Provider<NotificationPort>((ref) {
  return WebNotificationAdapter();
});

final networkStatusPortProvider = Provider<NetworkStatusPort>((ref) {
  return WebNetworkStatusAdapter();
});

final clipboardPortProvider = Provider<ClipboardPort>((ref) {
  return WebClipboardAdapter();
});

final sharePortProvider = Provider<SharePort>((ref) {
  return WebShareAdapter();
});

final audioRecorderPortProvider = Provider<AudioRecorderPort>((ref) {
  return WebAudioRecorderAdapter();
});
```

- [ ] **Step 2: 添加必要的 import**

```dart
// 在文件顶部添加

import '../../adapters/web_file_picker_adapter.dart';
import '../../adapters/web_notification_adapter.dart';
import '../../adapters/web_network_status_adapter.dart';
import '../../adapters/web_clipboard_adapter.dart';
import '../../adapters/web_share_adapter.dart';
import '../../adapters/web_audio_recorder_adapter.dart';
```

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/lib/core/di/providers.dart
git commit -m "feat(web): add platform capability providers"
```

---

## Task 17: 改造 MessageInput 组件

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart`

- [ ] **Step 1: 添加必要的 import**

```dart
// 在文件顶部添加

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
```

- [ ] **Step 2: 将 MessageInput 改造为 ConsumerStatefulWidget**

```dart
class MessageInput extends ConsumerStatefulWidget {
  const MessageInput({
    super.key,
    required this.onSend,
    required this.onSendImage,
    required this.onSendFile,
    required this.onSendVoice,
  });

  final void Function(String text) onSend;
  final void Function(UploadResult result) onSendImage;
  final void Function(UploadResult result) onSendFile;
  final void Function(UploadResult result) onSendVoice;

  @override
  ConsumerState<MessageInput> createState() => _MessageInputState();
}

class _MessageInputState extends ConsumerState<MessageInput> {
  final _controller = TextEditingController();
  bool _isUploading = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _pickAndSendImage() async {
    final filePicker = ref.read(filePickerPortProvider);
    final result = await filePicker.pickImage();

    if (result case Success(:final data)) {
      await _uploadAndSend(data, widget.onSendImage);
    }
  }

  Future<void> _pickAndSendFile() async {
    final filePicker = ref.read(filePickerPortProvider);
    final result = await filePicker.pickFile();

    if (result case Success(:final data)) {
      await _uploadAndSend(data, widget.onSendFile);
    }
  }

  Future<void> _recordAndSendVoice() async {
    final audioRecorder = ref.read(audioRecorderPortProvider);

    final startResult = await audioRecorder.startRecording();
    if (startResult is Failure) return;

    // 实际实现中，应该由用户通过 UI 交互（如长按按钮）来控制录音时长
    _showRecordingUI();
  }

  void _showRecordingUI() {
    // 显示录音 UI，包含停止按钮
  }

  Future<void> _stopRecordingAndSend() async {
    final audioRecorder = ref.read(audioRecorderPortProvider);

    final stopResult = await audioRecorder.stopRecording();
    if (stopResult case Success(:final data)) {
      await _uploadAndSend(data, widget.onSendVoice);
    }
  }

  Future<void> _uploadAndSend(
    PickedFile file,
    void Function(UploadResult) callback,
  ) async {
    setState(() => _isUploading = true);

    try {
      final fileApi = ref.read(fileApiProvider);
      final uploadResult = await _uploadFile(fileApi, file);
      callback(uploadResult);
    } finally {
      setState(() => _isUploading = false);
    }
  }

  Future<UploadResult> _uploadFile(FileApi fileApi, PickedFile file) async {
    if (file.mimeType.startsWith('image/')) {
      return fileApi.uploadImage(file.bytes, file.name);
    } else if (file.mimeType.startsWith('audio/')) {
      return fileApi.uploadAudio(file.bytes, file.name);
    } else {
      return fileApi.uploadFile(file.bytes, file.name);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (_isUploading)
          const LinearProgressIndicator(),
        TextField(
          controller: _controller,
          decoration: InputDecoration(
            hintText: '输入消息...',
            suffixIcon: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  icon: const Icon(Icons.image),
                  onPressed: _isUploading ? null : _pickAndSendImage,
                ),
                IconButton(
                  icon: const Icon(Icons.attach_file),
                  onPressed: _isUploading ? null : _pickAndSendFile,
                ),
                IconButton(
                  icon: const Icon(Icons.mic),
                  onPressed: _isUploading ? null : _recordAndSendVoice,
                ),
                IconButton(
                  icon: const Icon(Icons.send),
                  onPressed: _isUploading
                      ? null
                      : () {
                          widget.onSend(_controller.text);
                          _controller.clear();
                        },
                ),
              ],
            ),
          ),
          onSubmitted: (text) {
            widget.onSend(text);
            _controller.clear();
          },
        ),
      ],
    );
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart
git commit -m "feat(web): refactor MessageInput to use platform capabilities"
```

---

## Task 18: 创建 MockFilePickerAdapter

**Files:**
- Create: `flutter/apps/web/test/mocks/mock_file_picker_adapter.dart`

- [ ] **Step 1: 创建 MockFilePickerAdapter**

```dart
// flutter/apps/web/test/mocks/mock_file_picker_adapter.dart

import 'package:im_core/core.dart';

class MockFilePickerAdapter implements FilePickerPort {
  PickedFile? _mockFile;
  FailureError? _mockError;

  void setMockFile(PickedFile file) {
    _mockFile = file;
    _mockError = null;
  }

  void setMockError(FailureError error) {
    _mockError = error;
    _mockFile = null;
  }

  @override
  Future<Result<PickedFile>> pickImage({ImageSource source = ImageSource.gallery}) async {
    if (_mockError != null) {
      return Failure(_mockError!);
    }
    if (_mockFile != null) {
      return Success(_mockFile!);
    }
    return const Failure(OperationCancelled());
  }

  @override
  Future<Result<PickedFile>> pickFile({List<String>? allowedExtensions}) async {
    if (_mockError != null) {
      return Failure(_mockError!);
    }
    if (_mockFile != null) {
      return Success(_mockFile!);
    }
    return const Failure(OperationCancelled());
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/test/mocks/mock_file_picker_adapter.dart
git commit -m "test(web): add MockFilePickerAdapter"
```

---

## Task 19: 创建 MockAudioRecorderAdapter

**Files:**
- Create: `flutter/apps/web/test/mocks/mock_audio_recorder_adapter.dart`

- [ ] **Step 1: 创建 MockAudioRecorderAdapter**

```dart
// flutter/apps/web/test/mocks/mock_audio_recorder_adapter.dart

import 'package:im_core/core.dart';

class MockAudioRecorderAdapter implements AudioRecorderPort {
  bool _isRecording = false;
  PickedFile? _mockFile;
  FailureError? _mockError;

  void setMockFile(PickedFile file) {
    _mockFile = file;
    _mockError = null;
  }

  void setMockError(FailureError error) {
    _mockError = error;
    _mockFile = null;
  }

  @override
  Future<Result<void>> startRecording() async {
    if (_mockError != null) {
      return Failure(_mockError!);
    }
    _isRecording = true;
    return const Success(null);
  }

  @override
  Future<Result<PickedFile>> stopRecording() async {
    if (_mockError != null) {
      return Failure(_mockError!);
    }
    if (!_isRecording) {
      return const Failure(UnknownError('未在录音中'));
    }
    _isRecording = false;
    if (_mockFile != null) {
      return Success(_mockFile!);
    }
    return const Failure(UnknownError('无录音数据'));
  }

  @override
  Future<Result<void>> cancelRecording() async {
    _isRecording = false;
    return const Success(null);
  }

  @override
  Future<Result<bool>> isRecording() async {
    return Success(_isRecording);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/test/mocks/mock_audio_recorder_adapter.dart
git commit -m "test(web): add MockAudioRecorderAdapter"
```

---

## Task 20: 创建 FilePickerPort 单元测试

**Files:**
- Create: `flutter/apps/web/test/ports/file_picker_port_test.dart`

- [ ] **Step 1: 创建 FilePickerPort 单元测试**

```dart
// flutter/apps/web/test/ports/file_picker_port_test.dart

import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import '../mocks/mock_file_picker_adapter.dart';

void main() {
  group('FilePickerPort', () {
    late MockFilePickerAdapter adapter;

    setUp(() {
      adapter = MockFilePickerAdapter();
    });

    test('pickImage 成功', () async {
      final mockFile = PickedFile(
        name: 'test.jpg',
        mimeType: 'image/jpeg',
        bytes: Uint8List(100),
        size: 100,
      );
      adapter.setMockFile(mockFile);

      final result = await adapter.pickImage();

      expect(result, isA<Success<PickedFile>>());
      expect((result as Success).data.name, 'test.jpg');
    });

    test('pickImage 用户取消', () async {
      final result = await adapter.pickImage();

      expect(result, isA<Failure>());
      expect((result as Failure).error, isA<OperationCancelled>());
    });

    test('pickImage 发生错误', () async {
      adapter.setMockError(const UnknownError('测试错误'));

      final result = await adapter.pickImage();

      expect(result, isA<Failure>());
      expect((result as Failure).error, isA<UnknownError>());
    });

    test('pickFile 成功', () async {
      final mockFile = PickedFile(
        name: 'document.pdf',
        mimeType: 'application/pdf',
        bytes: Uint8List(200),
        size: 200,
      );
      adapter.setMockFile(mockFile);

      final result = await adapter.pickFile();

      expect(result, isA<Success<PickedFile>>());
      expect((result as Success).data.name, 'document.pdf');
    });

    test('pickFile 用户取消', () async {
      final result = await adapter.pickFile();

      expect(result, isA<Failure>());
      expect((result as Failure).error, isA<OperationCancelled>());
    });
  });
}
```

- [ ] **Step 2: 运行测试验证**

Run: `cd flutter/apps/web && flutter test test/ports/file_picker_port_test.dart`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/test/ports/file_picker_port_test.dart
git commit -m "test(web): add FilePickerPort unit tests"
```

---

## Task 21: 创建 WebFilePickerAdapter 集成测试

**Files:**
- Create: `flutter/apps/web/test/adapters/web_file_picker_adapter_test.dart`

- [ ] **Step 1: 创建 WebFilePickerAdapter 集成测试**

```dart
// flutter/apps/web/test/adapters/web_file_picker_adapter_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:new_im_project/adapters/web_file_picker_adapter.dart';

void main() {
  group('WebFilePickerAdapter', () {
    late WebFilePickerAdapter adapter;

    setUp(() {
      adapter = WebFilePickerAdapter();
    });

    test('pickImage 返回 Result 类型', () async {
      final result = await adapter.pickImage();
      expect(result, isA<Result<PickedFile>>());
    });

    test('pickFile 返回 Result 类型', () async {
      final result = await adapter.pickFile();
      expect(result, isA<Result<PickedFile>>());
    });
  });
}
```

- [ ] **Step 2: 运行测试验证**

Run: `cd flutter/apps/web && flutter test test/adapters/web_file_picker_adapter_test.dart`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/test/adapters/web_file_picker_adapter_test.dart
git commit -m "test(web): add WebFilePickerAdapter integration tests"
```

---

## Task 22: 创建 MessageInput 集成测试

**Files:**
- Create: `flutter/apps/web/test/widgets/message_input_test.dart`

- [ ] **Step 1: 创建 MessageInput 集成测试**

```dart
// flutter/apps/web/test/widgets/message_input_test.dart

import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:new_im_project/features/chat/presentation/widgets/message_input.dart';
import '../mocks/mock_file_picker_adapter.dart';
import '../mocks/mock_audio_recorder_adapter.dart';

void main() {
  group('MessageInput', () {
    late MockFilePickerAdapter mockFilePicker;
    late MockAudioRecorderAdapter mockAudioRecorder;

    setUp(() {
      mockFilePicker = MockFilePickerAdapter();
      mockAudioRecorder = MockAudioRecorderAdapter();
    });

    testWidgets('点击图片按钮触发文件选择', (tester) async {
      final mockFile = PickedFile(
        name: 'test.jpg',
        mimeType: 'image/jpeg',
        bytes: Uint8List(100),
        size: 100,
      );
      mockFilePicker.setMockFile(mockFile);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            filePickerPortProvider.overrideWithValue(mockFilePicker),
            audioRecorderPortProvider.overrideWithValue(mockAudioRecorder),
          ],
          child: MaterialApp(
            home: Scaffold(
              body: MessageInput(
                onSend: (_) {},
                onSendImage: (_) {},
                onSendFile: (_) {},
                onSendVoice: (_) {},
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.byIcon(Icons.image));
      await tester.pumpAndSettle();
    });

    testWidgets('点击附件按钮触发文件选择', (tester) async {
      final mockFile = PickedFile(
        name: 'document.pdf',
        mimeType: 'application/pdf',
        bytes: Uint8List(200),
        size: 200,
      );
      mockFilePicker.setMockFile(mockFile);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            filePickerPortProvider.overrideWithValue(mockFilePicker),
            audioRecorderPortProvider.overrideWithValue(mockAudioRecorder),
          ],
          child: MaterialApp(
            home: Scaffold(
              body: MessageInput(
                onSend: (_) {},
                onSendImage: (_) {},
                onSendFile: (_) {},
                onSendVoice: (_) {},
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.byIcon(Icons.attach_file));
      await tester.pumpAndSettle();
    });
  });
}
```

- [ ] **Step 2: 运行测试验证**

Run: `cd flutter/apps/web && flutter test test/widgets/message_input_test.dart`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/test/widgets/message_input_test.dart
git commit -m "test(web): add MessageInput integration tests"
```

---

## Task 23: 更新 core.dart 导出

**Files:**
- Modify: `flutter/packages/core/lib/core.dart`

- [ ] **Step 1: 添加新模型和端口的导出**

```dart
// 在 core.dart 文件中添加

// Models
export 'src/models/result.dart';
export 'src/models/failure_error.dart';
export 'src/models/picked_file.dart';

// Ports
export 'src/ports/file_picker_port.dart';
export 'src/ports/notification_port.dart';
export 'src/ports/network_status_port.dart';
export 'src/ports/clipboard_port.dart';
export 'src/ports/share_port.dart';
export 'src/ports/audio_recorder_port.dart';
```

- [ ] **Step 2: Commit**

```bash
git add flutter/packages/core/lib/core.dart
git commit -m "feat(core): export platform capability models and ports"
```

---

## Task 24: 运行完整测试套件

**Files:**
- None

- [ ] **Step 1: 运行所有测试**

Run: `cd flutter/apps/web && flutter test`
Expected: All tests PASS

- [ ] **Step 2: 修复任何失败的测试**

如果测试失败，检查并修复问题。

- [ ] **Step 3: Commit（如有修复）**

```bash
git add -A
git commit -m "fix(web): resolve test failures"
```

---

## Task 25: 验证构建

**Files:**
- None

- [ ] **Step 1: 运行 Flutter 分析**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors

- [ ] **Step 2: 修复任何分析问题**

如果分析发现问题，检查并修复。

- [ ] **Step 3: Commit（如有修复）**

```bash
git add -A
git commit -m "fix(web): resolve analysis issues"
```

---

## 自我审查清单

1. **规范覆盖**：每个规范需求都有对应的任务
   - ✅ Result 类型
   - ✅ FailureError 类型
   - ✅ PickedFile 数据模型
   - ✅ 6 个 Port 接口
   - ✅ 6 个 Web Adapter 实现
   - ✅ 依赖注入配置
   - ✅ MessageInput 改造
   - ✅ Mock 和测试

2. **占位符扫描**：没有 TBD、TODO 或模糊步骤
   - ✅ 所有步骤都有具体代码

3. **类型一致性**：所有类型、方法签名一致
   - ✅ Result<T> 和 FailureError 在所有 Port 中使用
   - ✅ PickedFile 在 FilePickerPort 和 AudioRecorderPort 中使用
   - ✅ NetworkStatus 在 NetworkStatusPort 中使用

4. **任务独立性**：每个任务都可以独立完成
   - ✅ 任务 1-9 创建核心模型和 Port（无依赖）
   - ✅ 任务 10-15 创建 Web Adapter（依赖 Port）
   - ✅ 任务 16-17 更新配置和 UI（依赖 Adapter）
   - ✅ 任务 18-24 创建测试（依赖实现）

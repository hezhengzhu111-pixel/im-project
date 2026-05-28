# Platform Capabilities Adapter Layer Design

## 目标

建立统一的设备能力适配层，为 Flutter Web 提供文件选择、通知、网络状态、剪贴板、分享、语音录制等能力，同时为未来 Windows/macOS 客户端复用做准备。

## 当前痛点

Vue Web 已通过 Capacitor 使用 camera、filesystem、keyboard、network、push notifications、share 等能力。Flutter Web 虽然依赖 file_picker，但 MessageInput 里图片/文件选择仍是 TODO，WebWsClient 也直接依赖 dart:html，不利于桌面复用。

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                      Presentation Layer                     │
│  MessageInput (选择 + 上传 + 发送)                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Ports (core)                          │
│  FilePickerPort  NotificationPort  NetworkStatusPort        │
│  ClipboardPort   SharePort         AudioRecorderPort        │
│  + PickedFile, Failure, Result<T> 模型                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Adapters (apps/web)                       │
│  WebFilePickerAdapter  WebNotificationAdapter               │
│  WebNetworkStatusAdapter  WebClipboardAdapter               │
│  WebShareAdapter       WebAudioRecorderAdapter              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Platform APIs                             │
│  File Picker Plugin  Browser Notification  online/offline   │
│  Clipboard API       Web Share API         MediaRecorder    │
└─────────────────────────────────────────────────────────────┘
```

## 技术决策

1. **Port 位置**：放在 `flutter/packages/core`（与现有 WsClientPort、HttpClientPort 等一致）
2. **错误处理**：每个 Port 方法返回 `Result<T, Failure>`（类似 Rust 的 Result 类型）
3. **文件数据模型**：`PickedFile` 包含 `name`、`mimeType`、`bytes`（Uint8List）、`size`
4. **MessageInput 输出**：`UploadResult`（已上传完成，包含 URL）

## Port 接口定义

### 1. FilePickerPort

```dart
// flutter/packages/core/lib/src/ports/file_picker_port.dart

abstract class FilePickerPort {
  /// 选择图片
  Future<Result<PickedFile>> pickImage({ImageSource source});

  /// 选择文件
  Future<Result<PickedFile>> pickFile({List<String>? allowedExtensions});
}

enum ImageSource { camera, gallery }
```

### 2. NotificationPort

```dart
// flutter/packages/core/lib/src/ports/notification_port.dart

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

### 3. NetworkStatusPort

```dart
// flutter/packages/core/lib/src/ports/network_status_port.dart

abstract class NetworkStatusPort {
  /// 获取当前连接状态
  Future<Result<NetworkStatus>> getStatus();

  /// 监听网络状态变化
  Stream<NetworkStatus> onStatusChange();
}

enum NetworkStatus { online, offline, unknown }
```

### 4. ClipboardPort

```dart
// flutter/packages/core/lib/src/ports/clipboard_port.dart

abstract class ClipboardPort {
  /// 复制文本到剪贴板
  Future<Result<void>> copy(String text);

  /// 从剪贴板粘贴文本
  Future<Result<String?>> paste();
}
```

### 5. SharePort

```dart
// flutter/packages/core/lib/src/ports/share_port.dart

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

### 6. AudioRecorderPort

```dart
// flutter/packages/core/lib/src/ports/audio_recorder_port.dart

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

## 数据模型

### 1. PickedFile

```dart
// flutter/packages/core/lib/src/models/picked_file.dart

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

### 2. Result

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

### 3. FailureError

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

## Web Adapter 实现

### 1. WebFilePickerAdapter

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

### 2. WebNotificationAdapter

```dart
// flutter/apps/web/lib/adapters/web_notification_adapter.dart

import 'dart:js_interop';
import 'package:im_core/core.dart';

class WebNotificationAdapter implements NotificationPort {
  @override
  Future<Result<bool>> requestPermission() async {
    try {
      final permission = await _requestNotificationPermission();
      return Success(permission == 'granted');
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
      final permission = await _requestNotificationPermission();
      if (permission != 'granted') {
        return const Failure(PermissionDenied('notification'));
      }

      _showBrowserNotification(title, body: body, payload: payload);
      return const Success(null);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  Future<String> _requestNotificationPermission() async {
    // 使用 Web Notification API
    final result = await _callNotificationMethod('requestPermission');
    return result;
  }

  void _showBrowserNotification(String title, {String? body, String? payload}) {
    // 创建浏览器通知
    _callNotificationMethod('new', [title, body, payload]);
  }

  dynamic _callNotificationMethod(String method, [List<dynamic>? args]) {
    // 桥接到 JavaScript Notification API
    throw UnimplementedError('需要实现 Web Notification API 桥接');
  }
}
```

### 3. WebNetworkStatusAdapter

```dart
// flutter/apps/web/lib/adapters/web_network_status_adapter.dart

import 'dart:async';
import 'dart:js_interop';
import 'package:im_core/core.dart';

class WebNetworkStatusAdapter implements NetworkStatusPort {
  final _statusController = StreamController<NetworkStatus>.broadcast();

  WebNetworkStatusAdapter() {
    _initListeners();
  }

  void _initListeners() {
    _addEventListener('online', (_) {
      _statusController.add(NetworkStatus.online);
    });
    _addEventListener('offline', (_) {
      _statusController.add(NetworkStatus.offline);
    });
  }

  @override
  Future<Result<NetworkStatus>> getStatus() async {
    try {
      final isOnline = _checkOnlineStatus();
      return Success(isOnline ? NetworkStatus.online : NetworkStatus.offline);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  @override
  Stream<NetworkStatus> onStatusChange() {
    return _statusController.stream;
  }

  bool _checkOnlineStatus() {
    return true; // 实际实现需要桥接到 JavaScript
  }

  void _addEventListener(String event, Function handler) {
    // 添加事件监听器
  }

  void dispose() {
    _statusController.close();
  }
}
```

### 4. WebClipboardAdapter

```dart
// flutter/apps/web/lib/adapters/web_clipboard_adapter.dart

import 'dart:js_interop';
import 'package:im_core/core.dart';

class WebClipboardAdapter implements ClipboardPort {
  @override
  Future<Result<void>> copy(String text) async {
    try {
      await _writeToClipboard(text);
      return const Success(null);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  @override
  Future<Result<String?>> paste() async {
    try {
      final text = await _readFromClipboard();
      return Success(text);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  Future<void> _writeToClipboard(String text) async {
    throw UnimplementedError('需要实现 Web Clipboard API 桥接');
  }

  Future<String?> _readFromClipboard() async {
    throw UnimplementedError('需要实现 Web Clipboard API 桥接');
  }
}
```

### 5. WebShareAdapter

```dart
// flutter/apps/web/lib/adapters/web_share_adapter.dart

import 'dart:js_interop';
import 'package:im_core/core.dart';

class WebShareAdapter implements SharePort {
  @override
  Future<Result<bool>> isAvailable() async {
    try {
      final available = _checkShareSupport();
      return Success(available);
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
      await _shareText(text);
      return const Success(null);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  @override
  Future<Result<void>> shareFile({required String filePath, String? mimeType}) async {
    return const Failure(UnsupportedCapability('share_file'));
  }

  bool _checkShareSupport() {
    return false; // 实际实现需要桥接到 JavaScript
  }

  Future<void> _shareText(String text) async {
    throw UnimplementedError('需要实现 Web Share API 桥接');
  }
}
```

### 6. WebAudioRecorderAdapter

```dart
// flutter/apps/web/lib/adapters/web_audio_recorder_adapter.dart

import 'dart:async';
import 'dart:js_interop';
import 'package:im_core/core.dart';

class WebAudioRecorderAdapter implements AudioRecorderPort {
  bool _isRecording = false;

  @override
  Future<Result<void>> startRecording() async {
    try {
      if (_isRecording) {
        return const Failure(UnknownError('已在录音中'));
      }

      await _startMediaRecorder();
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

      final file = await _stopMediaRecorder();
      _isRecording = false;
      return Success(file);
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

      await _cancelMediaRecorder();
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

  Future<void> _startMediaRecorder() async {
    throw UnimplementedError('需要实现 Web MediaRecorder API 桥接');
  }

  Future<PickedFile> _stopMediaRecorder() async {
    throw UnimplementedError('需要实现 Web MediaRecorder API 桥接');
  }

  Future<void> _cancelMediaRecorder() async {
    throw UnimplementedError('需要实现 Web MediaRecorder API 桥接');
  }
}
```

## 依赖注入

### Providers 配置

```dart
// flutter/apps/web/lib/core/di/providers.dart

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../adapters/web_file_picker_adapter.dart';
import '../../adapters/web_notification_adapter.dart';
import '../../adapters/web_network_status_adapter.dart';
import '../../adapters/web_clipboard_adapter.dart';
import '../../adapters/web_share_adapter.dart';
import '../../adapters/web_audio_recorder_adapter.dart';

// Port Providers
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

### MessageInput 改造

```dart
// flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';

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
    // 这里只是示例，实际需要添加录音状态 UI 和停止按钮
    _showRecordingUI();
  }

  void _showRecordingUI() {
    // 显示录音 UI，包含停止按钮
    // 用户点击停止按钮后调用 _stopRecordingAndSend
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

## 测试策略

### 1. Mock Adapter

```dart
// test/mocks/mock_file_picker_adapter.dart

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

```dart
// test/mocks/mock_audio_recorder_adapter.dart

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

### 2. Port 单元测试

```dart
// test/ports/file_picker_port_test.dart

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
  });
}
```

### 3. Adapter 集成测试

```dart
// test/adapters/web_file_picker_adapter_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:new_im_project/adapters/web_file_picker_adapter.dart';

void main() {
  group('WebFilePickerAdapter', () {
    late WebFilePickerAdapter adapter;

    setUp(() {
      adapter = WebFilePickerAdapter();
    });

    test('pickImage 返回 UnsupportedCapability on non-web', () async {
      final result = await adapter.pickImage();
      expect(result, isA<Result<PickedFile>>());
    });
  });
}
```

### 4. MessageInput 集成测试

```dart
// test/widgets/message_input_test.dart

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
  });
}
```

## 实现顺序和文件清单

### 阶段 1：核心模型和 Port 定义

| 文件 | 说明 |
|---|---|
| `flutter/packages/core/lib/src/models/result.dart` | Result 类型 |
| `flutter/packages/core/lib/src/models/failure_error.dart` | 错误类型 |
| `flutter/packages/core/lib/src/models/picked_file.dart` | 文件数据模型 |
| `flutter/packages/core/lib/src/ports/file_picker_port.dart` | 文件选择端口 |
| `flutter/packages/core/lib/src/ports/notification_port.dart` | 通知端口 |
| `flutter/packages/core/lib/src/ports/network_status_port.dart` | 网络状态端口 |
| `flutter/packages/core/lib/src/ports/clipboard_port.dart` | 剪贴板端口 |
| `flutter/packages/core/lib/src/ports/share_port.dart` | 分享端口 |
| `flutter/packages/core/lib/src/ports/audio_recorder_port.dart` | 录音端口 |

### 阶段 2：Web Adapter 实现

| 文件 | 说明 |
|---|---|
| `flutter/apps/web/lib/adapters/web_file_picker_adapter.dart` | 文件选择适配器 |
| `flutter/apps/web/lib/adapters/web_notification_adapter.dart` | 通知适配器 |
| `flutter/apps/web/lib/adapters/web_network_status_adapter.dart` | 网络状态适配器 |
| `flutter/apps/web/lib/adapters/web_clipboard_adapter.dart` | 剪贴板适配器 |
| `flutter/apps/web/lib/adapters/web_share_adapter.dart` | 分享适配器 |
| `flutter/apps/web/lib/adapters/web_audio_recorder_adapter.dart` | 录音适配器 |

### 阶段 3：依赖注入和 UI 改造

| 文件 | 说明 |
|---|---|
| `flutter/apps/web/lib/core/di/providers.dart` | 添加新 Port providers |
| `flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart` | 改造消息输入组件 |

### 阶段 4：测试

| 文件 | 说明 |
|---|---|
| `flutter/apps/web/test/mocks/mock_file_picker_adapter.dart` | Mock 文件选择器 |
| `flutter/apps/web/test/mocks/mock_audio_recorder_adapter.dart` | Mock 录音器 |
| `flutter/apps/web/test/ports/file_picker_port_test.dart` | 端口单元测试 |
| `flutter/apps/web/test/adapters/web_file_picker_adapter_test.dart` | 适配器测试 |
| `flutter/apps/web/test/widgets/message_input_test.dart` | 组件集成测试 |

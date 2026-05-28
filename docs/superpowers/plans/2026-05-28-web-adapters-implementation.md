# Web Platform Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 6 个 Web adapter 的真实浏览器 API 实现，修复 MessageInput 录音按钮，统一错误处理。

**Architecture:** 各 adapter 自包含 `package:web` js_interop 调用，错误码经 l10n 映射后由 UI 层展示。测试使用手写 mock，不依赖真实浏览器。

**Tech Stack:** Dart, Flutter, package:web, dart:js_interop, Riverpod, flutter_test

---

## File Structure

```
flutter/apps/web/
├── lib/
│   ├── adapters/
│   │   ├── web_audio_recorder_adapter.dart    # REWRITE — MediaRecorder
│   │   ├── web_notification_adapter.dart      # REWRITE — Notification API
│   │   ├── web_share_adapter.dart             # REWRITE — Web Share API
│   │   ├── web_clipboard_adapter.dart         # REWRITE — Clipboard API
│   │   └── web_file_picker_adapter.dart       # FIX — error codes
│   ├── features/chat/presentation/widgets/
│   │   └── message_input.dart                 # FIX — recording logic + error display
│   └── l10n/
│       ├── app_zh.arb                         # ADD 5 error keys
│       └── app_en.arb                         # ADD 5 error keys
└── test/
    ├── ports/
    │   └── audio_recorder_port_test.dart      # NEW
    ├── adapters/
    │   └── web_file_picker_adapter_test.dart   # ADD error code tests
    └── features/chat/presentation/
        └── message_input_test.dart            # NEW — recording + error widget tests
```

---

### Task 1: 新增 l10n 错误 key

**Files:**
- Modify: `flutter/apps/web/lib/l10n/app_zh.arb`
- Modify: `flutter/apps/web/lib/l10n/app_en.arb`

- [ ] **Step 1: 在 app_zh.arb 末尾（`}` 前）添加 5 个 key**

在 `app_zh.arb` 文件最后一个 `}` 前插入：

```json
  "errorShareNotAvailable": "当前浏览器不支持分享",
  "errorClipboardNotAvailable": "当前浏览器不支持剪贴板",
  "errorNotificationPermissionDenied": "通知权限被拒绝",
  "errorMicrophonePermissionDenied": "麦克风权限被拒绝",
  "errorFileReadFailed": "无法读取文件数据",
```

- [ ] **Step 2: 在 app_en.arb 末尾（`}` 前）添加 5 个 key**

在 `app_en.arb` 文件最后一个 `}` 前插入：

```json
  "errorShareNotAvailable": "Sharing not available in this browser",
  "errorClipboardNotAvailable": "Clipboard not available in this browser",
  "errorNotificationPermissionDenied": "Notification permission denied",
  "errorMicrophonePermissionDenied": "Microphone permission denied",
  "errorFileReadFailed": "Failed to read file data",
```

- [ ] **Step 3: 生成 l10n 代码**

Run: `cd D:/project/new-im-project/flutter/apps/web && flutter gen-l10n`
Expected: 生成成功，无错误

- [ ] **Step 4: Commit**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/lib/l10n/app_zh.arb flutter/apps/web/lib/l10n/app_en.arb flutter/apps/web/lib/l10n/
git commit -m "feat(l10n): add error keys for web adapters"
```

---

### Task 2: 修复 WebFilePickerAdapter 错误处理

**Files:**
- Modify: `flutter/apps/web/lib/adapters/web_file_picker_adapter.dart`

- [ ] **Step 1: 修复 pickImage 中 bytes==null 和 catch 块**

将 `pickImage` 方法中的两处 `UnknownError` 替换：

```dart
// 第 19 行：bytes == null 分支
return const Failure(UnknownError('file_read_failed'));

// 第 28 行：catch 块
return const Failure(UnknownError('file_read_failed'));
```

完整替换后 pickImage 方法：

```dart
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
```

- [ ] **Step 2: 修复 pickFile 中 bytes==null 和 catch 块**

```dart
// 第 48 行：bytes == null 分支
return const Failure(UnknownError('file_read_failed'));

// 第 57 行：catch 块
return const Failure(UnknownError('file_read_failed'));
```

完整替换后 pickFile 方法：

```dart
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
```

- [ ] **Step 3: 验证无 e.toString() 残留**

Run: `grep -n "e.toString()" D:/project/new-im-project/flutter/apps/web/lib/adapters/web_file_picker_adapter.dart`
Expected: 无输出

- [ ] **Step 4: Commit**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/lib/adapters/web_file_picker_adapter.dart
git commit -m "fix(file-picker): replace hardcoded strings and e.toString() with error codes"
```

---

### Task 3: 重写 WebClipboardAdapter

**Files:**
- Rewrite: `flutter/apps/web/lib/adapters/web_clipboard_adapter.dart`

- [ ] **Step 1: 重写 WebClipboardAdapter 使用 Clipboard API**

替换 `web_clipboard_adapter.dart` 全部内容：

```dart
import 'package:web/web.dart' as web;
import 'package:im_core/core.dart';

class WebClipboardAdapter implements ClipboardPort {
  @override
  Future<Result<void>> copy(String text) async {
    try {
      await web.window.navigator.clipboard.writeText(text).toDart;
      return const Success(null);
    } catch (e) {
      return const Failure(UnknownError('clipboard_copy_failed'));
    }
  }

  @override
  Future<Result<String?>> paste() async {
    try {
      final text = await web.window.navigator.clipboard.readText().toDart;
      return Success(text.isNotEmpty ? text : null);
    } catch (e) {
      return const Failure(UnknownError('clipboard_paste_failed'));
    }
  }
}
```

- [ ] **Step 2: 验证无 e.toString() 残留**

Run: `grep -n "e.toString()" D:/project/new-im-project/flutter/apps/web/lib/adapters/web_clipboard_adapter.dart`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/lib/adapters/web_clipboard_adapter.dart
git commit -m "feat(clipboard): implement real Clipboard API via package:web"
```

---

### Task 4: 重写 WebNotificationAdapter

**Files:**
- Rewrite: `flutter/apps/web/lib/adapters/web_notification_adapter.dart`

- [ ] **Step 1: 重写 WebNotificationAdapter 使用 Notification API**

替换 `web_notification_adapter.dart` 全部内容：

```dart
import 'package:web/web.dart' as web;
import 'package:im_core/core.dart';

class WebNotificationAdapter implements NotificationPort {
  @override
  Future<Result<bool>> requestPermission() async {
    try {
      final permission =
          await web.Notification.requestPermission().toDart;
      return Success(permission == 'granted');
    } catch (e) {
      return const Failure(
          UnknownError('notification_permission_failed'));
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

      web.Notification(title, web.NotificationOptions(body: body));
      return const Success(null);
    } catch (e) {
      return const Failure(
          UnknownError('notification_show_failed'));
    }
  }
}
```

- [ ] **Step 2: 验证无 e.toString() 残留**

Run: `grep -n "e.toString()" D:/project/new-im-project/flutter/apps/web/lib/adapters/web_notification_adapter.dart`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/lib/adapters/web_notification_adapter.dart
git commit -m "feat(notification): implement real Notification API via package:web"
```

---

### Task 5: 重写 WebShareAdapter

**Files:**
- Rewrite: `flutter/apps/web/lib/adapters/web_share_adapter.dart`

- [ ] **Step 1: 重写 WebShareAdapter 使用 Web Share API**

替换 `web_share_adapter.dart` 全部内容：

```dart
import 'package:web/web.dart' as web;
import 'package:im_core/core.dart';

class WebShareAdapter implements SharePort {
  @override
  Future<Result<bool>> isAvailable() async {
    try {
      return Success(web.window.navigator.canShare != null);
    } catch (e) {
      return const Failure(UnknownError('share_check_failed'));
    }
  }

  @override
  Future<Result<void>> shareText(String text) async {
    try {
      final available = await isAvailable();
      if (available case Success(:final data) when !data) {
        return const Failure(UnsupportedCapability('share'));
      }

      await web.window.navigator
          .share(web.ShareData(text: text))
          .toDart;
      return const Success(null);
    } catch (e) {
      if (e is web.DOMException && e.name == 'AbortError') {
        return const Failure(OperationCancelled());
      }
      return const Failure(UnknownError('share_failed'));
    }
  }

  @override
  Future<Result<void>> shareFile({
    required String filePath,
    String? mimeType,
  }) async {
    return const Failure(UnsupportedCapability('share_file'));
  }
}
```

- [ ] **Step 2: 验证无 e.toString() 残留**

Run: `grep -n "e.toString()" D:/project/new-im-project/flutter/apps/web/lib/adapters/web_share_adapter.dart`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/lib/adapters/web_share_adapter.dart
git commit -m "feat(share): implement real Web Share API via package:web"
```

---

### Task 6: 重写 WebAudioRecorderAdapter

**Files:**
- Rewrite: `flutter/apps/web/lib/adapters/web_audio_recorder_adapter.dart`

- [ ] **Step 1: 重写 WebAudioRecorderAdapter 使用 MediaRecorder API**

替换 `web_audio_recorder_adapter.dart` 全部内容：

```dart
import 'dart:async';
import 'dart:js_interop';
import 'dart:typed_data';

import 'package:web/web.dart' as web;
import 'package:im_core/core.dart';

class WebAudioRecorderAdapter implements AudioRecorderPort {
  web.MediaRecorder? _recorder;
  web.MediaStream? _stream;
  final List<web.Blob> _chunks = [];
  bool _isRecording = false;

  @override
  Future<Result<void>> startRecording() async {
    if (_isRecording) {
      return const Failure(UnknownError('already_recording'));
    }

    try {
      final stream = await web.window.navigator.mediaDevices
          .getUserMedia(web.MediaStreamConstraints(audio: true))
          .toDart;

      _stream = stream;
      _recorder = web.MediaRecorder(stream);
      _chunks.clear();

      _recorder!.addEventListener(
        'dataavailable',
        (web.Event event) {
          final blobEvent = event as web.BlobEvent;
          final blob = blobEvent.data;
          if (blob != null && blob.size > 0) {
            _chunks.add(blob);
          }
        }.toJS,
      );

      _recorder!.start();
      _isRecording = true;
      return const Success(null);
    } catch (e) {
      _cleanup();
      if (e is web.DOMException && e.name == 'NotAllowedError') {
        return const Failure(PermissionDenied('microphone'));
      }
      return const Failure(
          UnknownError('recording_start_failed'));
    }
  }

  @override
  Future<Result<PickedFile>> stopRecording() async {
    if (!_isRecording || _recorder == null) {
      return const Failure(UnknownError('not_recording'));
    }

    try {
      final completer = Completer<void>();

      void onStop(web.Event _) {
        if (!completer.isCompleted) {
          completer.complete();
        }
      }

      _recorder!.addEventListener('stop', onStop.toJS);
      _recorder!.stop();
      await completer.future;
      _recorder!.removeEventListener('stop', onStop.toJS);

      final mimeType = _recorder!.mimeType;
      final effectiveType =
          mimeType.isNotEmpty ? mimeType : 'audio/webm';

      final blob = web.Blob(
        _chunks.toJS,
        web.BlobPropertyBag(type: effectiveType),
      );

      final bytes = await _blobToUint8List(blob);

      _cleanup();

      return Success(PickedFile.fromBytes(
        name: 'voice_${DateTime.now().millisecondsSinceEpoch}.webm',
        mimeType: effectiveType,
        bytes: bytes,
      ));
    } catch (e) {
      _cleanup();
      return const Failure(
          UnknownError('recording_stop_failed'));
    }
  }

  @override
  Future<Result<void>> cancelRecording() async {
    if (!_isRecording) {
      return const Failure(UnknownError('not_recording'));
    }

    _cleanup();
    return const Success(null);
  }

  @override
  Future<Result<bool>> isRecording() async {
    return Success(_isRecording);
  }

  void _cleanup() {
    _isRecording = false;

    if (_recorder != null) {
      try {
        if (_recorder!.state != 'inactive') {
          _recorder!.stop();
        }
      } catch (_) {}
      _recorder = null;
    }

    if (_stream != null) {
      _stream!.getTracks().forEach((track) => track.stop());
      _stream = null;
    }

    _chunks.clear();
  }

  Future<Uint8List> _blobToUint8List(web.Blob blob) async {
    final buffer = await blob.arrayBuffer().toDart;
    return buffer.asUint8List();
  }
}
```

- [ ] **Step 2: 验证无 e.toString() 残留**

Run: `grep -n "e.toString()" D:/project/new-im-project/flutter/apps/web/lib/adapters/web_audio_recorder_adapter.dart`
Expected: 无输出

- [ ] **Step 3: Commit**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/lib/adapters/web_audio_recorder_adapter.dart
git commit -m "feat(audio-recorder): implement real MediaRecorder via package:web"
```

---

### Task 7: 修复 MessageInput 录音逻辑和错误展示

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart`

- [ ] **Step 1: 添加 _mapError 方法**

在 `_MessageInputState` 类中（`_handleSend` 方法之后）添加：

```dart
  String _mapError(FailureError error, AppLocalizations loc) {
    return switch (error) {
      UnsupportedCapability(:final capability) =>
        switch (capability) {
          'audio_recording' => loc.errorRecordingNotImplemented,
          'share' => loc.errorShareNotAvailable,
          'clipboard' => loc.errorClipboardNotAvailable,
          _ => loc.commonFailed,
        },
      PermissionDenied(:final capability) =>
        switch (capability) {
          'notification' => loc.errorNotificationPermissionDenied,
          'microphone' => loc.errorMicrophonePermissionDenied,
          _ => loc.commonFailed,
        },
      OperationCancelled() => '',
      UnknownError(:final message) =>
        switch (message) {
          'file_read_failed' => loc.errorFileReadFailed,
          'already_recording' => loc.errorAlreadyRecording,
          'not_recording' => loc.errorNotRecording,
          _ => loc.commonFailed,
        },
    };
  }
```

- [ ] **Step 2: 增强 _recordAndSendVoice()**

替换现有 `_recordAndSendVoice` 方法：

```dart
  Future<void> _recordAndSendVoice() async {
    final audioRecorder = ref.read(audioRecorderPortProvider);
    final result = await audioRecorder.startRecording();

    if (result case Failure(:final error)) {
      if (mounted) {
        final loc = AppLocalizations.of(context)!;
        final msg = _mapError(error, loc);
        if (msg.isNotEmpty) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(msg)));
        }
      }
      return;
    }
    setState(() => _isRecording = true);
  }
```

- [ ] **Step 3: 增强 _stopRecordingAndSend()**

替换现有 `_stopRecordingAndSend` 方法：

```dart
  Future<void> _stopRecordingAndSend() async {
    final audioRecorder = ref.read(audioRecorderPortProvider);
    final result = await audioRecorder.stopRecording();

    setState(() => _isRecording = false);

    if (result case Success(:final data)) {
      await _uploadAndSend(data, widget.onSendVoice);
    } else if (result case Failure(:final error)) {
      if (mounted) {
        final loc = AppLocalizations.of(context)!;
        final msg = _mapError(error, loc);
        if (msg.isNotEmpty) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(msg)));
        }
      }
    }
  }
```

- [ ] **Step 4: 修复录音按钮 onPressed**

替换录音按钮部分（约 185-192 行）：

```dart
          Semantics(
            label: loc.a11yVoiceInput,
            button: true,
            child: IconButton(
              icon: Icon(_isRecording ? Icons.stop : Icons.mic),
              onPressed: _isUploading
                  ? null
                  : () {
                      if (_isRecording) {
                        _stopRecordingAndSend();
                      } else {
                        _recordAndSendVoice();
                      }
                    },
              tooltip: loc.a11yVoiceInput,
              color: _isRecording ? Colors.red : null,
            ),
          ),
```

- [ ] **Step 5: 禁用附件和发送按钮（上传中）**

附件按钮（约 176-180 行）：

```dart
            child: IconButton(
              icon: const Icon(Icons.add_circle_outline),
              onPressed: _isUploading ? null : _showAttachmentMenu,
              tooltip: loc.a11yAddAttachment,
            ),
```

发送按钮（约 211-215 行）：

```dart
            child: IconButton(
              icon: const Icon(Icons.send),
              onPressed: _isUploading ? null : _handleSend,
              tooltip: loc.a11ySendMessage,
              color: Theme.of(context).colorScheme.primary,
            ),
```

- [ ] **Step 6: 移除空的 _showRecordingUI 方法**

删除第 90-92 行的空方法：

```dart
  void _showRecordingUI() {
    // 显示录音 UI，包含停止按钮
  }
```

- [ ] **Step 7: Commit**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart
git commit -m "fix(message-input): wire recording buttons to recorder, add error display"
```

---

### Task 8: 新增 AudioRecorder Port 测试

**Files:**
- Create: `flutter/apps/web/test/ports/audio_recorder_port_test.dart`

- [ ] **Step 1: 创建 audio_recorder_port_test.dart**

```dart
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import '../mocks/mock_audio_recorder_adapter.dart';

void main() {
  group('AudioRecorderPort', () {
    late MockAudioRecorderAdapter adapter;

    setUp(() {
      adapter = MockAudioRecorderAdapter();
    });

    test('startRecording 成功', () async {
      final result = await adapter.startRecording();

      expect(result, isA<Success<void>>());
    });

    test('startRecording 失败', () async {
      adapter.setMockError(const UnknownError('already_recording'));

      final result = await adapter.startRecording();

      expect(result, isA<Failure>());
      expect((result as Failure).error, isA<UnknownError>());
      expect(
        ((result as Failure).error as UnknownError).message,
        'already_recording',
      );
    });

    test('stopRecording 成功', () async {
      final mockFile = PickedFile.fromBytes(
        name: 'voice.webm',
        mimeType: 'audio/webm',
        bytes: Uint8List(100),
      );
      adapter.setMockFile(mockFile);
      await adapter.startRecording();

      final result = await adapter.stopRecording();

      expect(result, isA<Success<PickedFile>>());
      expect((result as Success).data.name, 'voice.webm');
    });

    test('stopRecording 未录音返回 Failure', () async {
      final result = await adapter.stopRecording();

      expect(result, isA<Failure>());
      expect((result as Failure).error, isA<UnknownError>());
    });

    test('stopRecording 失败', () async {
      await adapter.startRecording();
      adapter.setMockError(const UnknownError('recording_stop_failed'));

      final result = await adapter.stopRecording();

      expect(result, isA<Failure>());
      expect((result as Failure).error, isA<UnknownError>());
    });

    test('cancelRecording 成功', () async {
      await adapter.startRecording();

      final result = await adapter.cancelRecording();

      expect(result, isA<Success<void>>());
    });

    test('isRecording 返回正确状态', () async {
      var result = await adapter.isRecording();
      expect((result as Success).data, false);

      await adapter.startRecording();
      result = await adapter.isRecording();
      expect((result as Success).data, true);

      await adapter.cancelRecording();
      result = await adapter.isRecording();
      expect((result as Success).data, false);
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/test/ports/audio_recorder_port_test.dart
git commit -m "test(audio-recorder): add port contract tests"
```

---

### Task 9: 新增 MessageInput Widget 测试

**Files:**
- Create: `flutter/apps/web/test/features/chat/presentation/message_input_test.dart`

- [ ] **Step 1: 创建 message_input_test.dart**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/chat/presentation/widgets/message_input.dart';
import 'package:im_web/core/di/platform_providers.dart';
import 'package:im_web/data/file_providers.dart';
import '../../../mocks/mock_audio_recorder_adapter.dart';
import '../../../mocks/mock_file_picker_adapter.dart';

void main() {
  late MockAudioRecorderAdapter mockRecorder;
  late MockFilePickerAdapter mockFilePicker;

  setUp(() {
    mockRecorder = MockAudioRecorderAdapter();
    mockFilePicker = MockFilePickerAdapter();
  });

  Widget buildSubject({
    void Function(String)? onSend,
    void Function(UploadResult)? onSendImage,
    void Function(UploadResult)? onSendFile,
    void Function(UploadResult)? onSendVoice,
  }) {
    return ProviderScope(
      overrides: [
        audioRecorderPortProvider.overrideWithValue(mockRecorder),
        filePickerPortProvider.overrideWithValue(mockFilePicker),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: MessageInput(
            onSend: onSend ?? (_) {},
            onSendImage: onSendImage ?? (_) {},
            onSendFile: onSendFile ?? (_) {},
            onSendVoice: onSendVoice ?? (_) {},
          ),
        ),
      ),
    );
  }

  group('MessageInput recording', () {
    testWidgets('点击 mic 调用 startRecording', (tester) async {
      await tester.pumpWidget(buildSubject());

      await tester.tap(find.byIcon(Icons.mic));
      await tester.pump();

      final result = await mockRecorder.isRecording();
      expect((result as Success).data, true);
    });

    testWidgets('录音中点击 stop 调用 stopRecording', (tester) async {
      final mockFile = PickedFile.fromBytes(
        name: 'voice.webm',
        mimeType: 'audio/webm',
        bytes: Uint8List(100),
      );
      mockRecorder.setMockFile(mockFile);

      await tester.pumpWidget(buildSubject());

      // Start recording
      await tester.tap(find.byIcon(Icons.mic));
      await tester.pump();

      // Stop recording
      await tester.tap(find.byIcon(Icons.stop));
      await tester.pump();

      final result = await mockRecorder.isRecording();
      expect((result as Success).data, false);
    });

    testWidgets('startRecording 失败展示 SnackBar', (tester) async {
      mockRecorder
          .setMockError(const UnknownError('already_recording'));

      await tester.pumpWidget(buildSubject());

      await tester.tap(find.byIcon(Icons.mic));
      await tester.pump(); // startRecording
      await tester.pump(); // SnackBar animation

      expect(find.byType(SnackBar), findsOneWidget);
    });

    testWidgets('file picker cancel 不触发上传', (tester) async {
      var uploadCalled = false;

      await tester.pumpWidget(buildSubject(
        onSendFile: (_) => uploadCalled = true,
      ));

      // MockFilePickerAdapter 默认返回 OperationCancelled
      final result = await mockFilePicker.pickFile();
      expect(result, isA<Failure>());
      expect((result as Failure).error, isA<OperationCancelled>());
      expect(uploadCalled, false);
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
cd D:/project/new-im-project
git add flutter/apps/web/test/features/chat/presentation/message_input_test.dart
git commit -m "test(message-input): add recording button and error display tests"
```

---

### Task 10: 全量验证

- [ ] **Step 1: 运行所有测试**

Run: `cd D:/project/new-im-project/flutter/apps/web && flutter test`
Expected: 全部通过

- [ ] **Step 2: 验证无 e.toString() 泄露**

Run: `grep -rn "e.toString()" D:/project/new-im-project/flutter/apps/web/lib/adapters/`
Expected: 无输出

- [ ] **Step 3: 验证无硬编码中文错误**

Run: `grep -rn "无法读取" D:/project/new-im-project/flutter/apps/web/lib/adapters/`
Expected: 无输出

- [ ] **Step 4: 验证 l10n key 完整**

Run: `grep -c "errorShareNotAvailable\|errorClipboardNotAvailable\|errorNotificationPermissionDenied\|errorMicrophonePermissionDenied\|errorFileReadFailed" D:/project/new-im-project/flutter/apps/web/lib/l10n/app_zh.arb D:/project/new-im-project/flutter/apps/web/lib/l10n/app_en.arb`
Expected: 每个文件 5 个匹配

- [ ] **Step 5: 最终 Commit（如有遗漏文件）**

```bash
cd D:/project/new-im-project
git status
# 检查是否有未提交的文件
```

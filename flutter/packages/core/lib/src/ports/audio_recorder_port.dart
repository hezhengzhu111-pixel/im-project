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

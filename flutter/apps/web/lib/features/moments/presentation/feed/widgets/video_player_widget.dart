import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

/// 可交互的视频播放器组件。
/// 点击缩略图后在原位展开播放器，支持播放/暂停、进度条、时长显示。
class MomentVideoPlayer extends StatefulWidget {
  const MomentVideoPlayer({
    required this.videoUrl,
    this.thumbnailUrl,
    super.key,
  });

  final String videoUrl;
  final String? thumbnailUrl;

  @override
  State<MomentVideoPlayer> createState() => _MomentVideoPlayerState();
}

class _MomentVideoPlayerState extends State<MomentVideoPlayer> {
  late VideoPlayerController _controller;
  bool _isInitialized = false;
  bool _hasError = false;
  String? _errorMsg;

  @override
  void initState() {
    super.initState();
    _initController();
  }

  Future<void> _initController() async {
    _controller = VideoPlayerController.networkUrl(Uri.parse(widget.videoUrl));
    try {
      await _controller.initialize();
      if (mounted) {
        setState(() => _isInitialized = true);
        _controller.addListener(_onListener);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _hasError = true;
          _errorMsg = e.toString();
        });
      }
    }
  }

  void _onListener() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _controller.removeListener(_onListener);
    _controller.dispose();
    super.dispose();
  }

  String _formatDuration(Duration d) {
    final minutes = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '${d.inHours > 0 ? '${d.inHours}:' : ''}$minutes:$seconds';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (_hasError) {
      return Container(
        constraints: const BoxConstraints(maxWidth: 720, maxHeight: 480),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(12),
        ),
        child: AspectRatio(
          aspectRatio: 16 / 9,
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.error_outline, size: 48, color: theme.colorScheme.error),
                const SizedBox(height: 8),
                Text(
                  _errorMsg ?? '播放失败',
                  style: TextStyle(color: theme.colorScheme.error, fontSize: 13),
                ),
              ],
            ),
          ),
        ),
      );
    }

    if (!_isInitialized) {
      return Container(
        constraints: const BoxConstraints(maxWidth: 720, maxHeight: 480),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: AspectRatio(
            aspectRatio: 16 / 9,
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (widget.thumbnailUrl != null)
                  Image.network(widget.thumbnailUrl!, fit: BoxFit.cover),
                const Center(child: CircularProgressIndicator()),
              ],
            ),
          ),
        ),
      );
    }

    return Container(
      constraints: const BoxConstraints(maxWidth: 720, maxHeight: 480),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: AspectRatio(
          aspectRatio: _controller.value.aspectRatio,
          child: Stack(
            alignment: Alignment.center,
            children: [
              VideoPlayer(_controller),

              // Play/Pause overlay
              GestureDetector(
                onTap: () {
                  _controller.value.isPlaying
                      ? _controller.pause()
                      : _controller.play();
                },
                child: AnimatedOpacity(
                  opacity: _controller.value.isPlaying ? 0.0 : 1.0,
                  duration: const Duration(milliseconds: 300),
                  child: Container(
                    decoration: const BoxDecoration(
                      color: Colors.black38,
                      shape: BoxShape.circle,
                    ),
                    padding: const EdgeInsets.all(12),
                    child: const Icon(Icons.play_arrow, color: Colors.white, size: 36),
                  ),
                ),
              ),

              // Bottom controls
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Colors.transparent, Colors.black54],
                    ),
                  ),
                  child: Row(
                    children: [
                      GestureDetector(
                        onTap: () {
                          _controller.value.isPlaying
                              ? _controller.pause()
                              : _controller.play();
                        },
                        child: Icon(
                          _controller.value.isPlaying
                              ? Icons.pause
                              : Icons.play_arrow,
                          color: Colors.white,
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        _formatDuration(_controller.value.position),
                        style: const TextStyle(color: Colors.white, fontSize: 11),
                      ),
                      Expanded(
                        child: SliderTheme(
                          data: SliderThemeData(
                            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 5),
                            trackHeight: 2,
                            activeTrackColor: Colors.white,
                            inactiveTrackColor: Colors.white30,
                            thumbColor: Colors.white,
                            overlayColor: Colors.white24,
                          ),
                          child: Slider(
                            value: _controller.value.position.inMilliseconds
                                .toDouble()
                                .clamp(
                                  0.0,
                                  _controller.value.duration.inMilliseconds.toDouble(),
                                ),
                            max: _controller.value.duration.inMilliseconds
                                .toDouble()
                                .clamp(1.0, double.infinity),
                            onChanged: (v) {
                              _controller.seekTo(Duration(milliseconds: v.toInt()));
                            },
                          ),
                        ),
                      ),
                      Text(
                        _formatDuration(_controller.value.duration),
                        style: const TextStyle(color: Colors.white, fontSize: 11),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

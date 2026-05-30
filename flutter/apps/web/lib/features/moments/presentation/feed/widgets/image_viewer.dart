import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// 全屏图片查看器，使用 Overlay 实现。
/// 支持多图左右滑动、双指缩放、点击关闭、ESC 关闭。
class ImageViewerOverlay {
  static OverlayEntry? _entry;

  /// 显示图片查看器。
  /// [initialIndex] 初始显示的图片索引。
  /// [imageUrls] 图片 URL 列表。
  static void show(BuildContext context, {required List<String> imageUrls, int initialIndex = 0}) {
    dismiss();
    _entry = OverlayEntry(
      builder: (_) => _ImageViewerBody(
        imageUrls: imageUrls,
        initialIndex: initialIndex,
        onDismiss: dismiss,
      ),
    );
    Overlay.of(context).insert(_entry!);
  }

  static void dismiss() {
    _entry?.remove();
    _entry = null;
  }
}

class _ImageViewerBody extends StatefulWidget {
  const _ImageViewerBody({
    required this.imageUrls,
    required this.initialIndex,
    required this.onDismiss,
  });

  final List<String> imageUrls;
  final int initialIndex;
  final VoidCallback onDismiss;

  @override
  State<_ImageViewerBody> createState() => _ImageViewerBodyState();
}

class _ImageViewerBodyState extends State<_ImageViewerBody> {
  late final PageController _pageController;
  late int _currentIndex;
  bool _visible = true;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
    _pageController = PageController(initialPage: widget.initialIndex);
    HardwareKeyboard.instance.addHandler(_onKey);
  }

  @override
  void dispose() {
    HardwareKeyboard.instance.removeHandler(_onKey);
    _pageController.dispose();
    super.dispose();
  }

  bool _onKey(KeyEvent event) {
    if (event is KeyDownEvent && event.logicalKey == LogicalKeyboardKey.escape) {
      widget.onDismiss();
      return true;
    }
    return false;
  }

  void _toggleVisibility() {
    setState(() => _visible = !_visible);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _toggleVisibility,
      child: AnimatedOpacity(
        opacity: _visible ? 1.0 : 0.0,
        duration: const Duration(milliseconds: 200),
        child: Container(
          color: Colors.black.withOpacity(0.95),
          child: Stack(
            children: [
              PageView.builder(
                controller: _pageController,
                itemCount: widget.imageUrls.length,
                onPageChanged: (index) => setState(() => _currentIndex = index),
                itemBuilder: (context, index) {
                  return InteractiveViewer(
                    minScale: 0.5,
                    maxScale: 4.0,
                    child: Center(
                      child: Image.network(
                        widget.imageUrls[index],
                        fit: BoxFit.contain,
                        errorBuilder: (_, __, ___) => const Icon(
                          Icons.broken_image,
                          color: Colors.white54,
                          size: 64,
                        ),
                      ),
                    ),
                  );
                },
              ),
              Positioned(
                top: 16,
                right: 16,
                child: IconButton(
                  onPressed: widget.onDismiss,
                  icon: const Icon(Icons.close, color: Colors.white, size: 28),
                ),
              ),
              if (widget.imageUrls.length > 1)
                Positioned(
                  bottom: 24,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Text(
                        '${_currentIndex + 1} / ${widget.imageUrls.length}',
                        style: const TextStyle(color: Colors.white, fontSize: 14),
                      ),
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

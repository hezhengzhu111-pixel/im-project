import 'package:flutter/material.dart';
import 'package:im_web/l10n/app_localizations.dart';

class MomentsTopbar extends StatelessWidget {
  const MomentsTopbar({
    required this.scrollProgress,
    required this.onComposeTap,
    super.key,
  });

  final double scrollProgress;
  final VoidCallback onComposeTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 56,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Text(
            AppLocalizations.of(context)!.momentsTitle,
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: Colors.white,
              shadows: [Shadow(blurRadius: 3, color: Colors.black45)],
            ),
          ),
          Positioned(
            right: 16,
            child: IconButton(
              onPressed: onComposeTap,
              icon: const Icon(Icons.camera_alt_outlined, color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }
}

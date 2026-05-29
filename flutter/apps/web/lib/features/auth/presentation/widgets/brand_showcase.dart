import 'package:flutter/material.dart';
import 'package:im_ui/im_ui.dart';
import 'package:im_web/l10n/app_localizations.dart';

class BrandShowcase extends StatelessWidget {
  const BrandShowcase({super.key});

  @override
  Widget build(BuildContext context) {
    if (context.isMobile) {
      return const SizedBox.shrink();
    }

    final loc = AppLocalizations.of(context)!;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 60, vertical: 40),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 品牌徽章
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.2),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.lock, size: 14, color: Colors.white),
                const SizedBox(width: 6),
                Text(
                  loc.brandBadge,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // 主标题
          Text(
            loc.brandTitle,
            style: const TextStyle(
              fontSize: 40,
              fontWeight: FontWeight.bold,
              color: Colors.white,
              height: 1.2,
              letterSpacing: -0.01,
            ),
          ),
          const SizedBox(height: 12),

          // 副标题
          Text(
            loc.brandSubtitle,
            style: TextStyle(
              fontSize: 15,
              color: Colors.white.withValues(alpha: 0.8),
              height: 1.5,
            ),
          ),
          const SizedBox(height: 32),

          // 功能特性列表
          _buildFeatureItem(
            icon: Icons.lock,
            label: loc.brandFeatureE2eeLabel,
            desc: loc.brandFeatureE2ee,
          ),
          const SizedBox(height: 10),
          _buildFeatureItem(
            icon: Icons.speed,
            label: loc.brandFeatureRealtimeLabel,
            desc: loc.brandFeatureRealtime,
          ),
          const SizedBox(height: 10),
          _buildFeatureItem(
            icon: Icons.devices,
            label: loc.brandFeatureDeviceTrustLabel,
            desc: loc.brandFeatureDeviceTrust,
          ),
          const SizedBox(height: 10),
          _buildFeatureItem(
            icon: Icons.smart_toy,
            label: loc.brandFeatureAiLabel,
            desc: loc.brandFeatureAi,
          ),
        ],
      ),
    );
  }

  Widget _buildFeatureItem({
    required IconData icon,
    required String label,
    required String desc,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.15),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, size: 18, color: Colors.white),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 1),
              Text(
                desc,
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.white.withValues(alpha: 0.7),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

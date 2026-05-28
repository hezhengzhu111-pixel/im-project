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
      padding: const EdgeInsets.all(60),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 品牌徽章
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.2),
              ),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.lock, size: 16, color: Colors.white),
                SizedBox(width: 8),
                Text(
                  'End-to-End Encrypted',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),

          // 主标题
          const Text(
            'Secure.\nPrivate.\nInstant.',
            style: TextStyle(
              fontSize: 48,
              fontWeight: FontWeight.bold,
              color: Colors.white,
              height: 1.15,
              letterSpacing: -0.02,
            ),
          ),
          const SizedBox(height: 20),

          // 副标题
          Text(
            loc.brandSubtitle,
            style: TextStyle(
              fontSize: 16,
              color: Colors.white.withValues(alpha: 0.8),
              height: 1.6,
            ),
          ),
          const SizedBox(height: 40,

          ),

          // 功能特性列表
          _buildFeatureItem(
            icon: Icons.lock,
            label: 'E2EE Enabled',
            desc: loc.brandFeatureE2ee,
          ),
          const SizedBox(height: 16),
          _buildFeatureItem(
            icon: Icons.speed,
            label: 'Realtime Delivery',
            desc: loc.brandFeatureRealtime,
          ),
          const SizedBox(height: 16),
          _buildFeatureItem(
            icon: Icons.devices,
            label: 'Device Trust',
            desc: loc.brandFeatureDeviceTrust,
          ),
          const SizedBox(height: 16),
          _buildFeatureItem(
            icon: Icons.smart_toy,
            label: 'AI Assistant Online',
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
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.15),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, size: 20, color: Colors.white),
          ),
          const SizedBox(width: 14),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                desc,
                style: TextStyle(
                  fontSize: 13,
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

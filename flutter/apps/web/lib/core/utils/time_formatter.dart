import 'package:flutter/widgets.dart';
import 'package:im_web/l10n/app_localizations.dart';

String formatRelativeTime(BuildContext context, DateTime time) {
  final loc = AppLocalizations.of(context)!;
  final diff = DateTime.now().difference(time);
  if (diff.inMinutes < 1) return loc.timeJustNow;
  if (diff.inHours < 1) return loc.timeMinutesAgo(diff.inMinutes);
  if (diff.inDays < 1) return loc.timeHoursAgo(diff.inHours);
  if (diff.inDays < 30) return loc.timeDaysAgo(diff.inDays);
  return '${time.month}/${time.day}';
}

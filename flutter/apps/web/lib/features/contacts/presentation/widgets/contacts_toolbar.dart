import 'package:flutter/material.dart';
import 'package:im_ui/im_ui.dart';
import 'package:im_web/l10n/app_localizations.dart';

enum ContactsSortMode { name, online, time }

class ContactsToolbar extends StatelessWidget {
  const ContactsToolbar({
    super.key,
    required this.searchKeyword,
    required this.onSearchChanged,
    required this.sortMode,
    required this.onSortChanged,
  });

  final String searchKeyword;
  final ValueChanged<String> onSearchChanged;
  final ContactsSortMode sortMode;
  final ValueChanged<ContactsSortMode> onSortChanged;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;

    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: ImTokens.layoutPanelPadding,
        vertical: ImTokens.layoutItemGap,
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: TextEditingController(text: searchKeyword)
                ..selection = TextSelection.collapsed(
                  offset: searchKeyword.length,
                ),
              onChanged: onSearchChanged,
              decoration: InputDecoration(
                hintText: loc.contactsSearch,
                prefixIcon: const Icon(Icons.search, size: 20),
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: ImTokens.layoutPanelPadding,
                  vertical: 10,
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(ImTokens.radiusSm),
                  borderSide: BorderSide.none,
                ),
                filled: true,
                fillColor: ImTokens.wechatSearchBg,
              ),
            ),
          ),
          const SizedBox(width: ImTokens.layoutItemGap),
          PopupMenuButton<ContactsSortMode>(
            icon: const Icon(Icons.sort),
            tooltip: loc.contactsSortByName,
            onSelected: onSortChanged,
            itemBuilder: (context) => [
              PopupMenuItem(
                value: ContactsSortMode.name,
                child: Text(loc.contactsSortByName),
              ),
              PopupMenuItem(
                value: ContactsSortMode.online,
                child: Text(loc.contactsSortByOnline),
              ),
              PopupMenuItem(
                value: ContactsSortMode.time,
                child: Text(loc.contactsSortByTime),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

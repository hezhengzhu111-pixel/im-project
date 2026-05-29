# Join Group Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Join Group" dialog to the Flutter Web group list page, allowing users to search for and join existing groups.

**Architecture:** Single dialog component triggered from AppBar search icon. Uses existing `GroupNotifier.searchGroups()` and `GroupNotifier.joinGroup()` methods. No new API or state management needed.

**Tech Stack:** Flutter, Riverpod, Material Design

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `flutter/apps/web/lib/features/group/presentation/group_list_page.dart` | Modify | Add search icon button to AppBar |
| `flutter/apps/web/lib/features/group/presentation/widgets/join_group_dialog.dart` | Create | Search input + results list + join button |

---

### Task 1: Create Join Group Dialog Widget

**Files:**
- Create: `flutter/apps/web/lib/features/group/presentation/widgets/join_group_dialog.dart`

- [ ] **Step 1: Create the dialog widget file**

```dart
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';

class JoinGroupDialog extends ConsumerStatefulWidget {
  const JoinGroupDialog({super.key});

  @override
  ConsumerState<JoinGroupDialog> createState() => _JoinGroupDialogState();
}

class _JoinGroupDialogState extends ConsumerState<JoinGroupDialog> {
  final _searchController = TextEditingController();
  Timer? _debounceTimer;
  bool _isJoining = false;

  @override
  void dispose() {
    _searchController.dispose();
    _debounceTimer?.cancel();
    super.dispose();
  }

  void _onSearchChanged(String query) {
    _debounceTimer?.cancel();
    _debounceTimer = Timer(const Duration(milliseconds: 300), () {
      ref.read(groupStateProvider.notifier).searchGroups(query);
    });
  }

  Future<void> _joinGroup(Group group) async {
    if (_isJoining) return;
    setState(() => _isJoining = true);

    final success = await ref.read(groupStateProvider.notifier).joinGroup(group.id);

    if (mounted) {
      setState(() => _isJoining = false);
      final messenger = ScaffoldMessenger.of(context);
      if (success) {
        messenger.showSnackBar(
          SnackBar(content: Text('已加入 ${group.name}')),
        );
        // Reload groups list
        final userId = ref.read(authStateProvider).user?.id;
        if (userId != null) {
          ref.read(groupStateProvider.notifier).loadGroups(userId);
        }
      } else {
        messenger.showSnackBar(
          const SnackBar(content: Text('加入失败，请重试')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final groupState = ref.watch(groupStateProvider);

    return Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 400, maxHeight: 500),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Text(
                '加入群聊',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _searchController,
                onChanged: _onSearchChanged,
                decoration: InputDecoration(
                  hintText: '搜索群组名称...',
                  prefixIcon: const Icon(Icons.search),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Expanded(
                child: _buildSearchResults(groupState),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSearchResults(GroupState groupState) {
    if (groupState.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    final results = groupState.searchResults;
    if (results.isEmpty) {
      return Center(
        child: Text(
          _searchController.text.isEmpty
              ? '输入关键词搜索群组'
              : '未找到匹配的群组',
        ),
      );
    }

    return ListView.builder(
      itemCount: results.length,
      itemBuilder: (context, index) {
        final group = results[index];
        return ListTile(
          leading: CircleAvatar(
            backgroundImage:
                group.avatar != null ? NetworkImage(group.avatar!) : null,
            child: group.avatar == null
                ? Text(group.name.isNotEmpty ? group.name[0] : '?')
                : null,
          ),
          title: Text(group.name),
          subtitle: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (group.description != null && group.description!.isNotEmpty)
                Text(
                  group.description!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              if (group.memberCount != null)
                Text('${group.memberCount} 成员'),
            ],
          ),
          trailing: _isJoining
              ? const SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : TextButton(
                  onPressed: () => _joinGroup(group),
                  child: const Text('加入'),
                ),
        );
      },
    );
  }
}
```

- [ ] **Step 2: Verify file compiles**

Run: `cd flutter/apps/web && flutter analyze lib/features/group/presentation/widgets/join_group_dialog.dart`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/lib/features/group/presentation/widgets/join_group_dialog.dart
git commit -m "feat(group): add join group dialog widget"
```

---

### Task 2: Add Search Button to Group List Page

**Files:**
- Modify: `flutter/apps/web/lib/features/group/presentation/group_list_page.dart`

- [ ] **Step 1: Add import for JoinGroupDialog**

Add after existing imports:

```dart
import 'widgets/join_group_dialog.dart';
```

- [ ] **Step 2: Add search icon button to AppBar actions**

Replace the current AppBar actions block (lines 35-41) with:

```dart
actions: [
  IconButton(
    icon: const Icon(Icons.search),
    onPressed: () => showDialog(
      context: context,
      builder: (_) => const JoinGroupDialog(),
    ),
    tooltip: '加入群聊',
  ),
  IconButton(
    icon: const Icon(Icons.add),
    onPressed: () => context.push('/groups/create'),
    tooltip: loc.groupCreateTooltip,
  ),
],
```

- [ ] **Step 3: Verify file compiles**

Run: `cd flutter/apps/web && flutter analyze lib/features/group/presentation/group_list_page.dart`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add flutter/apps/web/lib/features/group/presentation/group_list_page.dart
git commit -m "feat(group): add join group search button to AppBar"
```

---

### Task 3: Add Localization Keys

**Files:**
- Modify: `flutter/apps/web/lib/l10n/app_en.arb`
- Modify: `flutter/apps/web/lib/l10n/app_zh.arb`

- [ ] **Step 1: Add English localization keys**

Add to `app_en.arb`:

```json
"joinGroup": "Join Group",
"joinGroupSearchHint": "Search group name...",
"joinGroupNoResults": "No matching groups found",
"joinGroupInputHint": "Enter keywords to search groups",
"joinGroupSuccess": "Joined {name}",
"joinGroupError": "Failed to join, please try again",
"joinGroupMembers": "{count} members"
```

- [ ] **Step 2: Add Chinese localization keys**

Add to `app_zh.arb`:

```json
"joinGroup": "加入群聊",
"joinGroupSearchHint": "搜索群组名称...",
"joinGroupNoResults": "未找到匹配的群组",
"joinGroupInputHint": "输入关键词搜索群组",
"joinGroupSuccess": "已加入 {name}",
"joinGroupError": "加入失败，请重试",
"joinGroupMembers": "{count} 成员"
```

- [ ] **Step 3: Generate localization files**

Run: `cd flutter/apps/web && flutter gen-l10n`
Expected: Successful generation

- [ ] **Step 4: Update JoinGroupDialog to use localization**

Replace hardcoded strings in `join_group_dialog.dart` with localization calls:

```dart
final loc = AppLocalizations.of(context)!;
```

Then replace:
- `'加入群聊'` → `loc.joinGroup`
- `'搜索群组名称...'` → `loc.joinGroupSearchHint`
- `'未找到匹配的群组'` → `loc.joinGroupNoResults`
- `'输入关键词搜索群组'` → `loc.joinGroupInputHint`
- `'已加入 ${group.name}'` → `loc.joinGroupSuccess(group.name)`
- `'加入失败，请重试'` → `loc.joinGroupError`
- `'${group.memberCount} 成员'` → `loc.joinGroupMembers(group.memberCount!)`

- [ ] **Step 5: Verify compilation**

Run: `cd flutter/apps/web && flutter analyze`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add flutter/apps/web/lib/l10n/app_en.arb flutter/apps/web/lib/l10n/app_zh.arb flutter/apps/web/lib/features/group/presentation/widgets/join_group_dialog.dart
git commit -m "feat(group): add localization for join group dialog"
```

---

### Task 4: Manual Verification

- [ ] **Step 1: Run Flutter Web app**

Run: `cd flutter/apps/web && flutter run -d chrome`
Expected: App launches successfully

- [ ] **Step 2: Navigate to group page**

- Login to the app
- Navigate to Groups tab
- Verify AppBar shows search icon (magnifying glass) next to create icon

- [ ] **Step 3: Test search functionality**

- Click search icon
- Verify dialog opens with search input
- Type a group name keyword
- Verify results appear after ~300ms debounce
- Verify each result shows: avatar, name, description (if exists), member count (if exists)

- [ ] **Step 4: Test join functionality**

- Click "加入" button on a group
- Verify loading indicator appears
- Verify SnackBar shows success message
- Close dialog
- Verify group appears in the list

- [ ] **Step 5: Test error scenarios**

- Search for non-existent group
- Verify "未找到匹配的群组" message
- Try joining a group you're already in (if API returns error)
- Verify error SnackBar appears

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(group): join group dialog fixes from testing"
```

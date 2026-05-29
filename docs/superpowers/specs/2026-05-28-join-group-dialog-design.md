# Join Group Dialog Design

**Date**: 2026-05-28
**Feature**: Flutter Web - 加入群聊能力
**Status**: Draft

## Overview

为 Flutter Web 群组页添加"加入群聊"功能，允许用户搜索并加入已存在的群组。

## Requirements

1. 群组页 AppBar 添加搜索图标入口
2. 点击弹出 Dialog，支持搜索群组
3. 搜索结果展示：群头像、群名、描述（有则显示）、成员数（有则显示）
4. 实时搜索（300ms 防抖）
5. 点击"加入"调用 joinGroup API
6. 加入成功后 Snackbar 提示，弹窗保持打开
7. 加入成功后刷新群组列表

## Constraints

- 只修改 Flutter Web 代码
- 不修改联系人、聊天、后端接口
- 不处理群组操作菜单和创建群

## Architecture

### Data Layer

已有实现，无需修改：
- `GroupApi.searchGroups(keyword)` - 搜索群组
- `GroupApi.joinGroup(groupId)` - 加入群组
- `GroupNotifier.searchGroups(keyword)` - 搜索状态管理
- `GroupNotifier.joinGroup(groupId)` - 加入状态管理

### UI Layer

#### Entry Point

修改 `group_list_page.dart`：
- AppBar actions 添加搜索图标按钮
- 点击调用 `_showJoinGroupDialog(context)`

#### Join Group Dialog

新增 `join_group_dialog.dart`，StatefulWidget，包含：

1. **搜索框**：`TextField` with `onChanged` callback
2. **防抖逻辑**：`Timer` 300ms，取消前一次搜索
3. **搜索结果**：`ListView.builder`，每项显示：
   - `CircleAvatar`（群头像，无头像显示首字母）
   - `Text` 群名
   - `Text` 描述（条件显示）
   - `Text` 成员数（条件显示）
   - `TextButton` "加入"按钮
4. **状态管理**：
   - 搜索中：`CircularProgressIndicator`
   - 空结果：提示文字
   - 错误：错误提示
5. **加入操作**：
   - 调用 `GroupNotifier.joinGroup`
   - 成功：`SnackBar` 提示，重新加载群组列表
   - 失败：`SnackBar` 错误提示

### Data Flow

```
User Input → TextField.onChanged
           → Timer 300ms debounce
           → GroupNotifier.searchGroups()
           → State.searchResults updates
           → ListView rebuilds

User Click Join → GroupNotifier.joinGroup()
               → Success: SnackBar + loadGroups()
               → Failure: SnackBar error
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `group_list_page.dart` | Modify | Add search icon button to AppBar |
| `join_group_dialog.dart` | Create | Join group dialog widget |

## Verification

1. 运行 Flutter Web 应用
2. 导航到群组页
3. 验证 AppBar 显示搜索图标
4. 点击搜索图标，验证 Dialog 弹出
5. 输入关键词，验证搜索结果实时更新
6. 验证搜索结果包含群头像、群名、描述、成员数
7. 点击"加入"，验证加入成功后 SnackBar 提示
8. 关闭 Dialog，验证群组列表已刷新

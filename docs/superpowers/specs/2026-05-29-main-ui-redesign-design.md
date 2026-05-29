# IM 主界面 UI 重构设计文档

> 日期：2026-05-29
> 状态：已确认
> 范围：登录后全部页面 + 导航栏 + 底层主题 Tokens

## 背景与目标

当前 IM 项目的登录页采用了现代的"紫-青渐变 + 毛玻璃"风格，但登录后的主界面（聊天、联系人、设置等）仍使用 Material 默认样式，与登录页严重割裂。

**目标**：将登录后的全部页面升级为"赛博悬浮发光"的现代社交风格，实现从登录到主界面的视觉统一。

## 品牌色体系

### 四色品牌渐变

用于登录页背景、主按钮、大型交互组件：

```
#667eea → #764ba2 → #23a6d5 → #23d5ab
```

Flutter 代码：
```dart
const LinearGradient(
  colors: [Color(0xFF667eea), Color(0xFF764BA2), Color(0xFF23a6d5), Color(0xFF23d5ab)],
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
)
```

### 品牌紫色

用于导航栏选中图标、胶囊发光阴影：

```
#764BA2
```

### 背景层级

| 层级 | 颜色 | 用途 |
|------|------|------|
| 底层背景 | `#F7F8FA` | Scaffold body、页面底层 |
| 内容层 | `Colors.white` | 侧边栏、聊天面板、卡片 |

## 组件设计规范

### 1. 侧边导航栏 (NavigationRail) — 赛博悬浮发光

**移除旧样式**：
- 删除 `BackdropFilter` 毛玻璃效果
- 删除 `VerticalDivider` 黑线分割

**新样式**：
- 背景：纯白 `Colors.white`
- 右侧微弱阴影：`BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 15, offset: Offset(5, 0))`
- 选中胶囊：纯白背景 `Colors.white`，圆角 `BorderRadius.circular(12)`
- 胶囊发光阴影：`BoxShadow(color: Color(0xFF764BA2).withOpacity(0.4), blurRadius: 15, spreadRadius: 0, offset: Offset(0, 4))`
- 选中图标颜色：深紫色 `Color(0xFF764BA2)`
- 未选中图标颜色：淡蓝灰色 `Colors.blueGrey.shade400`
- 增加整体左右 Padding，避免图标拥挤

**实现位置**：`flutter/packages/ui/lib/src/layouts/responsive_scaffold.dart`

### 2. 按钮 (Buttons)

**主按钮**（保存修改、退出登录、发布动态等）：
- 背景：四色渐变（通过 `Container` + `BoxDecoration` 实现）
- 文字：纯白加粗
- 圆角：`BorderRadius.circular(12)`
- 无边框

**次按钮**（取消、返回等）：
- 背景：`Colors.grey.shade100`
- 文字：深灰色
- 圆角：`BorderRadius.circular(12)`

**实现方式**：
```dart
Container(
  decoration: BoxDecoration(
    gradient: const LinearGradient(
      colors: [Color(0xFF667eea), Color(0xFF764BA2), Color(0xFF23a6d5), Color(0xFF23d5ab)],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
    borderRadius: BorderRadius.circular(12),
  ),
  child: ElevatedButton(
    style: ElevatedButton.styleFrom(
      backgroundColor: Colors.transparent,
      shadowColor: Colors.transparent,
      foregroundColor: Colors.white,
      textStyle: const TextStyle(fontWeight: FontWeight.bold),
    ),
    onPressed: onPressed,
    child: child,
  ),
)
```

### 3. 输入框 (TextField)

- 背景填充：`Colors.grey.shade100`
- 默认边框：`OutlineInputBorder(borderSide: BorderSide.none, borderRadius: BorderRadius.circular(12))`
- 聚焦边框：品牌紫色 `Color(0xFF764BA2)`，宽度 2px
- 内边距：水平 16px，垂直 14px

**实现方式**：
```dart
InputDecoration(
  fillColor: Colors.grey.shade100,
  filled: true,
  border: OutlineInputBorder(
    borderSide: BorderSide.none,
    borderRadius: BorderRadius.circular(12),
  ),
  focusedBorder: OutlineInputBorder(
    borderSide: const BorderSide(color: Color(0xFF764BA2), width: 2),
    borderRadius: BorderRadius.circular(12),
  ),
  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
)
```

### 4. 卡片与列表

- 圆角：`BorderRadius.circular(16)`
- 阴影：`BoxShadow(color: Colors.black.withOpacity(0.03), blurRadius: 20, offset: Offset(0, 4))`
- 内边距：至少 `EdgeInsets.all(20)`
- 移除所有生硬的灰色 `Border` 边框线
- 卡片浮在 `#F7F8FA` 浅灰背景上，形成自然层次感

### 5. TabBar

- 选中状态：使用品牌渐变色或品牌紫色
- 未选中状态：灰色
- 指示器：胶囊形状，品牌色背景

### 6. 列表项 (ListTile)

- 增加内部留白：`EdgeInsets.symmetric(horizontal: 16, vertical: 8)`
- 移除默认分割线
- 悬停/点击效果使用品牌色的浅色叠加（`.withOpacity(0.05)`）

## 底层 Token 更新

### ImColors (im_tokens.dart)

**Light 模式更新**：
```dart
// 主色：从蓝色改为品牌紫色
primary: Color(0xFF764BA2)

// 背景色
background: Color(0xFFF7F8FA)  // 原 #FAFAFA
surface: Colors.white

// 渐变色列表
brandGradient: [Color(0xFF667eea), Color(0xFF764BA2), Color(0xFF23a6d5), Color(0xFF23d5ab)]
```

**Dark 模式**：仅保留基础颜色变量映射，防止编译报错，不做精细化打磨。

### ImTheme (im_theme.dart)

更新 Material 3 组件主题：
- `NavigationRailTheme` — 应用赛博悬浮发光样式
- `ElevatedButtonTheme` — 应用渐变按钮样式
- `InputDecorationTheme` — 应用新输入框样式
- `CardTheme` — 应用圆角 + 微弱阴影
- `ListTileTheme` — 增加留白

## 页面重构清单

| 页面 | 文件路径 | 主要变更 |
|------|----------|----------|
| 导航栏 | `packages/ui/.../responsive_scaffold.dart` | 赛博悬浮发光风格 |
| 聊天页 | `features/chat/presentation/chat_page.dart` | 背景色、卡片阴影、输入框 |
| 联系人页 | `features/contacts/presentation/contacts_page.dart` | TabBar、列表项、按钮 |
| 群组页 | `features/group/presentation/group_list_page.dart` | 卡片、列表项 |
| 朋友圈页 | `features/moments/presentation/moments_main_page.dart` | 卡片、按钮 |
| 设置页 | `features/settings/presentation/settings_page.dart` | 卡片阴影、按钮、列表项 |
| 个人资料页 | `features/settings/presentation/profile_page.dart` | 输入框、按钮、卡片 |
| 添加好友页 | `features/contacts/presentation/add_friend_page.dart` | 输入框、按钮 |
| 创建群组页 | `features/group/presentation/create_group_page.dart` | 输入框、按钮 |
| AI 设置页 | `features/settings/presentation/ai_settings_page.dart` | 卡片、开关、列表项 |

## 设计原则

1. **只改样式，不改逻辑** — 保持所有业务逻辑、状态管理和路由不变
2. **Token 优先** — 优先修改底层 ImTokens/ImColors，全局生效
3. **组件复用** — 提取通用的渐变按钮、卡片等组件，避免重复代码
4. **渐进式** — 先完成亮色模式，暗色模式仅基础适配

## 验收标准

- [ ] 登录页与主界面视觉风格统一，无割裂感
- [ ] 导航栏呈现"赛博悬浮发光"效果
- [ ] 所有主按钮使用四色渐变
- [ ] 所有输入框使用新样式（淡灰背景 + 圆角 + 聚焦紫色边框）
- [ ] 所有卡片使用圆角 16 + 微弱阴影，无生硬边框
- [ ] 暗色模式无编译报错

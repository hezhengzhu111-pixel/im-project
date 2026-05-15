# 移动端颜色硬编码扫描清单

> 任务编号：XM-10
> 扫描日期：2026-05-15
> 扫描范围：`frontend/apps/mobile/src/` 下 screens、components、app/theme、app/navigation、stores
> 目的：输出主题系统改造清单，不做批量替换

---

## 一、当前主题系统现状

### 1.1 colors.ts 令牌定义（`src/app/theme/colors.ts`）

当前为**扁平对象**，无 light/dark 结构化分组：

| 令牌 | 值 | 暗色对应 | 缺失 |
|------|------|----------|------|
| `bg` | `#F6F7F9` | `darkBg: #101419` | - |
| `surface` | `#FFFFFF` | `darkSurface: #171D24` | - |
| `surfaceAlt` | `#EEF2F7` | - | **缺失暗色** |
| `text` | `#17202A` | `darkText: #F3F6FA` | - |
| `muted` | `#657386` | `darkMuted: #A7B0BE` | - |
| `border` | `#DDE3EA` | - | **缺失暗色** |
| `primary` | `#0E7AFE` | - | **缺失暗色** |
| `primarySoft` | `#E8F2FF` | - | **缺失暗色** |
| `success` | `#18A058` | - | **缺失暗色** |
| `warning` | `#D9822B` | - | **缺失暗色** |
| `danger` | `#D93025` | - | **缺失暗色** |
| `ai` | `#4C6FFF` | - | **缺失暗色** |
| `encrypted` | `#5B6472` | - | **缺失暗色** |

**问题**：14 个语义令牌中仅 4 个有暗色变体，其余 10 个在暗色模式下无法正确显示。

### 1.2 架构缺陷

| 问题 | 文件 | 说明 |
|------|------|------|
| 无结构化 light/dark 主题 | `src/app/theme/colors.ts` | 扁平对象，消费端需手动判断 `colors.darkBg` vs `colors.bg` |
| NavigationContainer 无 theme | `src/app/AppProviders.tsx:7` | 缺少 `theme` prop，导航栏始终使用默认亮色主题 |
| 主题偏好未接入渲染 | `src/stores/settingsStore.ts` vs `src/app/App.tsx:19` | store 存储 `theme` 但 App.tsx 用 `useColorScheme()`（OS 级），用户手动选择无效 |
| shadows.ts 硬编码 | `src/app/theme/shadows.ts:3` | `shadowColor: '#000'` 硬编码黑色 |

---

## 二、硬编码颜色清单

### 2.1 硬编码 hex（`#FFFFFF`）

| 文件 | 位置/组件 | 当前颜色写法 | 类型 | 建议 token | 优先级 |
|------|-----------|-------------|------|-----------|--------|
| `src/screens/chat/ChatScreen.tsx` | L172 / sendText | `'#FFFFFF'` | hardcoded hex | `colors.onPrimary` | P0 |
| `src/screens/settings/AiSettingsScreen.tsx` | L321 / providerChipTextActive | `'#FFFFFF'` | hardcoded hex | `colors.onPrimary` | P0 |
| `src/screens/moments/CreateMomentScreen.tsx` | L112 / badgeText | `'#FFFFFF'` | hardcoded hex | `colors.onPrimary` | P1 |
| `src/screens/moments/MomentsFeedScreen.tsx` | L322 / mediaOverflowText | `'#FFFFFF'` | hardcoded hex | `colors.onOverlay` | P1 |
| `src/components/chat/MessageBubble.tsx` | L116 / mineText | `'#FFFFFF'` | hardcoded hex | `colors.onPrimary` | P0 |
| `src/components/chat/SessionRow.tsx` | L88 / badgeText | `'#FFFFFF'` | hardcoded hex | `colors.onPrimary` | P0 |
| `src/components/common/PrimaryButton.tsx` | L40 / text | `'#FFFFFF'` | hardcoded hex | `colors.onPrimary` | P0 |
| `src/components/common/StateViews.tsx` | L110 / buttonText | `'#FFFFFF'` | hardcoded hex | `colors.onPrimary` | P1 |
| `src/components/common/StateViews.tsx` | L119 / bannerText | `'#FFFFFF'` | hardcoded hex | `colors.onWarning` | P1 |

### 2.2 硬编码 rgba

| 文件 | 位置/组件 | 当前颜色写法 | 类型 | 建议 token | 优先级 |
|------|-----------|-------------|------|-----------|--------|
| `src/screens/moments/MomentsFeedScreen.tsx` | L317 / mediaOverflow | `'rgba(0,0,0,0.5)'` | hardcoded rgba | `colors.overlay` | P1 |

### 2.3 硬编码阴影色

| 文件 | 位置/组件 | 当前颜色写法 | 类型 | 建议 token | 优先级 |
|------|-----------|-------------|------|-----------|--------|
| `src/app/theme/shadows.ts` | L3 / soft.shadowColor | `'#000'` | hardcoded hex | `colors.shadow` | P2 |

### 2.4 Alpha 拼接（不安全的颜色写法）

| 文件 | 位置/组件 | 当前颜色写法 | 类型 | 建议 token | 优先级 |
|------|-----------|-------------|------|-----------|--------|
| `src/screens/settings/AiSettingsScreen.tsx` | L240 / noticeCard | `colors.warning + '20'` | alpha concat | `colors.warningSoft` | P1 |
| `src/screens/settings/AiSettingsScreen.tsx` | L362 / actionButton | `colors.primary + '20'` | alpha concat | `colors.primarySoft`（已有，复用） | P1 |
| `src/screens/settings/AiSettingsScreen.tsx` | L370 / deleteButton | `colors.danger + '20'` | alpha concat | `colors.dangerSoft` | P1 |

---

## 三、静态 `colors.xxx` 使用点清单

### 3.1 `colors.bg`（`#F6F7F9`）— 背景色

| 文件 | 位置/组件 | 属性 | 优先级 |
|------|-----------|------|--------|
| `src/components/common/Screen.tsx` | L54 / safe | backgroundColor | P0 |
| `src/screens/settings/AiSettingsScreen.tsx` | L308 / providerChip | backgroundColor | P2 |
| `src/screens/settings/AiSettingsScreen.tsx` | L392 / footerNotice | backgroundColor | P2 |

### 3.2 `colors.surface`（`#FFFFFF`）— 卡片/面板色

| 文件 | 位置/组件 | 属性 | 优先级 |
|------|-----------|------|--------|
| `src/components/common/Screen.tsx` | L65 / header | backgroundColor | P0 |
| `src/components/chat/MessageBubble.tsx` | L104 / bubble (other) | backgroundColor | P0 |
| `src/components/chat/SessionRow.tsx` | L36 / row | backgroundColor | P0 |
| `src/components/forms/TextField.tsx` | L46 / input | backgroundColor | P0 |
| `src/screens/chat/ChatScreen.tsx` | L151 / composer | backgroundColor | P0 |
| `src/screens/settings/PrivacySettingsScreen.tsx` | L64 / section | backgroundColor | P1 |
| `src/screens/settings/DebugDiagnosticsScreen.tsx` | L158 / section | backgroundColor | P1 |
| `src/screens/settings/AiSettingsScreen.tsx` | L258 / section | backgroundColor | P1 |
| `src/screens/moments/MomentDetailScreen.tsx` | L168 / postSection | backgroundColor | P1 |
| `src/screens/moments/MomentsNotificationsScreen.tsx` | L91 / notification item | backgroundColor | P1 |
| `src/screens/moments/UserMomentsScreen.tsx` | L129 / profileHeader | backgroundColor | P1 |
| `src/screens/moments/UserMomentsScreen.tsx` | L173 / card | backgroundColor | P1 |
| `src/screens/moments/MomentsFeedScreen.tsx` | L227 / card | backgroundColor | P1 |

### 3.3 `colors.surfaceAlt`（`#EEF2F7`）— 次级表面色

| 文件 | 位置/组件 | 属性 | 优先级 |
|------|-----------|------|--------|
| `src/screens/chat/ChatScreen.tsx` | L160 / TextInput bg | backgroundColor | P0 |
| `src/screens/moments/CreateMomentScreen.tsx` | L98 / badgeRow | backgroundColor | P2 |
| `src/screens/moments/MomentDetailScreen.tsx` | L212 / mediaPlaceholder | backgroundColor | P2 |
| `src/screens/moments/MomentDetailScreen.tsx` | L260 / commentAvatar | backgroundColor | P2 |
| `src/screens/moments/MomentsNotificationsScreen.tsx` | L105 / itemAvatar | backgroundColor | P2 |
| `src/screens/moments/UserMomentsScreen.tsx` | L163 / comingSoonBadge | backgroundColor | P2 |
| `src/screens/moments/UserMomentsScreen.tsx` | L186 / mediaPlaceholder | backgroundColor | P2 |
| `src/screens/moments/MomentsFeedScreen.tsx` | L219 / headerBtn | backgroundColor | P2 |
| `src/screens/moments/MomentsFeedScreen.tsx` | L278 / mediaPlaceholder | backgroundColor | P2 |
| `src/screens/moments/MomentsFeedScreen.tsx` | L295 / linkCard | backgroundColor | P2 |

### 3.4 `colors.text`（`#17202A`）— 主文本色

| 文件 | 位置/组件 | 属性 | 优先级 |
|------|-----------|------|--------|
| `src/components/common/Screen.tsx` | L74 / title | color | P0 |
| `src/components/chat/MessageBubble.tsx` | L112 / text (other) | color | P0 |
| `src/components/chat/SessionRow.tsx` | L65 / name | color | P0 |
| `src/components/forms/TextField.tsx` | L50 / input text | color | P0 |
| `src/components/common/StateViews.tsx` | L84 / title | color | P1 |
| `src/screens/settings/DebugDiagnosticsScreen.tsx` | L168 / sectionTitle | color | P1 |
| `src/screens/settings/DebugDiagnosticsScreen.tsx` | L180 / value | color | P1 |
| `src/screens/settings/DebugDiagnosticsScreen.tsx` | L188 / errorText | color | P1 |
| `src/screens/settings/PrivacySettingsScreen.tsx` | L83 / label | color | P1 |
| `src/screens/settings/AiSettingsScreen.tsx` | L247 / noticeTitle | color | P1 |
| `src/screens/settings/AiSettingsScreen.tsx` | L264 / sectionTitle | color | P1 |
| `src/screens/settings/AiSettingsScreen.tsx` | L284 / switchText | color | P1 |
| `src/screens/settings/AiSettingsScreen.tsx` | L317 / providerChipText | color | P1 |
| `src/screens/settings/AiSettingsScreen.tsx` | L336 / keyName | color | P1 |
| `src/screens/moments/MomentDetailScreen.tsx` | L196 / nickname | color | P1 |
| `src/screens/moments/MomentDetailScreen.tsx` | L206 / content | color | P1 |
| `src/screens/moments/MomentDetailScreen.tsx` | L240 / commentsTitle | color | P1 |
| `src/screens/moments/MomentDetailScreen.tsx` | L279 / commentContent | color | P1 |
| `src/screens/moments/MomentsNotificationsScreen.tsx` | L118 / itemText | color | P1 |
| `src/screens/moments/MomentsFeedScreen.tsx` | L262 / nickname | color | P1 |
| `src/screens/moments/MomentsFeedScreen.tsx` | L272 / content | color | P1 |
| `src/screens/moments/UserMomentsScreen.tsx` | L153 / nickname | color | P1 |
| `src/screens/moments/UserMomentsScreen.tsx` | L180 / content | color | P1 |

### 3.5 `colors.muted`（`#657386`）— 次要文本色

| 文件 | 位置/组件 | 属性 | 优先级 |
|------|-----------|------|--------|
| `src/components/chat/MessageBubble.tsx` | L99 / sender | color | P0 |
| `src/components/chat/MessageBubble.tsx` | L145 / status | color | P1 |
| `src/components/chat/SessionRow.tsx` | L71 / preview | color | P0 |
| `src/components/forms/TextField.tsx` | L41 / label | color | P1 |
| `src/components/common/StateViews.tsx` | L89 / muted | color | P1 |
| `src/screens/settings/DebugDiagnosticsScreen.tsx` | L176 / label | color | P1 |
| `src/screens/settings/DebugDiagnosticsScreen.tsx` | L183 / errorLabel | color | P1 |
| `src/screens/settings/PrivacySettingsScreen.tsx` | L88 / description | color | P1 |
| `src/screens/settings/AiSettingsScreen.tsx` | L253 / noticeText | color | P1 |
| `src/screens/settings/AiSettingsScreen.tsx` | L269 / sectionHint | color | P2 |
| `src/screens/settings/AiSettingsScreen.tsx` | L288 / switchHint | color | P2 |
| `src/screens/settings/AiSettingsScreen.tsx` | L296 / label | color | P2 |
| `src/screens/settings/AiSettingsScreen.tsx` | L341 / keyMasked | color | P2 |
| `src/screens/settings/AiSettingsScreen.tsx` | L352 / statusUnknown | color | P2 |
| `src/screens/settings/AiSettingsScreen.tsx` | L383 / emptyText | color | P2 |
| `src/screens/settings/AiSettingsScreen.tsx` | L387 / emptyHint | color | P2 |
| `src/screens/settings/AiSettingsScreen.tsx` | L396 / footerText | color | P2 |
| `src/screens/moments/CreateMomentScreen.tsx` | L102 / badgeLabel | color | P2 |
| `src/screens/moments/CreateMomentScreen.tsx` | L125 / cancelText | color | P2 |
| `src/screens/moments/MomentDetailScreen.tsx` | L201 / location | color | P2 |
| `src/screens/moments/MomentDetailScreen.tsx` | L219 / mediaPlaceholderText | color | P2 |
| `src/screens/moments/MomentDetailScreen.tsx` | L228 / statText | color | P2 |
| `src/screens/moments/MomentDetailScreen.tsx` | L246 / noComments | color | P2 |
| `src/screens/moments/MomentDetailScreen.tsx` | L265 / commentAvatarText | color | P2 |
| `src/screens/moments/MomentsNotificationsScreen.tsx` | L110 / itemAvatarText | color | P2 |
| `src/screens/moments/UserMomentsScreen.tsx` | L158 / postCount | color | P2 |
| `src/screens/moments/UserMomentsScreen.tsx` | L169 / comingSoonText | color | P2 |
| `src/screens/moments/UserMomentsScreen.tsx` | L193 / mediaPlaceholderText | color | P2 |
| `src/screens/moments/UserMomentsScreen.tsx` | L201 / statText | color | P2 |
| `src/screens/moments/UserMomentsScreen.tsx` | L206 / footerText | color | P2 |
| `src/screens/moments/MomentsFeedScreen.tsx` | L267 / location | color | P2 |
| `src/screens/moments/MomentsFeedScreen.tsx` | L285 / mediaPlaceholderText | color | P2 |
| `src/screens/moments/MomentsFeedScreen.tsx` | L290 / mediaHint | color | P2 |
| `src/screens/moments/MomentsFeedScreen.tsx` | L323 / actionText | color | P2 |
| `src/screens/moments/MomentsFeedScreen.tsx` | L329 / footerText | color | P2 |

### 3.6 `colors.border`（`#DDE3EA`）— 边框色

| 文件 | 位置/组件 | 属性 | 优先级 |
|------|-----------|------|--------|
| `src/components/common/Screen.tsx` | L66 / header | borderBottomColor | P0 |
| `src/components/chat/SessionRow.tsx` | L37 / row | borderBottomColor | P0 |
| `src/components/forms/TextField.tsx` | L47 / input | borderColor | P0 |
| `src/screens/chat/ChatScreen.tsx` | L152 / composer | borderTopColor | P0 |
| `src/screens/settings/PrivacySettingsScreen.tsx` | L66 / section | borderTopColor | P1 |
| `src/screens/settings/PrivacySettingsScreen.tsx` | L72 / row | borderBottomColor | P1 |
| `src/screens/settings/DebugDiagnosticsScreen.tsx` | L159 / section | borderColor | P1 |
| `src/screens/settings/AiSettingsScreen.tsx` | L158 / Switch | trackColor false | P1 |
| `src/screens/settings/AiSettingsScreen.tsx` | L310 / providerChip | borderColor | P1 |
| `src/screens/settings/AiSettingsScreen.tsx` | L329 / keyItem | borderBottomColor | P1 |
| `src/screens/moments/MomentsFeedScreen.tsx` | L307 / actions | borderTopColor | P1 |

### 3.7 `colors.primary`（`#0E7AFE`）— 品牌主色

| 文件 | 位置/组件 | 属性 | 优先级 |
|------|-----------|------|--------|
| `src/components/chat/MessageBubble.tsx` | L109 / mineBubble | backgroundColor | P0 |
| `src/components/chat/MessageBubble.tsx` | L140 / mediaActionText | color | P1 |
| `src/components/chat/SessionRow.tsx` | L52 / avatarText | color | P1 |
| `src/components/chat/SessionRow.tsx` | L75 / flag | color | P2 |
| `src/components/common/PrimaryButton.tsx` | L29 / button | backgroundColor | P0 |
| `src/components/common/StateViews.tsx` | L8 / ActivityIndicator | color | P1 |
| `src/components/common/StateViews.tsx` | L104 / button | backgroundColor | P1 |
| `src/screens/chat/ChatScreen.tsx` | L167 / send button | backgroundColor | P0 |
| `src/screens/settings/AiSettingsScreen.tsx` | L158 / Switch | trackColor true | P1 |
| `src/screens/settings/AiSettingsScreen.tsx` | L313 / providerChipActive | backgroundColor | P1 |
| `src/screens/settings/AiSettingsScreen.tsx` | L314 / providerChipActive | borderColor | P1 |
| `src/screens/settings/AiSettingsScreen.tsx` | L362 / actionButton | backgroundColor+`'20'` | P1 |
| `src/screens/settings/AiSettingsScreen.tsx` | L365 / actionText | color | P1 |
| `src/screens/moments/MomentDetailScreen.tsx` | L187 / avatarText | color | P2 |
| `src/screens/moments/MomentDetailScreen.tsx` | L273 / commentNickname | color | P2 |
| `src/screens/moments/MomentsNotificationsScreen.tsx` | L81 / headerNote | color | P2 |
| `src/screens/moments/MomentsFeedScreen.tsx` | L222 / headerBtnText | color | P2 |
| `src/screens/moments/MomentsFeedScreen.tsx` | L253 / avatarText | color | P2 |
| `src/screens/moments/MomentsFeedScreen.tsx` | L301 / linkTitle | color | P2 |
| `src/screens/moments/MomentsFeedScreen.tsx` | L318 / actionTextLiked | color | P2 |
| `src/screens/moments/UserMomentsScreen.tsx` | L144 / avatarText | color | P2 |

### 3.8 `colors.primarySoft`（`#E8F2FF`）— 主色浅底

| 文件 | 位置/组件 | 属性 | 优先级 |
|------|-----------|------|--------|
| `src/components/chat/SessionRow.tsx` | L45 / avatar | backgroundColor | P1 |
| `src/screens/moments/MomentDetailScreen.tsx` | L182 / avatar | backgroundColor | P2 |
| `src/screens/moments/MomentsNotificationsScreen.tsx` | L74 / header | backgroundColor | P2 |
| `src/screens/moments/MomentsNotificationsScreen.tsx` | L99 / itemUnread | backgroundColor | P2 |
| `src/screens/moments/MomentsFeedScreen.tsx` | L248 / avatar | backgroundColor | P2 |
| `src/screens/moments/MomentsFeedScreen.tsx` | L317 / actionBtnLiked | backgroundColor | P2 |
| `src/screens/moments/UserMomentsScreen.tsx` | L139 / avatar | backgroundColor | P2 |

### 3.9 `colors.danger`（`#D93025`）— 危险色

| 文件 | 位置/组件 | 属性 | 优先级 |
|------|-----------|------|--------|
| `src/components/chat/SessionRow.tsx` | L81 / badge | backgroundColor | P0 |
| `src/components/chat/MessageBubble.tsx` | L151 / failed | color | P1 |
| `src/components/common/StateViews.tsx` | L94 / errorTitle | color | P1 |
| `src/components/common/StateViews.tsx` | L99 / error | color | P1 |
| `src/screens/settings/AiSettingsScreen.tsx` | L370 / deleteButton | backgroundColor+`'20'` | P1 |
| `src/screens/settings/AiSettingsScreen.tsx` | L373 / deleteText | color | P1 |
| `src/screens/moments/MomentsNotificationsScreen.tsx` | L129 / unread dot | backgroundColor | P2 |

### 3.10 `colors.warning`（`#D9822B`）— 警告色

| 文件 | 位置/组件 | 属性 | 优先级 |
|------|-----------|------|--------|
| `src/components/common/StateViews.tsx` | L114 / banner | backgroundColor | P1 |
| `src/screens/settings/AiSettingsScreen.tsx` | L240 / noticeCard | backgroundColor+`'20'` | P1 |
| `src/screens/settings/AiSettingsScreen.tsx` | L244 / noticeCard | borderLeftColor | P1 |
| `src/screens/moments/CreateMomentScreen.tsx` | L106 / badge | backgroundColor | P2 |

### 3.11 `colors.success`（`#18A058`）— 成功色

| 文件 | 位置/组件 | 属性 | 优先级 |
|------|-----------|------|--------|
| `src/screens/settings/AiSettingsScreen.tsx` | L349 / statusOk | color | P2 |

### 3.12 `colors.ai`（`#4C6FFF`）— AI 特征色

| 文件 | 位置/组件 | 属性 | 优先级 |
|------|-----------|------|--------|
| `src/components/chat/MessageBubble.tsx` | L119 / AI label | color | P1 |

---

## 四、StatusBar 与 Navigation 问题

### 4.1 StatusBar barStyle

| 文件 | 位置 | 当前写法 | 问题 | 优先级 |
|------|------|----------|------|--------|
| `src/app/App.tsx` | L19 | `barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'}` | 使用系统 `useColorScheme()` 而非 `settingsStore.theme`，用户手动选择主题时 StatusBar 不跟随 | P0 |

### 4.2 NavigationContainer theme

| 文件 | 位置 | 当前写法 | 问题 | 优先级 |
|------|------|----------|------|--------|
| `src/app/AppProviders.tsx` | L7 | `<NavigationContainer>` 无 `theme` prop | 导航头/Tab 栏始终使用默认亮色主题，暗色模式下不匹配 | P0 |

---

## 五、消息气泡配色问题

| 文件 | 位置 | 问题 | 优先级 |
|------|------|------|--------|
| `src/components/chat/MessageBubble.tsx` | L109 | mine 气泡使用 `colors.primary` 背景，暗色模式下 primary 色可能过亮 | P0 |
| `src/components/chat/MessageBubble.tsx` | L116 | mine 气泡文字硬编码 `#FFFFFF`，若 primary 色变浅则文字不可读 | P0 |
| `src/components/chat/MessageBubble.tsx` | L104 | other 气泡使用 `colors.surface`（纯白），暗色模式下刺眼 | P0 |

---

## 六、统计汇总

| 分类 | 数量 |
|------|------|
| 硬编码 `#FFFFFF` | 9 处 |
| 硬编码 rgba | 1 处 |
| 硬编码 `#000` | 1 处 |
| Alpha 拼接（不安全） | 3 处 |
| `colors.xxx` 静态引用 | ~120 处 |
| 缺失暗色变体的令牌 | 10 个 |
| NavigationContainer 缺 theme | 1 处 |
| StatusBar 未接用户主题 | 1 处 |

### 按优先级统计

| 优先级 | 数量 | 说明 |
|--------|------|------|
| **P0** | ~25 处 | 影响暗色模式可用性：所有硬编码 #FFFFFF、背景色、边框色、消息气泡、StatusBar、NavigationContainer |
| **P1** | ~40 处 | 影响主要页面观感：设置页、通知页、主文本色、警告/危险色 |
| **P2** | ~60 处 | 低频页面或辅助样式：朋友圈详情、头像底色、placeholder 文本 |

---

## 七、后续 Theme Token 改造建议

### 7.1 需新增的令牌

| 令牌名 | 建议值（亮色） | 建议值（暗色） | 用途 |
|--------|---------------|---------------|------|
| `onPrimary` | `#FFFFFF` | `#FFFFFF` | primary 背景上的文字色 |
| `onWarning` | `#FFFFFF` | `#FFFFFF` | warning 背景上的文字色 |
| `onOverlay` | `#FFFFFF` | `#FFFFFF` | 叠加层上的文字色 |
| `overlay` | `rgba(0,0,0,0.5)` | `rgba(0,0,0,0.7)` | 半透明叠加层 |
| `shadow` | `#000000` | `#000000` | 阴影色 |
| `warningSoft` | `#D9822B20` | 暗色待定 | warning 浅底 |
| `dangerSoft` | `#D9302520` | 暗色待定 | danger 浅底 |
| `surfaceAlt` 暗色 | - | `#1E242C` | 次级表面暗色 |
| `border` 暗色 | - | `#2A3038` | 边框暗色 |
| `primarySoft` 暗色 | - | `#0E7AFE20` | 主色浅底暗色 |

### 7.2 架构改造建议

1. **重构 colors.ts 为结构化主题**：`{ light: ColorSet, dark: ColorSet }` 或使用 Context/Hook 提供 `useThemeColors()` 消费端自动切换
2. **接入 NavigationContainer theme**：基于当前 colorScheme 构建 `LightTheme` / `DarkTheme` 对象
3. **统一主题源**：StatusBar 和所有颜色消费端应读取 `settingsStore.theme`（结合 OS fallback），而非各自独立判断
4. **消除 alpha 拼接**：用 `rgba()` 或预定义 soft 令牌替代 `colors.xxx + '20'` 写法
5. **替换所有 `#FFFFFF` 硬编码**：引入 `onPrimary` / `onWarning` / `onOverlay` 令牌

---

## 八、扫描目录清单

| 目录 | 文件数 | 颜色问题数 |
|------|--------|-----------|
| `src/screens/chat/` | 1 | 4 |
| `src/screens/settings/` | 5 | ~35 |
| `src/screens/moments/` | 6 | ~50 |
| `src/components/chat/` | 2 | ~15 |
| `src/components/common/` | 3 | ~12 |
| `src/components/forms/` | 1 | 4 |
| `src/app/theme/` | 5 | 19（定义层） |
| `src/app/` (App.tsx, AppProviders.tsx) | 2 | 2 |
| `src/stores/` | 1 | 1（架构缺陷） |
| **合计** | **26** | **~142** |

---

> **注意**：本次扫描仅输出清单，未修改任何源码文件。

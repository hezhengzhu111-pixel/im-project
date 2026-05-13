# Mobile Android 核心一致性修复设计

**日期：** 2026-05-13
**状态：** 待审核
**范围：** `frontend/apps/mobile`

---

## 1. 问题概述

当前 mobile app 存在以下核心一致性问题：

### 1.1 sessionId 规则不统一
- **问题：** mobile 多处手写 `private_${userId}_${targetId}` 和 `group_${groupId}`
- **影响：** 与 web/shared 的 `buildSessionId` 规则不一致，可能导致消息归属错误
- **位置：**
  - `chatStore.ts:64` - `private_${userId}_${target.targetId}`
  - `chatStore.ts:76` - `group_${group.id}`
  - `normalizers.ts:192` - 手写 sessionId
  - `messageStore.ts:37-47` - `resolveSessionId` 函数
  - `ids.ts:7-8` - `createConversationId` 函数

### 1.2 normalizer 代码重复
- **问题：** `mobile/src/utils/normalizers.ts` 重复实现了 `isRecord`, `asString`, `asNumber`, `asBoolean`
- **影响：** 与 `@im/shared-types/src/utils.ts` 行为可能分叉
- **位置：** `normalizers.ts:16-45`

### 1.3 Android Manifest 配置缺失
- **问题：** `AndroidManifest.xml` 使用 `${usesCleartextTraffic}` 占位符，但 `build.gradle` 未定义
- **影响：** 构建失败
- **位置：** `AndroidManifest.xml:22`, `build.gradle`

### 1.4 Firebase 未安全降级
- **问题：** `notificationService.ts` 直接调用 `messaging()` 而无检查
- **影响：** 缺少 `google-services.json` 时 App 崩溃
- **位置：** `notificationService.ts:109-122`

### 1.5 Gradle 配置不完整
- **问题：** `versionCode`/`versionName` 硬编码，release 使用 debug 签名
- **影响：** 无法支持版本管理和正式发布
- **位置：** `build.gradle:84-89`

---

## 2. 修复方案

### 2.1 架构设计：Adapter 模式

```
┌─────────────────────────────────────────────────────────────┐
│                    Shared Packages                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ shared-types    │  │shared-normalizers│  │shared-im-core│ │
│  │ (isRecord,      │  │ (normalizeMessage│  │ (buildSession│ │
│  │  asString, etc) │  │  normalizeUser)  │  │  Id, etc)   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Mobile Adapter Layer                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │sessionAdapter   │  │messageAdapter   │  │modelAdapter  │ │
│  │ (resolveSession │  │ (toMobileMessage│  │ (toMobile    │ │
│  │  Id)            │  │  fromShared)    │  │  User, etc)  │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Mobile Stores/UI                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ chatStore       │  │ messageStore    │  │ sessionStore │ │
│  │ (uses adapters) │  │ (uses adapters) │  │ (uses        │ │
│  │                 │  │                 │  │  adapters)   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 sessionId 统一规则

**规则：**
- 私聊：`buildSessionId("private", currentUserId, targetUserId)` → `${smallerId}_${largerId}`
- 群聊：`buildSessionId("group", currentUserId, groupId)` → `group_${groupId}`

**实现：** 创建 `sessionAdapter.ts`

```typescript
// frontend/apps/mobile/src/adapters/sessionAdapter.ts
import { buildSessionId, resolveMessageSessionId } from '@im/shared-im-core';
import type { ChatSessionType } from '@im/shared-types';

export const resolvePrivateSessionId = (
  currentUserId: string,
  targetUserId: string
): string => buildSessionId('private', currentUserId, targetUserId);

export const resolveGroupSessionId = (
  currentUserId: string,
  groupId: string
): string => buildSessionId('group', currentUserId, groupId);

export const resolveMessageSessionId = (
  message: { isGroupChat?: boolean; groupId?: string; senderId: string; receiverId?: string },
  currentUserId: string
): string | null => resolveMessageSessionId(message, currentUserId);
```

### 2.3 normalizer 收口策略

**原则：**
1. 基础类型守卫（`isRecord`, `asString`, `asNumber`, `asBoolean`）直接从 `@im/shared-types` 导入
2. 消息/用户/会话 normalization 优先使用 `@im/shared-normalizers`
3. mobile 只保留 UI/本地存储需要的字段转换

**实现：** 创建 `messageAdapter.ts` 和 `modelAdapter.ts`

```typescript
// frontend/apps/mobile/src/adapters/messageAdapter.ts
import { normalizeMessage } from '@im/shared-normalizers';
import type { Message } from '@im/shared-types';
import type { MobileMessage } from '@/types/models';

export const toMobileMessage = (sharedMessage: Message): MobileMessage => ({
  ...sharedMessage,
  // mobile 特有字段
  rawJson: JSON.stringify(sharedMessage),
});
```

### 2.4 Firebase 安全降级

**策略：**
1. 检查 `messaging()` 是否可用
2. 不可用时返回空字符串并记录 warn
3. Notifee 本地通知独立工作

**实现：**

```typescript
// frontend/apps/mobile/src/services/notification/notificationService.ts
let firebaseAvailable = false;

try {
  messaging();
  firebaseAvailable = true;
} catch {
  firebaseAvailable = false;
}

export async function getFcmToken(): Promise<string> {
  if (!firebaseAvailable) {
    logger.warn('notification', 'Firebase Messaging not available, returning empty token');
    return '';
  }
  // 原有逻辑
}
```

### 2.5 Gradle 配置修复

**实现：**

```gradle
// frontend/apps/mobile/android/app/build.gradle
def mobileVersionCode = (project.findProperty("IM_MOBILE_VERSION_CODE") ?: "1").toInteger()
def mobileVersionName = project.findProperty("IM_MOBILE_VERSION_NAME") ?: "0.0.1"

defaultConfig {
    versionCode mobileVersionCode
    versionName mobileVersionName
    manifestPlaceholders = [
        usesCleartextTraffic: "true"
    ]
}

buildTypes {
    debug {
        manifestPlaceholders = [
            usesCleartextTraffic: "true"
        ]
    }
    release {
        manifestPlaceholders = [
            usesCleartextTraffic: "false"
        ]
        signingConfig signingConfigs.debug // TODO: 替换为 release signing
        minifyEnabled enableProguardInReleaseBuilds
        proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
    }
}
```

---

## 3. 文件修改清单

### 3.1 新增文件

| 文件 | 职责 |
|------|------|
| `src/adapters/sessionAdapter.ts` | sessionId 统一封装 |
| `src/adapters/messageAdapter.ts` | shared Message → MobileMessage 转换 |
| `src/adapters/modelAdapter.ts` | shared User/Group → Mobile 模型转换 |
| `src/adapters/__tests__/sessionAdapter.spec.ts` | sessionId 测试 |
| `src/adapters/__tests__/messageAdapter.spec.ts` | message adapter 测试 |
| `src/stores/__tests__/messageStore.spec.ts` | pending message 测试 |
| `src/stores/__tests__/websocketStore.spec.ts` | WS dispatch 测试 |
| `src/services/notification/__tests__/notificationService.spec.ts` | Firebase 降级测试 |

### 3.2 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/utils/normalizers.ts` | 移除重复的类型守卫，改为从 shared-types 导入 |
| `src/utils/ids.ts` | 移除 `createConversationId`，改用 sessionAdapter |
| `src/stores/chatStore.ts` | 使用 sessionAdapter 替换手写 sessionId |
| `src/stores/messageStore.ts` | 使用 sessionAdapter 替换手写 sessionId |
| `src/stores/websocketStore.ts` | 使用 sessionAdapter 解析消息 sessionId |
| `src/services/chat/messageService.ts` | 使用 shared-normalizers |
| `src/services/notification/notificationService.ts` | 添加 Firebase 可用性检查 |
| `android/app/build.gradle` | 添加 manifestPlaceholders、versionCode/Name 支持 |
| `android/build.gradle` | 无修改 |
| `android/gradle.properties` | 无修改 |

---

## 4. 测试策略

### 4.1 sessionId 测试

```typescript
describe('sessionAdapter', () => {
  it('private session from contacts, WS message, and history should generate same sessionId', () => {
    const currentUserId = '100';
    const targetUserId = '200';
    const sessionId = resolvePrivateSessionId(currentUserId, targetUserId);
    expect(sessionId).toBe('100_200'); // 100 < 200
  });

  it('group session should generate same sessionId', () => {
    const sessionId = resolveGroupSessionId('100', 'group1');
    expect(sessionId).toBe('group_group1');
  });
});
```

### 4.2 normalizer 测试

```typescript
describe('messageAdapter', () => {
  it('should preserve clientMessageId', () => {
    const sharedMessage = { id: '1', clientMessageId: 'cm_123', ... };
    const mobileMessage = toMobileMessage(sharedMessage);
    expect(mobileMessage.clientMessageId).toBe('cm_123');
  });

  it('should preserve encrypted fields', () => {
    const sharedMessage = { id: '1', encrypted: true, ... };
    const mobileMessage = toMobileMessage(sharedMessage);
    expect(mobileMessage.encrypted).toBe(true);
  });
});
```

### 4.3 Firebase 降级测试

```typescript
describe('notificationService', () => {
  it('should return empty string when Firebase not available', async () => {
    // Mock messaging() to throw
    const token = await getFcmToken();
    expect(token).toBe('');
  });
});
```

---

## 5. 验证命令

```bash
cd frontend
npm install
npm run mobile:typecheck
npm run mobile:test
npm run mobile:lint
```

---

## 6. 未修复范围

以下不在本次修复范围内：

1. **E2EE 实现** - 按要求不实现
2. **后端 push-device API** - 未实现，FCM 推送受限
3. **iOS 适配** - 本次只修复 Android
4. **性能优化** - 不在本次范围内
5. **UI 重构** - 不在本次范围内

---

## 7. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| sessionId 规则变更导致历史消息无法匹配 | 高 | 添加迁移逻辑或兼容层 |
| shared-normalizers 缺少 mobile 需要的字段 | 中 | 优先补充 shared-normalizers |
| Firebase 降级影响推送功能 | 低 | 本地通知仍可用 |

---

## 8. 后续 Android 真机联调清单

1. 验证 sessionId 规则在真机上的一致性
2. 验证 Firebase 降级后 App 不崩溃
3. 验证消息发送/接收流程
4. 验证 pending message 重试逻辑
5. 验证通知显示和点击跳转

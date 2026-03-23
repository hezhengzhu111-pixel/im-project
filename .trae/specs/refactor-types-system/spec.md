# 类型系统重构 Spec

## Why
当前 `src/types/index.ts` 文件过大（355行），包含所有类型定义，存在类型重复（`User` 和 `UserInfo`）、大量使用 `any` 类型、缺少类型守卫等问题，导致类型安全性降低，维护困难。

## What Changes
- 拆分 `src/types/index.ts` 为多个职责单一的模块文件
- 合并重复的 `User` 和 `UserInfo` 接口
- 移除所有 `any` 类型，使用 `unknown` 或具体类型替代
- 添加类型守卫函数
- 添加工具类型定义

## Impact
- Affected specs: 所有使用类型的文件
- Affected code: 
  - `src/types/index.ts` → 拆分为多个文件
  - 所有导入类型的文件需要更新导入路径（通过重新导出保持兼容）

## ADDED Requirements

### Requirement: 模块化类型定义
系统 SHALL 将类型定义按职责拆分为独立模块：
- `user.ts` - 用户相关类型
- `message.ts` - 消息相关类型
- `chat.ts` - 聊天会话相关类型
- `group.ts` - 群组相关类型
- `api.ts` - API 响应类型
- `common.ts` - 公共类型（分页、文件等）
- `utils.ts` - 类型守卫和工具类型

#### Scenario: 类型导入兼容
- **WHEN** 重构完成后
- **THEN** 现有代码通过 `import { User } from '@/types'` 仍能正常工作

### Requirement: 类型去重
系统 SHALL 合并重复的类型定义：
- 合并 `User` 和 `UserInfo` 为统一的 `User` 接口
- 使用类型别名保持向后兼容

#### Scenario: User 类型统一
- **WHEN** 使用 User 类型时
- **THEN** 只有一个统一的 User 接口，包含所有必要字段

### Requirement: 类型安全
系统 SHALL 移除所有 `any` 类型：
- 使用 `unknown` 替代 `any`
- 为 `extra` 字段使用 `Record<string, unknown>`
- 为 API 响应添加完整类型定义

#### Scenario: 编译期类型检查
- **WHEN** 运行 `npm run typecheck`
- **THEN** 无类型错误

### Requirement: 类型守卫
系统 SHALL 提供类型守卫函数：
- `isMessage(obj: unknown): obj is Message`
- `isUser(obj: unknown): obj is User`
- `isApiResponse(obj: unknown): obj is ApiResponse`

#### Scenario: 运行时类型验证
- **WHEN** 接收到未知数据时
- **THEN** 可使用类型守卫进行安全验证

## MODIFIED Requirements

### Requirement: 类型导出
`src/types/index.ts` SHALL 改为重新导出所有子模块类型：
```typescript
export * from './user';
export * from './message';
// ...
```

## REMOVED Requirements

### Requirement: 重复类型定义
**Reason**: `User` 和 `UserInfo` 存在大量重复字段
**Migration**: 合并为单一 `User` 接口，`UserInfo` 作为类型别名保留向后兼容

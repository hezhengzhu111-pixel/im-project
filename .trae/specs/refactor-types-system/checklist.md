# Checklist: 类型系统重构

## 文件创建检查
- [ ] `src/types/user.ts` 创建完成
- [ ] `src/types/message.ts` 创建完成
- [ ] `src/types/chat.ts` 创建完成
- [ ] `src/types/group.ts` 创建完成
- [ ] `src/types/api.ts` 创建完成
- [ ] `src/types/common.ts` 创建完成
- [ ] `src/types/utils.ts` 创建完成

## 类型定义检查
- [ ] User 和 UserInfo 已合并，无重复定义
- [ ] Message 类型无 any 类型
- [ ] ApiResponse<T> 使用泛型定义
- [ ] 所有联合类型定义完整（MessageType, MessageStatus, UserStatus）

## 类型守卫检查
- [ ] isMessage 类型守卫实现正确
- [ ] isUser 类型守卫实现正确
- [ ] isApiResponse 类型守卫实现正确

## 兼容性检查
- [ ] `src/types/index.ts` 正确重新导出所有类型
- [ ] 现有代码导入路径无需修改
- [ ] 运行 `npm run typecheck` 无错误

## 代码质量检查
- [ ] 所有类型定义有 JSDoc 注释
- [ ] 无循环依赖
- [ ] 文件结构清晰，职责单一

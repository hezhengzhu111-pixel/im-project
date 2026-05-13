# Tasks
- [ ] 任务 1：审计 `markRead` 真实接口语义并形成结论
  - [ ] 阅读共享契约 `frontend/packages/shared-api-contract/src/message.endpoints.ts`
  - [ ] 阅读 Web 端 `frontend/apps/web/src/services/message.ts`，确认现有调用语义
  - [ ] 阅读 mobile 端 `frontend/apps/mobile/src/services/chat/messageService.ts`、`frontend/apps/mobile/src/stores/messageStore.ts`、`frontend/apps/mobile/src/stores/sessionStore.ts`
  - [ ] 搜索并阅读后端全部 `message/read`、`markRead`、已读回执相关 route / controller / handler / service / test 文件
  - [ ] 输出结论：参数真实需要 `conversationId`、`friendId`、`groupId` 或其他值；若源码无法唯一确认，则记录不确定性并以 Web 端现有语义为准

- [ ] 任务 2：按审计结论最小化修复 mobile `markRead`
  - [ ] 保持不改后端业务逻辑、不改 Web 业务逻辑、不重写 `messageStore` / `sessionStore`
  - [ ] 若后端语义为 `conversationId`，则将 mobile `markRead` 统一改为传 `session.id`
  - [ ] 若后端语义为私聊/群聊混合值，则在 shared contract 或 mobile service 中明确命名，避免继续误导
  - [ ] 保持 `markRead` 失败不影响页面显示，但记录 warning

- [ ] 任务 3：补充 mobile `markRead` 单元测试
  - [ ] 覆盖 private session 参数正确
  - [ ] 覆盖 group session 参数正确
  - [ ] 覆盖 `markRead` 成功后本地 session unread 清零
  - [ ] 覆盖 `markRead` 失败不影响页面显示但记录 warning

- [ ] 任务 4：更新 Android 修复说明文档
  - [ ] 更新 `frontend/apps/mobile/MOBILE_ANDROID_FIX_REPORT.md` 或新增 `frontend/apps/mobile/ANDROID_MARK_READ_CONTRACT.md`
  - [ ] 记录后端接口语义结论、mobile 修复策略、为何这样传参、验证结果与仍需人工联调项

- [ ] 任务 5：执行验证并收尾
  - [ ] 运行 `npm run mobile:typecheck`
  - [ ] 运行 `npm run mobile:test`
  - [ ] 运行 `npm run mobile:lint`
  - [ ] 根据验证结果修正实现或测试
  - [ ] 勾选已完成任务并整理最终报告

# Task Dependencies
- [任务 2] depends on [任务 1]
- [任务 3] depends on [任务 2]
- [任务 4] depends on [任务 1]
- [任务 5] depends on [任务 2]
- [任务 5] depends on [任务 3]
- [任务 5] depends on [任务 4]

/**
 * Web 端类型定义统一入口
 *
 * ## 重要规范
 *
 * - **新代码必须优先从 `@im/shared-types` 导入核心业务类型**
 *   （MessageType、Message、User、ChatSession、Group、ApiResponse、WebSocketMessage 等）
 * - 本文件（src/types/index.ts）仅作为**历史兼容层**，供旧代码平滑迁移
 * - **禁止在 Web 本地新增与 @im/shared-types 重复的核心业务类型**
 * - Web 特有 UI 类型（组件 Props、视图模型等）可保留在对应模块中，
 *   但需标注"Web UI 专用，非后端 DTO"
 */

// 从子模块重新导出所有类型（兼容旧导入路径）
export * from "./user";
export * from "./message";
export * from "./chat";
export * from "./group";
export * from "./api";
export * from "./common";
export * from "./utils";
export * from "./moments";

# 计划：完成设置中的所有功能

本计划旨在完善 IM 项目设置页面的所有功能，替换当前前端中基于 `setTimeout` 和 `localStorage` 的 Mock 实现，完成真实的后端接口支持及前后端联调。

## 1. 数据库与后端实体层设计
- **新增表结构**：在 `service_user_service_db` 数据库中创建 `user_settings` 表，包含以下字段：
  - `user_id` (BIGINT, 主键)
  - `privacy_settings` (JSON)
  - `message_settings` (JSON)
  - `general_settings` (JSON)
- **后端实体**：在 `user-service` 中创建对应的 `UserSettings` 实体类、`UserSettingsMapper`。

## 2. 后端接口实现 (`user-service`)
在 `UserController` 及 `UserService` 中新增以下真实接口：
- **用户设置管理**：
  - `GET /user/settings`：获取当前用户的设置。
  - `PUT /user/settings/privacy`：更新隐私设置。
  - `PUT /user/settings/message`：更新消息设置。
  - `PUT /user/settings/general`：更新通用设置。
- **安全与账户管理**：
  - `PUT /user/password`：修改密码（校验旧密码，加密新密码并保存）。
  - `POST /user/phone/code`：发送手机验证码（生成 6 位验证码存入 Redis，设置过期时间，打印日志模拟发送）。
  - `POST /user/phone/bind`：验证验证码并绑定/更新手机号。
  - `POST /user/email/code`：发送邮箱验证码（存入 Redis，模拟发送）。
  - `POST /user/email/bind`：验证验证码并绑定/更新邮箱。
  - `POST /user/account/delete` 或 `DELETE /user/account`：验证登录密码后，注销账户（将用户 `status` 标记为 0 禁用，并清除 Token 使其下线）。

## 3. 前端接口服务改造 (`frontend/src/services/user.ts`)
- 新增相应的请求方法：
  - `changePassword(data)`
  - `sendPhoneCode(phone)`, `bindPhone(data)`
  - `sendEmailCode(email)`, `bindEmail(data)`
  - `deleteAccount(data)`
  - `getUserSettings()`, `updatePrivacySettings(data)`, `updateMessageSettings(data)`, `updateGeneralSettings(data)`

## 4. 前端状态管理改造 (`frontend/src/stores/user.ts`)
- **移除 Mock 代码**：删除现有的基于 `setTimeout` 模拟的 API 请求。
- **对接真实接口**：
  - `changePassword`、`deleteAccount`、`bindEmail`、`bindPhone` 等方法调用新的 API。
  - 设置的读取和更新逻辑（`getUserSettings`、`updatePrivacySettings` 等）改为优先调用后端接口进行云端同步，本地 `localStorage` 可作为缓存保留以加快渲染。

## 5. 视图层适配与测试 (`Settings.vue`)
- 确保调用新 Store 方法时，错误捕获（如验证码错误、旧密码错误）能正确地通过 `ElMessage` 弹出。
- 确保表单的 Loading 状态、倒计时逻辑与真实的 API 请求生命周期对齐。
- 全面测试功能：修改密码、绑定手机、绑定邮箱、修改各类设置并刷新页面验证持久化、注销账户流程。
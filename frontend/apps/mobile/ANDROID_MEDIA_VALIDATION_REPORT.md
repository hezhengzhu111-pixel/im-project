# Android Media Validation Report

## 1. 媒体能力梳理

### 1.1 图片选择

- 使用 `react-native-image-picker`
- `mediaService.pickImage()` 当前允许单选 `mixed` 资源
- Android 上会把：
  - `content://` + `originalPath`
  - 缺失 `fileName`
  - 缺失 `mimeType`
  - 缺失 `fileSize`
  统一归一化为可上传 `MobileFile`

### 1.2 相机

- 使用 `react-native-image-picker.launchCamera`
- 走显式 `CAMERA` 权限申请
- 聊天页已补最小入口，可直接拍照后发送图片消息

### 1.3 文件选择

- 使用 `@react-native-documents/picker`
- Android 文档选择现在会：
  - 允许 `content://`
  - 对 `content://` 走 `keepLocalCopy`
  - 对 virtual file 允许导出为本地副本
  - 再统一归一化文件名 / MIME / 文件大小

### 1.4 语音录制

- 使用 `react-native-nitro-sound`
- 走显式 `RECORD_AUDIO` 权限申请
- 聊天页已补最小录音入口：
  - 第一次点击开始录制
  - 第二次点击停止录制并发送 `VOICE` 消息
- 录音结束后会生成标准化 `MobileFile`

### 1.5 语音播放

- `MessageBubble` 对 `VOICE` 消息提供最小播放/停止入口
- 复用 `NitroSound.startPlayer/stopPlayer`

### 1.6 视频消息展示

- `MessageBubble` 对 `VIDEO` 消息接入 `react-native-video`
- 当前目标是“可展示、可用系统控件播放”，不扩展复杂全屏手势能力

### 1.7 上传任务

- 由 `uploadService` + `uploadTaskRepository` 负责
- 同一 `localMessageId` 复用稳定 `taskId`
- 避免失败重试重复创建上传任务
- 上传成功后回写：
  - `remoteUrl`
  - `fileName`
  - `mimeType`
  - `fileSize`

### 1.8 缩略图

- 上传返回 `thumbnailUrl` 时：
  - pending payload 会回写 `thumbnailUrl`
  - 本地消息会同步更新 `thumbnailUrl`
  - 服务端消息回包后继续沿用该字段

## 2. Android 权限策略

### 2.1 Android 12 及以下

- 图片 / 视频 / 文件读取：`READ_EXTERNAL_STORAGE`
- 相机：`CAMERA`
- 录音：`RECORD_AUDIO`

### 2.2 Android 13

- 图片：`READ_MEDIA_IMAGES`
- 视频：`READ_MEDIA_VIDEO`
- 音频：`READ_MEDIA_AUDIO`
- 本轮已把 `mixed` 资源选择改成同时申请图片 + 视频读取权限

### 2.3 Android 14+

- 继续使用：
  - `READ_MEDIA_IMAGES`
  - `READ_MEDIA_VIDEO`
  - `READ_MEDIA_AUDIO`
  - `READ_MEDIA_VISUAL_USER_SELECTED`
- 若用户只授予“所选照片/视频”，系统 picker 仍可工作
- 当前实现不绕过权限，仍按系统授权结果决定是否进入媒体链路

## 3. 本次修复点

### 3.1 content:// URI 上传问题

- 文档选择结果如果是 `content://`，会先调用 `keepLocalCopy()` 复制到 app cache
- 图片选择若拿到 `originalPath`，优先转换为 `file://` 可上传路径
- 这样不需要改后端上传协议，也不需要重写上传系统

### 3.2 文件元数据缺失

- 对图片、文件、语音统一补齐：
  - 文件名
  - MIME type
  - 文件大小
- 缺失值优先从：
  - picker 原始元数据
  - 本地路径扩展名
  - 本地 `stat`
  推断得到

### 3.3 上传成功后本地 pending 未更新

- `messageStore.retryMessage()` 现在在 upload 成功后会同时更新：
  - 内存 `messagesBySession`
  - SQLite / memory message repository
  - pending payloadJson
- 更新字段包括：
  - `mediaUrl`
  - `thumbnailUrl`
  - `mediaName`
  - `mediaSize`

### 3.4 失败重试重复创建上传任务

- `uploadService.createTask()` 继续以 `localMessageId` 作为稳定任务键
- 若已存在任务，则合并更完整的文件元数据并复用原任务，而不是新建任务

### 3.5 最小媒体展示与播放入口

- 聊天页新增：
  - 相机发送入口
  - 语音录制/停止入口
- 气泡组件新增：
  - 图片预览
  - 视频播放器
  - 语音播放/停止
  - 文件打开按钮

## 4. sendMedia 链路确认

当前 `sendMedia()` 顺序为：

1. 先插入本地 pending message
2. 创建或复用稳定 upload task
3. 上传成功后更新本地消息与 pending payload
4. 调用服务端消息发送接口
5. 服务端回包后按 `clientMessageId` 替换 pending
6. 失败时保留失败状态并允许重试

## 5. 自动验证结果

- `mobile:test` 已覆盖：
  - image file payload
  - document file payload
  - voice file payload
  - upload task success updates message
  - upload task failure marks failed

最终仍需通过：

- `cd frontend && npm run mobile:typecheck`
- `cd frontend && npm run mobile:test`
- `cd frontend && npm run mobile:lint`

## 6. 真机验收建议

### 6.1 图片 / 相机

1. 打开私聊
2. 从相册选择图片发送
3. 使用相机拍照发送
4. 确认：
   - 本地先出现 `SENDING`
   - 上传成功后本地图片 URI 变为 CDN URL
   - 服务端回包后只保留一条消息

### 6.2 文件

1. 选择一个 `content://` 来源文件（例如下载、云盘、系统文件）
2. 发送文件消息
3. 确认：
   - 文件名不是空
   - MIME type 合理
   - 文件大小不是空
   - 点击文件可打开

### 6.3 语音

1. 点击 `Voice`
2. 再次点击 `Stop`
3. 确认：
   - 生成 `VOICE` 消息
   - 失败时可点击重试
   - 点击 `Play voice` 可播放，`Stop voice` 可停止

### 6.4 视频

1. 从媒体选择器选择视频
2. 确认本地与服务端消息合并正常
3. 确认视频气泡可展示播放器并可点击系统控件播放

## 7. 后端依赖

- 上传协议继续沿用现有文件接口：
  - 图片
  - 视频
  - 音频
  - 文件
- 若后端上传返回更多字段，移动端当前会优先消费：
  - `url`
  - `thumbnailUrl`
  - `fileName`
  - `size`
  - `contentType`
- 语音 / 视频时长目前仍以本地侧为主；若后端后续返回标准时长字段，可再对齐但本次不改协议

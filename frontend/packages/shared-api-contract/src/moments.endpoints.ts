export const MOMENTS_ENDPOINTS = {
  /** POST - 创建动态 */
  CREATE: '/moments',
  /** GET - 动态信息流 */
  FEED: '/moments/feed',
  /** GET - 单条动态详情 */
  POST_BY_ID: '/moments/:postId',
  /** DELETE - 删除动态 */
  DELETE_POST: '/moments/:postId',
  /** POST - 添加动态媒体 */
  ADD_MEDIA: '/moments/:postId/media',
  /** GET - 指定用户的动态列表 */
  USER_POSTS: '/moments/user/:userId',
  /** POST - 点赞 */
  LIKE: '/moments/:postId/like',
  /** DELETE - 取消点赞 */
  UNLIKE: '/moments/:postId/like',
  /** GET - 点赞列表 */
  LIKES: '/moments/:postId/likes',
  /** POST - 创建评论 */
  CREATE_COMMENT: '/moments/:postId/comments',
  /** DELETE - 删除评论 */
  DELETE_COMMENT: '/moments/comments/:commentId',
  /** GET - 评论列表 */
  COMMENTS: '/moments/:postId/comments',
  /** GET - 通知列表 */
  NOTIFICATIONS: '/moments/notifications',
  /** PUT - 标记通知已读 */
  MARK_NOTIFICATIONS_READ: '/moments/notifications/read',
} as const;

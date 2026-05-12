export const GROUP_ENDPOINTS = {
  CREATE: '/group/create',
  USER_GROUPS: '/group/user/:userId',
  MEMBERS_LIST: '/group/members/list',
  JOIN: '/group/:groupId/join',
  ADD_MEMBERS: '/group/:groupId/add-members',
  SEARCH: '/group/search',
  LEAVE: '/group/:groupId/leave',
  DISMISS: '/group/:groupId',
  UPDATE: '/group/:groupId',
} as const;

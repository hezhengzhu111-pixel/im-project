import 'page_meta.dart';

const appFallbackMeta = PageMeta(
  title: 'IM - 安全即时通讯',
  description:
      'IM 是一款安全即时通讯应用，支持端到端加密、群组聊天、朋友圈等功能',
  canonicalPath: '/',
  og: OgMeta(
    title: 'IM - 安全即时通讯',
    description:
        'IM 是一款安全即时通讯应用，支持端到端加密、群组聊天、朋友圈等功能',
    type: 'website',
  ),
  twitter: TwitterMeta(
    card: 'summary',
    title: 'IM - 安全即时通讯',
    description:
        'IM 是一款安全即时通讯应用，支持端到端加密、群组聊天、朋友圈等功能',
  ),
);

const pageMetaMap = <String, PageMeta>{
  '/login': PageMeta(
    title: '登录 - IM',
    description: '安全即时通讯，端到端加密登录',
    canonicalPath: '/login',
    og: OgMeta(title: '登录 - IM', description: '安全即时通讯，端到端加密登录'),
    twitter: TwitterMeta(title: '登录 - IM'),
  ),
  '/register': PageMeta(
    title: '注册 - IM',
    description: '创建您的 IM 账户',
    canonicalPath: '/register',
    og: OgMeta(title: '注册 - IM', description: '创建您的 IM 账户'),
    twitter: TwitterMeta(title: '注册 - IM'),
  ),
  '/chat': PageMeta(
    title: '聊天 - IM',
    description: '与好友安全聊天，端到端加密',
    canonicalPath: '/chat',
    og: OgMeta(title: '聊天 - IM', description: '与好友安全聊天，端到端加密'),
    twitter: TwitterMeta(title: '聊天 - IM'),
  ),
  '/contacts': PageMeta(
    title: '通讯录 - IM',
    description: '管理您的联系人',
    canonicalPath: '/contacts',
    og: OgMeta(title: '通讯录 - IM', description: '管理您的联系人'),
    twitter: TwitterMeta(title: '通讯录 - IM'),
  ),
  '/contacts/add': PageMeta(
    title: '添加好友 - IM',
    description: '搜索并添加新朋友',
    canonicalPath: '/contacts/add',
    og: OgMeta(title: '添加好友 - IM', description: '搜索并添加新朋友'),
    twitter: TwitterMeta(title: '添加好友 - IM'),
  ),
  '/groups': PageMeta(
    title: '群组 - IM',
    description: '管理和加入群组',
    canonicalPath: '/groups',
    og: OgMeta(title: '群组 - IM', description: '管理和加入群组'),
    twitter: TwitterMeta(title: '群组 - IM'),
  ),
  '/groups/create': PageMeta(
    title: '创建群组 - IM',
    description: '创建新的群组聊天',
    canonicalPath: '/groups/create',
    og: OgMeta(title: '创建群组 - IM', description: '创建新的群组聊天'),
    twitter: TwitterMeta(title: '创建群组 - IM'),
  ),
  '/moments': PageMeta(
    title: '朋友圈 - IM',
    description: '查看好友动态',
    canonicalPath: '/moments',
    og: OgMeta(title: '朋友圈 - IM', description: '查看好友动态'),
    twitter: TwitterMeta(title: '朋友圈 - IM'),
  ),
  '/moments/notifications': PageMeta(
    title: '动态通知 - IM',
    description: '查看朋友圈互动通知',
    canonicalPath: '/moments/notifications',
    og: OgMeta(title: '动态通知 - IM', description: '查看朋友圈互动通知'),
    twitter: TwitterMeta(title: '动态通知 - IM'),
  ),
  '/settings': PageMeta(
    title: '设置 - IM',
    description: '个性化您的 IM 体验',
    canonicalPath: '/settings',
    og: OgMeta(title: '设置 - IM', description: '个性化您的 IM 体验'),
    twitter: TwitterMeta(title: '设置 - IM'),
  ),
  '/settings/profile': PageMeta(
    title: '个人资料 - IM',
    description: '编辑您的个人资料',
    canonicalPath: '/settings/profile',
    og: OgMeta(title: '个人资料 - IM', description: '编辑您的个人资料'),
    twitter: TwitterMeta(title: '个人资料 - IM'),
  ),
  '/settings/ai': PageMeta(
    title: 'AI 设置 - IM',
    description: '配置 AI 助手',
    canonicalPath: '/settings/ai',
    og: OgMeta(title: 'AI 设置 - IM', description: '配置 AI 助手'),
    twitter: TwitterMeta(title: 'AI 设置 - IM'),
  ),
};

PageMeta metaForPath(String path) {
  return pageMetaMap[path] ?? appFallbackMeta;
}

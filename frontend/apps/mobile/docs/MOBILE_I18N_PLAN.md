# Mobile i18n Plan

## Current Status

i18n skeleton is in place. Dictionary structure and translation hook are ready for use.

## Supported Languages

- `zh-CN` — 简体中文
- `en-US` — English

## File Structure

```
src/app/i18n/
├── index.ts          # useI18n hook, t() function, exports
├── types.ts          # I18nDictionary, Locale, TranslationKey types
├── zh-CN.ts          # Chinese dictionary
└── en-US.ts          # English dictionary
```

## Key Modules

| Module    | Description          | Example Keys                                  |
|-----------|----------------------|-----------------------------------------------|
| common    | 通用文案             | ok, cancel, confirm, save, back, loading      |
| auth      | 认证相关             | login, register, username, password, logout   |
| tabs      | 底部导航标签         | chat, contacts, groups, settings, moments     |
| chat      | 聊天功能             | send, placeholder, voice, image, file, recall |
| message   | 消息状态             | recalled, deleted, loading, noMore, loadFailed|
| settings  | 设置页面             | language, theme, notification, privacy, about |
| errors    | 错误提示             | network, server, unknown, unauthorized        |

## Usage

### In Components (Hook)

```tsx
import { useI18n } from '@/app/i18n';

function MyComponent() {
  const { t } = useI18n();
  return <Text>{t('common.ok')}</Text>;
}
```

### Outside Components (Direct)

```typescript
import { t } from '@/app/i18n';
import { useSettingsStore } from '@/stores/settingsStore';

const locale = useSettingsStore.getState().locale;
const text = t(locale, 'common.ok');
```

### With Parameters

```tsx
const { t } = useI18n();
<Text>{t('chat.unreadCount', { count: 5 })}</Text>
// Dictionary value: "{count} unread messages"
```

## Next Steps

- [ ] Gradually replace hardcoded strings in screens with `t()` calls
- [ ] Add more keys as new features are built
- [ ] Consider adding more languages (zh-TW, ja, ko) when needed

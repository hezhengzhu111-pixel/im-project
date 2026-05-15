import { useSettingsStore } from '@/stores/settingsStore';
import type { I18nDictionary, Locale, TranslationKey, TranslationParams } from './types';
import zhCN from './zh-CN';
import enUS from './en-US';

const dictionaries: Record<Locale, I18nDictionary> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

function getNestedValue(obj: unknown, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(template: string, params: TranslationParams): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    return value !== undefined ? String(value) : `{${name}}`;
  });
}

export function t(locale: Locale, key: TranslationKey, params?: TranslationParams): string {
  const dict = dictionaries[locale] ?? dictionaries['zh-CN'];
  const value = getNestedValue(dict, key);
  if (value === undefined) {
    return key;
  }
  return params ? interpolate(value, params) : value;
}

export function useI18n() {
  const locale = useSettingsStore((state) => state.locale);

  const translate = (key: TranslationKey, params?: TranslationParams): string => {
    return t(locale, key, params);
  };

  return { t: translate, locale };
}

export type { I18nDictionary, Locale, TranslationKey, TranslationParams };
export { zhCN, enUS, dictionaries };

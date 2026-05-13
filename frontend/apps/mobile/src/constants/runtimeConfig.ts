import { NativeModules } from 'react-native';

export interface RuntimeConfigUrls {
  API_BASE_URL: string;
  WS_BASE_URL: string;
  FILE_BASE_URL: string;
}

export type MobileAppEnv =
  | 'dev-emulator'
  | 'dev-device'
  | 'sit'
  | 'prod'
  | 'internal'
  | 'debug';

export interface NativeRuntimeConfig extends Partial<RuntimeConfigUrls> {
  IM_MOBILE_APP_ENV?: string;
  IM_MOBILE_RELEASE_BUILD?: boolean | string;
}

export interface RuntimeConfigSource extends Partial<RuntimeConfigUrls> {
  IM_MOBILE_APP_ENV?: string;
}

export interface ResolvedRuntimeConfig extends RuntimeConfigUrls {
  APP_ENV: MobileAppEnv;
  IS_RELEASE_BUILD: boolean;
  warnings: string[];
}

const DEFAULT_CONFIG: RuntimeConfigUrls = {
  API_BASE_URL: 'http://10.0.2.2:8082/api',
  WS_BASE_URL: 'ws://10.0.2.2:8082',
  FILE_BASE_URL: 'http://10.0.2.2:8082',
};

const VALID_APP_ENVS: ReadonlySet<string> = new Set([
  'dev-emulator',
  'dev-device',
  'sit',
  'prod',
  'internal',
  'debug',
]);

const URL_PROTOCOLS: Record<keyof RuntimeConfigUrls, readonly string[]> = {
  API_BASE_URL: ['http:', 'https:'],
  WS_BASE_URL: ['ws:', 'wss:'],
  FILE_BASE_URL: ['http:', 'https:'],
};

const warnedMessages = new Set<string>();

const normalizeString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const parseBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }
  return false;
};

const isValidUrlForKey = (key: keyof RuntimeConfigUrls, value: string): boolean => {
  try {
    const parsed = new URL(value);
    return URL_PROTOCOLS[key].includes(parsed.protocol);
  } catch {
    return false;
  }
};

const normalizeAppEnv = (value: unknown): MobileAppEnv => {
  const normalized = normalizeString(value).toLowerCase();
  if (VALID_APP_ENVS.has(normalized)) {
    return normalized as MobileAppEnv;
  }
  return 'dev-emulator';
};

const getEnvRecord = (): Record<string, string | undefined> => {
  if (typeof process === 'undefined' || !process.env) {
    return {};
  }
  return process.env as Record<string, string | undefined>;
};

const readProcessEnvValue = (key: keyof RuntimeConfigUrls): string => {
  const env = getEnvRecord();
  const scopedKey = `IM_MOBILE_${key}`;
  return normalizeString(env[scopedKey] || env[key]);
};

const readProcessAppEnv = (): string => normalizeString(getEnvRecord().IM_MOBILE_APP_ENV);

const readNativeRuntimeConfig = (): NativeRuntimeConfig => {
  const module = NativeModules?.ConfigModule;
  if (!module) {
    return {};
  }
  const constants =
    typeof module.getConstants === 'function'
      ? (module.getConstants() as NativeRuntimeConfig)
      : (module as NativeRuntimeConfig);
  return constants || {};
};

const resolveUrl = (
  key: keyof RuntimeConfigUrls,
  sources: Array<{ name: string; value: unknown }>,
  warnings: string[],
): string => {
  for (const source of sources) {
    const value = normalizeString(source.value);
    if (!value) {
      continue;
    }
    if (isValidUrlForKey(key, value)) {
      return value;
    }
    warnings.push(`[config] Ignored invalid ${key} from ${source.name}: ${value}`);
  }
  warnings.push(`[config] Falling back to dev-emulator default for ${key}: ${DEFAULT_CONFIG[key]}`);
  return DEFAULT_CONFIG[key];
};

const warnOnce = (message: string) => {
  if (warnedMessages.has(message)) {
    return;
  }
  warnedMessages.add(message);
  console.warn(message);
};

export const resolveRuntimeConfig = (options?: {
  runtimeConfig?: RuntimeConfigSource;
  nativeConfig?: NativeRuntimeConfig;
  processEnv?: Record<string, string | undefined>;
}): ResolvedRuntimeConfig => {
  const warnings: string[] = [];
  const runtimeConfig = options?.runtimeConfig || globalThis.IM_MOBILE_RUNTIME_CONFIG || {};
  const nativeConfig = options?.nativeConfig || readNativeRuntimeConfig();
  const processEnv = options?.processEnv || getEnvRecord();
  const processValue = (key: keyof RuntimeConfigUrls) => normalizeString(processEnv[`IM_MOBILE_${key}`] || processEnv[key]);
  const processAppEnv = normalizeString(processEnv.IM_MOBILE_APP_ENV);

  const APP_ENV = normalizeAppEnv(runtimeConfig.IM_MOBILE_APP_ENV || processAppEnv || nativeConfig.IM_MOBILE_APP_ENV);
  const IS_RELEASE_BUILD = parseBoolean(nativeConfig.IM_MOBILE_RELEASE_BUILD);

  const API_BASE_URL = resolveUrl(
    'API_BASE_URL',
    [
      { name: 'runtime injected config', value: runtimeConfig.API_BASE_URL },
      { name: 'environment variables', value: processValue('API_BASE_URL') },
      { name: 'native config', value: nativeConfig.API_BASE_URL },
    ],
    warnings,
  );

  const WS_BASE_URL = resolveUrl(
    'WS_BASE_URL',
    [
      { name: 'runtime injected config', value: runtimeConfig.WS_BASE_URL },
      { name: 'environment variables', value: processValue('WS_BASE_URL') },
      { name: 'native config', value: nativeConfig.WS_BASE_URL },
    ],
    warnings,
  );

  const FILE_BASE_URL = resolveUrl(
    'FILE_BASE_URL',
    [
      { name: 'runtime injected config', value: runtimeConfig.FILE_BASE_URL },
      { name: 'environment variables', value: processValue('FILE_BASE_URL') },
      { name: 'native config', value: nativeConfig.FILE_BASE_URL },
    ],
    warnings,
  );

  const usesEmulatorFallback =
    API_BASE_URL === DEFAULT_CONFIG.API_BASE_URL &&
    WS_BASE_URL === DEFAULT_CONFIG.WS_BASE_URL &&
    FILE_BASE_URL === DEFAULT_CONFIG.FILE_BASE_URL;

  if (IS_RELEASE_BUILD && usesEmulatorFallback) {
    warnings.push(
      '[config] Release build is using dev-emulator fallback URLs. Gradle should fail-fast unless IM_MOBILE_APP_ENV is explicitly set to internal/debug.',
    );
  }

  return {
    API_BASE_URL,
    WS_BASE_URL,
    FILE_BASE_URL,
    APP_ENV,
    IS_RELEASE_BUILD,
    warnings,
  };
};

export const getRuntimeConfig = (): ResolvedRuntimeConfig => {
  const config = resolveRuntimeConfig();
  config.warnings.forEach(warnOnce);
  return config;
};

export const getDefaultRuntimeConfig = (): RuntimeConfigUrls => ({ ...DEFAULT_CONFIG });

export const getProcessEnvConfig = (): RuntimeConfigSource => ({
  API_BASE_URL: readProcessEnvValue('API_BASE_URL'),
  WS_BASE_URL: readProcessEnvValue('WS_BASE_URL'),
  FILE_BASE_URL: readProcessEnvValue('FILE_BASE_URL'),
  IM_MOBILE_APP_ENV: readProcessAppEnv(),
});

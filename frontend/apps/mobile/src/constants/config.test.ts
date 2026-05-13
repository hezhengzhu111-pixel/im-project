import { getDefaultRuntimeConfig, resolveRuntimeConfig } from './runtimeConfig';

describe('runtime config', () => {
  test('dev-emulator default remains available', () => {
    const config = resolveRuntimeConfig({
      runtimeConfig: {},
      nativeConfig: {},
      processEnv: {},
    });

    expect(config.APP_ENV).toBe('dev-emulator');
    expect(config.API_BASE_URL).toBe('http://10.0.2.2:8082/api');
    expect(config.WS_BASE_URL).toBe('ws://10.0.2.2:8082');
    expect(config.FILE_BASE_URL).toBe('http://10.0.2.2:8082');
  });

  test('runtime injected config has highest priority', () => {
    const config = resolveRuntimeConfig({
      runtimeConfig: {
        API_BASE_URL: 'https://runtime.example.com/api',
        WS_BASE_URL: 'wss://runtime.example.com/ws',
        FILE_BASE_URL: 'https://runtime.example.com/files',
        IM_MOBILE_APP_ENV: 'sit',
      },
      nativeConfig: {
        API_BASE_URL: 'https://native.example.com/api',
        WS_BASE_URL: 'wss://native.example.com/ws',
        FILE_BASE_URL: 'https://native.example.com/files',
        IM_MOBILE_APP_ENV: 'prod',
      },
      processEnv: {
        IM_MOBILE_API_BASE_URL: 'https://env.example.com/api',
        IM_MOBILE_WS_BASE_URL: 'wss://env.example.com/ws',
        IM_MOBILE_FILE_BASE_URL: 'https://env.example.com/files',
        IM_MOBILE_APP_ENV: 'dev-device',
      },
    });

    expect(config.APP_ENV).toBe('sit');
    expect(config.API_BASE_URL).toBe('https://runtime.example.com/api');
    expect(config.WS_BASE_URL).toBe('wss://runtime.example.com/ws');
    expect(config.FILE_BASE_URL).toBe('https://runtime.example.com/files');
  });

  test('invalid urls are ignored and fall back to lower-priority sources', () => {
    const config = resolveRuntimeConfig({
      runtimeConfig: {
        API_BASE_URL: 'ftp://invalid-api.example.com',
        WS_BASE_URL: 'https://invalid-ws.example.com',
      },
      nativeConfig: {
        API_BASE_URL: 'https://native.example.com/api',
        WS_BASE_URL: 'wss://native.example.com/ws',
        FILE_BASE_URL: 'https://native.example.com/files',
      },
      processEnv: {
        IM_MOBILE_FILE_BASE_URL: 'file://invalid-files.example.com',
      },
    });

    expect(config.API_BASE_URL).toBe('https://native.example.com/api');
    expect(config.WS_BASE_URL).toBe('wss://native.example.com/ws');
    expect(config.FILE_BASE_URL).toBe('https://native.example.com/files');
    expect(config.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Ignored invalid API_BASE_URL'),
        expect.stringContaining('Ignored invalid WS_BASE_URL'),
        expect.stringContaining('Ignored invalid FILE_BASE_URL'),
      ]),
    );
  });

  test('release fallback emits a clear warning', () => {
    const defaults = getDefaultRuntimeConfig();
    const config = resolveRuntimeConfig({
      runtimeConfig: {},
      nativeConfig: {
        IM_MOBILE_APP_ENV: 'prod',
        IM_MOBILE_RELEASE_BUILD: true,
      },
      processEnv: {},
    });

    expect(config.API_BASE_URL).toBe(defaults.API_BASE_URL);
    expect(config.WS_BASE_URL).toBe(defaults.WS_BASE_URL);
    expect(config.FILE_BASE_URL).toBe(defaults.FILE_BASE_URL);
    expect(config.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Release build is using dev-emulator fallback URLs'),
      ]),
    );
  });

  test('process env supports scoped IM_MOBILE_* variables', () => {
    const config = resolveRuntimeConfig({
      runtimeConfig: {},
      nativeConfig: {},
      processEnv: {
        IM_MOBILE_APP_ENV: 'dev-device',
        IM_MOBILE_API_BASE_URL: 'http://192.168.1.8:8082/api',
        IM_MOBILE_WS_BASE_URL: 'ws://192.168.1.8:8082',
        IM_MOBILE_FILE_BASE_URL: 'http://192.168.1.8:8082',
      },
    });

    expect(config.APP_ENV).toBe('dev-device');
    expect(config.API_BASE_URL).toBe('http://192.168.1.8:8082/api');
    expect(config.WS_BASE_URL).toBe('ws://192.168.1.8:8082');
    expect(config.FILE_BASE_URL).toBe('http://192.168.1.8:8082');
  });
});

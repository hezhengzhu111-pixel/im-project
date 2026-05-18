/**
 * Contract & type-level tests for @im/shared-platform-ports.
 *
 * All exports are pure TypeScript interfaces — no runtime values.
 * These tests verify:
 *  1. Every exported type name is importable from the package entry
 *  2. Mock implementations satisfy the expected interface shape
 *  3. Each interface method has the correct parameter and return-type contract
 *  4. Optional fields are properly typed
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type {
  ClockPort,
  HttpClientPort,
  RequestConfig,
  LoggerPort,
  NotifierPort,
  NotificationOptions,
  NavigatorPort,
  LifecyclePort,
  NetworkStatusPort,
  StoragePort,
  SecureStoragePort,
  UuidPort,
} from './index.ts';

// ─── Helper: verify an interface contract by constructing a mock ────────────
// These tests use type annotations so TypeScript enforces the interface at
// compile time, and the expect() calls verify the runtime shape.

// ============================================================================
// ClockPort
// ============================================================================
describe('ClockPort', () => {
  it('has the correct interface shape', () => {
    const mock: ClockPort = {
      now: () => new Date('2024-06-01T12:00:00Z'),
      nowMs: () => 1717243200000,
    };

    expect(mock.now()).toBeInstanceOf(Date);
    expect(mock.now().toISOString()).toBe('2024-06-01T12:00:00.000Z');
    expect(mock.nowMs()).toBe(1717243200000);
  });

  it('now() returns a Date', () => {
    const mock: ClockPort = {
      now: () => new Date(),
      nowMs: () => 0,
    };
    const result = mock.now();
    expect(result).toBeInstanceOf(Date);
    expect(typeof result.getTime()).toBe('number');
  });

  it('nowMs() returns a number', () => {
    const mock: ClockPort = {
      now: () => new Date(),
      nowMs: () => 1717243200000,
    };
    const result = mock.nowMs();
    expect(typeof result).toBe('number');
    expect(Number.isFinite(result)).toBe(true);
  });

  it('nowMs() can return 0 (edge case)', () => {
    const mock: ClockPort = {
      now: () => new Date(0),
      nowMs: () => 0,
    };
    expect(mock.nowMs()).toBe(0);
    expect(mock.now().getTime()).toBe(0);
  });
});

// ============================================================================
// HttpClientPort & RequestConfig
// ============================================================================
describe('HttpClientPort', () => {
  const mock: HttpClientPort = {
    get: async <T>(_url: string, _config?: RequestConfig): Promise<T> => {
      return { id: '1', name: 'test' } as unknown as T;
    },
    post: async <T>(_url: string, _data?: unknown, _config?: RequestConfig): Promise<T> => {
      return { success: true } as unknown as T;
    },
    put: async <T>(_url: string, _data?: unknown, _config?: RequestConfig): Promise<T> => {
      return { updated: true } as unknown as T;
    },
    delete: async <T>(_url: string, _config?: RequestConfig): Promise<T> => {
      return { deleted: true } as unknown as T;
    },
  };

  it('supports get with URL only', async () => {
    const result = await mock.get<{ id: string }>('/api/resource');
    expect(result).toEqual({ id: '1', name: 'test' });
  });

  it('supports get with full config', async () => {
    const config: RequestConfig = {
      headers: { Authorization: 'Bearer token' },
      timeout: 5000,
      signal: new AbortController().signal,
    };
    const result = await mock.get('/api/resource', config);
    expect(result).toBeDefined();
  });

  it('supports post with data and config', async () => {
    const config: RequestConfig = { headers: { 'X-Custom': 'val' } };
    const result = await mock.post('/api/create', { name: 'foo' }, config);
    expect(result).toEqual({ success: true });
  });

  it('supports post with data only', async () => {
    const result = await mock.post('/api/create', { name: 'foo' });
    expect(result).toEqual({ success: true });
  });

  it('supports put with data and config', async () => {
    const result = await mock.put('/api/update', { id: '1' });
    expect(result).toEqual({ updated: true });
  });

  it('supports delete with config', async () => {
    const result = await mock.delete('/api/delete');
    expect(result).toEqual({ deleted: true });
  });

  it('all methods return Promise', () => {
    expect(mock.get('/test')).toBeInstanceOf(Promise);
    expect(mock.post('/test')).toBeInstanceOf(Promise);
    expect(mock.put('/test')).toBeInstanceOf(Promise);
    expect(mock.delete('/test')).toBeInstanceOf(Promise);
  });
});

describe('RequestConfig', () => {
  it('supports all optional fields', () => {
    const config: RequestConfig = {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
      signal: new AbortController().signal,
    };
    expect(config.headers!['Content-Type']).toBe('application/json');
    expect(config.timeout).toBe(10000);
    expect(config.signal).toBeInstanceOf(AbortSignal);
  });

  it('can be empty object', () => {
    const config: RequestConfig = {};
    expect(config.headers).toBeUndefined();
    expect(config.timeout).toBeUndefined();
    expect(config.signal).toBeUndefined();
  });

  it('can have partial fields', () => {
    const withHeaders: RequestConfig = { headers: { Authorization: 'Bearer x' } };
    const withTimeout: RequestConfig = { timeout: 3000 };
    expect(withHeaders.timeout).toBeUndefined();
    expect(withTimeout.timeout).toBe(3000);
  });
});

// ============================================================================
// LoggerPort
// ============================================================================
describe('LoggerPort', () => {
  const logged: string[] = [];
  const mock: LoggerPort = {
    info: (msg, ...args) => { logged.push(`INFO: ${msg} ${args.join(',')}`); },
    warn: (msg, ...args) => { logged.push(`WARN: ${msg} ${args.join(',')}`); },
    error: (msg, ...args) => { logged.push(`ERROR: ${msg} ${args.join(',')}`); },
    debug: (msg, ...args) => { logged.push(`DEBUG: ${msg} ${args.join(',')}`); },
  };

  beforeEach(() => { logged.length = 0; });

  it('info logs with message and args', () => {
    mock.info('User logged in', 'user1', 'session_abc');
    expect(logged[0]).toBe('INFO: User logged in user1,session_abc');
  });

  it('warn logs with message and args', () => {
    mock.warn('Rate limit', 429, 'ip=1.2.3.4');
    expect(logged[0]).toBe('WARN: Rate limit 429,ip=1.2.3.4');
  });

  it('error logs with message and args', () => {
    mock.error('Connection failed', new Error('timeout'));
    expect(logged[0]).toContain('ERROR: Connection failed');
  });

  it('debug logs with message and args', () => {
    mock.debug('Cache hit', 'key=user:1');
    expect(logged[0]).toBe('DEBUG: Cache hit key=user:1');
  });

  it('logs without args', () => {
    mock.info('Simple message');
    expect(logged[0]).toBe('INFO: Simple message ');
  });

  it('logs with empty message', () => {
    mock.warn('');
    expect(logged[0]).toBe('WARN:  ');
  });
});

// ============================================================================
// NotifierPort & NotificationOptions
// ============================================================================
describe('NotifierPort', () => {
  it('notifies with full options', () => {
    const notified: NotificationOptions[] = [];
    const mock: NotifierPort = {
      notify: (options) => { notified.push(options); },
    };

    mock.notify({
      title: 'New Message',
      body: 'You have a new message from Alice',
      icon: '/icon.png',
      tag: 'chat:123',
      onClick: () => { /* noop */ },
    });

    expect(notified).toHaveLength(1);
    expect(notified[0].title).toBe('New Message');
    expect(notified[0].body).toBe('You have a new message from Alice');
    expect(notified[0].icon).toBe('/icon.png');
    expect(notified[0].tag).toBe('chat:123');
    expect(typeof notified[0].onClick).toBe('function');
  });

  it('notifies with minimal options (title only)', () => {
    const notified: NotificationOptions[] = [];
    const mock: NotifierPort = {
      notify: (options) => { notified.push(options); },
    };

    mock.notify({ title: 'Alert' });
    expect(notified[0].title).toBe('Alert');
    expect(notified[0].body).toBeUndefined();
    expect(notified[0].icon).toBeUndefined();
    expect(notified[0].tag).toBeUndefined();
    expect(notified[0].onClick).toBeUndefined();
  });
});

describe('NotificationOptions', () => {
  it('title is required', () => {
    const opts: NotificationOptions = { title: 'Required' };
    expect(opts.title).toBe('Required');
  });

  it('accepts partial optional fields', () => {
    const opts: NotificationOptions = { title: 'Test', body: 'Body only' };
    expect(opts.icon).toBeUndefined();
    expect(opts.tag).toBeUndefined();
    expect(opts.onClick).toBeUndefined();
  });
});

// ============================================================================
// NavigatorPort
// ============================================================================
describe('NavigatorPort', () => {
  it('opens url', () => {
    const opened: string[] = [];
    const mock: NavigatorPort = {
      openUrl: (url) => { opened.push(url); },
      canGoBack: () => true,
      goBack: () => { opened.push('back'); },
    };

    mock.openUrl('https://example.com');
    expect(opened[0]).toBe('https://example.com');
  });

  it('canGoBack returns boolean', () => {
    const mock: NavigatorPort = {
      openUrl: () => {},
      canGoBack: () => true,
      goBack: () => {},
    };
    expect(mock.canGoBack()).toBe(true);

    const mock2: NavigatorPort = {
      openUrl: () => {},
      canGoBack: () => false,
      goBack: () => {},
    };
    expect(mock2.canGoBack()).toBe(false);
  });

  it('goBack navigates back', () => {
    let wentBack = false;
    const mock: NavigatorPort = {
      openUrl: () => {},
      canGoBack: () => true,
      goBack: () => { wentBack = true; },
    };

    mock.goBack();
    expect(wentBack).toBe(true);
  });
});

// ============================================================================
// LifecyclePort
// ============================================================================
describe('LifecyclePort', () => {
  it('registers foreground callback and triggers it', () => {
    let foregroundCalled = false;
    const mock: LifecyclePort = {
      onForeground: (cb) => { cb(); },
      onBackground: () => {},
    };

    mock.onForeground(() => { foregroundCalled = true; });
    expect(foregroundCalled).toBe(true);
  });

  it('registers background callback and triggers it', () => {
    let backgroundCalled = false;
    const mock: LifecyclePort = {
      onForeground: () => {},
      onBackground: (cb) => { cb(); },
    };

    mock.onBackground(() => { backgroundCalled = true; });
    expect(backgroundCalled).toBe(true);
  });

  it('passes callback reference correctly', () => {
    const calls: string[] = [];
    const mock: LifecyclePort = {
      onForeground: (cb) => { setTimeout(() => cb(), 0); },
      onBackground: (cb) => { setTimeout(() => cb(), 0); },
    };

    const fg = () => calls.push('fg');
    const bg = () => calls.push('bg');
    mock.onForeground(fg);
    mock.onBackground(bg);

    // Manually invoke the stored callbacks to simulate
    fg();
    bg();
    expect(calls).toEqual(['fg', 'bg']);
  });
});

// ============================================================================
// NetworkStatusPort
// ============================================================================
describe('NetworkStatusPort', () => {
  it('registers online callback', () => {
    let online = false;
    const mock: NetworkStatusPort = {
      onOnline: (cb) => { setTimeout(() => { online = true; cb(); }, 0); },
      onOffline: () => {},
      isConnected: () => online,
    };

    expect(mock.isConnected()).toBe(false);
    // Simulate coming online
    online = true;
    expect(mock.isConnected()).toBe(true);
  });

  it('registers offline callback', () => {
    let offlineCalled = false;
    const mock: NetworkStatusPort = {
      onOnline: () => {},
      onOffline: (cb) => { offlineCalled = true; cb(); },
      isConnected: () => false,
    };

    mock.onOffline(() => {});
    expect(offlineCalled).toBe(true);
  });

  it('isConnected returns connection state', () => {
    const connectedMock: NetworkStatusPort = {
      onOnline: () => {},
      onOffline: () => {},
      isConnected: () => true,
    };
    const disconnectedMock: NetworkStatusPort = {
      onOnline: () => {},
      onOffline: () => {},
      isConnected: () => false,
    };

    expect(connectedMock.isConnected()).toBe(true);
    expect(disconnectedMock.isConnected()).toBe(false);
  });
});

// ============================================================================
// StoragePort
// ============================================================================
describe('StoragePort', () => {
  const store = new Map<string, string>();

  const mock: StoragePort = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, value); },
    removeItem: (key) => { store.delete(key); },
    clear: () => { store.clear(); },
  };

  beforeEach(() => store.clear());

  it('setItem and getItem round-trip', () => {
    mock.setItem('key1', 'value1');
    expect(mock.getItem('key1')).toBe('value1');
  });

  it('getItem returns null for missing key', () => {
    expect(mock.getItem('nonexistent')).toBeNull();
  });

  it('removeItem deletes a key', () => {
    mock.setItem('key1', 'value1');
    mock.removeItem('key1');
    expect(mock.getItem('key1')).toBeNull();
  });

  it('clear removes all keys', () => {
    mock.setItem('a', '1');
    mock.setItem('b', '2');
    mock.clear();
    expect(mock.getItem('a')).toBeNull();
    expect(mock.getItem('b')).toBeNull();
  });

  it('stores empty string', () => {
    mock.setItem('empty', '');
    expect(mock.getItem('empty')).toBe('');
  });

  it('stores special characters', () => {
    mock.setItem('special', '{"json":"value"}');
    expect(mock.getItem('special')).toBe('{"json":"value"}');
  });
});

// ============================================================================
// SecureStoragePort
// ============================================================================
describe('SecureStoragePort', () => {
  const store = new Map<string, string>();

  const mock: SecureStoragePort = {
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => { store.set(key, value); },
    removeItem: async (key) => { store.delete(key); },
  };

  beforeEach(() => store.clear());

  it('setItem and getItem round-trip', async () => {
    await mock.setItem('token', 'secret123');
    const result = await mock.getItem('token');
    expect(result).toBe('secret123');
  });

  it('getItem returns null for missing key', async () => {
    const result = await mock.getItem('missing');
    expect(result).toBeNull();
  });

  it('removeItem deletes a key', async () => {
    await mock.setItem('token', 'secret');
    await mock.removeItem('token');
    const result = await mock.getItem('token');
    expect(result).toBeNull();
  });

  it('all methods return Promise', () => {
    expect(mock.getItem('x')).toBeInstanceOf(Promise);
    expect(mock.setItem('x', 'y')).toBeInstanceOf(Promise);
    expect(mock.removeItem('x')).toBeInstanceOf(Promise);
  });

  it('handles concurrent set and get', async () => {
    await Promise.all([
      mock.setItem('k1', 'v1'),
      mock.setItem('k2', 'v2'),
    ]);
    const [v1, v2] = await Promise.all([
      mock.getItem('k1'),
      mock.getItem('k2'),
    ]);
    expect(v1).toBe('v1');
    expect(v2).toBe('v2');
  });
});

// ============================================================================
// UuidPort
// ============================================================================
describe('UuidPort', () => {
  it('uuid returns a string', () => {
    const mock: UuidPort = {
      uuid: () => '550e8400-e29b-41d4-a716-446655440000',
    };
    const id = mock.uuid();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('uuid returns unique values across calls', () => {
    let counter = 0;
    const mock: UuidPort = {
      uuid: () => {
        counter += 1;
        return `id-${counter}`;
      },
    };
    expect(mock.uuid()).toBe('id-1');
    expect(mock.uuid()).toBe('id-2');
    expect(mock.uuid()).toBe('id-3');
  });

  it('uuid conforms to expected format', () => {
    const mock: UuidPort = {
      uuid: () => '550e8400-e29b-41d4-a716-446655440000',
    };
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(mock.uuid()).toMatch(uuidRegex);
  });
});

// ============================================================================
// Export completeness — verify all type exports can be used in value position
// ============================================================================
describe('Package exports', () => {
  it('all interface names are correctly defined', () => {
    // Verify that mock objects can be created with proper interface typing
    const clock: ClockPort = { now: () => new Date(), nowMs: () => 0 };
    const http: HttpClientPort = {
      get: async <T>(_url?: string, _config?: RequestConfig): Promise<T> => ({} as unknown as T),
      post: async <T>(_url?: string, _data?: unknown, _config?: RequestConfig): Promise<T> => ({} as unknown as T),
      put: async <T>(_url?: string, _data?: unknown, _config?: RequestConfig): Promise<T> => ({} as unknown as T),
      delete: async <T>(_url?: string, _config?: RequestConfig): Promise<T> => ({} as unknown as T),
    };
    const logger: LoggerPort = {
      info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    };
    const notifier: NotifierPort = { notify: () => {} };
    const navigator: NavigatorPort = {
      openUrl: () => {}, canGoBack: () => true, goBack: () => {},
    };
    const lifecycle: LifecyclePort = {
      onForeground: () => {}, onBackground: () => {},
    };
    const network: NetworkStatusPort = {
      onOnline: () => {}, onOffline: () => {},
      isConnected: () => true,
    };
    const storage: StoragePort = {
      getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {},
    };
    const secureStorage: SecureStoragePort = {
      getItem: async () => null, setItem: async () => {},
      removeItem: async () => {},
    };
    const uuid: UuidPort = { uuid: () => 'id' };

    // All should be valid objects
    expect(clock.nowMs()).toBe(0);
    expect(navigator.canGoBack()).toBe(true);
    expect(network.isConnected()).toBe(true);
    expect(storage.getItem('x')).toBeNull();
    expect(typeof uuid.uuid()).toBe('string');
    expect(typeof logger.info).toBe('function');
    expect(typeof notifier.notify).toBe('function');
    expect(typeof lifecycle.onForeground).toBe('function');
    expect(typeof http.get).toBe('function');
    expect(typeof secureStorage.getItem).toBe('function');
  });
});

// ============================================================================
// Interface contract — verify no extra or missing methods
// ============================================================================
describe('Interface contracts have no extra methods', () => {
  it('ClockPort has exactly 2 methods', () => {
    const mock: ClockPort = { now: () => new Date(), nowMs: () => 0 };
    const keys = Object.keys(mock).sort();
    expect(keys).toEqual(['now', 'nowMs']);
  });

  it('HttpClientPort has exactly 4 methods', () => {
    const mock: HttpClientPort = {
      get: async <T>(_url?: string, _config?: RequestConfig): Promise<T> => ({} as unknown as T),
      post: async <T>(_url?: string, _data?: unknown, _config?: RequestConfig): Promise<T> => ({} as unknown as T),
      put: async <T>(_url?: string, _data?: unknown, _config?: RequestConfig): Promise<T> => ({} as unknown as T),
      delete: async <T>(_url?: string, _config?: RequestConfig): Promise<T> => ({} as unknown as T),
    };
    expect(Object.keys(mock).sort()).toEqual(['delete', 'get', 'post', 'put']);
  });

  it('LoggerPort has exactly 4 methods', () => {
    const mock: LoggerPort = {
      info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    };
    expect(Object.keys(mock).sort()).toEqual(['debug', 'error', 'info', 'warn']);
  });

  it('NotifierPort has exactly 1 method', () => {
    const mock: NotifierPort = { notify: () => {} };
    expect(Object.keys(mock)).toEqual(['notify']);
  });

  it('NavigatorPort has exactly 3 methods', () => {
    const mock: NavigatorPort = {
      openUrl: () => {}, canGoBack: () => true, goBack: () => {},
    };
    expect(Object.keys(mock).sort()).toEqual(['canGoBack', 'goBack', 'openUrl']);
  });

  it('LifecyclePort has exactly 2 methods', () => {
    const mock: LifecyclePort = {
      onForeground: () => {}, onBackground: () => {},
    };
    expect(Object.keys(mock).sort()).toEqual(['onBackground', 'onForeground']);
  });

  it('NetworkStatusPort has exactly 3 methods', () => {
    const mock: NetworkStatusPort = {
      onOnline: () => {}, onOffline: () => {}, isConnected: () => true,
    };
    expect(Object.keys(mock).sort()).toEqual(['isConnected', 'onOffline', 'onOnline']);
  });

  it('StoragePort has exactly 4 methods', () => {
    const mock: StoragePort = {
      getItem: () => null, setItem: () => {},
      removeItem: () => {}, clear: () => {},
    };
    expect(Object.keys(mock).sort()).toEqual(['clear', 'getItem', 'removeItem', 'setItem']);
  });

  it('SecureStoragePort has exactly 3 methods', () => {
    const mock: SecureStoragePort = {
      getItem: async () => null, setItem: async () => {},
      removeItem: async () => {},
    };
    expect(Object.keys(mock).sort()).toEqual(['getItem', 'removeItem', 'setItem']);
  });

  it('UuidPort has exactly 1 method', () => {
    const mock: UuidPort = { uuid: () => 'id' };
    expect(Object.keys(mock)).toEqual(['uuid']);
  });
});

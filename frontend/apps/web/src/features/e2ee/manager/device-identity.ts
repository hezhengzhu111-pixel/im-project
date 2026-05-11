/**
 * 设备标识管理
 *
 * 负责生成、缓存和恢复 device_id。
 * Web 端: IndexedDB 缓存 → localStorage UUID 回退。
 * Capacitor 端: SecureStorage → Capacitor Device.getId() → localStorage UUID。
 *
 * 重装检测: Capacitor 端通过 app_install_uuid 判断是否为全新安装。
 */

import { saveDeviceId, getDeviceId } from '../store/key-store';

// ---------------------------------------------------------------------------
// Capacitor 动态导入（可能未安装，包装为 try/catch）
// ---------------------------------------------------------------------------

interface CapacitorDeviceInfo {
  identifier?: string;
  uuid?: string;
}

// 使用 Function 构造器绕过 Vite 静态分析，避免解析未安装的 Capacitor 包
const _dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<unknown>;

async function tryGetCapacitorDeviceId(): Promise<string | null> {
  try {
    const mod = (await _dynamicImport('@capacitor/device')) as Record<string, unknown>;
    const Device = mod.Device as {
      getId: () => Promise<CapacitorDeviceInfo>;
    };
    const info = await Device.getId();
    return info.identifier ?? info.uuid ?? null;
  } catch {
    return null;
  }
}

async function tryReadSecureStorage(key: string): Promise<string | null> {
  try {
    const mod = (await _dynamicImport(
      '@aparajita/capacitor-secure-storage',
    )) as Record<string, unknown>;
    const SecureStorage = (mod.default ?? mod.SecureStorage) as {
      get: (key: string) => Promise<unknown>;
    };
    const result = await SecureStorage.get(key);
    if (typeof result === 'string') return result;
    if (result && typeof result === 'object' && 'value' in (result as Record<string, unknown>)) {
      return String((result as { value: unknown }).value);
    }
    return null;
  } catch {
    return null;
  }
}

async function tryWriteSecureStorage(key: string, value: string): Promise<boolean> {
  try {
    const mod = (await _dynamicImport(
      '@aparajita/capacitor-secure-storage',
    )) as Record<string, unknown>;
    const SecureStorage = (mod.default ?? mod.SecureStorage) as {
      set: (key: string, value: string) => Promise<void>;
    };
    await SecureStorage.set(key, value);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// UUID 生成（兼容无 crypto.randomUUID 的环境）
// ---------------------------------------------------------------------------

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: 使用 crypto.getRandomValues 生成 v4 UUID
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

// ---------------------------------------------------------------------------
// localStorage 回退
// ---------------------------------------------------------------------------

const LS_DEVICE_ID_KEY = 'e2ee_device_id';

function readLocalStorageDeviceId(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(LS_DEVICE_ID_KEY);
  } catch {
    return null;
  }
}

function writeLocalStorageDeviceId(id: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_DEVICE_ID_KEY, id);
    }
  } catch {
    // localStorage 不可用时静默失败
  }
}

// ---------------------------------------------------------------------------
// 内存缓存（防止并发调用生成多个 UUID）
// ---------------------------------------------------------------------------

let cachedDeviceId: string | null = null;
let deviceIdInFlight: Promise<string> | null = null;

// ---------------------------------------------------------------------------
// 核心: resolveDeviceId()
// ---------------------------------------------------------------------------

/**
 * 解析设备唯一标识。
 *
 * 优先级:
 * 1. 内存缓存（防止并发调用）
 * 2. IndexedDB 缓存（key-store）
 * 3. Capacitor Device.getId()（原生设备标识）
 * 4. localStorage 中的 UUID
 * 5. 全新生成 UUID → 写入 IndexedDB + localStorage
 *
 * @returns 设备唯一标识字符串
 */
export async function resolveDeviceId(): Promise<string> {
  // 1. 内存缓存命中
  if (cachedDeviceId) return cachedDeviceId;

  // 防止并发调用生成多个 UUID
  if (deviceIdInFlight) return deviceIdInFlight;

  deviceIdInFlight = resolveDeviceIdInternal();
  try {
    cachedDeviceId = await deviceIdInFlight;
    return cachedDeviceId;
  } finally {
    deviceIdInFlight = null;
  }
}

/** @internal 实际解析逻辑 */
async function resolveDeviceIdInternal(): Promise<string> {
  // 1. IndexedDB 缓存
  const cached = await getDeviceId();
  if (cached) return cached;

  // 2. Capacitor 原生设备 ID
  const nativeId = await tryGetCapacitorDeviceId();
  if (nativeId) {
    await saveDeviceId(nativeId);
    writeLocalStorageDeviceId(nativeId);
    return nativeId;
  }

  // 3. localStorage 回退
  const lsId = readLocalStorageDeviceId();
  if (lsId) {
    await saveDeviceId(lsId);
    return lsId;
  }

  // 4. 全新生成
  const newId = generateUUID();
  await saveDeviceId(newId);
  writeLocalStorageDeviceId(newId);
  return newId;
}

// ---------------------------------------------------------------------------
// 重装检测（Capacitor 端）
// ---------------------------------------------------------------------------

export interface InstallState {
  /** 是否为全新安装（app_install_uuid 不存在或不匹配） */
  isFreshInstall: boolean;
  /** 当前 app_install_uuid */
  installUuid: string;
}

const INSTALL_UUID_KEY = 'app_install_uuid';

/**
 * 检测应用安装状态（仅 Capacitor 端有意义）。
 *
 * 在 SecureStorage 中保存 app_install_uuid。
 * 如果 SecureStorage 中存在且与当前设备 ID 匹配 → 非全新安装。
 * 如果不存在或不匹配 → 全新安装（可能重装过）。
 *
 * Web 端始终返回 isFreshInstall: false（Web 端无法可靠检测重装）。
 *
 * @returns InstallState
 */
export async function detectInstallState(): Promise<InstallState> {
  // Web 端无法可靠检测重装
  const isNative = await isCapacitorPlatform();
  if (!isNative) {
    const deviceId = await resolveDeviceId();
    return { isFreshInstall: false, installUuid: deviceId };
  }

  const storedUuid = await tryReadSecureStorage(INSTALL_UUID_KEY);
  const currentDeviceId = await resolveDeviceId();

  if (storedUuid && storedUuid === currentDeviceId) {
    return { isFreshInstall: false, installUuid: storedUuid };
  }

  // 全新安装或重装: 写入当前 device ID 作为 install UUID
  await tryWriteSecureStorage(INSTALL_UUID_KEY, currentDeviceId);
  return { isFreshInstall: true, installUuid: currentDeviceId };
}

/**
 * 判断当前是否运行在 Capacitor 原生平台上
 */
async function isCapacitorPlatform(): Promise<boolean> {
  try {
    const mod = (await _dynamicImport('@capacitor/core')) as Record<string, unknown>;
    const Capacitor = mod.Capacitor as { isNativePlatform: () => boolean };
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * 重置内存中的设备 ID 缓存。
 * 仅供测试使用: 清除 IndexedDB 后调用此函数以确保下次 resolveDeviceId() 重新生成 ID。
 */
export function resetDeviceIdCache(): void {
  cachedDeviceId = null;
  deviceIdInFlight = null;
}

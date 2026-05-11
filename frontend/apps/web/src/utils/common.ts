import dayjs from "dayjs";
import { DATE_FORMATS, FILE_TYPES, FILE_SIZE_LIMITS } from "@/constants";
import { logger } from "@/utils/logger";

/**
 * 格式化时间
 * @param time 时间字符串或时间戳
 * @param format 格式化模板
 * @returns 格式化后的时间字符串
 */
export function formatTime(
  time: string | number | Date,
  format = DATE_FORMATS.CHAT_TIME,
): string {
  if (!time) return "";

  const now = dayjs();
  const target = dayjs(time);

  // 今天显示时间
  if (target.isSame(now, "day")) {
    return target.format(DATE_FORMATS.CHAT_TIME);
  }

  // 昨天显示"昨天 HH:mm"
  if (target.isSame(now.subtract(1, "day"), "day")) {
    return `昨天 ${target.format(DATE_FORMATS.CHAT_TIME)}`;
  }

  // 本年显示"MM-DD HH:mm"
  if (target.isSame(now, "year")) {
    return target.format(DATE_FORMATS.DATETIME);
  }

  // 其他显示完整日期
  return target.format(format);
}

/**
 * 格式化文件大小
 * @param size 文件大小（字节）
 * @returns 格式化后的文件大小字符串
 */
export function formatFileSize(size: number): string {
  if (size === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(size) / Math.log(k));

  return `${(size / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

/**
 * 获取文件类型
 * @param fileName 文件名
 * @returns 文件类型
 */
export function getFileType(
  fileName: string,
): keyof typeof FILE_TYPES | "OTHER" {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext) return "OTHER";

  for (const [type, extensions] of Object.entries(FILE_TYPES)) {
    if ((extensions as readonly string[]).includes(ext)) {
      return type as keyof typeof FILE_TYPES;
    }
  }

  return "OTHER";
}

/**
 * 检查文件大小是否超限
 * @param file 文件对象
 * @returns 是否超限
 */
export function isFileSizeExceeded(file: File): boolean {
  const fileType = getFileType(file.name);
  const limit = FILE_SIZE_LIMITS[fileType as keyof typeof FILE_SIZE_LIMITS];

  if (!limit) return false;

  return file.size > limit;
}

/**
 * 防抖函数
 * @param func 要防抖的函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

/**
 * 节流函数
 * @param func 要节流的函数
 * @param delay 延迟时间（毫秒）
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let lastCall = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();

    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    }
  };
}

/**
 * 生成唯一ID
 * @returns 唯一ID字符串
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 深拷贝对象
 * @param obj 要拷贝的对象
 * @returns 拷贝后的对象
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  if (obj instanceof Array) {
    return obj.map((item) => deepClone(item)) as T;
  }

  if (typeof obj === "object") {
    const cloned = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }

  return obj;
}

/**
 * 检查是否为空值
 * @param value 要检查的值
 * @returns 是否为空
 */
export function isEmpty(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

/**
 * 获取头像显示文本
 * @param name 用户名或昵称
 * @returns 头像显示文本
 */
export function getAvatarText(name?: string): string {
  if (!name) return "?";

  // 如果是中文，取最后一个字符
  if (/[\u4e00-\u9fa5]/.test(name)) {
    return name.charAt(name.length - 1);
  }

  // 如果是英文，取第一个字符
  return name.charAt(0).toUpperCase();
}

/**
 * 复制文本到剪贴板
 * @param text 要复制的文本
 * @returns 是否复制成功
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // 降级方案
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textArea);
    return success;
  } catch (error) {
    logger.warn("copy to clipboard failed", error);
    return false;
  }
}

import dayjs from "dayjs";
import { DATE_FORMATS } from "@/constants";

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


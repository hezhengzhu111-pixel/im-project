import { logger } from "@/utils/logger";

/**
 * 性能优化工具函数
 */

/**
 * 防抖函数
 * @param func 要防抖的函数
 * @param wait 等待时间（毫秒）
 * @param immediate 是否立即执行
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate = false,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };

    const callNow = immediate && !timeout;

    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);

    if (callNow) func(...args);
  };
}

/**
 * 节流函数
 * @param func 要节流的函数
 * @param limit 时间间隔（毫秒）
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number,
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * 延迟执行函数
 * @param ms 延迟时间（毫秒）
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 批量处理函数
 * @param items 要处理的项目数组
 * @param processor 处理函数
 * @param batchSize 批次大小
 * @param delayMs 批次间延迟时间
 */
export async function batchProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize = 10,
  delayMs = 100,
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    // 在批次之间添加延迟，避免阻塞UI
    if (i + batchSize < items.length) {
      await delay(delayMs);
    }
  }

  return results;
}

/**
 * 内存使用监控
 */
export class MemoryMonitor {
  private static instance: MemoryMonitor;
  private memoryUsage: number[] = [];
  private maxSamples = 100;

  static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  /**
   * 记录当前内存使用情况
   */
  recordMemoryUsage(): void {
    if ("memory" in performance) {
      const memory = (performance as any).memory;
      const usage = memory.usedJSHeapSize / memory.totalJSHeapSize;

      this.memoryUsage.push(usage);

      // 保持样本数量在限制内
      if (this.memoryUsage.length > this.maxSamples) {
        this.memoryUsage.shift();
      }

      // 如果内存使用率过高，发出警告
      if (usage > 0.8) {
        logger.warn("memory usage is high", `${(usage * 100).toFixed(2)}%`);
      }
    }
  }

  /**
   * 获取平均内存使用率
   */
  getAverageMemoryUsage(): number {
    if (this.memoryUsage.length === 0) return 0;

    const sum = this.memoryUsage.reduce((a, b) => a + b, 0);
    return sum / this.memoryUsage.length;
  }

  /**
   * 清理内存使用记录
   */
  clearMemoryUsage(): void {
    this.memoryUsage = [];
  }
}

/**
 * 虚拟滚动工具类
 */
export class VirtualScroller {
  private container: HTMLElement;
  private itemHeight: number;
  private visibleCount: number;
  private totalCount: number;
  private scrollTop = 0;

  constructor(
    container: HTMLElement,
    itemHeight: number,
    visibleCount: number,
    totalCount: number,
  ) {
    this.container = container;
    this.itemHeight = itemHeight;
    this.visibleCount = visibleCount;
    this.totalCount = totalCount;
  }

  /**
   * 计算可见范围
   */
  getVisibleRange(): { start: number; end: number } {
    const start = Math.floor(this.scrollTop / this.itemHeight);
    const end = Math.min(start + this.visibleCount, this.totalCount);

    return { start, end };
  }

  /**
   * 更新滚动位置
   */
  updateScrollTop(scrollTop: number): void {
    this.scrollTop = scrollTop;
  }

  /**
   * 获取容器总高度
   */
  getTotalHeight(): number {
    return this.totalCount * this.itemHeight;
  }

  /**
   * 获取偏移量
   */
  getOffset(): number {
    const { start } = this.getVisibleRange();
    return start * this.itemHeight;
  }
}

/**
 * 图片懒加载工具
 */
export class LazyImageLoader {
  private observer: IntersectionObserver;
  private images = new Set<HTMLImageElement>();

  constructor(options?: IntersectionObserverInit) {
    this.observer = new IntersectionObserver(
      this.handleIntersection.bind(this),
      {
        rootMargin: "50px",
        threshold: 0.1,
        ...options,
      },
    );
  }

  /**
   * 观察图片元素
   */
  observe(img: HTMLImageElement): void {
    this.images.add(img);
    this.observer.observe(img);
  }

  /**
   * 停止观察图片元素
   */
  unobserve(img: HTMLImageElement): void {
    this.images.delete(img);
    this.observer.unobserve(img);
  }

  /**
   * 处理交叉观察
   */
  private handleIntersection(entries: IntersectionObserverEntry[]): void {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target as HTMLImageElement;
        const src = img.dataset.src;

        if (src) {
          img.src = src;
          img.removeAttribute("data-src");
          this.observer.unobserve(img);
          this.images.delete(img);
        }
      }
    });
  }

  /**
   * 销毁观察器
   */
  destroy(): void {
    this.observer.disconnect();
    this.images.clear();
  }
}

/**
 * 缓存管理器
 */
export class CacheManager {
  private cache = new Map<
    string,
    { data: any; timestamp: number; ttl: number }
  >();
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  /**
   * 设置缓存
   */
  set(key: string, data: any, ttl = 5 * 60 * 1000): void {
    // 如果缓存已满，删除最旧的项
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  /**
   * 获取缓存
   */
  get(key: string): any | null {
    const item = this.cache.get(key);

    if (!item) return null;

    // 检查是否过期
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  /**
   * 删除缓存
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * 清理过期缓存
   */
  cleanup(): void {
    const now = Date.now();

    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

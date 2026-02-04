<template>
  <div v-if="showMonitor" class="performance-monitor">
    <div class="monitor-header">
      <h4>性能监控</h4>
      <el-button size="small" link @click="toggleMonitor">
        <el-icon><Close /></el-icon>
      </el-button>
    </div>

    <div class="monitor-content">
      <!-- 内存使用情况 -->
      <div class="metric-item">
        <span class="metric-label">内存使用率:</span>
        <span class="metric-value" :class="getMemoryStatusClass()">
          {{ (memoryUsage * 100).toFixed(1) }}%
        </span>
      </div>

      <!-- FPS -->
      <div class="metric-item">
        <span class="metric-label">FPS:</span>
        <span class="metric-value" :class="getFpsStatusClass()">
          {{ fps }}
        </span>
      </div>

      <!-- 消息数量 -->
      <div class="metric-item">
        <span class="metric-label">消息数量:</span>
        <span class="metric-value">
          {{ messageCount }}
        </span>
      </div>

      <!-- 渲染时间 -->
      <div class="metric-item">
        <span class="metric-label">渲染时间:</span>
        <span class="metric-value"> {{ renderTime }}ms </span>
      </div>

      <!-- 网络延迟 -->
      <div class="metric-item">
        <span class="metric-label">网络延迟:</span>
        <span class="metric-value" :class="getLatencyStatusClass()">
          {{ networkLatency }}ms
        </span>
      </div>

      <!-- 操作按钮 -->
      <div class="monitor-actions">
        <el-button size="small" @click="clearCache"> 清理缓存 </el-button>
        <el-button size="small" @click="forceGC"> 强制GC </el-button>
        <el-button size="small" @click="exportMetrics"> 导出数据 </el-button>
      </div>
    </div>
  </div>

  <!-- 悬浮按钮 -->
  <div v-else class="monitor-toggle" @click="toggleMonitor">
    <el-icon><Monitor /></el-icon>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { ElMessage } from "element-plus";
import { Close, Monitor } from "@element-plus/icons-vue";
import { MemoryMonitor, CacheManager } from "@/utils/performance";
import { useChatStore } from "@/stores/chat";

// 响应式数据
const showMonitor = ref(false);
const memoryUsage = ref(0);
const fps = ref(0);
const renderTime = ref(0);
const networkLatency = ref(0);

// 性能监控实例
const memoryMonitor = MemoryMonitor.getInstance();
const cacheManager = new CacheManager();

// Store引用
const chatStore = useChatStore();

// 计算属性
const messageCount = computed(() => {
  return chatStore.currentMessages.length;
});

// FPS监控
let frameCount = 0;
let lastTime = performance.now();
let animationId: number;

const measureFPS = () => {
  frameCount++;
  const currentTime = performance.now();

  if (currentTime - lastTime >= 1000) {
    fps.value = Math.round((frameCount * 1000) / (currentTime - lastTime));
    frameCount = 0;
    lastTime = currentTime;
  }

  animationId = requestAnimationFrame(measureFPS);
};

// 内存监控
const updateMemoryUsage = () => {
  memoryMonitor.recordMemoryUsage();
  memoryUsage.value = memoryMonitor.getAverageMemoryUsage();
};

// 渲染时间监控
const measureRenderTime = () => {
  const start = performance.now();

  // 使用requestAnimationFrame来测量渲染时间
  requestAnimationFrame(() => {
    renderTime.value = Math.round(performance.now() - start);
  });
};

// 网络延迟监控
const measureNetworkLatency = async () => {
  const start = performance.now();

  try {
    // 发送ping请求到服务器
    const response = await fetch("/api/ping", {
      method: "GET",
      cache: "no-cache",
    });

    if (response.ok) {
      networkLatency.value = Math.round(performance.now() - start);
    }
  } catch (error) {
    console.warn("网络延迟测量失败:", error);
  }
};

// 状态类名
const getMemoryStatusClass = () => {
  if (memoryUsage.value > 0.8) return "status-danger";
  if (memoryUsage.value > 0.6) return "status-warning";
  return "status-normal";
};

const getFpsStatusClass = () => {
  if (fps.value < 30) return "status-danger";
  if (fps.value < 50) return "status-warning";
  return "status-normal";
};

const getLatencyStatusClass = () => {
  if (networkLatency.value > 1000) return "status-danger";
  if (networkLatency.value > 500) return "status-warning";
  return "status-normal";
};

// 方法
const toggleMonitor = () => {
  showMonitor.value = !showMonitor.value;
};

const clearCache = () => {
  cacheManager.clear();
  ElMessage.success("缓存已清理");
};

const forceGC = () => {
  if ("gc" in window && typeof (window as any).gc === "function") {
    (window as any).gc();
    ElMessage.success("垃圾回收已执行");
  } else {
    ElMessage.warning("当前环境不支持手动垃圾回收");
  }
};

const exportMetrics = () => {
  const metrics = {
    timestamp: new Date().toISOString(),
    memoryUsage: memoryUsage.value,
    fps: fps.value,
    renderTime: renderTime.value,
    networkLatency: networkLatency.value,
    messageCount: messageCount.value,
  };

  const blob = new Blob([JSON.stringify(metrics, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `performance-metrics-${Date.now()}.json`;
  a.click();

  URL.revokeObjectURL(url);
  ElMessage.success("性能数据已导出");
};

// 定时器
let memoryTimer: NodeJS.Timeout;
let renderTimer: NodeJS.Timeout;
let networkTimer: NodeJS.Timeout;

// 生命周期
onMounted(() => {
  // 开始FPS监控
  measureFPS();

  // 定时更新性能指标
  memoryTimer = setInterval(updateMemoryUsage, 2000);
  renderTimer = setInterval(measureRenderTime, 1000);
  networkTimer = setInterval(measureNetworkLatency, 10000);

  // 初始测量
  updateMemoryUsage();
  measureRenderTime();
  measureNetworkLatency();
});

onUnmounted(() => {
  // 清理定时器
  if (animationId) {
    cancelAnimationFrame(animationId);
  }

  clearInterval(memoryTimer);
  clearInterval(renderTimer);
  clearInterval(networkTimer);

  // 清理内存监控
  memoryMonitor.clearMemoryUsage();
});
</script>

<style scoped>
.performance-monitor {
  position: fixed;
  top: 20px;
  right: 20px;
  width: 280px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  z-index: 9999;
  font-size: 12px;
}

.monitor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.monitor-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.monitor-content {
  padding: 16px;
}

.metric-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.metric-label {
  color: #606266;
  font-weight: 500;
}

.metric-value {
  font-weight: 600;
  font-family: "Courier New", monospace;
}

.status-normal {
  color: #67c23a;
}

.status-warning {
  color: #e6a23c;
}

.status-danger {
  color: #f56c6c;
}

.monitor-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}

.monitor-actions .el-button {
  flex: 1;
  font-size: 11px;
}

.monitor-toggle {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 48px;
  height: 48px;
  background: #409eff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(64, 158, 255, 0.3);
  transition: all 0.3s ease;
  z-index: 9998;
}

.monitor-toggle:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(64, 158, 255, 0.4);
}

.monitor-toggle .el-icon {
  color: white;
  font-size: 20px;
}

@media (max-width: 768px) {
  .performance-monitor {
    width: calc(100vw - 40px);
    top: 10px;
    right: 20px;
    left: 20px;
  }

  .monitor-toggle {
    bottom: 80px;
    right: 20px;
  }
}
</style>

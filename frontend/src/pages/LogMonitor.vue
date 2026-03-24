<template>
  <div class="log-monitor">
    <h2>实时日志监控 (SSE)</h2>
    <div class="controls">
      <el-input v-model="filterKeyword" placeholder="关键字过滤" style="width: 200px" />
      <el-select v-model="filterLevel" placeholder="日志级别" clearable style="width: 150px">
        <el-option label="INFO" value="INFO" />
        <el-option label="WARN" value="WARN" />
        <el-option label="ERROR" value="ERROR" />
      </el-select>
      <el-button @click="connectSSE" type="primary">连接 SSE</el-button>
      <el-button @click="disconnectSSE" type="danger">断开连接</el-button>
    </div>
    
    <!-- 虚拟滚动列表 -->
    <div class="log-list" ref="logContainer">
      <div v-for="(log, index) in filteredLogs" :key="index" class="log-item" :class="log.level.toLowerCase()">
        <span class="time">{{ log.timestamp }}</span>
        <span class="level">[{{ log.level }}]</span>
        <span class="traceId" v-if="log.traceId" @click="showTrace(log.traceId)">[TraceId: {{ log.traceId }}]</span>
        <span class="msg">{{ log.message }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue';
import { ElMessage } from 'element-plus';

const logs = ref<any[]>([]);
const filterKeyword = ref('');
const filterLevel = ref('');
let eventSource: EventSource | null = null;

const filteredLogs = computed(() => {
  return logs.value.filter(log => {
    const matchKeyword = filterKeyword.value ? log.message.includes(filterKeyword.value) : true;
    const matchLevel = filterLevel.value ? log.level === filterLevel.value : true;
    return matchKeyword && matchLevel;
  });
});

const connectSSE = () => {
  if (eventSource) return;
  
  eventSource = new EventSource('http://localhost:8090/api/logs/stream');
  
  eventSource.onmessage = (event) => {
    // 假设后端传过来的格式是原始字符串，前端做简单正则解析，或者后端传 JSON
    const raw = event.data;
    const regex = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s+\[.*?\]\s+(\w+)\s+\[traceId=(.*?)\]\s+(.*?)\s+-\s+(.*)$/;
    const match = raw.match(regex);
    if (match) {
      logs.value.push({
        timestamp: match[1],
        level: match[2],
        traceId: match[3],
        service: match[4],
        message: match[5]
      });
      if (logs.value.length > 1000) {
        logs.value.shift(); // 保持最大1000条
      }
    } else {
      logs.value.push({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        traceId: '',
        service: '',
        message: raw
      });
    }
  };

  eventSource.onerror = () => {
    ElMessage.error('SSE 连接断开');
    disconnectSSE();
  };
};

const disconnectSSE = () => {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
};

const showTrace = (traceId: string) => {
  ElMessage.info(`正在查询 TraceId: ${traceId} 的完整链路...`);
  // 发送请求到后端查询聚合日志
};

onBeforeUnmount(() => {
  disconnectSSE();
});
</script>

<style scoped>
.log-monitor {
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.controls {
  margin-bottom: 10px;
  display: flex;
  gap: 10px;
}
.log-list {
  flex: 1;
  background: #1e1e1e;
  color: #d4d4d4;
  overflow-y: auto;
  font-family: monospace;
  padding: 10px;
  border-radius: 4px;
}
.log-item {
  margin-bottom: 4px;
  word-break: break-all;
}
.log-item.error { color: #f56c6c; }
.log-item.warn { color: #e6a23c; }
.log-item.info { color: #67c23a; }
.time { color: #888; margin-right: 8px; }
.level { margin-right: 8px; font-weight: bold; }
.traceId { color: #409eff; cursor: pointer; text-decoration: underline; margin-right: 8px; }
</style>

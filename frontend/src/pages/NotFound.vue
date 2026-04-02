<template>
  <div class="not-found-container">
    <div class="not-found-content">
      <div class="error-illustration">
        <svg viewBox="0 0 200 200" class="error-svg">
          <!-- 404 数字 -->
          <text x="100" y="80" text-anchor="middle" class="error-number">
            404
          </text>

          <!-- 装饰元素 -->
          <circle cx="50" cy="120" r="3" class="decoration" />
          <circle cx="150" cy="120" r="3" class="decoration" />
          <circle cx="100" cy="140" r="2" class="decoration" />

          <!-- 波浪线 -->
          <path
            d="M 30 160 Q 50 150 70 160 T 110 160 T 150 160 T 170 160"
            stroke="currentColor"
            stroke-width="2"
            fill="none"
            class="wave-line"
          />
        </svg>
      </div>

      <div class="error-info">
        <h1 class="error-title">页面未找到</h1>
        <p class="error-description">抱歉，您访问的页面不存在或已被移除。</p>
        <p class="error-suggestion">请检查网址是否正确，或返回首页继续浏览。</p>
      </div>

      <div class="error-actions">
        <el-button type="primary" size="large" @click="goHome">
          <el-icon><House /></el-icon>
          返回首页
        </el-button>

        <el-button size="large" @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回上页
        </el-button>

        <el-button size="large" @click="refresh">
          <el-icon><Refresh /></el-icon>
          刷新页面
        </el-button>
      </div>

      <div class="help-links">
        <h3>您可能在寻找：</h3>
        <div class="link-grid">
          <router-link to="/chat" class="help-link">
            <el-icon><ChatDotRound /></el-icon>
            <span>聊天</span>
          </router-link>

          <router-link to="/contacts" class="help-link">
            <el-icon><User /></el-icon>
            <span>联系人</span>
          </router-link>

          <router-link to="/groups" class="help-link">
            <el-icon><UserFilled /></el-icon>
            <span>群组</span>
          </router-link>

          <router-link to="/profile" class="help-link">
            <el-icon><Avatar /></el-icon>
            <span>个人资料</span>
          </router-link>

          <router-link to="/settings" class="help-link">
            <el-icon><Setting /></el-icon>
            <span>设置</span>
          </router-link>
        </div>
      </div>

      <div class="error-footer">
        <p class="footer-text">
          如果问题持续存在，请联系技术支持：
          <el-link href="mailto:support@example.com" type="primary">
            support@example.com
          </el-link>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";

import {
  House,
  ArrowLeft,
  Refresh,
  ChatDotRound,
  User,
  UserFilled,
  Avatar,
  Setting,
} from "@element-plus/icons-vue";

// 路由
const router = useRouter();

// 方法
const goHome = () => {
  router.push("/");
};

const goBack = () => {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push("/");
  }
};

const refresh = () => {
  window.location.reload();
};

// 页面加载时的动画效果
const animateElements = () => {
  // 添加进入动画
  const container = document.querySelector(".not-found-content");
  if (container) {
    container.classList.add("animate-in");
  }
};

// 组件挂载后执行动画
import { onMounted } from "vue";
onMounted(() => {
  setTimeout(animateElements, 100);
});
</script>

<style scoped>
.not-found-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  position: relative;
  overflow: hidden;
}

.not-found-container::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="2" fill="%23ffffff" opacity="0.1"/></svg>')
    repeat;
  background-size: 50px 50px;
  animation: float 20s infinite linear;
}

@keyframes float {
  0% {
    transform: translateY(0px) translateX(0px);
  }
  33% {
    transform: translateY(-10px) translateX(10px);
  }
  66% {
    transform: translateY(5px) translateX(-5px);
  }
  100% {
    transform: translateY(0px) translateX(0px);
  }
}

.not-found-content {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  padding: 40px;
  max-width: 600px;
  width: 100%;
  text-align: center;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
  position: relative;
  z-index: 1;
  opacity: 0;
  transform: translateY(30px);
  transition: all 0.6s ease;
}

.not-found-content.animate-in {
  opacity: 1;
  transform: translateY(0);
}

.error-illustration {
  margin-bottom: 30px;
}

.error-svg {
  width: 200px;
  height: 200px;
  color: #667eea;
}

.error-number {
  font-size: 48px;
  font-weight: bold;
  fill: currentColor;
  font-family: "Arial", sans-serif;
}

.decoration {
  fill: currentColor;
  opacity: 0.6;
  animation: pulse 2s infinite;
}

.wave-line {
  color: #667eea;
  opacity: 0.8;
  animation: wave 3s infinite ease-in-out;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.6;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}

@keyframes wave {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}

.error-info {
  margin-bottom: 30px;
}

.error-title {
  font-size: 32px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0 0 16px 0;
}

.error-description {
  font-size: 16px;
  color: #5a6c7d;
  margin: 0 0 12px 0;
  line-height: 1.6;
}

.error-suggestion {
  font-size: 14px;
  color: #7f8c8d;
  margin: 0;
  line-height: 1.5;
}

.error-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 40px;
}

.help-links {
  margin-bottom: 30px;
}

.help-links h3 {
  font-size: 18px;
  color: #2c3e50;
  margin: 0 0 20px 0;
  font-weight: 500;
}

.link-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
  max-width: 400px;
  margin: 0 auto;
}

.help-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 12px;
  background: #f8f9fa;
  border-radius: 12px;
  text-decoration: none;
  color: #5a6c7d;
  transition: all 0.3s ease;
  border: 2px solid transparent;
}

.help-link:hover {
  background: #667eea;
  color: white;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.help-link .el-icon {
  font-size: 20px;
}

.help-link span {
  font-size: 12px;
  font-weight: 500;
}

.error-footer {
  border-top: 1px solid #e9ecef;
  padding-top: 20px;
}

.footer-text {
  font-size: 13px;
  color: #6c757d;
  margin: 0;
  line-height: 1.5;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .not-found-container {
    padding: 10px;
  }

  .not-found-content {
    padding: 30px 20px;
  }

  .error-svg {
    width: 150px;
    height: 150px;
  }

  .error-number {
    font-size: 36px;
  }

  .error-title {
    font-size: 24px;
  }

  .error-actions {
    flex-direction: column;
    align-items: center;
  }

  .error-actions .el-button {
    width: 100%;
    max-width: 200px;
  }

  .link-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .help-link {
    padding: 12px 8px;
  }

  .help-link .el-icon {
    font-size: 16px;
  }

  .help-link span {
    font-size: 11px;
  }
}

@media (max-width: 480px) {
  .error-actions {
    gap: 8px;
  }

  .link-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* 暗色主题 */
[data-theme="dark"] .not-found-content {
  background: rgba(45, 45, 45, 0.95);
  color: #e0e0e0;
}

[data-theme="dark"] .error-title {
  color: #e0e0e0;
}

[data-theme="dark"] .error-description {
  color: #b0b0b0;
}

[data-theme="dark"] .error-suggestion {
  color: #a0a0a0;
}

[data-theme="dark"] .help-links h3 {
  color: #e0e0e0;
}

[data-theme="dark"] .help-link {
  background: #3a3a3a;
  color: #b0b0b0;
}

[data-theme="dark"] .help-link:hover {
  background: #667eea;
  color: white;
}

[data-theme="dark"] .error-footer {
  border-top-color: #404040;
}

[data-theme="dark"] .footer-text {
  color: #a0a0a0;
}

/* 动画增强 */
.error-actions .el-button {
  transition: all 0.3s ease;
}

.error-actions .el-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* 加载动画 */
@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.not-found-content > * {
  animation: slideInUp 0.6s ease forwards;
}

.not-found-content > *:nth-child(1) {
  animation-delay: 0.1s;
}
.not-found-content > *:nth-child(2) {
  animation-delay: 0.2s;
}
.not-found-content > *:nth-child(3) {
  animation-delay: 0.3s;
}
.not-found-content > *:nth-child(4) {
  animation-delay: 0.4s;
}
.not-found-content > *:nth-child(5) {
  animation-delay: 0.5s;
}
</style>

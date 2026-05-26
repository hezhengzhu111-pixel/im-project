<template>
  <div class="moments-page-wrapper fresh-page">
    <div class="moments-container">
      <!-- 左侧主面板 -->
      <div class="moments-main-panel">
        <div ref="topbarRef" class="moments-topbar">
          <span class="topbar-title">朋友圈</span>
          <el-icon class="topbar-camera" @click="showComposer = true">
            <Camera />
          </el-icon>
        </div>

        <div ref="scrollRef" class="moments-scroll" @scroll="handleScroll">
          <MomentsCover
            :cover-photo="coverPhoto"
            :avatar="avatar"
            :nickname="nickname"
          />
          <MomentsFeed />
        </div>
      </div>

      <!-- 右侧面板（桌面端可见） -->
      <aside class="moments-side-panel">
        <div class="fresh-glass-card side-profile-card">
          <el-avatar :src="avatar" :size="64" class="side-avatar">
            {{ nickname?.[0] || 'U' }}
          </el-avatar>
          <div class="side-nickname">{{ nickname || '用户' }}</div>
          <button class="side-post-btn" @click="showComposer = true">
            <el-icon><Camera /></el-icon>
            <span>发布动态</span>
          </button>
        </div>
        <div class="fresh-glass-card side-tip-card">
          <p>分享你的生活瞬间</p>
          <p class="tip-muted">照片、文字、视频都可以发布到朋友圈</p>
        </div>
      </aside>
    </div>

    <!-- 发布动态抽屉 -->
    <el-drawer v-model="showComposer" title="发布动态" :size="drawerSize" direction="btt">
      <MomentsComposer @close="showComposer = false" />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Camera } from '@element-plus/icons-vue'
import { useIsMobile } from '@/composables/useIsMobile'
import { useUserStore } from '@/stores/user'
import { useMomentsStore } from '@/stores/moments'
import MomentsFeed from './MomentsFeed.vue'
import MomentsCover from './MomentsCover.vue'
import MomentsComposer from './MomentsComposer.vue'

const showComposer = ref(false)
const { isMobile } = useIsMobile()
const drawerSize = computed(() => (isMobile.value ? '100vw' : 'min(400px, 100vw)'))

const userStore = useUserStore()
const momentsStore = useMomentsStore()

const avatar = computed(() => userStore.avatar)
const nickname = computed(() => userStore.nickname)
const coverPhoto = computed(() => (userStore.currentUser as any)?.coverPhoto ?? '')

const scrollRef = ref<HTMLElement>()
const topbarRef = ref<HTMLElement>()

let threshold = 232
let ticking = false

function computeThreshold() {
  const coverHeight = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--moments-cover-height').trim()
  ) || 280
  threshold = coverHeight - 48
}

function updateTopbar(scrollTop: number) {
  if (!topbarRef.value) return
  const progress = Math.min(scrollTop / threshold, 1)
  topbarRef.value.style.setProperty('--topbar-bg-opacity', String(progress * 0.95))
  topbarRef.value.style.setProperty('--topbar-border-opacity', String(progress))
  topbarRef.value.style.setProperty('--topbar-blur', `${progress * 10}px`)
  if (progress > 0.5) {
    topbarRef.value.classList.add('is-solid')
  } else {
    topbarRef.value.classList.remove('is-solid')
  }
}

function handleScroll() {
  if (!ticking) {
    requestAnimationFrame(() => {
      if (scrollRef.value) {
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.value
        updateTopbar(scrollTop)
        if (scrollHeight - scrollTop - clientHeight < 100) {
          momentsStore.loadFeed()
        }
      }
      ticking = false
    })
    ticking = true
  }
}

onMounted(() => {
  computeThreshold()
  window.addEventListener('resize', computeThreshold)
})

onUnmounted(() => {
  window.removeEventListener('resize', computeThreshold)
})
</script>

<style scoped lang="scss">
.moments-page-wrapper {
  width: 100%;
  min-height: 100vh;
  display: flex;
  justify-content: center;
}

.moments-container {
  width: min(1040px, 100%);
  height: 100%;
  min-height: 0;
  margin: 0 auto;
  padding: 20px;
  display: grid;
  grid-template-columns: minmax(0, 680px) 280px;
  gap: 16px;
  background: transparent;
  align-items: start;
}

// 左侧主面板 — 玻璃卡片
.moments-main-panel {
  display: flex;
  flex-direction: column;
  background: var(--fresh-glass-bg);
  border: 1px solid var(--fresh-glass-border);
  border-radius: var(--fresh-radius-page);
  overflow: hidden;
  backdrop-filter: var(--fresh-blur);
  -webkit-backdrop-filter: var(--fresh-blur);
  min-height: 0;
}

// 右侧面板 — 桌面端显示
.moments-side-panel {
  display: flex;
  flex-direction: column;
  align-self: start;
  position: sticky;
  top: 20px;
  gap: 14px;
  // Do NOT set min-height, height, or flex:1
}

.side-profile-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 20px;
  text-align: center;
}

.side-avatar {
  border-radius: 16px;
}

.side-nickname {
  font-size: 16px;
  font-weight: 600;
  color: var(--fresh-text);
}

.side-post-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border: none;
  border-radius: 20px;
  background: linear-gradient(135deg, var(--fresh-green), var(--fresh-mint));
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(7, 193, 96, 0.22);
  }
}

.side-tip-card {
  padding: 18px 20px;

  p {
    margin: 0;
    font-size: 14px;
    color: var(--fresh-text);
    font-weight: 500;
  }

  .tip-muted {
    margin-top: 6px;
    font-size: 12px;
    color: var(--fresh-text-muted);
    font-weight: 400;
  }
}

// topbar（保留原有 sticky 逻辑）
.moments-topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  height: var(--moments-topbar-height);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  background: rgba(255, 255, 255, var(--topbar-bg-opacity, 0));
  border-bottom: 1px solid rgba(236, 236, 236, var(--topbar-border-opacity, 0));
  backdrop-filter: blur(var(--topbar-blur, 0px));
  -webkit-backdrop-filter: blur(var(--topbar-blur, 0px));
}

.topbar-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-inverse);
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
}

.topbar-camera {
  position: absolute;
  right: 16px;
  font-size: 22px;
  color: var(--text-inverse);
  cursor: pointer;
  padding: 4px;
}

.moments-topbar.is-solid {
  .topbar-title {
    color: var(--fresh-text);
    text-shadow: none;
  }
  .topbar-camera {
    color: var(--fresh-text);
  }
}

.moments-scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  min-height: 0;
}

// ── 窄屏/嵌入上下文 ──
@media (max-width: 1180px) {
  .moments-container {
    grid-template-columns: minmax(0, 680px);
    justify-content: center;
  }

  .moments-side-panel {
    display: none;
  }
}

// ── 移动端 ──
@media (max-width: 768px) {
  .moments-page-wrapper {
    background: var(--moments-bg);
  }

  .moments-container {
    max-width: 100%;
    padding: 0;
    grid-template-columns: 1fr;
    gap: 0;
  }

  .moments-main-panel {
    border-radius: 0;
    border: none;
    background: var(--moments-bg);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .moments-side-panel {
    display: none;
  }

  .topbar-title {
    font-size: 16px;
  }
}
</style>

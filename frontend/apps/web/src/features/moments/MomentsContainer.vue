<template>
  <div class="moments-page-wrapper">
    <div class="moments-container">
    <!-- 顶栏：sticky, 透明→实色 -->
    <div ref="topbarRef" class="moments-topbar">
      <span class="topbar-title">朋友圈</span>
      <el-icon class="topbar-camera" @click="showComposer = true">
        <Camera />
      </el-icon>
    </div>

    <!-- 统一滚动区 -->
    <div ref="scrollRef" class="moments-scroll" @scroll="handleScroll">
      <MomentsCover
        :cover-photo="coverPhoto"
        :avatar="avatar"
        :nickname="nickname"
      />
      <MomentsFeed />
    </div>

    <!-- 发布动态抽屉 -->
    <el-drawer v-model="showComposer" title="发布动态" :size="drawerSize" direction="btt">
      <MomentsComposer @close="showComposer = false" />
    </el-drawer>
    </div>
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
  height: 100vh;
  display: flex;
  justify-content: center;
  background-color: #F0F0F0;
}

.moments-container {
  width: 100%;
  max-width: 600px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--moments-bg);
  border-left: 1px solid #ECECEC;
  border-right: 1px solid #ECECEC;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.08);
  position: relative;
  overflow-x: hidden;
  overflow-y: visible;
}

.moments-topbar {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky, 200);
  height: var(--moments-topbar-height);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  background: rgba(255, 255, 255, var(--topbar-bg-opacity, 0));
  border-bottom: 1px solid rgba(236, 236, 236, var(--topbar-border-opacity, 0));
  backdrop-filter: blur(var(--topbar-blur, 0px));
  -webkit-backdrop-filter: blur(var(--topbar-blur, 0px));
  transition: background 0.15s ease, border-color 0.15s ease;
}

.topbar-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-inverse);
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
  transition: color 0.15s ease, text-shadow 0.15s ease;
}

.topbar-camera {
  position: absolute;
  right: 16px;
  font-size: 22px;
  color: var(--text-inverse);
  cursor: pointer;
  padding: 4px;
  transition: color 0.15s ease;
}

.moments-topbar.is-solid {
  .topbar-title {
    color: var(--text-primary);
    text-shadow: none;
  }
  .topbar-camera {
    color: var(--text-primary);
  }
}

.moments-scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

@media (max-width: 768px) {
  .moments-page-wrapper {
    background-color: var(--moments-bg);
  }

  .moments-container {
    max-width: 100%;
    border-left: none;
    border-right: none;
    box-shadow: none;
  }

  .topbar-title {
    font-size: 16px;
  }
}
</style>

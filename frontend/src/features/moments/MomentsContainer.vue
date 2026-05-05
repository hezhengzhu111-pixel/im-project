<template>
  <div class="moments-container">
    <div class="moments-header">
      <h2>朋友圈</h2>
      <el-button type="primary" @click="showComposer = true">
        <el-icon><Plus /></el-icon>
        发布动态
      </el-button>
    </div>

    <MomentsFeed />

    <el-drawer v-model="showComposer" title="发布动态" :size="drawerSize" direction="btt">
      <MomentsComposer @close="showComposer = false" />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { useIsMobile } from '@/composables/useIsMobile'
import MomentsFeed from './MomentsFeed.vue'
import MomentsComposer from './MomentsComposer.vue'

const showComposer = ref(false)

const { isMobile } = useIsMobile()
const drawerSize = computed(() => (isMobile.value ? '100vw' : 'min(400px, 100vw)'))
</script>

<style scoped lang="scss">
.moments-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.moments-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--el-border-color-light);

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }
}
</style>

<template>
  <el-dialog v-model="visible" fullscreen :show-close="false">
    <div class="image-viewer">
      <el-icon class="close-btn" @click="visible = false"><Close /></el-icon>
      <el-image :src="currentImage" fit="contain" />
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Close } from '@element-plus/icons-vue'

const props = defineProps<{
  images: string[]
  initialIndex?: number
}>()

const visible = defineModel<boolean>('visible')
const currentIndex = ref(props.initialIndex || 0)

const currentImage = computed(() => props.images[currentIndex.value])
</script>

<style scoped lang="scss">
.image-viewer {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.9);

  .close-btn {
    position: fixed;
    top: 20px;
    right: 20px;
    font-size: 24px;
    color: white;
    cursor: pointer;
  }

  .el-image {
    max-width: 90vw;
    max-height: 90vh;
  }
}
</style>

<template>
  <el-radio-group v-model="model" class="visibility-picker">
    <el-radio-button :value="0">
      <el-icon><Platform /></el-icon>
      公开
    </el-radio-button>
    <el-radio-button :value="1">
      <el-icon><User /></el-icon>
      好友可见
    </el-radio-button>
    <el-radio-button :value="2">
      <el-icon><Lock /></el-icon>
      仅自己
    </el-radio-button>
  </el-radio-group>
</template>

<script setup lang="ts">
import { Platform, User, Lock } from '@element-plus/icons-vue'

const model = defineModel<number>({ default: 0 })
</script>

<style scoped lang="scss">
.visibility-picker {
  width: 100%;

  :deep(.el-radio-button) {
    flex: 1;

    .el-radio-button__inner {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }
  }
}
</style>

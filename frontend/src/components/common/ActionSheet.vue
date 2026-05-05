<template>
  <Teleport to="body">
    <Transition name="sheet-fade">
      <div v-if="visible" class="action-sheet-overlay" @click.self="close">
        <Transition name="sheet-slide">
          <div v-if="visible" class="action-sheet">
            <div class="action-sheet-options">
              <button
                v-for="(option, index) in options"
                :key="index"
                class="action-sheet-option"
                :class="{ 'action-sheet-option--destructive': option.destructive }"
                @click="select(index)"
              >
                {{ option.label }}
              </button>
            </div>
            <button class="action-sheet-cancel" @click="close">取消</button>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
export interface ActionSheetOption {
  label: string;
  destructive?: boolean;
}

defineProps<{
  options: ActionSheetOption[];
}>();

const visible = defineModel<boolean>("visible", { default: false });
const emit = defineEmits<{
  (e: "select", index: number): void;
}>();

function select(index: number) {
  emit("select", index);
  visible.value = false;
}

function close() {
  visible.value = false;
}
</script>

<style scoped lang="scss">
.action-sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.action-sheet {
  width: 100%;
  max-width: 500px;
  padding: 0 8px calc(8px + env(safe-area-inset-bottom, 0px));
}

.action-sheet-options {
  background: var(--el-bg-color, #fff);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 8px;
}

.action-sheet-option {
  width: 100%;
  padding: 14px;
  border: none;
  background: transparent;
  font-size: 16px;
  color: var(--el-text-color-primary, #303133);
  cursor: pointer;
  text-align: center;

  & + & {
    border-top: 1px solid var(--el-border-color-lighter, #e4e7ed);
  }

  &:active {
    background: var(--el-fill-color-light, #f5f7fa);
  }

  &--destructive {
    color: var(--el-color-danger, #f56c6c);
  }
}

.action-sheet-cancel {
  width: 100%;
  padding: 14px;
  border: none;
  background: var(--el-bg-color, #fff);
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
  cursor: pointer;

  &:active {
    background: var(--el-fill-color-light, #f5f7fa);
  }
}

.sheet-fade-enter-active,
.sheet-fade-leave-active {
  transition: opacity 0.2s ease;
}
.sheet-fade-enter-from,
.sheet-fade-leave-to {
  opacity: 0;
}

.sheet-slide-enter-active,
.sheet-slide-leave-active {
  transition: transform 0.25s ease;
}
.sheet-slide-enter-from,
.sheet-slide-leave-to {
  transform: translateY(100%);
}
</style>

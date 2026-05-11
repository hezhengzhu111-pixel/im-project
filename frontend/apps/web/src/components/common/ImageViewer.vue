<template>
  <Teleport to="body">
    <Transition name="viewer-fade">
      <div v-if="visible" class="image-viewer" @click.self="close">
        <button class="viewer-close" @click="close" aria-label="关闭">
          <el-icon :size="24"><Close /></el-icon>
        </button>

        <div v-if="images.length > 1" class="viewer-counter">
          {{ currentIndex + 1 }} / {{ images.length }}
        </div>

        <div
          ref="imageWrapRef"
          class="viewer-image-wrap"
          @touchstart="onTouchStart"
          @touchmove="onTouchMove"
          @touchend="onTouchEnd"
        >
          <img
            :src="images[currentIndex]"
            class="viewer-image"
            :style="imageTransform"
            draggable="false"
          />
        </div>

        <button
          v-if="images.length > 1 && currentIndex > 0"
          class="viewer-nav viewer-nav--prev"
          @click.stop="prev"
          aria-label="上一张"
        >
          <el-icon :size="32"><ArrowLeft /></el-icon>
        </button>
        <button
          v-if="images.length > 1 && currentIndex < images.length - 1"
          class="viewer-nav viewer-nav--next"
          @click.stop="next"
          aria-label="下一张"
        >
          <el-icon :size="32"><ArrowRight /></el-icon>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue";
import { Close, ArrowLeft, ArrowRight } from "@element-plus/icons-vue";

const props = defineProps<{
  images: string[];
  initialIndex?: number;
}>();

const visible = defineModel<boolean>("visible", { default: false });
const currentIndex = ref(props.initialIndex ?? 0);

watch(visible, (val) => {
  if (val) {
    currentIndex.value = props.initialIndex ?? 0;
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
  }
});

const scale = ref(1);
const translateX = ref(0);
const translateY = ref(0);
let initialDistance = 0;
let initialScale = 1;
let startX = 0;
let startY = 0;
let startTranslateX = 0;
let startTranslateY = 0;
let isDragging = false;

const imageTransform = computed(() => ({
  transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`,
}));

function close() {
  visible.value = false;
}

function prev() {
  if (currentIndex.value > 0) {
    currentIndex.value--;
    resetTransform();
  }
}

function next() {
  if (currentIndex.value < props.images.length - 1) {
    currentIndex.value++;
    resetTransform();
  }
}

function resetTransform() {
  scale.value = 1;
  translateX.value = 0;
  translateY.value = 0;
}

function getDistance(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function onTouchStart(e: TouchEvent) {
  if (e.touches.length === 2) {
    initialDistance = getDistance(e.touches);
    initialScale = scale.value;
  } else if (e.touches.length === 1) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startTranslateX = translateX.value;
    startTranslateY = translateY.value;
    isDragging = true;
  }
}

function onTouchMove(e: TouchEvent) {
  if (e.touches.length === 2) {
    const dist = getDistance(e.touches);
    scale.value = Math.max(0.5, Math.min(5, initialScale * (dist / initialDistance)));
  } else if (e.touches.length === 1 && isDragging && scale.value > 1) {
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    translateX.value = startTranslateX + dx;
    translateY.value = startTranslateY + dy;
  }
}

function onTouchEnd(e: TouchEvent) {
  if (e.touches.length === 0) {
    if (scale.value <= 1 && isDragging) {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx > 0) prev();
        else next();
      } else if (Math.abs(dy) > 100 && dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.5) {
        close();
      }
    }
    isDragging = false;
    if (scale.value < 1) {
      scale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
    }
  }
}

function onKeydown(e: KeyboardEvent) {
  if (!visible.value) return;
  if (e.key === "Escape") close();
  if (e.key === "ArrowLeft") prev();
  if (e.key === "ArrowRight") next();
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", onKeydown);
}

onUnmounted(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("keydown", onKeydown);
  }
});
</script>

<style scoped lang="scss">
.image-viewer {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
}

.viewer-close {
  position: absolute;
  top: calc(12px + env(safe-area-inset-top, 0px));
  right: 12px;
  z-index: 10;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  cursor: pointer;
}

.viewer-counter {
  position: absolute;
  top: calc(16px + env(safe-area-inset-top, 0px));
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
}

.viewer-image-wrap {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.viewer-image {
  max-width: 95vw;
  max-height: 90vh;
  object-fit: contain;
  user-select: none;
  transition: transform 0.1s ease-out;
}

.viewer-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.15);
  border: none;
  border-radius: 50%;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  cursor: pointer;
}

.viewer-nav--prev {
  left: 12px;
}

.viewer-nav--next {
  right: 12px;
}

.viewer-fade-enter-active,
.viewer-fade-leave-active {
  transition: opacity 0.2s ease;
}

.viewer-fade-enter-from,
.viewer-fade-leave-to {
  opacity: 0;
}
</style>

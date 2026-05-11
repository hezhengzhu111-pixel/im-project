<template>
  <ImageViewer
    v-model:visible="visible"
    :images="images"
    :initial-index="initialIndex"
  />
</template>

<script setup lang="ts">
import ImageViewer from "@/components/common/ImageViewer.vue";

defineProps<{
  images: string[];
  initialIndex?: number;
}>();

const visible = defineModel<boolean>("visible", { default: false });
</script>

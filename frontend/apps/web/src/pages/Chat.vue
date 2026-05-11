<template>
  <DesktopChatLayout v-if="!isMobile" />
  <MobileChatLayout v-else />
</template>

<script setup lang="ts">
import DesktopChatLayout from "@/layouts/DesktopChatLayout.vue";
import MobileChatLayout from "@/layouts/MobileChatLayout.vue";
import { useIsMobile } from "@/composables/useIsMobile";

const { isMobile } = useIsMobile();
</script>

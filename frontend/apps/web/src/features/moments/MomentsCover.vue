<template>
  <div class="moments-cover">
    <div
      class="cover-bg"
      :style="coverBgStyle"
    />
    <div class="cover-body">
      <span class="cover-nickname">{{ nickname }}</span>
      <slot name="actions" />
      <img
        class="cover-avatar"
        :src="avatar"
        alt=""
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  coverPhoto: string
  avatar: string
  nickname: string
}>(), {
  coverPhoto: '',
  avatar: '',
  nickname: '',
})

const coverBgStyle = computed(() => {
  if (props.coverPhoto) {
    return {
      backgroundImage: `url(${props.coverPhoto})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  return {
    backgroundColor: 'var(--moments-cover-placeholder)',
  }
})
</script>

<style scoped lang="scss">
.moments-cover {
  position: relative;
  height: var(--moments-cover-height);
  flex-shrink: 0;
}

.cover-bg {
  position: absolute;
  inset: 0;
  background-repeat: no-repeat;
  overflow: hidden;
}

.cover-body {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 16px;
  gap: 12px;
}

.cover-nickname {
  flex: 1;
  text-align: right;
  color: var(--text-inverse);
  font-size: 18px;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cover-avatar {
  width: var(--moments-avatar-size);
  height: var(--moments-avatar-size);
  border-radius: var(--moments-avatar-radius);
  border: 3px solid #FFFFFF;
  transform: translateY(50%);
  flex-shrink: 0;
  object-fit: cover;
  background: var(--surface-sunken);
  z-index: 10;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
}

@media (min-width: 769px) {
  .moments-cover {
    height: clamp(178px, 20vh, 236px);
  }

  .cover-avatar {
    width: 76px;
    height: 76px;
    border-radius: 18px;
    border-width: 3px;
  }

  .cover-nickname {
    font-size: 18px;
  }
}
</style>

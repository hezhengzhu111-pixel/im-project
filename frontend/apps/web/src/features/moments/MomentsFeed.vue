<template>
  <div class="moments-feed" ref="feedRef" @scroll="handleScroll">
    <div v-if="loading && feed.length === 0" class="feed-loading">
      <el-skeleton :rows="5" animated />
    </div>

    <div v-else-if="feed.length === 0" class="feed-empty">
      <el-empty description="暂无动态" />
    </div>

    <template v-else>
      <MomentsPostCard
        v-for="item in feed"
        :key="item.post.id"
        :post="item"
      />

      <div v-if="loading" class="feed-loading-more">
        <el-icon class="is-loading"><Loading /></el-icon>
        加载中...
      </div>

      <div v-else-if="!hasMore" class="feed-no-more">
        没有更多了
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { useMomentsStore } from '@/stores/moments'
import { storeToRefs } from 'pinia'
import MomentsPostCard from './MomentsPostCard.vue'

const store = useMomentsStore()
const { feed, loading, hasMore } = storeToRefs(store)

const feedRef = ref<HTMLElement>()

onMounted(() => {
  store.loadFeed(true)
})

function handleScroll() {
  if (!feedRef.value) return

  const { scrollTop, scrollHeight, clientHeight } = feedRef.value
  if (scrollHeight - scrollTop - clientHeight < 100) {
    store.loadFeed()
  }
}
</script>

<style scoped lang="scss">
.moments-feed {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.feed-loading,
.feed-empty {
  padding: 40px 0;
}

.feed-loading-more,
.feed-no-more {
  text-align: center;
  padding: 20px 0;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

@media (max-width: 768px) {
  .moments-feed {
    padding-bottom: calc(12px + var(--mobile-tabbar-height, 56px) + env(safe-area-inset-bottom, 0px));
  }
}
</style>

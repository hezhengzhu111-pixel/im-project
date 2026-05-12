import React, { useEffect } from 'react';
import { FlatList, Pressable, Text } from 'react-native';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { Screen } from '@/components/common/Screen';
import { EmptyState } from '@/components/common/StateViews';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { useMomentsStore } from '@/stores/momentsStore';

export function MomentsFeedScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const feed = useMomentsStore((state) => state.feed);
  const loading = useMomentsStore((state) => state.loading);
  const loadFeed = useMomentsStore((state) => state.loadFeed);
  const toggleLike = useMomentsStore((state) => state.toggleLike);

  useEffect(() => {
    void loadFeed(true);
  }, [loadFeed]);

  return (
    <Screen title="Moments" scroll={false} refreshing={loading} onRefresh={() => void loadFeed(true)} right={<PrimaryButton label="Post" onPress={() => navigation.navigate('CreateMomentScreen')} />}>
      {feed.length === 0 ? <EmptyState title="No moments" /> : null}
      <FlatList
        data={feed}
        keyExtractor={(item) => item.post.id}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('MomentDetailScreen')}>
            <Text>{item.post.content}</Text>
            <Pressable onPress={() => void toggleLike(item.post.id)}>
              <Text>{item.isLiked ? 'Unlike' : 'Like'} {item.likeCount || 0}</Text>
            </Pressable>
          </Pressable>
        )}
      />
    </Screen>
  );
}

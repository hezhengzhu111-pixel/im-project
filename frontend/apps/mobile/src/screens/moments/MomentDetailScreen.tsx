import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { TextField } from '@/components/forms/TextField';
import { useMomentsStore } from '@/stores/momentsStore';

export function MomentDetailScreen() {
  const post = useMomentsStore((state) => state.feed[0]);
  const createComment = useMomentsStore((state) => state.createComment);
  const deletePost = useMomentsStore((state) => state.deletePost);
  const [comment, setComment] = useState('');

  if (!post) {
    return <Screen title="Moment"><Text>No moment selected</Text></Screen>;
  }
  return (
    <Screen title="Moment">
      <Text>{post.post.content}</Text>
      <TextField label="Comment" value={comment} onChangeText={setComment} />
      <PrimaryButton
        label="Comment"
        onPress={() => {
          void createComment(post.post.id, comment).then(() => setComment(''));
        }}
      />
      <PrimaryButton
        label="Delete moment"
        onPress={() => {
          void deletePost(post.post.id).then(() => Alert.alert('Deleted'));
        }}
      />
    </Screen>
  );
}

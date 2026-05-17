import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { EmptyState } from '@/components/common/StateViews';
import { PageContent, SectionCard, AvatarText } from '@/components/common/PageElements';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { TextField } from '@/components/forms/TextField';
import { colors, spacing, typography } from '@/app/theme';
import { useContactStore } from '@/stores/contactStore';

export function AddFriendScreen() {
  const [keyword, setKeyword] = useState('');
  const [message, setMessage] = useState('');
  const results = useContactStore((state) => state.searchResults);
  const searchUsers = useContactStore((state) => state.searchUsers);
  const addFriend = useContactStore((state) => state.addFriend);

  return (
    <Screen title="添加好友">
      <PageContent>
        <SectionCard title="查找用户" subtitle="可输入用户名、昵称、手机号或邮箱">
          <TextField label="关键词" value={keyword} placeholder="请输入搜索关键词" onChangeText={setKeyword} />
          <TextField label="验证消息" value={message} placeholder="我是..." onChangeText={setMessage} />
          <PrimaryButton
            label="搜索"
            onPress={() => {
              void searchUsers(keyword);
            }}
          />
        </SectionCard>
        <SectionCard title="搜索结果">
          {results.length === 0 ? (
            <EmptyState title="暂无搜索结果" subtitle="输入关键词后点击搜索" />
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => {
                const name = item.nickname || item.username || item.id;
                return (
                  <Pressable
                    style={({ pressed }) => [styles.resultRow, pressed ? styles.pressed : null]}
                    onPress={() => {
                      void addFriend(item.id, message);
                    }}
                  >
                    <AvatarText label={name} />
                    <View style={styles.resultBody}>
                      <Text numberOfLines={1} style={styles.resultName}>{name}</Text>
                      <Text numberOfLines={1} style={styles.resultId}>账号：{item.username || item.id}</Text>
                    </View>
                    <Text style={styles.addText}>添加</Text>
                  </Pressable>
                );
              }}
            />
          )}
        </SectionCard>
      </PageContent>
    </Screen>
  );
}

const styles = StyleSheet.create({
  resultRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 62,
  },
  pressed: {
    opacity: 0.65,
  },
  resultBody: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  resultName: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '700',
  },
  resultId: {
    color: colors.muted,
    fontSize: typography.small,
  },
  addText: {
    color: colors.primary,
    fontSize: typography.small,
    fontWeight: '800',
  },
  separator: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
  },
});

import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { EmptyState } from '@/components/common/StateViews';
import { PageContent, SectionCard, AvatarText } from '@/components/common/PageElements';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { TextField } from '@/components/forms/TextField';
import { colors, spacing, typography } from '@/app/theme';
import { useGroupStore } from '@/stores/groupStore';

export function JoinGroupScreen() {
  const [keyword, setKeyword] = useState('');
  const searchResults = useGroupStore((state) => state.searchResults);
  const searchGroups = useGroupStore((state) => state.searchGroups);
  const joinGroup = useGroupStore((state) => state.joinGroup);

  return (
    <Screen title="加入群组">
      <PageContent>
        <SectionCard title="查找群组">
          <TextField label="关键词" value={keyword} placeholder="请输入群名称或群标识" onChangeText={setKeyword} />
          <PrimaryButton
            label="搜索"
            onPress={() => {
              void searchGroups(keyword);
            }}
          />
        </SectionCard>
        <SectionCard title="搜索结果">
          {searchResults.length === 0 ? (
            <EmptyState title="暂无搜索结果" subtitle="输入关键词后点击搜索" />
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => {
                const name = item.groupName || item.name || item.id;
                return (
                  <Pressable
                    style={({ pressed }) => [styles.resultRow, pressed ? styles.pressed : null]}
                    onPress={() => {
                      void joinGroup(item.id);
                    }}
                  >
                    <AvatarText label={name} square />
                    <View style={styles.resultBody}>
                      <Text numberOfLines={1} style={styles.resultName}>{name}</Text>
                      <Text style={styles.resultMeta}>{item.memberCount || 0} 位成员</Text>
                    </View>
                    <Text style={styles.joinText}>加入</Text>
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
  resultMeta: {
    color: colors.muted,
    fontSize: typography.small,
  },
  joinText: {
    color: colors.primary,
    fontSize: typography.small,
    fontWeight: '800',
  },
  separator: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
  },
});

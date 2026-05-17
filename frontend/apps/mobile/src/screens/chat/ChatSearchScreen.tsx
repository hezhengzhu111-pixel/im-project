import React, { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/common/Screen';
import { EmptyState } from '@/components/common/StateViews';
import { PageContent, SectionCard } from '@/components/common/PageElements';
import { TextField } from '@/components/forms/TextField';
import { colors, spacing, typography } from '@/app/theme';
import { useMessageStore } from '@/stores/messageStore';
import { useSessionStore } from '@/stores/sessionStore';

export function ChatSearchScreen() {
  const [keyword, setKeyword] = useState('');
  const searchResults = useMessageStore((state) => state.searchResults);
  const searchMessages = useMessageStore((state) => state.searchMessages);
  const session = useSessionStore((state) => state.currentSession);

  return (
    <Screen title="搜索消息">
      <PageContent>
        <SectionCard>
          <TextField
            label="关键词"
            value={keyword}
            placeholder="输入消息内容或文件名"
            onChangeText={(value) => {
              setKeyword(value);
              searchMessages(value, session?.id);
            }}
          />
        </SectionCard>
        <SectionCard title="搜索结果">
          {searchResults.length === 0 ? (
            <EmptyState title={keyword ? '暂无匹配消息' : '输入关键词开始搜索'} />
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => (
                <Text numberOfLines={2} style={styles.resultText}>
                  {item.content || item.mediaName || '[消息]'}
                </Text>
              )}
            />
          )}
        </SectionCard>
      </PageContent>
    </Screen>
  );
}

const styles = StyleSheet.create({
  resultText: {
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 22,
    paddingVertical: spacing.sm,
  },
  separator: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
  },
});

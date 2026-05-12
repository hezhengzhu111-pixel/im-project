import React, { useEffect } from 'react';
import { FlatList, Pressable, Text } from 'react-native';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { Screen } from '@/components/common/Screen';
import { EmptyState } from '@/components/common/StateViews';
import { PrimaryButton } from '@/components/common/PrimaryButton';
import { useChatStore } from '@/stores/chatStore';
import { useGroupStore } from '@/stores/groupStore';

export function GroupsScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const groups = useGroupStore((state) => state.groups);
  const loadGroups = useGroupStore((state) => state.loadGroups);
  const openGroupSession = useChatStore((state) => state.openGroupSession);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  return (
    <Screen title="Groups" scroll={false} right={<PrimaryButton label="New" onPress={() => navigation.navigate('CreateGroupScreen')} />}>
      {groups.length === 0 ? <EmptyState title="No groups" /> : null}
      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable onPress={() => void openGroupSession(item).then(() => navigation.navigate('ChatStack', { screen: 'ChatScreen' }))}>
            <Text>{item.groupName || item.name || item.id} ({item.memberCount || 0})</Text>
          </Pressable>
        )}
      />
      <PrimaryButton label="Join group" onPress={() => navigation.navigate('JoinGroupScreen')} />
    </Screen>
  );
}

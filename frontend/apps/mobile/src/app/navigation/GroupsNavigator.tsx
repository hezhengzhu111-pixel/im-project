import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GroupsScreen } from '@/screens/groups/GroupsScreen';
import { CreateGroupScreen } from '@/screens/groups/CreateGroupScreen';
import { JoinGroupScreen } from '@/screens/groups/JoinGroupScreen';
import { GroupMembersScreen } from '@/screens/groups/GroupMembersScreen';
import { AddGroupMembersScreen } from '@/screens/groups/AddGroupMembersScreen';
import { GroupProfileScreen } from '@/screens/groups/GroupProfileScreen';

export type GroupsStackParamList = {
  GroupsScreen: undefined;
  CreateGroupScreen: undefined;
  JoinGroupScreen: undefined;
  GroupMembersScreen: { groupId?: string } | undefined;
  AddGroupMembersScreen: { groupId?: string } | undefined;
  GroupProfileScreen: { groupId?: string } | undefined;
};

const Stack = createNativeStackNavigator<GroupsStackParamList>();

export function GroupsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="GroupsScreen" component={GroupsScreen} />
      <Stack.Screen name="CreateGroupScreen" component={CreateGroupScreen} />
      <Stack.Screen name="JoinGroupScreen" component={JoinGroupScreen} />
      <Stack.Screen name="GroupMembersScreen" component={GroupMembersScreen} />
      <Stack.Screen name="AddGroupMembersScreen" component={AddGroupMembersScreen} />
      <Stack.Screen name="GroupProfileScreen" component={GroupProfileScreen} />
    </Stack.Navigator>
  );
}

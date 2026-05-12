import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SessionListScreen } from '@/screens/chat/SessionListScreen';
import { ChatScreen } from '@/screens/chat/ChatScreen';
import { ChatSearchScreen } from '@/screens/chat/ChatSearchScreen';
import { GroupReadDetailScreen } from '@/screens/chat/GroupReadDetailScreen';
import { SessionInfoScreen } from '@/screens/chat/SessionInfoScreen';

export type ChatStackParamList = {
  SessionListScreen: undefined;
  ChatScreen: { sessionId?: string } | undefined;
  ChatSearchScreen: undefined;
  GroupReadDetailScreen: undefined;
  SessionInfoScreen: undefined;
};

const Stack = createNativeStackNavigator<ChatStackParamList>();

export function ChatNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SessionListScreen" component={SessionListScreen} />
      <Stack.Screen name="ChatScreen" component={ChatScreen} />
      <Stack.Screen name="ChatSearchScreen" component={ChatSearchScreen} />
      <Stack.Screen name="GroupReadDetailScreen" component={GroupReadDetailScreen} />
      <Stack.Screen name="SessionInfoScreen" component={SessionInfoScreen} />
    </Stack.Navigator>
  );
}

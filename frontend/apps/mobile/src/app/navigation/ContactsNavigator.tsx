import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ContactsScreen } from '@/screens/contacts/ContactsScreen';
import { FriendRequestsScreen } from '@/screens/contacts/FriendRequestsScreen';
import { AddFriendScreen } from '@/screens/contacts/AddFriendScreen';
import { FriendProfileScreen } from '@/screens/contacts/FriendProfileScreen';

export type ContactsStackParamList = {
  ContactsScreen: undefined;
  FriendRequestsScreen: undefined;
  AddFriendScreen: undefined;
  FriendProfileScreen: { friendId?: string } | undefined;
};

const Stack = createNativeStackNavigator<ContactsStackParamList>();

export function ContactsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ContactsScreen" component={ContactsScreen} />
      <Stack.Screen name="FriendRequestsScreen" component={FriendRequestsScreen} />
      <Stack.Screen name="AddFriendScreen" component={AddFriendScreen} />
      <Stack.Screen name="FriendProfileScreen" component={FriendProfileScreen} />
    </Stack.Navigator>
  );
}

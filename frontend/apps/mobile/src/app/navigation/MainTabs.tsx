import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ChatNavigator } from './ChatNavigator';
import { ContactsNavigator } from './ContactsNavigator';
import { GroupsNavigator } from './GroupsNavigator';
import { ProfileNavigator } from './ProfileNavigator';
import { MomentsNavigator } from './MomentsNavigator';

export type MainTabsParamList = {
  ChatStack: undefined;
  ContactsStack: undefined;
  GroupsStack: undefined;
  Moments: undefined;
  ProfileStack: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

export function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true }}>
      <Tab.Screen name="ChatStack" component={ChatNavigator} options={{ title: 'Chats' }} />
      <Tab.Screen name="ContactsStack" component={ContactsNavigator} options={{ title: 'Contacts' }} />
      <Tab.Screen name="GroupsStack" component={GroupsNavigator} options={{ title: 'Groups' }} />
      <Tab.Screen name="Moments" component={MomentsNavigator} />
      <Tab.Screen name="ProfileStack" component={ProfileNavigator} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

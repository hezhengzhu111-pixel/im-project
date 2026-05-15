import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MomentsFeedScreen } from '@/screens/moments/MomentsFeedScreen';
import { CreateMomentScreen } from '@/screens/moments/CreateMomentScreen';
import { MomentDetailScreen } from '@/screens/moments/MomentDetailScreen';
import { UserMomentsScreen } from '@/screens/moments/UserMomentsScreen';
import { MomentsNotificationsScreen } from '@/screens/moments/MomentsNotificationsScreen';

export type MomentsStackParamList = {
  MomentsFeedScreen: undefined;
  CreateMomentScreen: undefined;
  MomentDetailScreen: { postId?: string };
  UserMomentsScreen: { userId?: string } | undefined;
  MomentsNotificationsScreen: undefined;
};

const Stack = createNativeStackNavigator<MomentsStackParamList>();

export function MomentsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MomentsFeedScreen" component={MomentsFeedScreen} />
      <Stack.Screen name="CreateMomentScreen" component={CreateMomentScreen} />
      <Stack.Screen name="MomentDetailScreen" component={MomentDetailScreen} />
      <Stack.Screen name="UserMomentsScreen" component={UserMomentsScreen} />
      <Stack.Screen name="MomentsNotificationsScreen" component={MomentsNotificationsScreen} />
    </Stack.Navigator>
  );
}

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors, radius, spacing, typography } from '@/app/theme';
import { ChatNavigator } from './ChatNavigator';
import { ContactsNavigator } from './ContactsNavigator';
import { GroupsNavigator } from './GroupsNavigator';
import { ProfileNavigator } from './ProfileNavigator';
import { MomentsNavigator } from './MomentsNavigator';
import { useContactStore } from '@/stores/contactStore';
import { useSessionStore } from '@/stores/sessionStore';

export type MainTabsParamList = {
  ChatStack: undefined;
  ContactsStack: undefined;
  GroupsStack: undefined;
  Moments: undefined;
  ProfileStack: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

const tabIcon = {
  ChatStack: '●',
  ContactsStack: '◐',
  GroupsStack: '◍',
  Moments: '○',
  ProfileStack: '◌',
} as const;

function TabGlyph({ label, focused, badge }: { label: string; focused: boolean; badge?: number }) {
  return (
    <View style={styles.iconWrap}>
      <Text style={[styles.iconText, focused ? styles.iconTextActive : null]}>{label}</Text>
      {badge && badge > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function MainTabs() {
  const totalUnreadCount = useSessionStore((state) =>
    state.sessions.reduce((total, session) => total + Math.max(0, session.unreadCount || 0), 0),
  );
  const pendingRequestsCount = useContactStore((state) => state.friendRequests.length);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabBarItem,
      }}
    >
      <Tab.Screen
        name="ChatStack"
        component={ChatNavigator}
        options={{
          title: '聊天',
          tabBarIcon: ({ focused }) => <TabGlyph label={tabIcon.ChatStack} focused={focused} badge={totalUnreadCount} />,
          tabBarBadge: undefined,
        }}
      />
      <Tab.Screen
        name="ContactsStack"
        component={ContactsNavigator}
        options={{
          title: '通讯录',
          tabBarIcon: ({ focused }) => <TabGlyph label={tabIcon.ContactsStack} focused={focused} badge={pendingRequestsCount} />,
          tabBarBadge: undefined,
        }}
      />
      <Tab.Screen
        name="GroupsStack"
        component={GroupsNavigator}
        options={{
          title: '群组',
          tabBarIcon: ({ focused }) => <TabGlyph label={tabIcon.GroupsStack} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Moments"
        component={MomentsNavigator}
        options={{
          title: '动态',
          tabBarIcon: ({ focused }) => <TabGlyph label={tabIcon.Moments} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="ProfileStack"
        component={ProfileNavigator}
        options={{
          title: '我',
          tabBarIcon: ({ focused }) => <TabGlyph label={tabIcon.ProfileStack} focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: 62,
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
  },
  tabBarItem: {
    paddingVertical: spacing.xxs,
  },
  tabLabel: {
    fontSize: typography.tiny,
    fontWeight: '700',
    marginTop: spacing.xxs,
  },
  iconWrap: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    minWidth: 28,
    position: 'relative',
  },
  iconText: {
    color: colors.muted,
    fontSize: 19,
    fontWeight: '900',
    lineHeight: 21,
  },
  iconTextActive: {
    color: colors.primary,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    minWidth: 16,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -9,
    top: -5,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 13,
  },
});

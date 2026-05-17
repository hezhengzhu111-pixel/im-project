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

function TabGlyph({ label, focused, badge }: { label: string; focused: boolean; badge?: number }) {
  return (
    <View style={[styles.glyph, focused ? styles.glyphActive : null]}>
      <Text style={[styles.glyphText, focused ? styles.glyphTextActive : null]}>{label}</Text>
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
          title: 'Chats',
          tabBarIcon: ({ focused }) => <TabGlyph label="C" focused={focused} badge={totalUnreadCount} />,
          tabBarBadge: undefined,
        }}
      />
      <Tab.Screen
        name="ContactsStack"
        component={ContactsNavigator}
        options={{
          title: 'Contacts',
          tabBarIcon: ({ focused }) => <TabGlyph label="P" focused={focused} badge={pendingRequestsCount} />,
          tabBarBadge: undefined,
        }}
      />
      <Tab.Screen
        name="GroupsStack"
        component={GroupsNavigator}
        options={{
          title: 'Groups',
          tabBarIcon: ({ focused }) => <TabGlyph label="G" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Moments"
        component={MomentsNavigator}
        options={{
          title: 'Moments',
          tabBarIcon: ({ focused }) => <TabGlyph label="M" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="ProfileStack"
        component={ProfileNavigator}
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabGlyph label="Me" focused={focused} />,
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
    height: 64,
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
  glyph: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 24,
    justifyContent: 'center',
    minWidth: 26,
    paddingHorizontal: spacing.xs,
    position: 'relative',
  },
  glyphActive: {
    backgroundColor: colors.primarySoft,
  },
  glyphText: {
    color: colors.muted,
    fontSize: typography.tiny,
    fontWeight: '900',
  },
  glyphTextActive: {
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
    right: -8,
    top: -6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 13,
  },
});

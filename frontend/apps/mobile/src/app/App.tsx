import React, { useEffect, useState } from 'react';
import { Animated, StatusBar, StyleSheet, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { bootstrapApp } from './bootstrap';
import { AppProviders } from './AppProviders';
import { RootNavigator } from './navigation/RootNavigator';
import { BrandLaunchCover } from '@/components/brand/BrandIdentity';

const LAUNCH_COVER_DURATION_MS = 1850;
const LAUNCH_FADE_DURATION_MS = 360;

export default function App() {
  const colorScheme = useColorScheme();
  const [showLaunchCover, setShowLaunchCover] = useState(true);
  const launchOpacity = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    void bootstrapApp();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(launchOpacity, {
        toValue: 0,
        duration: LAUNCH_FADE_DURATION_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setShowLaunchCover(false);
        }
      });
    }, LAUNCH_COVER_DURATION_MS);

    return () => clearTimeout(timer);
  }, [launchOpacity]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar barStyle={showLaunchCover || colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
        <AppProviders>
          <RootNavigator />
        </AppProviders>
        {showLaunchCover ? (
          <Animated.View pointerEvents="none" style={[styles.launchCover, { opacity: launchOpacity }]}>
            <BrandLaunchCover animated />
          </Animated.View>
        ) : null}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  launchCover: {
    ...StyleSheet.absoluteFill,
    zIndex: 999,
  },
});

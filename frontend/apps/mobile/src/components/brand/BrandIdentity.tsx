import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/app/theme';

export const BRAND_NAME = '密笺';
export const BRAND_TAGLINE = '端到端加密的安全聊天';

interface BrandLockupProps {
  animated?: boolean;
  compact?: boolean;
  align?: 'center' | 'left';
  tagline?: string;
}

export function BrandMark({ animated = false }: { animated?: boolean }) {
  const seal = useRef(new Animated.Value(animated ? 0 : 1)).current;
  const glow = useRef(new Animated.Value(animated ? 0 : 1)).current;

  useEffect(() => {
    if (!animated) return;
    Animated.parallel([
      Animated.timing(seal, {
        toValue: 1,
        duration: 720,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(260),
        Animated.timing(glow, {
          toValue: 1,
          duration: 760,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [animated, glow, seal]);

  return (
    <View style={styles.markWrap}>
      <Animated.View
        style={[
          styles.markGlow,
          {
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] }),
            transform: [
              {
                scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.mark,
          {
            opacity: seal,
            transform: [
              {
                scale: seal.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }),
              },
              {
                translateY: seal.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
              },
            ],
          },
        ]}
      >
        <View style={styles.envelopeBody}>
          <View style={styles.envelopeFlap} />
          <View style={styles.lockShackle} />
          <View style={styles.lockBody}>
            <View style={styles.lockKeyhole} />
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

export function BrandLockup({
  animated = false,
  compact = false,
  align = 'center',
  tagline = BRAND_TAGLINE,
}: BrandLockupProps) {
  const opacity = useRef(new Animated.Value(animated ? 0 : 1)).current;
  const slide = useRef(new Animated.Value(animated ? 8 : 0)).current;
  const line = useRef(new Animated.Value(animated ? 0 : 1)).current;

  useEffect(() => {
    if (!animated) return;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 560,
        delay: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: 0,
        duration: 560,
        delay: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(line, {
        toValue: 1,
        duration: 820,
        delay: 520,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [animated, line, opacity, slide]);

  return (
    <View style={[styles.lockup, align === 'left' ? styles.lockupLeft : null]}>
      <BrandMark animated={animated} />
      <Animated.View
        style={[
          styles.copy,
          compact ? styles.copyCompact : null,
          align === 'left' ? styles.copyLeft : null,
          { opacity, transform: [{ translateY: slide }] },
        ]}
      >
        <Text style={[styles.name, compact ? styles.nameCompact : null]}>{BRAND_NAME}</Text>
        <View style={[styles.dividerRow, align === 'left' ? styles.dividerRowLeft : null]}>
          <Animated.View style={[styles.divider, { transform: [{ scaleX: line }] }]} />
        </View>
        <Text style={[styles.tagline, compact ? styles.taglineCompact : null]}>{tagline}</Text>
      </Animated.View>
    </View>
  );
}

export function BrandLaunchCover({ animated = true }: { animated?: boolean }) {
  return (
    <View style={styles.cover}>
      <View style={styles.orbTop} />
      <View style={styles.orbBottom} />
      <BrandLockup animated={animated} />
      <Text style={styles.coverNote}>消息只在你与对方之间可读</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    alignItems: 'center',
    backgroundColor: '#F7FAF8',
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: spacing.xl,
  },
  orbTop: {
    backgroundColor: 'rgba(7, 193, 96, 0.08)',
    borderRadius: 180,
    height: 360,
    position: 'absolute',
    right: -160,
    top: -120,
    width: 360,
  },
  orbBottom: {
    backgroundColor: 'rgba(87, 107, 149, 0.07)',
    borderRadius: 150,
    bottom: -120,
    height: 300,
    left: -130,
    position: 'absolute',
    width: 300,
  },
  markWrap: {
    alignItems: 'center',
    height: 96,
    justifyContent: 'center',
    width: 96,
  },
  markGlow: {
    backgroundColor: 'rgba(7, 193, 96, 0.12)',
    borderRadius: 48,
    height: 96,
    position: 'absolute',
    width: 96,
  },
  mark: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: 'rgba(7, 193, 96, 0.18)',
    borderRadius: 28,
    borderWidth: 1,
    height: 76,
    justifyContent: 'center',
    shadowColor: '#12231A',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    width: 76,
  },
  envelopeBody: {
    alignItems: 'center',
    backgroundColor: '#ECF8F1',
    borderColor: 'rgba(7, 193, 96, 0.2)',
    borderRadius: radius.md,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 52,
  },
  envelopeFlap: {
    borderColor: 'rgba(7, 193, 96, 0.26)',
    borderRadius: 3,
    borderWidth: 1,
    height: 36,
    position: 'absolute',
    top: -21,
    transform: [{ rotate: '45deg' }],
    width: 36,
  },
  lockShackle: {
    borderColor: colors.encrypted,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderWidth: 2,
    height: 16,
    position: 'absolute',
    top: 12,
    width: 18,
  },
  lockBody: {
    alignItems: 'center',
    backgroundColor: colors.encrypted,
    borderRadius: 5,
    height: 18,
    justifyContent: 'center',
    marginTop: 10,
    width: 24,
  },
  lockKeyhole: {
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    height: 5,
    opacity: 0.86,
    width: 4,
  },
  lockup: {
    alignItems: 'center',
  },
  lockupLeft: {
    alignItems: 'flex-start',
  },
  copy: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  copyCompact: {
    marginTop: spacing.sm,
  },
  copyLeft: {
    alignItems: 'flex-start',
  },
  name: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 6,
  },
  nameCompact: {
    fontSize: 28,
    letterSpacing: 4,
  },
  dividerRow: {
    alignItems: 'center',
    height: 16,
    justifyContent: 'center',
    width: 92,
  },
  dividerRowLeft: {
    alignItems: 'flex-start',
  },
  divider: {
    backgroundColor: 'rgba(7, 193, 96, 0.45)',
    borderRadius: 999,
    height: 2,
    width: 68,
  },
  tagline: {
    color: colors.encrypted,
    fontSize: typography.body,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  taglineCompact: {
    color: colors.muted,
    fontSize: typography.small,
    fontWeight: '600',
  },
  coverNote: {
    bottom: 56,
    color: colors.muted,
    fontSize: typography.small,
    position: 'absolute',
  },
});

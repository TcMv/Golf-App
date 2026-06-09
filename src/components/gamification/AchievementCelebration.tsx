import React, { useEffect } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import type { NewBadge } from '../../utils/gamification';

const CONFETTI = Array.from({ length: 18 }, (_, index) => ({
  left: `${(index * 37) % 100}%` as `${number}%`,
  color: [Colors.green, Colors.eagle, Colors.birdie, Colors.text][index % 4],
  delay: (index % 6) * 80,
}));

function ConfettiPiece({ left, color, delay }: typeof CONFETTI[number]) {
  const fall = useSharedValue(-80);
  const rotate = useSharedValue(0);
  useEffect(() => {
    fall.value = withDelay(delay, withTiming(760, { duration: 1800, easing: Easing.linear }));
    rotate.value = withDelay(delay, withTiming(540, { duration: 1800, easing: Easing.linear }));
  }, [delay, fall, rotate]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: fall.value }, { rotate: `${rotate.value}deg` }],
  }));
  return <Animated.View style={[styles.confetti, { left, backgroundColor: color }, style]} />;
}

export default function AchievementCelebration({
  badge,
  onDismiss,
}: {
  badge: NewBadge | null;
  onDismiss: () => void;
}) {
  const scale = useSharedValue(0.3);
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (badge) {
      opacity.value = withTiming(1, { duration: 250 });
      scale.value = withSpring(1, { damping: 9, stiffness: 120 });
    }
  }, [badge, opacity, scale]);
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Modal visible={badge != null} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        {badge && CONFETTI.map((piece, index) => <ConfettiPiece key={index} {...piece} />)}
        {badge && (
          <Animated.View style={[styles.card, badgeStyle]}>
            <Text style={styles.eyebrow}>ACHIEVEMENT UNLOCKED</Text>
            <View style={styles.badgeCircle}>
              <Text style={styles.badgeIcon}>{badge.icon}</Text>
            </View>
            <Text style={styles.title}>{badge.name}</Text>
            <Text style={styles.description}>{badge.description}</Text>
            <TouchableOpacity style={styles.button} onPress={onDismiss}>
              <Text style={styles.buttonText}>Continue</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    backgroundColor: Colors.backdrop,
    overflow: 'hidden',
  },
  confetti: {
    position: 'absolute',
    top: 0,
    width: 9,
    height: 18,
    borderRadius: 2,
  },
  card: {
    width: '100%',
    alignItems: 'center',
    padding: Spacing.xxl,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.green,
    backgroundColor: Colors.surface1,
  },
  eyebrow: {
    color: Colors.green,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.xs,
    letterSpacing: 1.2,
  },
  badgeCircle: {
    width: 128,
    height: 128,
    marginVertical: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    borderWidth: 3,
    borderColor: Colors.green,
    backgroundColor: Colors.greenMuted,
  },
  badgeIcon: { color: Colors.text, fontFamily: Font.black, fontSize: 42 },
  title: { color: Colors.text, fontFamily: Font.black, fontWeight: FontWeight.black, fontSize: FontSize.xxl },
  description: {
    color: Colors.textSecondary,
    fontFamily: Font.regular,
    fontSize: FontSize.base,
    lineHeight: 22,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    height: 50,
    marginTop: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.green,
  },
  buttonText: { color: Colors.bg, fontFamily: Font.bold, fontWeight: FontWeight.bold, fontSize: FontSize.base },
});

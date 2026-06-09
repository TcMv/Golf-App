import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ACHIEVEMENTS } from '../../utils/gamification';
import type { EarnedBadge } from '../../hooks/useUserStats';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

export default function AchievementGrid({ earned }: { earned: EarnedBadge[] }) {
  const earnedKeys = new Set(earned.map(badge => badge.badge_key));
  return (
    <View style={styles.grid}>
      {Object.entries(ACHIEVEMENTS).map(([key, definition]) => {
        const unlocked = earnedKeys.has(key);
        return (
          <View key={key} style={[styles.card, !unlocked && styles.lockedCard]}>
            <Text style={[styles.icon, !unlocked && styles.lockedText]}>{definition[1]}</Text>
            <Text style={[styles.name, !unlocked && styles.lockedText]}>{definition[0]}</Text>
            <Text style={styles.description}>
              {unlocked ? definition[2] : 'Locked'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  card: {
    width: '48%',
    minHeight: 112,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.greenDark,
    backgroundColor: Colors.surface1,
  },
  lockedCard: { borderColor: Colors.border, opacity: 0.5 },
  icon: { color: Colors.green, fontFamily: Font.black, fontSize: FontSize.xl },
  name: {
    color: Colors.text,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
    marginTop: Spacing.sm,
  },
  description: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, marginTop: 2 },
  lockedText: { color: Colors.textMuted },
});

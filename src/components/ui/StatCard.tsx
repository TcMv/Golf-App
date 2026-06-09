import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: string | number;
  subLabel?: string;
  color?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatCard({ label, value, subLabel, color }: StatCardProps) {
  const valueColor = color ?? Colors.text;

  return (
    <View style={styles.card}>
      <Text style={[styles.value, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.label}>{label}</Text>
      {subLabel ? <Text style={styles.subLabel}>{subLabel}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  value: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    fontFamily: Font.bold,
    color: Colors.text,
    lineHeight: FontSize.xxl * 1.15,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    fontFamily: Font.medium,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  subLabel: {
    fontSize: FontSize.xs,
    fontFamily: Font.regular,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
});

import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Colors, Radius, Spacing } from '../../constants/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Variant = 'pill' | 'card';

interface DarkPillProps {
  children: React.ReactNode;
  variant?: Variant;
  style?: ViewStyle;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Semi-transparent dark overlay container used on top of the GPS map.
 *
 * variant="pill"  — fully rounded pill (Radius.full), tight padding
 * variant="card"  — rounded card (Radius.lg), more generous padding
 */
export function DarkPill({
  children,
  variant = 'pill',
  style,
}: DarkPillProps) {
  return (
    <View style={[styles.base, variantStyles[variant], style]}>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.mapOverlay,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});

const variantStyles = StyleSheet.create({
  pill: {
    borderRadius: Radius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.base,
  },
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.base,
  },
});

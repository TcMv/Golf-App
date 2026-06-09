import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'danger';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: Variant;
  style?: ViewStyle;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  style,
}: PrimaryButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        pressed && pressedStyles[variant],
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, labelStyles[variant]]}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    width: '100%',
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  label: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    fontFamily: Font.bold,
  },
  disabled: {
    opacity: 0.4,
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: Colors.green,
  },
  secondary: {
    backgroundColor: Colors.surface2,
  },
  danger: {
    backgroundColor: Colors.red,
  },
});

const labelStyles = StyleSheet.create({
  primary: {
    color: Colors.bg,
  },
  secondary: {
    color: Colors.text,
  },
  danger: {
    color: Colors.text,
  },
});

const pressedStyles = StyleSheet.create({
  primary: {
    backgroundColor: Colors.greenDark,
  },
  secondary: {
    opacity: 0.8,
  },
  danger: {
    opacity: 0.8,
  },
});

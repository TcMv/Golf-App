import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { Colors, FontSize, FontWeight, Radius } from '../../constants/theme';

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
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      style={[
        styles.base,
        variantStyles[variant],
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, labelStyles[variant]]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  base: {
    height: 52,
    width: '100%',
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  label: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
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
    color: '#000000',
  },
  secondary: {
    color: Colors.text,
  },
  danger: {
    color: Colors.text,
  },
});

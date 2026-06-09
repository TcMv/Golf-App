import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

type Nav = NativeStackNavigationProp<{
  StartRound: undefined;
  MyBagSetup: { returnTo?: 'StartRound' | 'Main' } | undefined;
}>;

export default function CaddieHomeScreen() {
  const navigation = useNavigation<Nav>();
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>AI CADDIE</Text>
        <Text style={styles.title}>Course strategy powered by your game.</Text>
        <Text style={styles.description}>
          Start a round for live GPS distances, wind-adjusted club selection, hazard warnings,
          and advice based on your previous results.
        </Text>
        <TouchableOpacity style={styles.primary} onPress={() => navigation.navigate('StartRound')}>
          <Text style={styles.primaryText}>START A ROUND</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondary}
          onPress={() => navigation.navigate('MyBagSetup', { returnTo: 'Main' })}
        >
          <Text style={styles.secondaryText}>UPDATE CLUB DISTANCES</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  content: { flex: 1, justifyContent: 'center', padding: Spacing.xl },
  eyebrow: { color: Colors.green, fontFamily: Font.bold, fontSize: FontSize.xs, letterSpacing: 1.2 },
  title: {
    marginTop: Spacing.sm,
    color: Colors.text,
    fontFamily: Font.black,
    fontWeight: FontWeight.black,
    fontSize: FontSize.xxl,
    lineHeight: 38,
  },
  description: {
    marginTop: Spacing.base,
    color: Colors.textSecondary,
    fontFamily: Font.regular,
    fontSize: FontSize.base,
    lineHeight: 24,
  },
  primary: {
    height: 54,
    marginTop: Spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.green,
  },
  primaryText: { color: Colors.bg, fontFamily: Font.bold, fontWeight: FontWeight.bold },
  secondary: {
    height: 54,
    marginTop: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface1,
  },
  secondaryText: { color: Colors.text, fontFamily: Font.bold, fontWeight: FontWeight.bold },
});

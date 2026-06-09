import React from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing, Typography } from '../../constants/theme';

type RootStackParamList = {
  Welcome: undefined;
  MyBagSetup: undefined;
  HandicapSetup: undefined;
  Main: undefined;
};
type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function WelcomeScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.container}>
        <View style={styles.logoArea}>
          <Text style={styles.logoIcon}>⛳</Text>
          <Text style={styles.logoName}>GolfCaddie</Text>
          <Text style={styles.tagline}>Your personal golf caddie</Text>
        </View>

        <View style={styles.features}>
          {[
            { icon: '📍', text: 'Live GPS distances to front, mid & back of green' },
            { icon: '🏌', text: 'Track every shot with club and lie selection' },
            { icon: '📊', text: 'GA handicap tracking and performance stats' },
            { icon: '🗺', text: 'Nambour Golf Club pre-loaded and ready' },
          ].map(({ icon, text }) => (
            <View key={text} style={styles.featureRow}>
              <Text style={styles.featureIcon}>{icon}</Text>
              <Text style={styles.featureText}>{text}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.startBtn}
          onPress={() => navigation.navigate('MyBagSetup')}
          activeOpacity={0.85}
        >
          <Text style={styles.startBtnText}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'space-between',
    paddingVertical: Spacing.xxl,
  },
  logoArea: { alignItems: 'center', paddingTop: Spacing.xxl, gap: Spacing.md },
  logoIcon: { fontSize: 64 },
  logoName: { ...Typography.h1, color: Colors.text },
  tagline: { ...Typography.h3, color: Colors.textMuted },

  features: { gap: Spacing.base },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  featureIcon: { fontSize: FontSize.lg, width: 28 },
  featureText: { flex: 1, ...Typography.body, color: Colors.textMuted, lineHeight: 24 },

  startBtn: {
    height: 56,
    borderRadius: Radius.md,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    fontFamily: Font.bold,
    color: Colors.bg,
  },
});

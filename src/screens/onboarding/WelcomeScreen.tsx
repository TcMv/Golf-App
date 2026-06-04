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
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

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
  logoName: { fontSize: 40, fontWeight: FontWeight.black, color: Colors.text, letterSpacing: -1 },
  tagline: { fontSize: FontSize.md, color: Colors.textSecondary, fontWeight: FontWeight.medium },

  features: { gap: Spacing.base },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  featureIcon: { fontSize: FontSize.lg, width: 28 },
  featureText: { flex: 1, fontSize: FontSize.base, color: Colors.textSecondary, lineHeight: FontSize.base * 1.5 },

  startBtn: {
    height: 56,
    borderRadius: Radius.full,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#000' },
});

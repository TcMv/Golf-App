import React from 'react';
import {
  ScrollView,
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

const DEFAULT_BAG = [
  'Driver', '3W', '5W',
  '4i', '5i', '6i', '7i', '8i', '9i',
  'PW', '52°', '56°', '60°', 'Putter',
];

export default function MyBagSetupScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

      <View style={styles.progress}>
        <View style={[styles.progressDot, styles.progressDotActive]} />
        <View style={styles.progressLine} />
        <View style={styles.progressDot} />
      </View>

      <View style={styles.titleArea}>
        <Text style={styles.step}>Step 1 of 2</Text>
        <Text style={styles.title}>My Bag</Text>
        <Text style={styles.subtitle}>
          Your default 14-club bag is loaded. You can customise it anytime in Settings.
        </Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.clubList}>
        {DEFAULT_BAG.map((club) => (
          <View key={club} style={styles.clubRow}>
            <View style={styles.clubDot} />
            <Text style={styles.clubName}>{club}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('HandicapSetup')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>Looks good, Continue →</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate('HandicapSetup')}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryBtnText}>Customise Later</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  progressDotActive: { backgroundColor: Colors.green, borderColor: Colors.green },
  progressLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  titleArea: { padding: Spacing.xl, gap: Spacing.sm },
  step: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.text },
  subtitle: { fontSize: FontSize.base, color: Colors.textSecondary, lineHeight: FontSize.base * 1.5 },
  scroll: { flex: 1, paddingHorizontal: Spacing.base },
  clubList: {
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginHorizontal: Spacing.base,
  },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  clubDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.green },
  clubName: { fontSize: FontSize.base, fontWeight: FontWeight.medium, color: Colors.text },
  footer: {
    padding: Spacing.base,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  primaryBtn: {
    height: 56,
    borderRadius: Radius.full,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: '#000' },
  secondaryBtn: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.medium, color: Colors.textSecondary },
});

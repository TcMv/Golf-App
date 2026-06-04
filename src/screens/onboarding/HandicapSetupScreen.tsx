import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';

const ONBOARDING_KEY = '@golf_onboarding_done';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

type RootStackParamList = {
  Welcome: undefined;
  MyBagSetup: undefined;
  HandicapSetup: undefined;
  Main: undefined;
};
type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function HandicapSetupScreen() {
  const navigation = useNavigation<Nav>();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const goToMain = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  const handleSave = async () => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0 || num > 54) {
      Alert.alert('Invalid', 'Please enter a valid handicap index (0–54.0).');
      return;
    }
    setSaving(true);
    await supabase
      .from('app_settings')
      .upsert({ key: 'handicap_index', value: num.toFixed(1) });
    setSaving(false);
    goToMain();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.progress}>
          <View style={[styles.progressDot, styles.progressDotDone]} />
          <View style={[styles.progressLine, styles.progressLineDone]} />
          <View style={[styles.progressDot, styles.progressDotActive]} />
        </View>

        <View style={styles.content}>
          <Text style={styles.step}>Step 2 of 2</Text>
          <Text style={styles.title}>Handicap Index</Text>
          <Text style={styles.subtitle}>
            Enter your current Golf Australia handicap index to seed the app's calculations.
            You can update this anytime in Settings.
          </Text>

          <View style={styles.inputCard}>
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={setValue}
              placeholder="e.g. 14.5"
              placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad"
              autoFocus
              maxLength={5}
            />
            <Text style={styles.inputUnit}>GA Index</Text>
          </View>

          <Text style={styles.note}>
            This seeds the handicap calculation. The app will track your official differential
            from each round played.
          </Text>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveBtn, (!value || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!value || saving}
            activeOpacity={0.85}
          >
            <Text style={styles.saveBtnText}>
              {saving ? 'Saving…' : 'Save & Start'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={goToMain} activeOpacity={0.8}>
            <Text style={styles.skipBtnText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  flex: { flex: 1 },
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
  progressDotDone: { backgroundColor: Colors.greenDark, borderColor: Colors.greenDark },
  progressDotActive: { backgroundColor: Colors.green, borderColor: Colors.green },
  progressLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  progressLineDone: { backgroundColor: Colors.greenDark },

  content: { flex: 1, padding: Spacing.xl, gap: Spacing.base },
  step: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontSize: FontSize.xxl, fontWeight: FontWeight.bold, color: Colors.text },
  subtitle: { fontSize: FontSize.base, color: Colors.textSecondary, lineHeight: FontSize.base * 1.5 },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface2,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    paddingHorizontal: Spacing.base,
    marginTop: Spacing.md,
  },
  input: {
    flex: 1,
    height: 64,
    fontSize: 40,
    fontWeight: FontWeight.black,
    color: Colors.text,
  },
  inputUnit: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.medium },
  note: { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: FontSize.sm * 1.6 },

  footer: {
    padding: Spacing.base,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  saveBtn: {
    height: 56,
    borderRadius: Radius.full,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: '#000' },
  skipBtn: { height: 48, alignItems: 'center', justifyContent: 'center' },
  skipBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.medium, color: Colors.textSecondary },
});

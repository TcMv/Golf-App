import React, { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

type RootStackParamList = {
  Welcome: undefined;
  MyBagSetup: undefined;
  HandicapSetup: undefined;
  Main: undefined;
};
type Nav = NativeStackNavigationProp<RootStackParamList>;

interface OnboardingClub {
  name: string;
  type: string;
  defaultCarry: number;
  desc: string;
}

const WIZARD_CLUBS: OnboardingClub[] = [
  { name: 'Driver', type: 'driver', defaultCarry: 210, desc: 'Your primary tee club. Metres of carry.' },
  { name: '3W', type: 'wood', defaultCarry: 190, desc: '3 Wood. Good for long fairway shots or tight tees.' },
  { name: '5W', type: 'wood', defaultCarry: 180, desc: '5 Wood. High launching fairway wood.' },
  { name: '4i', type: 'iron', defaultCarry: 165, desc: '4 Iron. Long iron distance.' },
  { name: '5i', type: 'iron', defaultCarry: 155, desc: '5 Iron.' },
  { name: '6i', type: 'iron', defaultCarry: 145, desc: '6 Iron.' },
  { name: '7i', type: 'iron', defaultCarry: 135, desc: '7 Iron. Standard mid iron carry.' },
  { name: '8i', type: 'iron', defaultCarry: 125, desc: '8 Iron.' },
  { name: '9i', type: 'iron', defaultCarry: 115, desc: '9 Iron.' },
  { name: 'PW', type: 'wedge', defaultCarry: 105, desc: 'Pitching Wedge. Short game approach.' },
  { name: 'GW (52°)', type: 'wedge', defaultCarry: 95, desc: 'Gap Wedge. Between PW and SW.' },
  { name: 'SW (56°)', type: 'wedge', defaultCarry: 85, desc: 'Sand Wedge. Essential for bunkers and short chips.' },
  { name: 'LW (60°)', type: 'wedge', defaultCarry: 75, desc: 'Lob Wedge. For high flop shots.' },
  { name: 'Putter', type: 'putter', defaultCarry: 15, desc: 'Putting distance on green.' },
];

export default function MyBagSetupScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();

  // Wizard state: 0 = Splash, 1-14 = Wizard Club Steps
  const [step, setStep] = useState(0);

  // Distances record (club name -> carry distance string)
  const [carries, setCarries] = useState<Record<string, string>>({});

  // Excluded clubs record (club name -> boolean)
  const [excludedClubs, setExcludedClubs] = useState<Record<string, boolean>>({});

  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Initialize carries with preset defaults
  useEffect(() => {
    const initialCarries: Record<string, string> = {};
    WIZARD_CLUBS.forEach(c => {
      initialCarries[c.name] = String(c.defaultCarry);
    });
    setCarries(initialCarries);
  }, []);

  // Autofocus the input field when stepping through clubs
  useEffect(() => {
    if (step > 0 && inputRef.current) {
      // Small timeout to ensure input renders
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [step]);

  const toggleExclude = (clubName: string) => {
    setExcludedClubs(prev => ({
      ...prev,
      [clubName]: !prev[clubName],
    }));
  };

  const handleNext = () => {
    if (step === WIZARD_CLUBS.length) {
      handleFinish();
    } else {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const handleFinish = async (skipAll = false) => {
    if (!user) {
      navigation.navigate('HandicapSetup');
      return;
    }

    setSaving(true);
    try {
      const insertData = [];

      for (let i = 0; i < WIZARD_CLUBS.length; i++) {
        const club = WIZARD_CLUBS[i];

        // Skip excluded clubs if not skipping the entire wizard
        if (!skipAll && excludedClubs[club.name]) {
          continue;
        }

        let carry = parseInt(carries[club.name], 10);
        if (isNaN(carry) || carry <= 0) {
          carry = club.defaultCarry;
        }

        insertData.push({
          user_id: user.id,
          club_name: club.name,
          carry_distance_metres: carry,
        });
      }

      if (insertData.length > 0) {
        // Delete existing user clubs if any to avoid duplicates
        await supabase.from('user_clubs').delete().eq('user_id', user.id);

        // Insert user club carry distances
        const { error } = await supabase.from('user_clubs').insert(insertData);
        if (error) throw error;
      }
    } catch (e) {
      console.error('Failed to save user clubs during onboarding:', e);
      Alert.alert('Save Error', 'Could not save carry distances. You can try again later in Settings.');
    } finally {
      setSaving(false);
      navigation.navigate('HandicapSetup');
    }
  };

  // ---------------------------------------------------------------------------
  // Renderers
  // ---------------------------------------------------------------------------

  if (saving) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.green} size="large" />
        <Text style={styles.loadingText}>Saving your bag setup...</Text>
      </View>
    );
  }

  // 1. Render Onboarding Splash (Step 0)
  if (step === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

        <View style={styles.splashContainer}>
          <View style={styles.splashHeader}>
            <Text style={styles.splashLogo}>🤖 AI CADDIE Setup</Text>
          </View>

          <View style={styles.splashBody}>
            <Text style={styles.splashTitle}>Caddie Recommendations</Text>
            <Text style={styles.splashDesc}>
              To give you caddie recommendations, we need your carry distances.
            </Text>
            <Text style={styles.splashSubDesc}>
              This carry data powers our deterministic AI caddie engine, adjusting suggestions for wind speed, slope rating, and hazard avoidance in real time during your round.
            </Text>
          </View>

          <View style={styles.splashFooter}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => setStep(1)}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Let's Enter Distances</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => handleFinish(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryBtnText}>Do This Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // 2. Render Club Wizard Steps (Step 1-14)
  const currentClub = WIZARD_CLUBS[step - 1];
  const isExcluded = excludedClubs[currentClub.name] === true;
  const carryVal = carries[currentClub.name] ?? '';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Progress Bar & Skip option */}
        <View style={styles.wizardHeader}>
          <View style={styles.progressDots}>
            {WIZARD_CLUBS.map((_, idx) => (
              <View
                key={idx}
                style={[
                  styles.progressDot,
                  idx + 1 === step && styles.progressDotActive,
                  idx + 1 < step && styles.progressDotDone,
                ]}
              />
            ))}
          </View>
          <TouchableOpacity onPress={() => handleFinish(true)} activeOpacity={0.7}>
            <Text style={styles.skipBtnText}>Skip All</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.wizardStepInfo}>
            <Text style={styles.stepCount}>Club {step} of 14</Text>
            <Text style={styles.clubName}>{currentClub.name}</Text>
            <Text style={styles.clubDesc}>{currentClub.desc}</Text>
          </View>

          {/* Input Block */}
          <View style={styles.inputBlock}>
            <Text style={[styles.inputLabel, isExcluded && styles.mutedText]}>
              Carry Distance (Metres)
            </Text>
            <TextInput
              ref={inputRef}
              style={[styles.inputField, isExcluded && styles.inputFieldDisabled]}
              value={carryVal}
              onChangeText={val => setCarries(prev => ({ ...prev, [currentClub.name]: val }))}
              keyboardType="number-pad"
              editable={!isExcluded}
              placeholder="e.g. 150"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          {/* Exclude Toggle */}
          <TouchableOpacity
            style={[styles.excludeToggle, isExcluded && styles.excludeToggleActive]}
            onPress={() => toggleExclude(currentClub.name)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, isExcluded && styles.checkboxActive]}>
              {isExcluded && <Text style={styles.checkboxCheck}>✓</Text>}
            </View>
            <Text style={styles.excludeToggleText}>I don't carry this club in my bag</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Footer controls */}
        <View style={styles.wizardFooter}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={handleBack}
            activeOpacity={0.8}
          >
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={handleNext}
            activeOpacity={0.8}
          >
            <Text style={styles.nextBtnText}>
              {step === WIZARD_CLUBS.length ? 'Finish & Save →' : 'Next →'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  loading: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  loadingText: { color: Colors.textMuted, fontSize: FontSize.sm, fontFamily: Font.regular },

  // Splash Screen Styling
  splashContainer: {
    flex: 1,
    padding: Spacing.xl,
    justifyContent: 'space-between',
  },
  splashHeader: {
    paddingTop: Spacing.xl,
    alignItems: 'center',
  },
  splashLogo: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.green,
    fontFamily: Font.bold,
  },
  splashBody: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.md,
  },
  splashTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    fontFamily: Font.black,
    lineHeight: 38,
  },
  splashDesc: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    fontFamily: Font.bold,
    lineHeight: 22,
  },
  splashSubDesc: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontFamily: Font.regular,
    lineHeight: 20,
    marginTop: Spacing.xs,
  },
  splashFooter: {
    gap: Spacing.sm,
  },
  primaryBtn: {
    height: 56,
    borderRadius: Radius.md,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.bg,
    fontFamily: Font.bold,
  },
  secondaryBtn: {
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
    fontFamily: Font.semibold,
  },

  // Wizard General Styling
  wizardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  progressDots: {
    flexDirection: 'row',
    gap: 4,
  },
  progressDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surface3,
  },
  progressDotActive: {
    backgroundColor: Colors.green,
    width: 12,
  },
  progressDotDone: {
    backgroundColor: Colors.greenDark,
  },
  skipBtnText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: Font.medium,
    fontWeight: FontWeight.medium,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: Spacing.xl,
    gap: Spacing.xl,
  },
  wizardStepInfo: {
    gap: Spacing.xs,
  },
  stepCount: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontFamily: Font.bold,
  },
  clubName: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.black,
    color: Colors.text,
    fontFamily: Font.black,
  },
  clubDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontFamily: Font.regular,
    lineHeight: 18,
  },
  inputBlock: {
    gap: Spacing.sm,
  },
  inputLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontFamily: Font.bold,
  },
  inputField: {
    height: 56,
    backgroundColor: Colors.surface1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    fontFamily: Font.bold,
  },
  inputFieldDisabled: {
    backgroundColor: Colors.surface2,
    borderColor: Colors.border,
    opacity: 0.3,
  },
  mutedText: {
    color: Colors.textMuted,
  },
  excludeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  excludeToggleActive: {
    borderColor: Colors.green + '44',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: Colors.green,
    borderColor: Colors.green,
  },
  checkboxCheck: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.bg,
  },
  excludeToggleText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontFamily: Font.medium,
    fontWeight: FontWeight.medium,
  },
  wizardFooter: {
    flexDirection: 'row',
    padding: Spacing.base,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  backBtn: {
    flex: 1,
    height: 50,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
    fontFamily: Font.semibold,
  },
  nextBtn: {
    flex: 2,
    height: 50,
    borderRadius: Radius.md,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.bg,
    fontFamily: Font.bold,
  },
});

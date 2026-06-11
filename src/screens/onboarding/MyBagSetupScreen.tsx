import React, { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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
import { useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { clubSetupExitAction, isValidClubCarry, SETUP_CLUBS } from '../../utils/clubSetup';

type RootStackParamList = {
  Welcome: undefined;
  MyBagSetup: { returnTo?: 'StartRound' | 'Main' } | undefined;
  Main: undefined;
  StartRound: undefined;
};
type Nav = NativeStackNavigationProp<RootStackParamList>;
type SetupRoute = RouteProp<{
  MyBagSetup: {
    returnTo?: 'StartRound' | 'Main';
  } | undefined;
}, 'MyBagSetup'>;

export default function MyBagSetupScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<SetupRoute>();
  const { user } = useAuth();
  const returnTo = route.params?.returnTo ?? 'Main';

  // Wizard state: 0 = splash, -1 = club selection, 1-N = distance steps
  const [step, setStep] = useState(0);

  // Distances record (club name -> carry distance string)
  const [carries, setCarries] = useState<Record<string, string>>(() =>
    Object.fromEntries(SETUP_CLUBS.map(club => [club.name, String(club.defaultCarry)])),
  );
  const [averageClubs, setAverageClubs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SETUP_CLUBS.map(club => [club.name, true])),
  );

  // Excluded clubs record (club name -> boolean)
  const [excludedClubs, setExcludedClubs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SETUP_CLUBS.map(club => [club.name, !club.defaultSelected])),
  );
  const selectedClubs = SETUP_CLUBS.filter(club => !excludedClubs[club.name]);

  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);

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

  const useAverageForClub = (clubName: string, defaultCarry: number) => {
    setCarries(prev => ({
      ...prev,
      [clubName]: String(defaultCarry),
    }));
    setAverageClubs(prev => ({
      ...prev,
      [clubName]: true,
    }));
    setExcludedClubs(prev => ({
      ...prev,
      [clubName]: false,
    }));
    Keyboard.dismiss();
  };

  const handleNext = () => {
    Keyboard.dismiss();
    if (step === selectedClubs.length) {
      handleFinish();
    } else {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    Keyboard.dismiss();
    if (step === 1) {
      setStep(-1);
    } else if (step > 1) {
      setStep(step - 1);
    }
  };

  const continueAfterSetup = () => {
    if (clubSetupExitAction(returnTo, navigation.canGoBack()) === 'back') {
      navigation.goBack();
      return;
    }
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  const handleFinish = async (skipAll = false) => {
    if (saving) return;
    Keyboard.dismiss();

    if (!user) {
      continueAfterSetup();
      return;
    }

    if (skipAll) {
      setSaving(true);
      continueAfterSetup();
      return;
    }

    setSaving(true);
    try {
      const insertData: {
        user_id: string;
        club_name: string;
        carry_distance_metres: number;
      }[] = [];

      for (let i = 0; i < selectedClubs.length; i++) {
        const club = selectedClubs[i];

        const carry = parseInt(carries[club.name], 10);
        if (!isValidClubCarry(club, carry)) {
          Alert.alert('Check Distance', `Enter a carry between 20m and 400m for ${club.name}.`);
          setStep(i + 1);
          return;
        }

        insertData.push({
          user_id: user.id,
          club_name: club.name,
          carry_distance_metres: carry,
        });
      }

      const { error: deleteError } = await supabase
        .from('user_clubs')
        .delete()
        .eq('user_id', user.id);
      if (deleteError) throw deleteError;
      if (insertData.length > 0) {
        const { error } = await supabase.from('user_clubs').insert(insertData);
        if (error) throw error;
      }
    } catch (e) {
      Alert.alert('Save Error', 'Could not save carry distances. You can try again later in Settings.');
      setSaving(false);
      return;
    } finally {
      setSaving(false);
    }
    continueAfterSetup();
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
              onPress={() => setStep(-1)}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Let's Enter Distances</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.averageSetupBtn}
              onPress={() => handleFinish()}
              activeOpacity={0.8}
            >
              <Text style={styles.averageSetupTitle}>I don't know my distances</Text>
              <Text style={styles.averageSetupText}>Use average golfer estimates</Text>
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

  if (step === -1) {
    const groups = [
      { type: 'driver', label: 'Driver' },
      { type: 'wood', label: 'Fairway Woods' },
      { type: 'hybrid', label: 'Hybrids' },
      { type: 'iron', label: 'Irons' },
      { type: 'wedge', label: 'Wedges' },
    ] as const;
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
        <View style={styles.selectionHeader}>
          <Text style={styles.selectionTitle}>Build Your Bag</Text>
          <Text style={styles.selectionDesc}>
            Select only the clubs you carry. You can change this later in Settings.
          </Text>
        </View>
        <ScrollView contentContainerStyle={styles.selectionContent}>
          {groups.map(group => (
            <View key={group.type} style={styles.selectionGroup}>
              <Text style={styles.selectionGroupTitle}>{group.label}</Text>
              <View style={styles.clubGrid}>
                {SETUP_CLUBS.filter(club => club.type === group.type).map(club => {
                  const selected = !excludedClubs[club.name];
                  return (
                    <TouchableOpacity
                      key={club.name}
                      style={[styles.clubChip, selected && styles.clubChipSelected]}
                      onPress={() => toggleExclude(club.name)}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.clubChipText, selected && styles.clubChipTextSelected]}>
                        {selected ? '✓ ' : ''}{club.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
        <View style={styles.selectionFooter}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep(0)}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.nextBtn, selectedClubs.length === 0 && styles.nextBtnDisabled]}
            onPress={() => {
              if (selectedClubs.length === 0) {
                Alert.alert('Select Your Clubs', 'Choose at least one club for your bag.');
                return;
              }
              setStep(1);
            }}
          >
            <Text style={styles.nextBtnText}>Set {selectedClubs.length} Distances →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // 2. Render distance wizard for the selected clubs
  const currentClub = selectedClubs[step - 1];
  const carryVal = carries[currentClub.name] ?? '';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Progress Bar & Skip option */}
        <View style={styles.wizardHeader}>
          <View style={styles.progressDots}>
            {selectedClubs.map((_, idx) => (
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
          <TouchableOpacity
            onPress={() => handleFinish(true)}
            activeOpacity={0.7}
            disabled={saving}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.skipBtnText}>Skip All</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.wizardStepInfo}>
            <Text style={styles.stepCount}>Club {step} of {selectedClubs.length}</Text>
            <Text style={styles.clubName}>{currentClub.name}</Text>
            <Text style={styles.clubDesc}>{currentClub.desc}</Text>
          </View>

          {/* Input Block */}
          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>
              Carry Distance (Metres)
            </Text>
            <TextInput
              ref={inputRef}
              style={[
                styles.inputField,
                averageClubs[currentClub.name] && styles.inputFieldAverage,
              ]}
              value={carryVal}
              onChangeText={val => {
                setCarries(prev => ({ ...prev, [currentClub.name]: val }));
                setAverageClubs(prev => ({ ...prev, [currentClub.name]: false }));
              }}
              keyboardType="number-pad"
              placeholder="e.g. 150"
              placeholderTextColor={Colors.textMuted}
            />
            {averageClubs[currentClub.name] && (
              <Text style={styles.averageNote}>Average golfer estimate</Text>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.averageToggle,
              averageClubs[currentClub.name] && styles.averageToggleActive,
            ]}
            onPress={() => useAverageForClub(currentClub.name, currentClub.defaultCarry)}
            activeOpacity={0.7}
          >
            <View style={styles.averageToggleText}>
              <Text style={styles.averageToggleTitle}>I don't know my carry distance</Text>
              <Text style={styles.averageToggleSub}>
                Use the average estimate: {currentClub.defaultCarry}m
              </Text>
            </View>
            <Text style={styles.averageCheck}>
              {averageClubs[currentClub.name] ? '✓' : 'Use'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.excludeToggle}
            onPress={() => setStep(-1)}
            activeOpacity={0.7}
          >
            <Text style={styles.excludeToggleText}>Edit the clubs in my bag</Text>
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
            style={[styles.nextBtn, saving && styles.nextBtnDisabled]}
            onPress={handleNext}
            activeOpacity={0.8}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={Colors.bg} />
            ) : (
              <Text style={styles.nextBtnText}>
                {step === selectedClubs.length ? 'Finish & Save →' : 'Next →'}
              </Text>
            )}
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
  averageSetupBtn: {
    minHeight: 64,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.green,
    backgroundColor: Colors.greenMuted,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.base,
  },
  averageSetupTitle: {
    color: Colors.green,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.base,
  },
  averageSetupText: {
    color: Colors.textSecondary,
    fontFamily: Font.regular,
    fontSize: FontSize.sm,
    marginTop: 2,
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
  selectionHeader: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.base,
    gap: Spacing.sm,
  },
  selectionTitle: {
    color: Colors.text,
    fontFamily: Font.black,
    fontWeight: FontWeight.black,
    fontSize: FontSize.xxl,
  },
  selectionDesc: {
    color: Colors.textSecondary,
    fontFamily: Font.regular,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  selectionContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },
  selectionGroup: {
    gap: Spacing.sm,
  },
  selectionGroupTitle: {
    color: Colors.textMuted,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  clubGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  clubChip: {
    minWidth: 68,
    minHeight: 44,
    paddingHorizontal: Spacing.base,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubChipSelected: {
    borderColor: Colors.green,
    backgroundColor: Colors.greenMuted,
  },
  clubChipText: {
    color: Colors.textSecondary,
    fontFamily: Font.semibold,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.sm,
  },
  clubChipTextSelected: {
    color: Colors.green,
  },
  selectionFooter: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.base,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.bg,
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
  inputFieldAverage: {
    borderColor: Colors.greenDark,
  },
  averageNote: {
    color: Colors.green,
    fontFamily: Font.medium,
    fontSize: FontSize.xs,
  },
  mutedText: {
    color: Colors.textMuted,
  },
  averageToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  averageToggleActive: {
    borderColor: Colors.green,
    backgroundColor: Colors.greenMuted,
  },
  averageToggleText: {
    flex: 1,
  },
  averageToggleTitle: {
    color: Colors.text,
    fontFamily: Font.semibold,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.sm,
  },
  averageToggleSub: {
    color: Colors.textMuted,
    fontFamily: Font.regular,
    fontSize: FontSize.xs,
    marginTop: 3,
  },
  averageCheck: {
    color: Colors.green,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.sm,
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
  nextBtnDisabled: {
    opacity: 0.65,
  },
  nextBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.bg,
    fontFamily: Font.bold,
  },
});

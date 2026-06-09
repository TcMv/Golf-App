import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useRound } from '../../context/RoundContext';
import { useAuth } from '../../context/AuthContext';
import { fetchWind } from '../../utils/wind';
import { callOpenAI, buildBriefingPrompt } from '../../utils/anthropic';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import type { Course, Hole, Round, TeeSet } from '../../types';

type RootStackParamList = {
  PlayHome: undefined;
  StartRound: undefined;
  ActiveRound: undefined;
  EndRound: undefined;
  RoundDetail: { roundId: string };
};

type Nav = NativeStackNavigationProp<RootStackParamList>;
type RoundType = '18' | 'front9' | 'back9';

const COURSE_ID = '00000000-0000-0000-0000-000000000001';

const TEE_DOT_COLORS: Record<string, string> = {
  white: '#FFFFFF',
  blue: '#4A90D9',
  red: '#E53E3E',
  yellow: '#F5C518',
  black: '#222222',
};

export default function StartRoundScreen() {
  const navigation = useNavigation<Nav>();
  const { startRound } = useRound();
  const { user, profile } = useAuth();

  const [roundType, setRoundType] = useState<RoundType>('18');
  const [startingHole, setStartingHole] = useState(1);
  const [excludeHandicap, setExcludeHandicap] = useState(false);
  const [loading, setLoading] = useState(false);
  const [teeSets, setTeeSets] = useState<TeeSet[]>([]);
  const [selectedTeeSet, setSelectedTeeSet] = useState<TeeSet | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingTips, setBriefingTips] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('tee_sets')
      .select('*')
      .eq('course_id', COURSE_ID)
      .order('total_metres', { ascending: false })
      .then(({ data }) => {
        if (data && data.length > 0) {
          const sets = data as TeeSet[];
          setTeeSets(sets);
          setSelectedTeeSet(sets.find(t => t.colour === 'white') ?? sets[0]);
        }
      });
  }, []);

  const holesPlayed = roundType === '18' ? 18 : 9;

  const handleGetBriefing = useCallback(async () => {
    if (!selectedTeeSet) return;
    setBriefingLoading(true);
    setBriefingTips(null);
    try {
      const wind = await fetchWind(-26.6317, 152.9587);
      const { system, user: userMsg } = buildBriefingPrompt({
        courseName: 'Nambour Golf Club',
        courseRating: selectedTeeSet.course_rating,
        slopeRating: selectedTeeSet.slope_rating,
        teeColour: selectedTeeSet.colour,
        windLabel: wind?.label ?? 'Calm',
        handicapIndex: profile?.handicap_index ?? null,
      });
      const tips = await callOpenAI(system, userMsg);
      setBriefingTips(tips);
    } catch {
      setBriefingTips('Could not load briefing. Check EXPO_PUBLIC_ANTHROPIC_API_KEY.');
    } finally {
      setBriefingLoading(false);
    }
  }, [selectedTeeSet, profile]);

  const handleStart = useCallback(async () => {
    if (!selectedTeeSet) {
      Alert.alert('Error', 'Tees not loaded yet. Please wait a moment and try again.');
      return;
    }
    setLoading(true);
    try {
      const [{ data: course }, { data: holes }] = await Promise.all([
        supabase.from('courses').select('*').eq('id', COURSE_ID).single(),
        supabase.from('holes').select('*').eq('course_id', COURSE_ID).order('number'),
      ]);

      if (!course || !holes) {
        Alert.alert('Error', 'Failed to load course data. Check Supabase connection.');
        return;
      }

      const { data: roundData, error } = await supabase
        .from('rounds')
        .insert({
          course_id: COURSE_ID,
          tee_set_id: selectedTeeSet.id,
          date: new Date().toISOString().split('T')[0],
          holes_played: holesPlayed,
          starting_hole: startingHole,
          exclude_from_handicap: excludeHandicap,
          scoring_mode: 'classic',
          completed: false,
          user_id: user?.id ?? null,
        })
        .select()
        .single();

      if (error || !roundData) {
        Alert.alert('Error', 'Failed to create round. ' + (error?.message ?? ''));
        return;
      }

      startRound(
        roundData as Round,
        course as Course,
        selectedTeeSet,
        holes as Hole[],
      );

      navigation.navigate('ActiveRound');
    } catch (e) {
      Alert.alert('Error', 'Something went wrong starting the round.');
    } finally {
      setLoading(false);
    }
  }, [selectedTeeSet, roundType, startingHole, excludeHandicap, holesPlayed, startRound, navigation]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Start Round</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Course */}
        <View style={styles.courseRow}>
          <View>
            <Text style={styles.courseName}>Nambour Golf Club</Text>
            <Text style={styles.courseLocation}>Nambour, QLD</Text>
          </View>
          <View style={styles.courseTag}>
            <Text style={styles.courseTagText}>18 holes</Text>
          </View>
        </View>

        {/* Round Type */}
        <Text style={styles.sectionLabel}>Round Type</Text>
        <View style={styles.segmented}>
          {(['18', 'front9', 'back9'] as RoundType[]).map((type) => (
            <TouchableOpacity
              key={type}
              style={[styles.segment, roundType === type && styles.segmentActive]}
              onPress={() => {
                setRoundType(type);
                if (type === 'front9') setStartingHole(1);
                if (type === 'back9') setStartingHole(10);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.segmentText, roundType === type && styles.segmentTextActive]}>
                {type === '18' ? '18 Holes' : type === 'front9' ? 'Front 9' : 'Back 9'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Starting Hole */}
        <Text style={styles.sectionLabel}>Starting Hole</Text>
        <View style={styles.holePickerRow}>
          {(roundType === 'back9'
            ? [10, 11, 12, 13, 14, 15, 16, 17, 18]
            : roundType === 'front9'
            ? [1, 2, 3, 4, 5, 6, 7, 8, 9]
            : Array.from({ length: 18 }, (_, i) => i + 1)
          ).map((n) => (
            <TouchableOpacity
              key={n}
              style={[styles.holePip, startingHole === n && styles.holePipActive]}
              onPress={() => setStartingHole(n)}
              activeOpacity={0.7}
            >
              <Text style={[styles.holePipText, startingHole === n && styles.holePipTextActive]}>
                {n}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tee Selection */}
        <Text style={styles.sectionLabel}>Tees</Text>
        {teeSets.map(tee => {
          const isSelected = selectedTeeSet?.id === tee.id;
          return (
            <TouchableOpacity
              key={tee.id}
              style={[styles.teeCard, isSelected && styles.teeCardActive]}
              onPress={() => setSelectedTeeSet(tee)}
              activeOpacity={0.7}
            >
              <View style={[styles.teeColorDot, { backgroundColor: TEE_DOT_COLORS[tee.colour] ?? '#fff' }]} />
              <View style={styles.teeInfo}>
                <Text style={styles.teeName}>{tee.name}</Text>
                <Text style={styles.teeDetails}>{tee.total_metres}m  ·  Slope {tee.slope_rating}  ·  Rating {tee.course_rating}</Text>
              </View>
              {isSelected && (
                <View style={styles.teeCheck}>
                  <Text style={styles.teeCheckText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* AI Pre-round Briefing */}
        <Text style={styles.sectionLabel}>AI Caddie Briefing</Text>
        <View style={styles.briefingCard}>
          {briefingTips ? (
            <>
              <View style={styles.briefingHeader}>
                <Text style={styles.briefingIcon}>🤖</Text>
                <Text style={styles.briefingTitle}>PRE-ROUND TIPS</Text>
              </View>
              <Text style={styles.briefingTips}>{briefingTips}</Text>
              <TouchableOpacity onPress={handleGetBriefing} activeOpacity={0.7} style={styles.briefingRefreshBtn}>
                <Text style={styles.briefingRefreshText}>Refresh</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.briefingGetBtn}
              onPress={handleGetBriefing}
              activeOpacity={0.8}
              disabled={briefingLoading || !selectedTeeSet}
            >
              {briefingLoading
                ? <ActivityIndicator color={Colors.green} />
                : <Text style={styles.briefingGetBtnText}>⛳  Get AI Briefing</Text>}
            </TouchableOpacity>
          )}
        </View>

        {/* Exclude from handicap */}
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Exclude from handicap</Text>
            <Text style={styles.toggleSub}>This round won't count toward your index</Text>
          </View>
          <Switch
            value={excludeHandicap}
            onValueChange={setExcludeHandicap}
            trackColor={{ false: Colors.surface3, true: Colors.greenDark }}
            thumbColor={excludeHandicap ? Colors.green : Colors.textMuted}
          />
        </View>
      </ScrollView>

      {/* Start button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.startBtn, loading && styles.startBtnDisabled]}
          onPress={handleStart}
          activeOpacity={0.8}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.startBtnText}>⛳  Start Round</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    backgroundColor: Colors.surface2,
  },
  backBtnText: { fontSize: FontSize.base, color: Colors.textSecondary },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.base, paddingBottom: Spacing.xxl },
  courseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    marginBottom: Spacing.base,
  },
  courseName: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text },
  courseLocation: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  courseTag: {
    backgroundColor: Colors.greenMuted,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  courseTagText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.green },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: Spacing.sm,
    marginTop: Spacing.base,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: Colors.surface2,
    borderRadius: Radius.md,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 40,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: { backgroundColor: Colors.surface3 },
  segmentText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textMuted },
  segmentTextActive: { color: Colors.text, fontWeight: FontWeight.semibold },
  holePickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  holePip: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holePipActive: { backgroundColor: Colors.greenMuted, borderColor: Colors.green },
  holePipText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textSecondary },
  holePipTextActive: { color: Colors.green, fontWeight: FontWeight.bold },
  teeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  teeCardActive: { borderColor: Colors.green },
  teeColorDot: {
    width: 16,
    height: 16,
    borderRadius: Radius.full,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  teeInfo: { flex: 1 },
  teeName: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.text },
  teeDetails: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  teeCheck: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teeCheckText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: '#000' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    marginTop: Spacing.base,
  },
  toggleLabel: { fontSize: FontSize.base, fontWeight: FontWeight.medium, color: Colors.text },
  toggleSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  briefingCard: {
    backgroundColor: Colors.surface2,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.green + '44',
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  briefingHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  briefingIcon: { fontSize: 18 },
  briefingTitle: {
    fontSize: 10,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    color: Colors.green,
    letterSpacing: 0.8,
  },
  briefingTips: {
    fontSize: FontSize.sm,
    fontFamily: Font.regular,
    color: Colors.text,
    lineHeight: 20,
  },
  briefingGetBtn: {
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.greenMuted,
    borderWidth: 1,
    borderColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  briefingGetBtnText: {
    fontSize: FontSize.sm,
    fontFamily: Font.semibold,
    fontWeight: FontWeight.semibold,
    color: Colors.green,
  },
  briefingRefreshBtn: { alignSelf: 'flex-end' },
  briefingRefreshText: {
    fontSize: FontSize.xs,
    fontFamily: Font.medium,
    color: Colors.textMuted,
  },
  footer: {
    padding: Spacing.base,
    paddingBottom: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  startBtn: {
    height: 56,
    borderRadius: Radius.full,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnDisabled: { opacity: 0.5 },
  startBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#000000' },
});

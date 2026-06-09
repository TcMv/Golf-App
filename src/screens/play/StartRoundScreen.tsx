import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useRound } from '../../context/RoundContext';
import { useAuth } from '../../context/AuthContext';
import { fetchWind } from '../../utils/wind';
import { buildPreRoundBriefing } from '../../utils/caddie';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import type { Course, Hole, Round, TeeSet } from '../../types';
import { convertDistance, distanceUnitLabel } from '../../utils/units';

type RootStackParamList = {
  PlayHome: undefined;
  StartRound: undefined;
  ActiveRound: undefined;
  EndRound: undefined;
  RoundDetail: { roundId: string };
  MyBagSetup: { returnTo?: 'StartRound' | 'Main' } | undefined;
};

type Nav = NativeStackNavigationProp<RootStackParamList>;
type RoundType = '18' | 'front9' | 'back9';

const TEE_DOT_COLORS: Record<string, string> = {
  white: Colors.text,
  blue: Colors.textMuted,
  red: Colors.doublePlus,
  yellow: Colors.eagle,
  black: Colors.bg,
};

export default function StartRoundScreen() {
  const navigation = useNavigation<Nav>();
  const { startRound } = useRound();
  const { user, profile } = useAuth();

  const [roundType, setRoundType] = useState<RoundType>('18');
  const [startingHole, setStartingHole] = useState(1);
  const [excludeHandicap, setExcludeHandicap] = useState(false);
  const [loading, setLoading] = useState(false);
  const [setupLoading, setSetupLoading] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseSearch, setCourseSearch] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [teeSets, setTeeSets] = useState<TeeSet[]>([]);
  const [selectedTeeSet, setSelectedTeeSet] = useState<TeeSet | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingTips, setBriefingTips] = useState<string | null>(null);
  const bagPromptedForFocus = useRef(false);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    bagPromptedForFocus.current = false;

    const checkBagBeforeFirstRound = async () => {
      if (!user?.id) return;
      const { data: savedClubs, error: clubError } = await supabase
        .from('user_clubs')
        .select('club_name')
        .eq('user_id', user.id)
        .not('carry_distance_metres', 'is', null);
      const hasUsableClub = (savedClubs ?? []).some(
        club => club.club_name.toLowerCase() !== 'putter',
      );
      if (
        cancelled
        || clubError
        || hasUsableClub
        || bagPromptedForFocus.current
      ) {
        return;
      }
      bagPromptedForFocus.current = true;
      Alert.alert(
        'Set Up Your Clubs',
        'Add your carry distances before starting to enable accurate caddie recommendations.',
        [
          { text: 'Continue Without', style: 'cancel' },
          {
            text: 'Set Up Now',
            onPress: () => navigation.navigate('MyBagSetup', { returnTo: 'StartRound' }),
          },
        ],
      );
    };

    void checkBagBeforeFirstRound();
    return () => {
      cancelled = true;
    };
  }, [navigation, user?.id]));

  useEffect(() => {
    const loadCourses = async () => {
      setSetupLoading(true);
      const { data, error } = await supabase
        .from('courses')
        .select('id, name, lat, lng, holes, created_at')
        .order('name');

      if (error) {
        Alert.alert('Course Error', 'Could not load the course database.');
        setSetupLoading(false);
        return;
      }

      const loaded = (data ?? []) as Course[];
      setCourses(loaded);
      const preferred = loaded.find(course => course.id === profile?.home_course_id) ?? loaded[0] ?? null;
      setSelectedCourse(preferred);
      setSetupLoading(false);
    };

    loadCourses();
  }, [profile?.home_course_id]);

  useEffect(() => {
    if (!selectedCourse) {
      setTeeSets([]);
      setSelectedTeeSet(null);
      return;
    }

    setTeeSets([]);
    setSelectedTeeSet(null);
    supabase
      .from('tee_sets')
      .select('id, course_id, name, colour, total_metres, course_rating, slope_rating')
      .eq('course_id', selectedCourse.id)
      .order('total_metres', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          Alert.alert('Tee Error', `Could not load tees for ${selectedCourse.name}.`);
          return;
        }
        const sets = (data ?? []) as TeeSet[];
        setTeeSets(sets);
        setSelectedTeeSet(sets.find(t => t.colour === 'white') ?? sets[0] ?? null);
      });
  }, [selectedCourse]);

  useEffect(() => {
    setBriefingTips(null);
  }, [selectedCourse?.id, selectedTeeSet?.id]);

  const holesPlayed = roundType === '18' ? 18 : 9;
  const units = profile?.units_preference ?? 'metres';

  const handleGetBriefing = useCallback(async () => {
    if (!selectedTeeSet || !selectedCourse) return;
    setBriefingLoading(true);
    setBriefingTips(null);
    try {
      const [wind, recentRoundsResult] = await Promise.all([
        fetchWind(selectedCourse.lat, selectedCourse.lng),
        user?.id
          ? supabase
              .from('rounds')
              .select('gross_total')
              .eq('user_id', user.id)
              .eq('course_id', selectedCourse.id)
              .eq('completed', true)
              .not('gross_total', 'is', null)
              .order('date', { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [] }),
      ]);
      const recentCourseScores = (recentRoundsResult.data ?? [])
        .map(round => round.gross_total as number | null)
        .filter((score): score is number => score != null);
      const tips = buildPreRoundBriefing({
        courseName: selectedCourse.name,
        courseRating: selectedTeeSet.course_rating,
        slopeRating: selectedTeeSet.slope_rating,
        windLabel: wind?.label ?? 'Calm',
        windSpeed: wind?.speed_kmh ?? 0,
        handicapIndex: profile?.handicap_index ?? null,
        recentCourseScores,
      });
      setBriefingTips(tips);
    } catch {
      setBriefingTips('Could not build the briefing. Check your connection and try again.');
    } finally {
      setBriefingLoading(false);
    }
  }, [selectedTeeSet, selectedCourse, profile?.handicap_index, user?.id]);

  const handleStart = useCallback(async () => {
    if (!selectedCourse || !selectedTeeSet || !user?.id) {
      Alert.alert('Error', 'Select a course and tee before starting.');
      return;
    }
    setLoading(true);
    try {
      const [{ data: course }, { data: holes }] = await Promise.all([
        supabase
          .from('courses')
          .select('id, name, lat, lng, holes, created_at')
          .eq('id', selectedCourse.id)
          .single(),
        supabase
          .from('holes')
          .select('id, course_id, number, par, stroke_index, white_metres, green_front_metres, green_back_metres, tee_lat, tee_lng, green_front_lat, green_front_lng, green_mid_lat, green_mid_lng, green_back_lat, green_back_lng, notes')
          .eq('course_id', selectedCourse.id)
          .order('number'),
      ]);

      if (!course || !holes) {
        Alert.alert('Error', 'Failed to load course data. Check Supabase connection.');
        return;
      }

      const { data: roundData, error } = await supabase
        .from('rounds')
        .insert({
          course_id: selectedCourse.id,
          tee_set_id: selectedTeeSet.id,
          date: new Date().toISOString().split('T')[0],
          holes_played: holesPlayed,
          starting_hole: startingHole,
          exclude_from_handicap: excludeHandicap,
          scoring_mode: 'classic',
          completed: false,
          user_id: user.id,
        })
        .select('id, course_id, tee_set_id, date, holes_played, scoring_mode, starting_hole, exclude_from_handicap, gross_total, net_total, handicap_differential, completed')
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
  }, [selectedCourse, selectedTeeSet, user?.id, startingHole, excludeHandicap, holesPlayed, startRound, navigation]);

  const filteredCourses = courses.filter(course =>
    course.name.toLowerCase().includes(courseSearch.trim().toLowerCase()),
  );

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
        <Text style={styles.sectionLabel}>Course</Text>
        <TextInput
          style={styles.courseSearch}
          value={courseSearch}
          onChangeText={setCourseSearch}
          placeholder="Search courses"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="words"
        />
        {setupLoading ? (
          <ActivityIndicator color={Colors.green} style={styles.setupLoader} />
        ) : filteredCourses.length === 0 ? (
          <View style={styles.courseEmpty}>
            <Text style={styles.courseEmptyText}>No matching courses</Text>
          </View>
        ) : (
          filteredCourses.map(course => {
            const isSelected = selectedCourse?.id === course.id;
            return (
              <TouchableOpacity
                key={course.id}
                style={[styles.courseRow, isSelected && styles.courseRowActive]}
                onPress={() => setSelectedCourse(course)}
                activeOpacity={0.7}
              >
                <View>
                  <Text style={styles.courseName}>{course.name}</Text>
                  <Text style={styles.courseLocation}>
                    {course.lat.toFixed(4)}, {course.lng.toFixed(4)}
                  </Text>
                </View>
                <View style={[styles.courseTag, isSelected && styles.courseTagActive]}>
                  <Text style={styles.courseTagText}>{course.holes} holes</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}

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
        {selectedCourse && teeSets.length === 0 && !setupLoading ? (
          <View style={styles.courseEmpty}>
            <Text style={styles.courseEmptyText}>No tee data is available for this course.</Text>
          </View>
        ) : null}
        {teeSets.map(tee => {
          const isSelected = selectedTeeSet?.id === tee.id;
          return (
            <TouchableOpacity
              key={tee.id}
              style={[styles.teeCard, isSelected && styles.teeCardActive]}
              onPress={() => setSelectedTeeSet(tee)}
              activeOpacity={0.7}
            >
              <View style={[styles.teeColorDot, { backgroundColor: TEE_DOT_COLORS[tee.colour] ?? Colors.text }]} />
              <View style={styles.teeInfo}>
                <Text style={styles.teeName}>{tee.name}</Text>
                <Text style={styles.teeDetails}>
                  {convertDistance(tee.total_metres, units)}{distanceUnitLabel(units, true)}
                  {'  ·  '}Slope {tee.slope_rating}  ·  Rating {tee.course_rating}
                </Text>
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
              disabled={briefingLoading || !selectedTeeSet || !selectedCourse}
            >
              {briefingLoading
                ? <ActivityIndicator color={Colors.green} />
                : <Text style={styles.briefingGetBtnText}>⛳  Build Caddie Briefing</Text>}
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
          disabled={loading || !selectedCourse || !selectedTeeSet}
        >
          {loading ? (
            <ActivityIndicator color={Colors.bg} />
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
    borderRadius: Radius.md,
    backgroundColor: Colors.surface2,
  },
  backBtnText: { fontSize: FontSize.base, color: Colors.textSecondary },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, fontFamily: Font.semibold, color: Colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.base, paddingBottom: Spacing.xxl },
  courseSearch: {
    minHeight: 48,
    backgroundColor: Colors.surface1,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.base,
    color: Colors.text,
    fontSize: FontSize.base,
    fontFamily: Font.regular,
    marginBottom: Spacing.sm,
  },
  setupLoader: { marginVertical: Spacing.lg },
  courseEmpty: {
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
  },
  courseEmptyText: { color: Colors.textMuted, fontSize: FontSize.sm, fontFamily: Font.regular },
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
  courseRowActive: { borderColor: Colors.green },
  courseName: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, fontFamily: Font.semibold, color: Colors.text },
  courseLocation: { fontSize: FontSize.sm, fontFamily: Font.regular, color: Colors.textMuted, marginTop: Spacing.xs },
  courseTag: {
    backgroundColor: Colors.greenMuted,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  courseTagText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.green },
  courseTagActive: { backgroundColor: Colors.greenMuted },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    fontFamily: Font.bold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
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
    backgroundColor: Colors.text,
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
  teeCheckText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, fontFamily: Font.bold, color: Colors.bg },
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
    fontSize: FontSize.xs,
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
    minHeight: 48,
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
    borderRadius: Radius.md,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnDisabled: { opacity: 0.5 },
  startBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, fontFamily: Font.bold, color: Colors.bg },
});

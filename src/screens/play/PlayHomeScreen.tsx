import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { formatDistanceToNow } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useRound } from '../../context/RoundContext';
import { useUserStats, xpProgress } from '../../hooks/useUserStats';
import { loadWeeklyChallenge, processPracticeActivity } from '../../utils/gamification';
import { calcHandicapIndex } from '../../lib/handicap';
import { calculateRoundPar, monthStartString } from '../../utils/homeDashboard';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

// ---------------------------------------------------------------------------
// Navigation types
// ---------------------------------------------------------------------------

type RootStackParamList = {
  PlayHome: undefined;
  StartRound: undefined;
  ActiveRound: undefined;
  EndRound: undefined;
  RoundDetail: { roundId: string };
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecentRound {
  id: string;
  date: string;
  course_name: string;
  gross_total: number | null;
  par_total: number;
  exclude_from_handicap: boolean;
}

interface WeeklyChallenge {
  id: string;
  title: string;
  description: string;
  challenge_type: string;
  target_value: number;
}

interface ChallengeProgress {
  current_value: number;
  completed: boolean;
}

export default function PlayHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { user, profile } = useAuth();
  const { activeRound } = useRound();
  const { stats: userStats, refresh: refreshStats, loading: statsLoading } = useUserStats();

  // Loading States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data States
  const [recentRound, setRecentRound] = useState<RecentRound | null>(null);
  const [handicapIndex, setHandicapIndex] = useState<number | null>(null);
  const [handicapDelta, setHandicapDelta] = useState<number | null>(null);

  // Weekly Challenge
  const [weeklyChallenge, setWeeklyChallenge] = useState<WeeklyChallenge | null>(null);
  const [challengeProgress, setChallengeProgress] = useState<ChallengeProgress | null>(null);

  // Monthly Stats
  const [monthlyAvgScore, setMonthlyAvgScore] = useState<number | null>(null);
  const [monthlyGIR, setMonthlyGIR] = useState<number | null>(null);
  const [monthlyPutts, setMonthlyPutts] = useState<number | null>(null);

  // Practice Log Modal
  const [practiceModalVisible, setPracticeModalVisible] = useState(false);
  const [practiceLogging, setPracticeLogging] = useState(false);

  // ---------------------------------------------------------------------------
  // Calculations & Fetching
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      // 1. Fetch completed rounds with holes to calculate scorecard totals
      const { data: roundsData, error: roundsError } = await supabase
        .from('rounds')
        .select(`
          id,
          date,
          gross_total,
          handicap_differential,
          exclude_from_handicap,
          completed,
          course_id,
          holes_played,
          starting_hole,
          courses:course_id ( name ),
          holes:course_id ( number, par )
        `)
        .eq('user_id', user.id)
        .eq('completed', true)
        .order('date', { ascending: false });

      if (roundsError) throw roundsError;

      const rounds = (roundsData ?? []).map((r: any) => {
        const parTotal = calculateRoundPar(
          r.holes ?? [],
          r.starting_hole ?? 1,
          r.holes_played ?? 18,
        );
        return {
          ...r,
          course_name: r.courses?.name ?? 'Unknown Course',
          par_total: parTotal ?? (r.holes_played === 9 ? 36 : 72),
        };
      });

      // 2. Set most recent round
      if (rounds.length > 0) {
        const last = rounds[0];
        setRecentRound({
          id: last.id,
          date: last.date,
          course_name: last.course_name,
          gross_total: last.gross_total,
          par_total: last.par_total,
          exclude_from_handicap: last.exclude_from_handicap,
        });
      } else {
        setRecentRound(null);
      }

      // 3. Calculate Handicap & Delta
      const differentials = rounds
        .filter(r => r.handicap_differential !== null && !r.exclude_from_handicap)
        .map(r => r.handicap_differential as number);

      const currentHandicap = calcHandicapIndex(differentials) ?? (profile?.handicap_index !== null ? profile?.handicap_index : null) ?? null;
      setHandicapIndex(currentHandicap);

      // Prior rounds (before the 1st of the current month)
      const firstDayOfMonth = monthStartString();
      const priorRounds = rounds.filter(r => r.date < firstDayOfMonth);
      const priorDiffs = priorRounds
        .filter(r => r.handicap_differential !== null && !r.exclude_from_handicap)
        .map(r => r.handicap_differential as number);
      const priorHandicap = calcHandicapIndex(priorDiffs);

      if (currentHandicap !== null && priorHandicap !== null) {
        setHandicapDelta(currentHandicap - priorHandicap);
      } else {
        setHandicapDelta(null);
      }

      // 4. Calculate Month-to-Date Stats
      const thisMonthRounds = rounds.filter(r => r.date >= firstDayOfMonth);
      const scoredThisMonth = thisMonthRounds.filter(r => r.gross_total !== null);

      if (scoredThisMonth.length > 0) {
        const avgScore = scoredThisMonth.reduce((sum, r) => sum + r.gross_total!, 0) / scoredThisMonth.length;
        setMonthlyAvgScore(Math.round(avgScore));

        // Fetch scores for this month's rounds to calculate overall GIR & putts
        const roundIds = thisMonthRounds.map(r => r.id);
        const { data: scoresData } = await supabase
          .from('hole_scores')
          .select('gir, putts')
          .in('round_id', roundIds);

        const monthScores = scoresData ?? [];
        if (monthScores.length > 0) {
          const girHits = monthScores.filter(s => s.gir === true).length;
          setMonthlyGIR(Math.round((girHits / monthScores.length) * 100));

          const totalPutts = monthScores.reduce((sum, s) => sum + (s.putts ?? 0), 0);
          setMonthlyPutts(Number((totalPutts / thisMonthRounds.length).toFixed(1)));
        } else {
          setMonthlyGIR(null);
          setMonthlyPutts(null);
        }
      } else {
        setMonthlyAvgScore(null);
        setMonthlyGIR(null);
        setMonthlyPutts(null);
      }

      // 5. Fetch Weekly Challenge (Defensive Check in case tables do not exist)
      try {
        const weekly = await loadWeeklyChallenge(user.id);
        setWeeklyChallenge({
          id: weekly.challenge.key,
          title: weekly.challenge.title,
          description: weekly.challenge.description,
          challenge_type: weekly.challenge.key,
          target_value: weekly.challenge.target,
        });
        setChallengeProgress({
          current_value: weekly.currentValue,
          completed: weekly.completed,
        });
      } catch {
        setWeeklyChallenge(null);
        setChallengeProgress(null);
      }

    } catch {
      Alert.alert('Load Error', 'Failed to retrieve home dashboard statistics.');
    } finally {
      setLoading(false);
    }
  }, [user, profile]);

  useFocusEffect(useCallback(() => {
    void Promise.all([fetchData(), refreshStats()]);
  }, [fetchData, refreshStats]));

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchData(), refreshStats()]);
    setRefreshing(false);
  }, [fetchData, refreshStats]);

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------

  const handleLogPractice = async (type: string) => {
    if (!user) return;
    setPracticeLogging(true);
    try {
      const activity = await processPracticeActivity(user.id, type);

      // Haptic Feedback
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (hapticErr) {
        // Safe fallback
      }

      Alert.alert(
        'Practice Logged! 🏌️',
        `Logged "${type}" successfully!\n+15 XP Awarded.\n🔥 Streak is now ${activity.streak} days!`,
        [{ text: 'Great', onPress: () => {
          setPracticeModalVisible(false);
          refreshStats();
          fetchData();
        }}]
      );

    } catch (e: any) {
      Alert.alert('Save Error', e.message ?? 'Failed to log practice activity.');
    } finally {
      setPracticeLogging(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Helper Renderers
  // ---------------------------------------------------------------------------

  const getGreeting = () => {
    const hours = new Date().getHours();
    if (hours < 12) return 'Good morning';
    if (hours < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'Golfer';

  const renderDeltaBadge = () => {
    if (handicapDelta === null) return null;
    const isImproved = handicapDelta < 0;
    const icon = isImproved ? 'arrow-down-circle' : 'arrow-up-circle';
    const color = isImproved ? Colors.green : Colors.red;
    const absVal = Math.abs(handicapDelta).toFixed(1);

    return (
      <View style={styles.deltaContainer}>
        <Ionicons name={icon} size={14} color={color} />
        <Text style={[styles.deltaText, { color }]}>{absVal} this month</Text>
      </View>
    );
  };

  const xpProgressInfo = useMemo(() => {
    if (!userStats) return { pct: 0, currentXp: 0, neededXp: 200, level: 1 };
    return xpProgress(userStats.xp);
  }, [userStats]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

      {/* ── time-aware Greeting & Handicap Strip ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreeting()}, {displayName}</Text>
          <View style={styles.handicapStrip}>
            <Text style={styles.handicapText}>
              Handicap: <Text style={styles.handicapVal}>{handicapIndex !== null ? handicapIndex.toFixed(1) : '—'}</Text>
            </Text>
            {renderDeltaBadge()}
          </View>
        </View>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => navigation.navigate('StartRound')}
          accessibilityLabel="Start New Round Quick Settings"
        >
          <Ionicons name="golf-outline" size={24} color={Colors.green} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.green}
            colors={[Colors.green]}
          />
        }
      >
        {(loading || statsLoading) && !refreshing && (
          <ActivityIndicator color={Colors.green} style={styles.loadingIndicator} />
        )}
        {/* ── Streak & XP Card ── */}
        <View style={styles.streakCard}>
          <View style={styles.streakHeader}>
            <Text style={styles.streakTitle}>🔥 {userStats?.streak_days ?? 0}-Day Streak</Text>
            <Text style={styles.levelLabel}>LVL {xpProgressInfo.level}</Text>
          </View>
          <View style={styles.progressContainer}>
            <View style={styles.xpBarBackground}>
              <View style={[styles.xpBarFill, { width: `${xpProgressInfo.pct * 100}%` }]} />
            </View>
            <Text style={styles.xpProgressText}>
              {xpProgressInfo.currentXp} / {xpProgressInfo.neededXp} XP to Level {xpProgressInfo.level + 1}
            </Text>
          </View>
        </View>

        {/* ── Action CTAs Row ── */}
        <View style={styles.ctaContainer}>
          <TouchableOpacity
            style={styles.ctaPrimary}
            onPress={() => navigation.navigate(activeRound ? 'ActiveRound' : 'StartRound')}
            activeOpacity={0.8}
          >
            <Text style={styles.ctaPrimaryText}>
              {activeRound ? `RESUME HOLE ${activeRound.currentHoleNumber}` : 'START ROUND'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ctaSecondary}
            onPress={() => setPracticeModalVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.ctaSecondaryText}>PRACTICE LOG</Text>
          </TouchableOpacity>
        </View>

        {/* ── Weekly Challenge Card ── */}
        {weeklyChallenge && challengeProgress && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>WEEKLY CHALLENGE</Text>
              {challengeProgress.completed ? (
                <View style={styles.completedBadge}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.green} />
                  <Text style={styles.completedBadgeText}>COMPLETED</Text>
                </View>
              ) : (
                <Text style={styles.cardSubTitle}>ACTIVE</Text>
              )}
            </View>
            <Text style={styles.challengeTitle}>{weeklyChallenge.title}</Text>
            <Text style={styles.challengeDesc}>{weeklyChallenge.description}</Text>

            <View style={styles.challengeProgressRow}>
              <View style={styles.challengeBarBg}>
                <View
                  style={[
                    styles.challengeBarFill,
                    { width: `${Math.min(100, ((challengeProgress.current_value / weeklyChallenge.target_value) * 100))}%` },
                  ]}
                />
              </View>
              <Text style={styles.challengeProgressText}>
                {challengeProgress.current_value} / {weeklyChallenge.target_value}
              </Text>
            </View>
          </View>
        )}

        {/* ── Last Round Card ── */}
        {recentRound ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>LAST ROUND</Text>
            <View style={styles.lastRoundHeader}>
              <View>
                <Text style={styles.lastRoundCourse}>{recentRound.course_name}</Text>
                <Text style={styles.lastRoundDate}>
                  {formatDistanceToNow(new Date(recentRound.date), { addSuffix: true })}
                </Text>
              </View>
              <View style={styles.lastRoundScoreWrapper}>
                <Text style={styles.lastRoundGross}>{recentRound.gross_total ?? '—'}</Text>
                {recentRound.gross_total !== null && (
                  <Text
                    style={[
                      styles.lastRoundDiff,
                      {
                        color:
                          recentRound.gross_total - recentRound.par_total < 0
                            ? Colors.green
                            : recentRound.gross_total - recentRound.par_total === 0
                            ? Colors.text
                            : Colors.orange,
                      },
                    ]}
                  >
                    {recentRound.gross_total - recentRound.par_total === 0
                      ? 'E'
                      : recentRound.gross_total - recentRound.par_total > 0
                      ? `+${recentRound.gross_total - recentRound.par_total}`
                      : String(recentRound.gross_total - recentRound.par_total)}
                  </Text>
                )}
              </View>
            </View>
            <TouchableOpacity
              style={styles.viewScorecardLink}
              onPress={() => navigation.navigate('RoundDetail', { roundId: recentRound.id })}
              activeOpacity={0.7}
            >
              <Text style={styles.viewScorecardLinkText}>View Scorecard</Text>
              <Ionicons name="arrow-forward" size={14} color={Colors.green} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>LAST ROUND</Text>
            <Text style={styles.emptyCardTitle}>No completed rounds yet</Text>
            <Text style={styles.emptyCardText}>
              Start a round to build your score history and monthly trends.
            </Text>
          </View>
        )}

        {/* ── Month-To-Date Stats strip ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>YOUR STATS THIS MONTH</Text>
          <View style={styles.monthStatsStrip}>
            <View style={styles.monthStatItem}>
              <Text style={styles.monthStatVal}>{monthlyAvgScore ?? '—'}</Text>
              <Text style={styles.monthStatLabel}>Avg Score</Text>
            </View>
            <View style={styles.monthStatDivider} />
            <View style={styles.monthStatItem}>
              <Text style={styles.monthStatVal}>{monthlyGIR !== null ? `${monthlyGIR}%` : '—'}</Text>
              <Text style={styles.monthStatLabel}>GIR %</Text>
            </View>
            <View style={styles.monthStatDivider} />
            <View style={styles.monthStatItem}>
              <Text style={styles.monthStatVal}>{monthlyPutts ?? '—'}</Text>
              <Text style={styles.monthStatLabel}>Putts/Round</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Practice Log Modal */}
      <Modal
        visible={practiceModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPracticeModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Practice Log</Text>
              <TouchableOpacity
                onPress={() => setPracticeModalVisible(false)}
                disabled={practiceLogging}
              >
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDesc}>
              Select a practice session type to log. You will gain +15 XP and maintain your daily streak!
            </Text>

            <View style={styles.practiceOptions}>
              {[
                { type: 'Driving Range (50+ balls)', icon: '⛳' },
                { type: 'Putting Green (30+ mins)', icon: '⛳' },
                { type: 'Chipping & Short Game', icon: '⛳' },
                { type: 'Practice Round (9 Holes)', icon: '⛳' },
              ].map(opt => (
                <TouchableOpacity
                  key={opt.type}
                  style={styles.practiceBtn}
                  onPress={() => handleLogPractice(opt.type)}
                  disabled={practiceLogging}
                  activeOpacity={0.7}
                >
                  <Text style={styles.practiceBtnIcon}>{opt.icon}</Text>
                  <Text style={styles.practiceBtnText}>{opt.type}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Redesigned Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  greeting: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
    fontFamily: Font.semibold,
  },
  handicapStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: Spacing.sm,
  },
  handicapText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontFamily: Font.regular,
  },
  handicapVal: {
    color: Colors.text,
    fontWeight: FontWeight.bold,
  },
  deltaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  deltaText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    fontFamily: Font.semibold,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.base, gap: Spacing.base, paddingBottom: Spacing.xxl },
  loadingIndicator: { paddingVertical: Spacing.sm },

  // Streak & XP Progress Card
  streakCard: {
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
  },
  streakHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  streakTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    fontFamily: Font.bold,
  },
  levelLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.green,
    fontFamily: Font.bold,
    backgroundColor: Colors.surface2,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  progressContainer: {
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  xpBarBackground: {
    height: 8,
    backgroundColor: Colors.surface3,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%',
    backgroundColor: Colors.green,
  },
  xpProgressText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: Font.regular,
  },

  // CTA Buttons Row
  ctaContainer: {
    flexDirection: 'column',
    gap: Spacing.sm,
  },
  ctaPrimary: {
    backgroundColor: Colors.green,
    height: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPrimaryText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.bg,
    fontFamily: Font.bold,
    letterSpacing: 0.5,
  },
  ctaSecondary: {
    backgroundColor: Colors.surface2,
    height: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ctaSecondaryText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    fontFamily: Font.bold,
    letterSpacing: 0.5,
  },

  // General Cards
  card: {
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  cardTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
    letterSpacing: 0.8,
    fontFamily: Font.bold,
  },
  cardSubTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.green,
    letterSpacing: 0.8,
    fontFamily: Font.bold,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  completedBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.green,
    fontFamily: Font.bold,
  },

  // Challenge specifics
  challengeTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    fontFamily: Font.bold,
  },
  challengeDesc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontFamily: Font.regular,
    marginTop: 2,
    lineHeight: 16,
  },
  challengeProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  challengeBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.surface3,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  challengeBarFill: {
    height: '100%',
    backgroundColor: Colors.green,
  },
  challengeProgressText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    fontFamily: Font.semibold,
    width: 32,
    textAlign: 'right',
  },

  // Last Round Card
  lastRoundHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  lastRoundCourse: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
    fontFamily: Font.semibold,
  },
  lastRoundDate: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: Font.regular,
    marginTop: 2,
  },
  lastRoundScoreWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  lastRoundGross: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    fontFamily: Font.bold,
  },
  lastRoundDiff: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    fontFamily: Font.bold,
    backgroundColor: Colors.subtle,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  viewScorecardLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
  },
  viewScorecardLinkText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.green,
    fontFamily: Font.semibold,
  },
  emptyCardTitle: {
    color: Colors.text,
    fontFamily: Font.semibold,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.base,
    marginTop: Spacing.sm,
  },
  emptyCardText: {
    color: Colors.textMuted,
    fontFamily: Font.regular,
    fontSize: FontSize.sm,
    lineHeight: 19,
    marginTop: 2,
  },

  // Month stats strip
  monthStatsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  monthStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  monthStatVal: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    fontFamily: Font.bold,
  },
  monthStatLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: Font.regular,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  monthStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.border,
  },

  // Modal styling
  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.backdrop,
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: Colors.surface1,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    fontFamily: Font.bold,
  },
  modalDesc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 16,
    fontFamily: Font.regular,
  },
  practiceOptions: {
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  practiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  practiceBtnIcon: { fontSize: 16 },
  practiceBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
    fontFamily: Font.semibold,
  },
});

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import type { Round } from '../../types';

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
// Constants
// ---------------------------------------------------------------------------

const COURSE_ID = '00000000-0000-0000-0000-000000000001';
const COURSE_NAME = 'Nambour Golf Club';
const COURSE_LOCATION = 'Nambour, QLD';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CourseStats {
  roundsPlayed: number;
  avgScore: number | null;
  bestScore: number | null;
}

interface RecentRound {
  id: string;
  date: string;
  gross_total: number | null;
  par: number;
  handicap_differential: number | null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action}
    </View>
  );
}

function ScoreToParLabel({ gross, par }: { gross: number | null; par: number }) {
  if (gross === null) return <Text style={styles.roundScore}>–</Text>;
  const diff = gross - par;
  let color = Colors.scorePar;
  let label = 'E';
  if (diff > 0) { color = diff === 1 ? Colors.bogey : Colors.doublePlus; label = `+${diff}`; }
  if (diff < 0) { color = Colors.birdie; label = `${diff}`; }
  return (
    <View style={styles.toParRow}>
      <Text style={styles.roundScore}>{gross}</Text>
      <View style={[styles.toParBadge, { backgroundColor: color + '22' }]}>
        <Text style={[styles.toParText, { color }]}>{label}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function PlayHomeScreen() {
  const navigation = useNavigation<Nav>();

  const [stats, setStats] = useState<CourseStats>({ roundsPlayed: 0, avgScore: null, bestScore: null });
  const [recentRounds, setRecentRounds] = useState<RecentRound[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch completed rounds for this course
      const { data: rounds, error } = await supabase
        .from('rounds')
        .select('id, date, gross_total, handicap_differential, holes_played')
        .eq('course_id', COURSE_ID)
        .eq('completed', true)
        .order('date', { ascending: false })
        .limit(20);

      if (error) throw error;

      const completed = (rounds ?? []) as (Round & { holes_played: number })[];
      const withScore = completed.filter((r) => r.gross_total !== null);

      const roundsPlayed = completed.length;
      const bestScore = withScore.length > 0
        ? Math.min(...withScore.map((r) => r.gross_total!))
        : null;
      const avgScore = withScore.length > 0
        ? Math.round(withScore.reduce((s, r) => s + r.gross_total!, 0) / withScore.length)
        : null;

      setStats({ roundsPlayed, avgScore, bestScore });

      // Fetch course par for to-par calculations
      const { data: holes } = await supabase
        .from('holes')
        .select('par')
        .eq('course_id', COURSE_ID);

      const totalPar = (holes ?? []).reduce((s: number, h: { par: number }) => s + h.par, 0) || 72;

      const recent: RecentRound[] = completed.slice(0, 3).map((r) => ({
        id: r.id,
        date: r.date,
        gross_total: r.gross_total,
        par: totalPar,
        handicap_differential: r.handicap_differential,
      }));
      setRecentRounds(recent);
    } catch (err) {
      Alert.alert('Error', 'Failed to load course data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.logo}>GolfCaddie</Text>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => navigation.navigate('StartRound')}
          accessibilityLabel="Settings"
        >
          {/* Settings gear icon (drawn with text) */}
          <Text style={styles.iconText}>⚙</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Course hero card ── */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.courseTagRow}>
              <View style={styles.courseTag}>
                <Text style={styles.courseTagText}>18</Text>
              </View>
              <Text style={styles.courseTagLabel}>Holes</Text>
            </View>
          </View>
          <Text style={styles.courseName}>{COURSE_NAME}</Text>
          <Text style={styles.courseLocation}>{COURSE_LOCATION}</Text>

          <TouchableOpacity
            style={styles.startBtn}
            onPress={() => navigation.navigate('StartRound')}
            activeOpacity={0.8}
          >
            <Text style={styles.startBtnIcon}>⛳</Text>
            <Text style={styles.startBtnLabel}>Start Round</Text>
          </TouchableOpacity>
        </View>

        {/* ── My Stats card ── */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>My Stats at Nambour</Text>
          {loading ? (
            <ActivityIndicator color={Colors.green} style={{ marginTop: Spacing.base }} />
          ) : (
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.roundsPlayed}</Text>
                <Text style={styles.statLabel}>Rounds</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: stats.avgScore ? Colors.text : Colors.textMuted }]}>
                  {stats.avgScore ?? '–'}
                </Text>
                <Text style={styles.statLabel}>Avg Score</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: stats.bestScore ? Colors.green : Colors.textMuted }]}>
                  {stats.bestScore ?? '–'}
                </Text>
                <Text style={styles.statLabel}>Best Score</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Recent Rounds ── */}
        <SectionTitle
          title="Recent Rounds"
          action={
            <TouchableOpacity onPress={() => {}}>
              <Text style={styles.viewAllBtn}>View All</Text>
            </TouchableOpacity>
          }
        />

        <View style={styles.roundsCard}>
          {loading ? (
            <ActivityIndicator color={Colors.green} style={{ marginVertical: Spacing.base }} />
          ) : recentRounds.length === 0 ? (
            <Text style={styles.emptyText}>No completed rounds yet</Text>
          ) : (
            recentRounds.map((round, idx) => {
              const dateLabel = (() => {
                try { return format(new Date(round.date), 'dd MMM yyyy'); } catch { return round.date; }
              })();
              return (
                <React.Fragment key={round.id}>
                  {idx > 0 && <View style={styles.roundDivider} />}
                  <TouchableOpacity
                    style={styles.roundRow}
                    onPress={() => navigation.navigate('RoundDetail', { roundId: round.id })}
                    activeOpacity={0.7}
                  >
                    <View style={styles.roundLeft}>
                      <Text style={styles.roundDate}>{dateLabel}</Text>
                      {round.handicap_differential !== null && (
                        <Text style={styles.roundDiff}>
                          Diff: {round.handicap_differential.toFixed(1)}
                        </Text>
                      )}
                    </View>
                    <View style={styles.roundRight}>
                      <ScoreToParLabel gross={round.gross_total} par={round.par} />
                      <Text style={styles.chevron}>›</Text>
                    </View>
                  </TouchableOpacity>
                </React.Fragment>
              );
            })
          )}
        </View>

        {/* ── Add Past Round ── */}
        <TouchableOpacity style={styles.addPastBtn} onPress={() => {}}>
          <Text style={styles.addPastText}>+ Add Past Round</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  logo: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.green,
    letterSpacing: 0.5,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.base,
    paddingBottom: Spacing.xxxl,
  },

  // Hero card
  heroCard: {
    backgroundColor: Colors.surface1,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    marginBottom: Spacing.base,
    overflow: 'hidden',
  },
  heroTop: {
    marginBottom: Spacing.md,
  },
  courseTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  courseTag: {
    backgroundColor: Colors.greenMuted,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  courseTagText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.green,
  },
  courseTagLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },
  courseName: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
    lineHeight: FontSize.xl * 1.2,
  },
  courseLocation: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.green,
    borderRadius: Radius.full,
    height: 52,
    gap: Spacing.sm,
  },
  startBtnIcon: {
    fontSize: FontSize.base,
  },
  startBtnLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: '#000000',
  },

  // Stats card
  statsCard: {
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    marginBottom: Spacing.base,
  },
  statsTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginBottom: Spacing.base,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.border,
  },
  statValue: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  viewAllBtn: {
    fontSize: FontSize.sm,
    color: Colors.green,
    fontWeight: FontWeight.medium,
  },

  // Rounds card
  roundsCard: {
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.base,
    overflow: 'hidden',
  },
  roundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.base,
  },
  roundDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.base,
  },
  roundLeft: {
    gap: 2,
  },
  roundDate: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
    color: Colors.text,
  },
  roundDiff: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  roundRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  roundScore: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  toParRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  toParBadge: {
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  toParText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  chevron: {
    fontSize: FontSize.xl,
    color: Colors.textMuted,
    lineHeight: FontSize.xl,
  },
  emptyText: {
    padding: Spacing.base,
    color: Colors.textMuted,
    textAlign: 'center',
    fontSize: FontSize.sm,
  },

  // Add past round
  addPastBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.base,
  },
  addPastText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
});

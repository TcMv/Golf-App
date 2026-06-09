import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import type { HoleScore, Round } from '../../types';

type RouteParams = { roundId: string };

function scoreColor(diff: number): string {
  if (diff <= -1) return Colors.birdie;
  if (diff === 0) return Colors.scorePar;
  if (diff === 1) return Colors.bogey;
  return Colors.doublePlus;
}

export default function RoundDetailScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const route = useRoute<RouteProp<{ RoundDetail: RouteParams }, 'RoundDetail'>>();
  const { roundId } = route.params;

  const [round, setRound] = useState<Round | null>(null);
  const [courseName, setCourseName] = useState('');
  const [holes, setHoles] = useState<{ number: number; par: number }[]>([]);
  const [scores, setScores] = useState<HoleScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: roundData, error: roundError } = await supabase
        .from('rounds')
        .select('id, course_id, tee_set_id, date, holes_played, scoring_mode, starting_hole, exclude_from_handicap, gross_total, net_total, handicap_differential, completed, courses(name)')
        .eq('id', roundId)
        .eq('user_id', user.id)
        .single();

      if (roundError || !roundData) {
        setError('Could not load this round.');
        return;
      }
      setRound(roundData as Round);
      setCourseName((roundData as any).courses?.name ?? '');

      const [{ data: holesData, error: holesError }, { data: scoresData, error: scoresError }] = await Promise.all([
        supabase.from('holes').select('number, par').eq('course_id', roundData.course_id).order('number'),
        supabase
          .from('hole_scores')
          .select('id, round_id, hole_id, hole_number, gross_score, net_score, fairway_hit, gir, gir_miss_direction, putts, chips, sand_shots, penalties')
          .eq('round_id', roundId)
          .order('hole_number'),
      ]);
      if (holesError || scoresError) {
        setError('Could not load the round scorecard.');
        return;
      }

      const startingHole = roundData.starting_hole ?? 1;
      const endingHole = startingHole + 8;
      setHoles(
        roundData.holes_played === 9
          ? ((holesData ?? []) as { number: number; par: number }[]).filter(
              hole => hole.number >= startingHole && hole.number <= endingHole,
            )
          : (holesData ?? []) as { number: number; par: number }[],
      );
      setScores((scoresData ?? []) as HoleScore[]);
    } finally {
      setLoading(false);
    }
  }, [roundId, user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.green} size="large" />
      </View>
    );
  }

  if (!round) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>{error ?? 'Round not found'}</Text>
        {error && (
          <TouchableOpacity style={styles.retryButton} onPress={fetchData}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const dateLabel = (() => {
    try { return format(new Date(round.date), 'EEE d MMM yyyy'); }
    catch { return round.date; }
  })();

  const totalPar = holes.reduce((s, h) => s + h.par, 0);
  const toPar = (round.gross_total ?? 0) - totalPar;
  const toParLabel = toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : `${toPar}`;

  const scoreMap: Record<number, HoleScore> = {};
  scores.forEach((s) => { scoreMap[s.hole_number] = s; });

  const front9Holes = holes.filter((h) => h.number <= 9);
  const back9Holes = holes.filter((h) => h.number > 9);

  const totalPutts = scores.reduce((s, sc) => s + (sc.putts ?? 0), 0);
  const totalPenalties = scores.reduce((s, sc) => s + (sc.penalties ?? 0), 0);
  const firHoles = holes.filter((h) => h.par >= 4);
  const firHit = scores.filter((s) => {
    const h = holes.find((ho) => ho.number === s.hole_number);
    return h && h.par >= 4 && s.fairway_hit === 'hit';
  }).length;
  const girHit = scores.filter((s) => s.gir === true).length;

  const birdies = scores.filter((s) => {
    const h = holes.find((ho) => ho.number === s.hole_number);
    return h && s.gross_score !== null && s.gross_score < h.par;
  }).length;
  const pars = scores.filter((s) => {
    const h = holes.find((ho) => ho.number === s.hole_number);
    return h && s.gross_score === h.par;
  }).length;
  const bogeys = scores.filter((s) => {
    const h = holes.find((ho) => ho.number === s.hole_number);
    return h && s.gross_score !== null && s.gross_score === h.par + 1;
  }).length;
  const doubles = scores.filter((s) => {
    const h = holes.find((ho) => ho.number === s.hole_number);
    return h && s.gross_score !== null && s.gross_score >= h.par + 2;
  }).length;

  function renderHoleRows(holeList: { number: number; par: number }[]) {
    return holeList.map((hole) => {
      const s = scoreMap[hole.number];
      const diff = s?.gross_score != null ? s.gross_score - hole.par : null;
      const color = diff != null ? scoreColor(diff) : Colors.textMuted;
      return (
        <View key={hole.number} style={styles.tableRow}>
          <Text style={styles.colHole}>{hole.number}</Text>
          <Text style={styles.colPar}>{hole.par}</Text>
          <Text style={[styles.colScore, { color }]}>{s?.gross_score ?? '-'}</Text>
          <Text style={[styles.colDiff, { color }]}>
            {diff == null ? '' : diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`}
          </Text>
          <Text style={styles.colFir}>{hole.par >= 4 ? (s?.fairway_hit === 'hit' ? '✓' : s?.fairway_hit === 'left' ? 'L' : s?.fairway_hit === 'right' ? 'R' : '-') : '—'}</Text>
          <Text style={styles.colGir}>{s?.gir === true ? '✓' : s?.gir === false ? '✕' : '-'}</Text>
          <Text style={styles.colPutts}>{s?.putts ?? '-'}</Text>
        </View>
      );
    });
  }

  function renderSubtotal(holeList: { number: number; par: number }[], label: string) {
    const subPar = holeList.reduce((s, h) => s + h.par, 0);
    const subScore = holeList.reduce((s, h) => s + (scoreMap[h.number]?.gross_score ?? 0), 0);
    return (
      <View style={[styles.tableRow, styles.subtotalRow]}>
        <Text style={styles.colHole}>{label}</Text>
        <Text style={styles.colPar}>{subPar}</Text>
        <Text style={[styles.colScore, { fontWeight: FontWeight.bold }]}>{subScore || '-'}</Text>
        <Text style={styles.colDiff} />
        <Text style={styles.colFir} />
        <Text style={styles.colGir} />
        <Text style={styles.colPutts} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerDate}>{dateLabel}</Text>
          <Text style={styles.headerCourse}>{courseName}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Score summary */}
        <View style={styles.heroRow}>
          <View style={styles.heroScore}>
            <Text style={styles.heroScoreValue}>{round.gross_total ?? '-'}</Text>
            <Text style={styles.heroScoreLabel}>Gross</Text>
          </View>
          <View style={[styles.heroScore, styles.heroTopar]}>
            <Text style={[styles.heroScoreValue, { color: toPar < 0 ? Colors.birdie : toPar === 0 ? Colors.scorePar : Colors.bogey }]}>
              {toParLabel}
            </Text>
            <Text style={styles.heroScoreLabel}>To Par</Text>
          </View>
          {round.handicap_differential != null && (
            <View style={styles.heroScore}>
              <Text style={styles.heroScoreValue}>{round.handicap_differential.toFixed(1)}</Text>
              <Text style={styles.heroScoreLabel}>Diff</Text>
            </View>
          )}
        </View>

        {/* Scorecard table */}
        <View style={styles.tableCard}>
          <View style={styles.tableHeaderRow}>
            <Text style={styles.colHole}>#</Text>
            <Text style={styles.colPar}>Par</Text>
            <Text style={styles.colScore}>Score</Text>
            <Text style={styles.colDiff}>+/-</Text>
            <Text style={styles.colFir}>FIR</Text>
            <Text style={styles.colGir}>GIR</Text>
            <Text style={styles.colPutts}>Putts</Text>
          </View>
          {renderHoleRows(front9Holes)}
          {renderSubtotal(front9Holes, 'OUT')}
          {back9Holes.length > 0 && (
            <>
              {renderHoleRows(back9Holes)}
              {renderSubtotal(back9Holes, 'IN')}
            </>
          )}
          <View style={[styles.tableRow, styles.totalRow]}>
            <Text style={[styles.colHole, { fontWeight: FontWeight.bold }]}>TOT</Text>
            <Text style={[styles.colPar, { fontWeight: FontWeight.bold }]}>{totalPar}</Text>
            <Text style={[styles.colScore, { fontWeight: FontWeight.black, fontSize: FontSize.base }]}>
              {round.gross_total ?? '-'}
            </Text>
            <Text style={[styles.colDiff, {
              fontWeight: FontWeight.bold,
              color: toPar < 0 ? Colors.birdie : toPar === 0 ? Colors.scorePar : toPar === 1 ? Colors.bogey : Colors.doublePlus
            }]}>{toParLabel}</Text>
            <Text style={styles.colFir}>{firHoles.length > 0 ? `${firHit}/${firHoles.length}` : '—'}</Text>
            <Text style={styles.colGir}>{girHit}/{holes.length}</Text>
            <Text style={styles.colPutts}>{totalPutts}</Text>
          </View>
        </View>

        {/* Stats card */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Round Stats</Text>
          <View style={styles.statsGrid}>
            {[
              { label: 'FIR %', value: firHoles.length > 0 ? `${Math.round((firHit / firHoles.length) * 100)}%` : '-' },
              { label: 'GIR %', value: `${Math.round((girHit / Math.max(holes.length, 1)) * 100)}%` },
              { label: 'Putts', value: totalPutts },
              { label: 'Penalties', value: totalPenalties },
              { label: 'Birdies', value: birdies },
              { label: 'Pars', value: pars },
              { label: 'Bogeys', value: bogeys },
              { label: 'Double+', value: doubles },
            ].map(({ label, value }) => (
              <View key={label} style={styles.statItem}>
                <Text style={styles.statValue}>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  loading: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: Colors.textMuted, fontSize: FontSize.base },
  retryButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.green,
  },
  retryText: { color: Colors.bg, fontWeight: FontWeight.bold },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: FontSize.xxl, color: Colors.text, lineHeight: FontSize.xxl + 4 },
  headerDate: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.text },
  headerCourse: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 1 },
  scroll: { flex: 1 },
  content: { padding: Spacing.base, gap: Spacing.base, paddingBottom: Spacing.xxl },

  heroRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  heroScore: { flex: 1, alignItems: 'center', paddingVertical: Spacing.base, borderRightWidth: 1, borderRightColor: Colors.border },
  heroTopar: {},
  heroScoreValue: { fontSize: FontSize.xxl, fontWeight: FontWeight.black, color: Colors.text },
  heroScoreLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },

  tableCard: {
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface2,
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    alignItems: 'center',
  },
  subtotalRow: { backgroundColor: Colors.surface2 },
  totalRow: { backgroundColor: Colors.surface3 },
  colHole: { width: 28, fontSize: FontSize.xs, fontWeight: FontWeight.medium, color: Colors.textSecondary },
  colPar: { width: 28, fontSize: FontSize.xs, color: Colors.textMuted },
  colScore: { width: 40, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.text, textAlign: 'center' },
  colDiff: { width: 32, fontSize: FontSize.xs, fontWeight: FontWeight.medium, textAlign: 'center' },
  colFir: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center' },
  colGir: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center' },
  colPutts: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center' },

  statsCard: {
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
  },
  statsTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: Spacing.base,
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statItem: { width: '25%', alignItems: 'center', paddingVertical: Spacing.md },
  statValue: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
});

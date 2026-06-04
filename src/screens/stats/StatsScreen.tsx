import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { calcHandicapIndex } from '../../lib/handicap';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import type { HandicapHistory, HoleScore, Round } from '../../types';

interface RoundRow extends Round {
  gross_total: number | null;
  handicap_differential: number | null;
}

function BarChart({
  data,
  max,
}: {
  data: { label: string; value: number; color: string }[];
  max: number;
}) {
  return (
    <View style={barStyles.container}>
      {data.map(({ label, value, color }) => (
        <View key={label} style={barStyles.row}>
          <Text style={barStyles.label}>{label}</Text>
          <View style={barStyles.track}>
            <View
              style={[barStyles.fill, { width: `${max > 0 ? (value / max) * 100 : 0}%`, backgroundColor: color }]}
            />
          </View>
          <Text style={barStyles.value}>{value}%</Text>
        </View>
      ))}
    </View>
  );
}

const barStyles = StyleSheet.create({
  container: { gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  label: { width: 60, fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  track: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.surface3,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
  value: { width: 36, fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'right' },
});

export default function StatsScreen() {
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [scores, setScores] = useState<HoleScore[]>([]);
  const [holePars, setHolePars] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [storedHandicap, setStoredHandicap] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { data: roundsData },
        { data: scoresData },
        { data: holesData },
        { data: settingsData },
      ] = await Promise.all([
        supabase.from('rounds').select('*').eq('completed', true).order('date', { ascending: false }),
        supabase.from('hole_scores').select('*'),
        supabase.from('holes').select('number, par').eq('course_id', '00000000-0000-0000-0000-000000000001'),
        supabase.from('app_settings').select('value').eq('key', 'handicap_index').maybeSingle(),
      ]);

      setRounds((roundsData ?? []) as RoundRow[]);
      setScores((scoresData ?? []) as HoleScore[]);
      const parMap: Record<number, number> = {};
      (holesData ?? []).forEach((h: { number: number; par: number }) => { parMap[h.number] = h.par; });
      setHolePars(parMap);
      setStoredHandicap(settingsData?.value ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const stats = useMemo(() => {
    const totalRounds = rounds.length;
    if (totalRounds === 0) return null;

    const withScore = rounds.filter((r) => r.gross_total != null);
    const avgScore = withScore.length > 0
      ? Math.round(withScore.reduce((s, r) => s + r.gross_total!, 0) / withScore.length)
      : null;
    const bestScore = withScore.length > 0
      ? Math.min(...withScore.map((r) => r.gross_total!))
      : null;

    // Handicap from differentials
    const differentials = rounds
      .filter((r) => r.handicap_differential != null && !r.exclude_from_handicap)
      .map((r) => r.handicap_differential!);
    const handicapIndex = calcHandicapIndex(differentials) ?? (storedHandicap ? parseFloat(storedHandicap) : null);

    // Stats from hole_scores
    let firHoles = 0, firHit = 0, girHoles = 0, girHit = 0, totalPutts = 0;
    let birdies = 0, pars = 0, bogeys = 0, doubles = 0;

    for (const s of scores) {
      const par = holePars[s.hole_number];
      if (!par) continue;
      girHoles++;
      if (s.gir === true) girHit++;
      if (par >= 4) { firHoles++; if (s.fairway_hit === 'hit') firHit++; }
      totalPutts += s.putts ?? 0;
      if (s.gross_score == null) continue;
      const diff = s.gross_score - par;
      if (diff <= -1) birdies++;
      else if (diff === 0) pars++;
      else if (diff === 1) bogeys++;
      else doubles++;
    }

    const totalScoredHoles = birdies + pars + bogeys + doubles;
    const firPct = firHoles > 0 ? Math.round((firHit / firHoles) * 100) : 0;
    const girPct = girHoles > 0 ? Math.round((girHit / girHoles) * 100) : 0;
    const avgPutts = girHoles > 0 ? (totalPutts / girHoles).toFixed(1) : '-';

    // Miss patterns
    const fairwayLeft = scores.filter((s) => s.fairway_hit === 'left').length;
    const fairwayRight = scores.filter((s) => s.fairway_hit === 'right').length;
    const fairwayHit = scores.filter((s) => s.fairway_hit === 'hit').length;
    const fairwayTotal = Math.max(fairwayLeft + fairwayRight + fairwayHit, 1);

    const girLeft = scores.filter((s) => s.gir === false && s.gir_miss_direction === 'left').length;
    const girRight = scores.filter((s) => s.gir === false && s.gir_miss_direction === 'right').length;
    const girShort = scores.filter((s) => s.gir === false && s.gir_miss_direction === 'short').length;
    const girLong = scores.filter((s) => s.gir === false && s.gir_miss_direction === 'long').length;
    const girMissTotal = Math.max(girLeft + girRight + girShort + girLong, 1);

    return {
      totalRounds, avgScore, bestScore, handicapIndex, firPct, girPct, avgPutts,
      birdies, pars, bogeys, doubles, totalScoredHoles,
      fairwayLeft: Math.round((fairwayLeft / fairwayTotal) * 100),
      fairwayHit: Math.round((fairwayHit / fairwayTotal) * 100),
      fairwayRight: Math.round((fairwayRight / fairwayTotal) * 100),
      girLeft: Math.round((girLeft / girMissTotal) * 100),
      girRight: Math.round((girRight / girMissTotal) * 100),
      girShort: Math.round((girShort / girMissTotal) * 100),
      girLong: Math.round((girLong / girMissTotal) * 100),
    };
  }, [rounds, scores, holePars, storedHandicap]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Stats</Text>
        <Text style={styles.headerSub}>Nambour Golf Club</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color={Colors.green} size="large" style={{ marginTop: 40 }} />
        ) : !stats ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No completed rounds yet.</Text>
            <Text style={styles.emptySubText}>Finish a round to see your stats here.</Text>
          </View>
        ) : (
          <>
            {/* Handicap hero */}
            <View style={styles.handicapCard}>
              <Text style={styles.handicapLabel}>Handicap Index</Text>
              <Text style={styles.handicapValue}>
                {stats.handicapIndex != null ? stats.handicapIndex.toFixed(1) : '-'}
              </Text>
              <Text style={styles.handicapSub}>Based on {stats.totalRounds} round{stats.totalRounds !== 1 ? 's' : ''}</Text>
            </View>

            {/* Stats grid */}
            <View style={styles.statsGrid}>
              {[
                { label: 'Scoring Avg', value: stats.avgScore ?? '-' },
                { label: 'Best Round', value: stats.bestScore ?? '-', color: Colors.green },
                { label: 'FIR %', value: `${stats.firPct}%` },
                { label: 'GIR %', value: `${stats.girPct}%` },
                { label: 'Avg Putts', value: stats.avgPutts },
                { label: 'Total Rounds', value: stats.totalRounds },
              ].map(({ label, value, color }) => (
                <View key={label} style={styles.statItem}>
                  <Text style={[styles.statValue, color ? { color } : {}]}>{value}</Text>
                  <Text style={styles.statLabel}>{label}</Text>
                </View>
              ))}
            </View>

            {/* Scoring distribution */}
            {stats.totalScoredHoles > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Scoring Distribution</Text>
                <BarChart
                  max={100}
                  data={[
                    { label: 'Birdie-', value: Math.round((stats.birdies / stats.totalScoredHoles) * 100), color: Colors.birdie },
                    { label: 'Par', value: Math.round((stats.pars / stats.totalScoredHoles) * 100), color: Colors.scorePar },
                    { label: 'Bogey', value: Math.round((stats.bogeys / stats.totalScoredHoles) * 100), color: Colors.bogey },
                    { label: 'Double+', value: Math.round((stats.doubles / stats.totalScoredHoles) * 100), color: Colors.doublePlus },
                  ]}
                />
              </View>
            )}

            {/* Miss patterns */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Miss Patterns</Text>
              <Text style={styles.cardSubTitle}>Fairways</Text>
              <BarChart
                max={100}
                data={[
                  { label: 'Left', value: stats.fairwayLeft, color: Colors.orange },
                  { label: 'Hit', value: stats.fairwayHit, color: Colors.scorePar },
                  { label: 'Right', value: stats.fairwayRight, color: Colors.orange },
                ]}
              />
              <View style={styles.cardDivider} />
              <Text style={styles.cardSubTitle}>Greens</Text>
              <BarChart
                max={100}
                data={[
                  { label: 'Short', value: stats.girShort, color: Colors.orange },
                  { label: 'Left', value: stats.girLeft, color: Colors.orange },
                  { label: 'Right', value: stats.girRight, color: Colors.orange },
                  { label: 'Long', value: stats.girLong, color: Colors.orange },
                ]}
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  header: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text },
  headerSub: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  scroll: { flex: 1 },
  content: { padding: Spacing.base, gap: Spacing.base, paddingBottom: Spacing.xxl },
  empty: { alignItems: 'center', paddingTop: 60, gap: Spacing.sm },
  emptyText: { fontSize: FontSize.md, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  emptySubText: { fontSize: FontSize.sm, color: Colors.textMuted },

  handicapCard: {
    backgroundColor: Colors.surface1,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.green,
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.base,
  },
  handicapLabel: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  handicapValue: { fontSize: 72, fontWeight: FontWeight.black, color: Colors.green, lineHeight: 80 },
  handicapSub: { fontSize: FontSize.sm, color: Colors.textMuted },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  statItem: {
    width: '33.33%',
    alignItems: 'center',
    paddingVertical: Spacing.base,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statValue: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center' },

  card: {
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    gap: Spacing.md,
  },
  cardTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cardSubTitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.xs },
  cardDivider: { height: 1, backgroundColor: Colors.border },
});

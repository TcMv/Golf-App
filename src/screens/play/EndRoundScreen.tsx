import React, { useCallback, useMemo, useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useRound } from '../../context/RoundContext';
import { useAuth } from '../../context/AuthContext';
import { calcDifferential } from '../../lib/handicap';
import { callOpenAI, buildDebriefPrompt } from '../../utils/anthropic';
import { processRoundFinish, type NewBadge } from '../../utils/gamification';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

type RootStackParamList = {
  PlayHome: undefined;
  StartRound: undefined;
  ActiveRound: undefined;
  EndRound: undefined;
  RoundDetail: { roundId: string };
};
type Nav = NativeStackNavigationProp<RootStackParamList>;

function ScoreCell({ score, par }: { score: number | null; par: number }) {
  if (score === null) return <Text style={styles.scoreCellEmpty}>-</Text>;
  const diff = score - par;
  let color = Colors.textSecondary;
  if (diff <= -1) color = Colors.birdie;
  else if (diff === 0) color = Colors.scorePar;
  else if (diff === 1) color = Colors.bogey;
  else color = Colors.doublePlus;
  const label = diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`;
  return (
    <View style={[styles.scoreCell, { borderColor: color + '55' }]}>
      <Text style={[styles.scoreCellText, { color }]}>{score}</Text>
      <Text style={[styles.scoreCellDiff, { color }]}>{label}</Text>
    </View>
  );
}

export default function EndRoundScreen() {
  const navigation = useNavigation<Nav>();
  const { activeRound, endRound } = useRound();
  const { user, profile } = useAuth();

  const [roundSaved, setRoundSaved] = useState(false);
  const [finishLoading, setFinishLoading] = useState(false);
  const [debriefLoading, setDebriefLoading] = useState(false);
  const [debriefTips, setDebriefTips] = useState<string | null>(null);
  const [xpGained, setXpGained] = useState<number | null>(null);
  const [newBadges, setNewBadges] = useState<NewBadge[]>([]);

  const holes = activeRound?.holes ?? [];
  const scores = activeRound?.scores ?? {};

  const stats = useMemo(() => {
    let totalScore = 0;
    let toPar = 0;
    let fir = 0;
    let firTotal = 0;
    let gir = 0;
    let girTotal = 0;
    let totalPutts = 0;
    let totalPenalties = 0;
    let birdie = 0;
    let parCount = 0;
    let bogey = 0;
    let doublePlus = 0;

    for (const hole of holes) {
      const s = scores[hole.number];
      if (!s) continue;
      const g = s.gross_score;
      if (g != null) {
        totalScore += g;
        const diff = g - hole.par;
        toPar += diff;
        if (diff <= -1) birdie++;
        else if (diff === 0) parCount++;
        else if (diff === 1) bogey++;
        else doublePlus++;
      }
      if (hole.par >= 4) { firTotal++; if (s.fairway_hit === 'hit') fir++; }
      girTotal++;
      if (s.gir === true) gir++;
      totalPutts += s.putts ?? 0;
      totalPenalties += s.penalties ?? 0;
    }

    return { totalScore, toPar, fir, firTotal, gir, girTotal, totalPutts, totalPenalties, birdie, parCount, bogey, doublePlus };
  }, [holes, scores]);

  const differential = useMemo(() => {
    if (!activeRound || stats.totalScore === 0) return null;
    const { slope_rating, course_rating } = activeRound.teeSet;
    return calcDifferential(stats.totalScore, course_rating, slope_rating);
  }, [activeRound, stats]);

  const toParLabel = stats.toPar === 0 ? 'E'
    : stats.toPar > 0 ? `+${stats.toPar}`
    : `${stats.toPar}`;

  const handleGoHome = useCallback(() => {
    endRound();
    navigation.reset({ index: 0, routes: [{ name: 'PlayHome' }] });
  }, [endRound, navigation]);

  const handleFinish = useCallback(async () => {
    if (!activeRound) return;
    setFinishLoading(true);
    try {
      const { error } = await supabase
        .from('rounds')
        .update({
          completed: true,
          gross_total: stats.totalScore || null,
          handicap_differential: differential != null ? Math.round(differential * 10) / 10 : null,
        })
        .eq('id', activeRound.round.id);

      if (error) {
        Alert.alert('Error', 'Failed to save round: ' + error.message);
        return;
      }

      // Upsert hole scores (safe even if auto-saved during active round)
      const scoreRows = holes
        .filter((h) => scores[h.number]?.gross_score != null)
        .map((h) => ({
          round_id: activeRound.round.id,
          hole_id: h.id,
          hole_number: h.number,
          ...scores[h.number],
        }));

      if (scoreRows.length > 0) {
        await supabase.from('hole_scores').upsert(scoreRows, { onConflict: 'round_id,hole_number' });
      }

      setRoundSaved(true);

      // Gamification: XP + badges
      if (user?.id) {
        try {
          const girPct2 = stats.girTotal > 0 ? Math.round((stats.gir / stats.girTotal) * 100) : 0;
          const result = await processRoundFinish(user.id, activeRound.round.date, {
            birdies: stats.birdie,
            eagles: 0,
            pars: stats.parCount,
            bogeys: stats.bogey,
            doublePlus: stats.doublePlus,
            girPct: girPct2,
            totalPutts: stats.totalPutts,
            holesPlayed: holes.length,
          });
          setXpGained(result.xpGained);
          setNewBadges(result.newBadges);
        } catch {
          // non-critical — swallow silently
        }
      }

      // Fetch AI debrief tips
      setDebriefLoading(true);
      try {
        const girPct = stats.girTotal > 0 ? Math.round((stats.gir / stats.girTotal) * 100) : 0;
        const firPct = stats.firTotal > 0 ? Math.round((stats.fir / stats.firTotal) * 100) : 0;
        const { system, user: userMsg } = buildDebriefPrompt({
          totalScore: stats.totalScore,
          toPar: stats.toPar,
          girPct,
          firPct,
          totalPutts: stats.totalPutts,
          handicapIndex: profile?.handicap_index ?? null,
          courseName: activeRound.course.name,
          differential,
        });
        const tips = await callOpenAI(system, userMsg);
        setDebriefTips(tips);
      } catch {
        setDebriefTips('Could not load tips. Check EXPO_PUBLIC_ANTHROPIC_API_KEY.');
      } finally {
        setDebriefLoading(false);
      }
    } finally {
      setFinishLoading(false);
    }
  }, [activeRound, stats, differential, holes, scores, profile]);

  const handleDiscard = useCallback(() => {
    Alert.alert(
      'Discard Round',
      'This will permanently delete the round. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            if (activeRound) {
              await supabase.from('rounds').delete().eq('id', activeRound.round.id);
            }
            endRound();
            navigation.reset({ index: 0, routes: [{ name: 'PlayHome' }] });
          },
        },
      ],
    );
  }, [activeRound, endRound, navigation]);

  if (!activeRound) {
    return (
      <View style={styles.noRound}>
        <Text style={styles.noRoundText}>No round to finish</Text>
      </View>
    );
  }

  const dateLabel = (() => {
    try { return format(new Date(activeRound.round.date), 'EEEE d MMMM yyyy'); }
    catch { return activeRound.round.date; }
  })();

  const front9 = holes.filter((h) => h.number <= 9);
  const back9 = holes.filter((h) => h.number > 9);
  const front9Total = front9.reduce((s, h) => s + (scores[h.number]?.gross_score ?? 0), 0);
  const back9Total = back9.reduce((s, h) => s + (scores[h.number]?.gross_score ?? 0), 0);
  const front9Par = front9.reduce((s, h) => s + h.par, 0);
  const back9Par = back9.reduce((s, h) => s + h.par, 0);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Round Complete</Text>
        <Text style={styles.headerDate}>{dateLabel}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Score hero */}
        <View style={styles.heroCard}>
          <Text style={styles.heroScore}>{stats.totalScore || '-'}</Text>
          <View style={[styles.toParBadge, {
            backgroundColor: stats.toPar < 0 ? Colors.birdie + '22'
              : stats.toPar === 0 ? Colors.scorePar + '22'
              : Colors.bogey + '22'
          }]}>
            <Text style={[styles.toParText, {
              color: stats.toPar < 0 ? Colors.birdie
                : stats.toPar === 0 ? Colors.scorePar
                : stats.toPar === 1 ? Colors.bogey
                : Colors.doublePlus
            }]}>{toParLabel}</Text>
          </View>
          <Text style={styles.heroLabel}>{activeRound.course.name} · White Tees</Text>
        </View>

        {/* Scorecard table */}
        <View style={styles.tableCard}>
          {/* Front 9 */}
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderText}>FRONT 9</Text>
          </View>
          {front9.map((hole) => (
            <View key={hole.number} style={styles.tableRow}>
              <Text style={styles.tableHole}>{hole.number}</Text>
              <Text style={styles.tablePar}>Par {hole.par}</Text>
              <View style={styles.tableScoreCell}>
                <ScoreCell score={scores[hole.number]?.gross_score ?? null} par={hole.par} />
              </View>
            </View>
          ))}
          <View style={[styles.tableRow, styles.tableSubtotal]}>
            <Text style={styles.tableHole}>OUT</Text>
            <Text style={styles.tablePar}>Par {front9Par}</Text>
            <Text style={styles.tableTotal}>{front9Total || '-'}</Text>
          </View>

          {/* Back 9 */}
          {back9.length > 0 && (
            <>
              <View style={styles.tableHeader}>
                <Text style={styles.tableHeaderText}>BACK 9</Text>
              </View>
              {back9.map((hole) => (
                <View key={hole.number} style={styles.tableRow}>
                  <Text style={styles.tableHole}>{hole.number}</Text>
                  <Text style={styles.tablePar}>Par {hole.par}</Text>
                  <View style={styles.tableScoreCell}>
                    <ScoreCell score={scores[hole.number]?.gross_score ?? null} par={hole.par} />
                  </View>
                </View>
              ))}
              <View style={[styles.tableRow, styles.tableSubtotal]}>
                <Text style={styles.tableHole}>IN</Text>
                <Text style={styles.tablePar}>Par {back9Par}</Text>
                <Text style={styles.tableTotal}>{back9Total || '-'}</Text>
              </View>
            </>
          )}

          {/* Grand total */}
          <View style={[styles.tableRow, styles.tableFinalTotal]}>
            <Text style={styles.tableHole}>TOTAL</Text>
            <Text style={styles.tablePar}>Par {front9Par + back9Par}</Text>
            <Text style={styles.tableTotalFinal}>{stats.totalScore || '-'}</Text>
          </View>
        </View>

        {/* Round stats */}
        <View style={styles.statsGrid}>
          {[
            { label: 'FIR', value: stats.firTotal > 0 ? `${Math.round((stats.fir / stats.firTotal) * 100)}%` : '-' },
            { label: 'GIR', value: stats.girTotal > 0 ? `${Math.round((stats.gir / stats.girTotal) * 100)}%` : '-' },
            { label: 'Putts', value: stats.totalPutts || '-' },
            { label: 'Penalties', value: stats.totalPenalties },
          ].map(({ label, value }) => (
            <View key={label} style={styles.statItem}>
              <Text style={styles.statValue}>{value}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Handicap */}
        {!activeRound.round.exclude_from_handicap && differential != null && (
          <View style={styles.handicapCard}>
            <Text style={styles.handicapTitle}>Handicap Differential</Text>
            <Text style={styles.handicapValue}>{differential.toFixed(1)}</Text>
            <Text style={styles.handicapNote}>
              (113 / {activeRound.teeSet.slope_rating}) × ({stats.totalScore} − {activeRound.teeSet.course_rating.toFixed(1)})
            </Text>
          </View>
        )}

        {activeRound.round.exclude_from_handicap && (
          <View style={styles.practiceNote}>
            <Text style={styles.practiceNoteText}>Practice round — excluded from handicap</Text>
          </View>
        )}

        {/* XP gained */}
        {roundSaved && xpGained != null && (
          <View style={styles.xpCard}>
            <Text style={styles.xpLabel}>XP EARNED</Text>
            <Text style={styles.xpValue}>+{xpGained} XP</Text>
          </View>
        )}

        {/* New badges */}
        {newBadges.length > 0 && (
          <View style={styles.badgesCard}>
            <Text style={styles.badgesTitle}>🏅 ACHIEVEMENT UNLOCKED</Text>
            {newBadges.map(b => (
              <View key={b.key} style={styles.badgeRow}>
                <Text style={styles.badgeIcon}>{b.icon}</Text>
                <View style={styles.badgeText}>
                  <Text style={styles.badgeName}>{b.name}</Text>
                  <Text style={styles.badgeDesc}>{b.description}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* AI Debrief */}
        {roundSaved && (
          <View style={styles.debriefCard}>
            <View style={styles.debriefHeader}>
              <Text style={styles.debriefIcon}>🤖</Text>
              <Text style={styles.debriefTitle}>AI COACH TIPS</Text>
            </View>
            {debriefLoading ? (
              <ActivityIndicator color={Colors.green} style={styles.debriefSpinner} />
            ) : debriefTips ? (
              <Text style={styles.debriefTips}>{debriefTips}</Text>
            ) : null}
          </View>
        )}

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>

      {/* Footer buttons */}
      <View style={styles.footer}>
        {roundSaved ? (
          <TouchableOpacity style={styles.finishBtn} onPress={handleGoHome} activeOpacity={0.8}>
            <Text style={styles.finishBtnText}>Back to Home</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.discardBtn} onPress={handleDiscard} activeOpacity={0.8}>
              <Text style={styles.discardBtnText}>Discard</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.finishBtn, finishLoading && { opacity: 0.7 }]}
              onPress={handleFinish}
              activeOpacity={0.8}
              disabled={finishLoading}
            >
              {finishLoading
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.finishBtnText}>Finish Round</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  noRound: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  noRoundText: { fontSize: FontSize.base, color: Colors.textMuted },
  header: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text, fontFamily: Font.bold },
  headerDate: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2, fontFamily: Font.regular },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.base },

  heroCard: {
    backgroundColor: Colors.surface1,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    padding: Spacing.xl,
    marginBottom: Spacing.base,
    gap: Spacing.sm,
  },
  heroScore: { fontSize: 72, fontWeight: FontWeight.black, fontFamily: Font.black, color: Colors.text, lineHeight: 80 },
  toParBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  toParText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, fontFamily: Font.bold },
  heroLabel: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: Spacing.sm, fontFamily: Font.regular },

  tableCard: {
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: Spacing.base,
  },
  tableHeader: {
    backgroundColor: Colors.surface2,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  tableHeaderText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    fontFamily: Font.bold,
    color: Colors.textMuted,
    letterSpacing: 0.6,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  tableSubtotal: { backgroundColor: Colors.surface2 },
  tableFinalTotal: { backgroundColor: Colors.surface3 },
  tableHole: { width: 44, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, fontFamily: Font.semibold, color: Colors.text },
  tablePar: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, fontFamily: Font.regular },
  tableScoreCell: { width: 64, alignItems: 'flex-end' },
  tableTotal: { width: 64, textAlign: 'right', fontSize: FontSize.base, fontWeight: FontWeight.bold, fontFamily: Font.bold, color: Colors.text },
  tableTotalFinal: { width: 64, textAlign: 'right', fontSize: FontSize.lg, fontWeight: FontWeight.black, fontFamily: Font.black, color: Colors.text },
  scoreCell: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: 'center',
  },
  scoreCellText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, fontFamily: Font.bold },
  scoreCellDiff: { fontSize: FontSize.xs, fontFamily: Font.medium },
  scoreCellEmpty: { fontSize: FontSize.sm, color: Colors.textMuted, fontFamily: Font.regular },

  statsGrid: {
    flexDirection: 'row',
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.base,
    overflow: 'hidden',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.base,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  statValue: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, fontFamily: Font.bold, color: Colors.text },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4, fontFamily: Font.medium },

  handicapCard: {
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.green,
    padding: Spacing.base,
    alignItems: 'center',
    marginBottom: Spacing.base,
  },
  handicapTitle: { fontSize: FontSize.sm, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, fontFamily: Font.medium },
  handicapValue: { fontSize: FontSize.xxxl, fontWeight: FontWeight.black, fontFamily: Font.black, color: Colors.green, marginTop: Spacing.xs },
  handicapNote: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.sm, textAlign: 'center', fontFamily: Font.regular },

  practiceNote: {
    backgroundColor: Colors.surface1,
    borderRadius: Radius.md,
    padding: Spacing.base,
    alignItems: 'center',
    marginBottom: Spacing.base,
  },
  practiceNoteText: { fontSize: FontSize.sm, color: Colors.textMuted, fontFamily: Font.regular },

  xpCard: {
    backgroundColor: Colors.greenMuted,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.green + '55',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  xpLabel: {
    fontSize: FontSize.xs,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    color: Colors.green,
    letterSpacing: 0.8,
  },
  xpValue: {
    fontSize: FontSize.lg,
    fontFamily: Font.black,
    fontWeight: FontWeight.black,
    color: Colors.green,
  },
  badgesCard: {
    backgroundColor: Colors.surface2,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.yellow + '44',
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  badgesTitle: {
    fontSize: 10,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    color: Colors.yellow,
    letterSpacing: 0.8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  badgeIcon: { fontSize: 28 },
  badgeText: { flex: 1 },
  badgeName: {
    fontSize: FontSize.base,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  badgeDesc: {
    fontSize: FontSize.xs,
    fontFamily: Font.regular,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  debriefCard: {
    backgroundColor: Colors.surface2,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.green + '44',
    padding: Spacing.base,
    marginBottom: Spacing.base,
    gap: Spacing.sm,
  },
  debriefHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  debriefIcon: { fontSize: 18 },
  debriefTitle: {
    fontSize: 10,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    color: Colors.green,
    letterSpacing: 0.8,
  },
  debriefSpinner: { marginVertical: Spacing.base },
  debriefTips: {
    fontSize: FontSize.sm,
    fontFamily: Font.regular,
    color: Colors.text,
    lineHeight: 20,
  },

  footer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.base,
    paddingBottom: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  discardBtn: {
    flex: 1,
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.redMuted,
    borderWidth: 1,
    borderColor: Colors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, fontFamily: Font.semibold, color: Colors.red },
  finishBtn: {
    flex: 2,
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, fontFamily: Font.bold, color: '#000' },
});

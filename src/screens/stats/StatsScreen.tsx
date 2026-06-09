import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { calcHandicapIndex } from '../../lib/handicap';
import {
  calculateClubDistanceStats,
  calculatePerformanceAnalytics,
} from '../../utils/statsAnalytics';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import type { HoleScore, Round, Club } from '../../types';
import { convertDistance, distanceUnitLabel } from '../../utils/units';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Types
type TabKey = 'dashboard' | 'history' | 'handicap' | 'clubs';

interface RoundRow extends Round {
  course_name: string;
  par_total: number | null;
  holes?: { par: number; number: number }[];
}

interface CalculatedRound extends RoundRow {
  firPct: number;
  girPct: number;
  totalPutts: number;
}

// ---------------------------------------------------------------------------
// Custom Chart Components
// ---------------------------------------------------------------------------

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) {
    return <Text style={chartStyles.noData}>—</Text>;
  }
  const width = 80;
  const height = 24;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((val, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <View style={{ width, height, justifyContent: 'center' }}>
      <Svg width={width} height={height}>
        <Polyline points={points} fill="none" stroke={color} strokeWidth={2} />
      </Svg>
    </View>
  );
}

function HandicapLineChart({ data, width, height }: { data: number[]; width: number; height: number }) {
  if (data.length === 0) {
    return (
      <View style={[chartStyles.emptyChart, { width, height }]}>
        <Text style={chartStyles.emptyChartText}>No differentials recorded</Text>
      </View>
    );
  }

  const paddingLeft = 32;
  const paddingRight = 16;
  const paddingTop = 24;
  const paddingBottom = 24;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const range = maxVal - minVal || 1;

  const getX = (index: number) => paddingLeft + (index / Math.max(1, data.length - 1)) * chartWidth;
  const getY = (val: number) => paddingTop + chartHeight - ((val - minVal) / range) * chartHeight;

  const points = data.map((val, index) => `${getX(index)},${getY(val)}`).join(' ');

  // Color code trend: green if trending down, red if up
  const isTrendingDown = data.length >= 2 ? data[data.length - 1] < data[0] : true;
  const lineColor = isTrendingDown ? Colors.green : Colors.red;

  const bestDiff = minVal;
  const worstDiff = maxVal;
  const currentDiff = data[data.length - 1];

  return (
    <View style={{ width, height, marginVertical: Spacing.sm }}>
      <Svg width={width} height={height}>
        {/* Horizontal grid lines */}
        {[0, 0.5, 1].map((ratio, i) => {
          const val = minVal + ratio * range;
          const y = getY(val);
          return (
            <React.Fragment key={i}>
              <Line
                x1={paddingLeft}
                y1={y}
                x2={width - paddingRight}
                y2={y}
                stroke={Colors.border}
                strokeWidth={1}
                strokeDasharray="4, 4"
              />
              <SvgText
                x={5}
                y={y + 4}
                fill={Colors.textMuted}
                fontSize={9}
                fontFamily={Font.regular}
              >
                {val.toFixed(1)}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* Main trend line */}
        <Polyline points={points} fill="none" stroke={lineColor} strokeWidth={2.5} />

        {/* Differential circles */}
        {data.map((val, index) => {
          const cx = getX(index);
          const cy = getY(val);
          const isBest = val === bestDiff;
          const isWorst = val === worstDiff;
          const isCurrent = index === data.length - 1;

          let circleColor = Colors.text;
          let radius = 4;
          if (isCurrent) { circleColor = Colors.green; radius = 6; }
          else if (isBest) { circleColor = Colors.yellow; radius = 5; }
          else if (isWorst) { circleColor = Colors.red; radius = 5; }

          return (
            <React.Fragment key={index}>
              <Circle
                cx={cx}
                cy={cy}
                r={radius}
                fill={circleColor}
                stroke={Colors.bg}
                strokeWidth={1.5}
              />
              {isBest && (
                <SvgText
                  x={cx}
                  y={Math.max(10, cy - 9)}
                  fill={Colors.yellow}
                  fontSize={8}
                  fontFamily={Font.bold}
                  textAnchor="middle"
                >
                  BEST
                </SvgText>
              )}
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

function ParAveragesChart({ data }: { data: { label: string; value: number }[] }) {
  const width = SCREEN_WIDTH - 64;
  const height = 90;
  const barHeight = 16;
  const maxVal = Math.max(...data.map(d => d.value), 6); // Cap min scale to 6 shots

  return (
    <View style={{ width, height, marginVertical: Spacing.sm }}>
      <Svg width={width} height={height}>
        {data.map((item, index) => {
          const y = index * 28;
          const barWidth = maxVal > 0 ? (item.value / maxVal) * (width - 110) : 0;
          return (
            <React.Fragment key={item.label}>
              {/* Label */}
              <SvgText
                x={0}
                y={y + 12}
                fill={Colors.textSecondary}
                fontSize={12}
                fontFamily={Font.medium}
              >
                {item.label}
              </SvgText>

              {/* Bar track */}
              <Rect
                x={60}
                y={y}
                width={width - 110}
                height={barHeight}
                rx={4}
                fill={Colors.surface3}
              />

              {/* Bar fill */}
              <Rect
                x={60}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={4}
                fill={Colors.green}
              />

              {/* Value text */}
              <SvgText
                x={width - 40}
                y={y + 12}
                fill={Colors.text}
                fontSize={12}
                fontFamily={Font.bold}
                fontWeight="700"
              >
                {item.value.toFixed(2)}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  noData: { color: Colors.textMuted, fontSize: FontSize.xs, fontStyle: 'italic' },
  emptyChart: { justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.surface2, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  emptyChartText: { color: Colors.textMuted, fontSize: FontSize.sm, fontFamily: Font.regular },
});

// ---------------------------------------------------------------------------
// Scorecard Grid Component
// ---------------------------------------------------------------------------

function ScorecardGrid({ round, scores }: { round: CalculatedRound; scores: HoleScore[] }) {
  const roundScores = scores.filter(s => s.round_id === round.id);
  const roundHolePars = Object.fromEntries((round.holes ?? []).map(hole => [hole.number, hole.par]));
  const scoreMap: Record<number, HoleScore> = {};
  roundScores.forEach(s => {
    scoreMap[s.hole_number] = s;
  });

  const getScoreColor = (score: number, par: number) => {
    const diff = score - par;
    if (diff <= -2) return Colors.yellow;
    if (diff === -1) return Colors.green;
    if (diff === 0) return Colors.text;
    if (diff === 1) return Colors.orange;
    return Colors.red;
  };

  const getScoreBg = (score: number, par: number) => {
    const diff = score - par;
    if (diff <= -2) return Colors.yellowMuted;
    if (diff === -1) return Colors.greenMuted;
    if (diff === 0) return 'transparent';
    if (diff === 1) return Colors.orangeMuted;
    return Colors.redMuted;
  };

  const renderHalf = (holesRange: number[], subtotalLabel: string) => {
    const subPar = holesRange.reduce((sum, h) => sum + (roundHolePars[h] ?? 0), 0);
    const subScore = holesRange.reduce((sum, h) => sum + (scoreMap[h]?.gross_score ?? 0), 0);
    const subPutts = holesRange.reduce((sum, h) => sum + (scoreMap[h]?.putts ?? 0), 0);

    return (
      <View style={gridStyles.halfContainer}>
        {/* Header Row */}
        <View style={gridStyles.row}>
          <Text style={[gridStyles.cell, gridStyles.headerCell]}>Hole</Text>
          {holesRange.map(h => (
            <Text key={h} style={[gridStyles.cell, gridStyles.headerCell]}>{h}</Text>
          ))}
          <Text style={[gridStyles.cell, gridStyles.headerCell, gridStyles.subtotalCell]}>{subtotalLabel}</Text>
        </View>

        {/* Par Row */}
        <View style={gridStyles.row}>
          <Text style={gridStyles.cell}>Par</Text>
          {holesRange.map(h => (
            <Text key={h} style={gridStyles.cell}>{roundHolePars[h] ?? '-'}</Text>
          ))}
          <Text style={[gridStyles.cell, gridStyles.subtotalCell]}>{subPar}</Text>
        </View>

        {/* Score Row */}
        <View style={gridStyles.row}>
          <Text style={gridStyles.cell}>Score</Text>
          {holesRange.map(h => {
            const par = roundHolePars[h] ?? 4;
            const s = scoreMap[h]?.gross_score;
            if (s == null) return <Text key={h} style={gridStyles.cell}>-</Text>;
            return (
              <View key={h} style={[gridStyles.cell, { backgroundColor: getScoreBg(s, par), borderRadius: 4, justifyContent: 'center' }]}>
                <Text style={{ color: getScoreColor(s, par), fontWeight: FontWeight.bold, fontSize: FontSize.sm, textAlign: 'center' }}>
                  {s}
                </Text>
              </View>
            );
          })}
          <Text style={[gridStyles.cell, gridStyles.subtotalCell, { fontWeight: FontWeight.bold }]}>{subScore}</Text>
        </View>

        {/* Putts Row */}
        <View style={gridStyles.row}>
          <Text style={gridStyles.cell}>Putts</Text>
          {holesRange.map(h => (
            <Text key={h} style={gridStyles.cell}>{scoreMap[h]?.putts ?? '-'}</Text>
          ))}
          <Text style={[gridStyles.cell, gridStyles.subtotalCell]}>{subPutts}</Text>
        </View>
      </View>
    );
  };

  const playedHoles = (round.holes ?? []).map(hole => hole.number);
  const firstHalf = playedHoles.slice(0, 9);
  const secondHalf = playedHoles.slice(9, 18);
  const totalPar = playedHoles.reduce((sum, hole) => sum + (roundHolePars[hole] ?? 0), 0);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={gridStyles.scroll}>
      <View style={gridStyles.container}>
        {renderHalf(firstHalf, round.holes_played === 9 ? 'TOT' : 'OUT')}
        {secondHalf.length > 0 && (
          <>
            <View style={{ height: Spacing.xs }} />
            {renderHalf(secondHalf, 'IN')}
          </>
        )}

        {/* Total stats footer */}
        <View style={gridStyles.totalSummary}>
          <Text style={gridStyles.totalSummaryText}>
            Par: <Text style={{ color: Colors.text, fontWeight: FontWeight.semibold }}>{totalPar}</Text>
          </Text>
          <Text style={gridStyles.totalSummaryText}>
            Total: <Text style={{ color: Colors.green, fontWeight: FontWeight.black }}>{round.gross_total ?? '-'}</Text> ({round.gross_total != null ? (round.gross_total - totalPar > 0 ? `+${round.gross_total - totalPar}` : round.gross_total - totalPar === 0 ? 'E' : round.gross_total - totalPar) : '-'})
          </Text>
          <Text style={gridStyles.totalSummaryText}>
            Putts: <Text style={{ color: Colors.text, fontWeight: FontWeight.semibold }}>{round.totalPutts ?? '-'}</Text>
          </Text>
          <Text style={gridStyles.totalSummaryText}>
            GIR: <Text style={{ color: Colors.text, fontWeight: FontWeight.semibold }}>{round.girPct}%</Text>
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const gridStyles = StyleSheet.create({
  scroll: { marginVertical: Spacing.sm },
  container: { paddingRight: Spacing.base },
  halfContainer: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface2,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.border },
  cell: {
    width: 34,
    height: 28,
    lineHeight: 28,
    textAlign: 'center',
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  headerCell: {
    backgroundColor: Colors.surface3,
    color: Colors.textMuted,
    fontWeight: FontWeight.bold,
  },
  subtotalCell: {
    width: 38,
    backgroundColor: Colors.surface3,
    color: Colors.text,
    borderRightWidth: 0,
  },
  totalSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.surface2,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: Spacing.xs,
  },
  totalSummaryText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
});

// ---------------------------------------------------------------------------
// Main Stats Screen Component
// ---------------------------------------------------------------------------

export default function StatsScreen() {
  const { user, profile } = useAuth();
  const units = profile?.units_preference ?? 'metres';

  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');

  // Data State
  const [rawRounds, setRawRounds] = useState<RoundRow[]>([]);
  const [scores, setScores] = useState<HoleScore[]>([]);
  const [holePars, setHolePars] = useState<Record<number, number>>({});
  const [userClubs, setUserClubs] = useState<any[]>([]);
  const [gpsAverages, setGpsAverages] = useState<Record<string, {
    average: number;
    stddev: number;
    samples: number;
  }>>({});
  const [loading, setLoading] = useState(true);
  const [storedHandicap, setStoredHandicap] = useState<string | null>(null);

  // Expanded Scorecards
  const [expandedRoundId, setExpandedRoundId] = useState<string | null>(null);

  // Target Handicap Simulator State
  const [targetHandicap, setTargetHandicap] = useState('');

  // Club Edit Modal State
  const [editingClub, setEditingClub] = useState<any | null>(null);
  const [editCarryDist, setEditCarryDist] = useState('');
  const [updatingClubCarry, setUpdatingClubCarry] = useState(false);

  // ---------------------------------------------------------------------------
  // Data Fetching & Seeding
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [
        { data: roundsData },
        { data: scoresData },
        { data: settingsData },
        { data: userClubsData },
        { data: globalClubsData },
        { data: shotsData },
      ] = await Promise.all([
        supabase
          .from('rounds')
          .select('id, course_id, tee_set_id, date, holes_played, exclude_from_handicap, gross_total, net_total, handicap_differential, completed, courses:course_id ( name ), holes:course_id ( number, par )')
          .eq('user_id', user.id)
          .eq('completed', true)
          .order('date', { ascending: false }),
        supabase
          .from('hole_scores')
          .select('id, round_id, hole_number, gross_score, fairway_hit, gir, putts'),
        supabase
          .from('profiles')
          .select('handicap_index')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('user_clubs')
          .select('id, user_id, club_name, carry_distance_metres, total_distance_metres, created_at')
          .eq('user_id', user.id),
        supabase
          .from('clubs')
          .select('id, name')
          .order('sort_order'),
        supabase
          .from('shots')
          .select('club_id, club_name, distance_metres')
          .not('distance_metres', 'is', null),
      ]);

      // Process Rounds Data
      const processedRounds: RoundRow[] = (roundsData ?? []).map((r: any) => {
        const start = r.starting_hole ?? 1;
        const sequence = r.holes_played === 9
          ? Array.from({ length: 9 }, (_, index) => start + index)
          : Array.from({ length: 18 }, (_, index) => ((start - 1 + index) % 18) + 1);
        const hList = (r.holes ?? []).filter((hole: { number: number }) => sequence.includes(hole.number));
        const parTotal = hList.length > 0 ? hList.reduce((sum: number, h: any) => sum + h.par, 0) : null;
        return {
          ...r,
          holes: hList,
          course_name: r.courses?.name ?? 'Unknown Course',
          par_total: parTotal,
        };
      });
      setRawRounds(processedRounds);

      // Process Hole Scores
      setScores((scoresData ?? []) as HoleScore[]);

      // Use the newest round's course pars as the display fallback. Each
      // calculated round still uses its own joined hole data for analytics.
      const parMap: Record<number, number> = {};
      ((processedRounds[0]?.holes ?? []) as { number: number; par: number }[]).forEach(h => {
        parMap[h.number] = h.par;
      });
      setHolePars(parMap);

      // Handicap setting from profile
      setStoredHandicap(settingsData?.handicap_index != null ? String(settingsData.handicap_index) : null);

      const clubsList = userClubsData ?? [];
      clubsList.sort((a, b) => (b.carry_distance_metres ?? 0) - (a.carry_distance_metres ?? 0));
      setUserClubs(clubsList);

      // Calculate GPS shot averages
      const clubIdToName: Record<string, string> = {};
      (globalClubsData ?? []).forEach(c => {
        clubIdToName[c.id] = c.name;
      });

      const shotDistancesGrouped: Record<string, number[]> = {};
      (shotsData ?? []).forEach(s => {
        const name = s.club_name ?? (s.club_id ? clubIdToName[s.club_id] : null);
        if (name) {
          if (!shotDistancesGrouped[name]) shotDistancesGrouped[name] = [];
          shotDistancesGrouped[name].push(s.distance_metres);
        }
      });

      const gpsAvgs: Record<string, { average: number; stddev: number; samples: number }> = {};
      Object.keys(shotDistancesGrouped).forEach(name => {
        const stats = calculateClubDistanceStats(shotDistancesGrouped[name]);
        if (stats) gpsAvgs[name] = stats;
      });
      setGpsAverages(gpsAvgs);

    } catch {
      Alert.alert('Load Error', 'Could not load your statistics. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // Calculations
  // ---------------------------------------------------------------------------

  const calculatedRounds = useMemo((): CalculatedRound[] => {
    return rawRounds.map(r => {
      const roundScores = scores.filter(s => s.round_id === r.id);
      const roundHoles = r.holes ?? [];

      let firHoles = 0;
      let firHit = 0;
      let girHit = 0;
      let totalPutts = 0;

      roundScores.forEach(s => {
        const h = roundHoles.find(ho => ho.number === s.hole_number);
        const par = h?.par ?? holePars[s.hole_number] ?? 4;
        if (par >= 4) {
          firHoles++;
          if (s.fairway_hit === 'hit') firHit++;
        }
        if (s.gir === true) girHit++;
        totalPutts += s.putts ?? 0;
      });

      const firPct = firHoles > 0 ? Math.round((firHit / firHoles) * 100) : 0;
      const girPct = roundHoles.length > 0 ? Math.round((girHit / roundHoles.length) * 100) : 0;

      return {
        ...r,
        firPct,
        girPct,
        totalPutts,
      };
    });
  }, [rawRounds, scores, holePars]);

  const stats = useMemo(() => {
    const totalRounds = calculatedRounds.length;
    if (totalRounds === 0) return null;

    const withScore = calculatedRounds.filter(r => r.gross_total != null);
    const avgScore = withScore.length > 0
      ? Math.round(withScore.reduce((sum, r) => sum + r.gross_total!, 0) / withScore.length)
      : null;
    const bestScore = withScore.length > 0
      ? Math.min(...withScore.map(r => r.gross_total!))
      : null;

    // Calc Handicap Index using WHS best 8 of last 20
    const differentials = calculatedRounds
      .filter(r => r.handicap_differential != null && !r.exclude_from_handicap)
      .map(r => r.handicap_differential as number);
    const handicapIndex = calcHandicapIndex(differentials) ?? (storedHandicap ? parseFloat(storedHandicap) : null);

    const performance = calculatePerformanceAnalytics(
      calculatedRounds.map(round => ({
        id: round.id,
        courseName: round.course_name,
        holes: round.holes ?? [],
      })),
      scores,
      20,
    );

    return {
      totalRounds,
      avgScore,
      bestScore,
      handicapIndex,
      firPct: performance.firPct,
      girPct: performance.girPct,
      avgPutts: performance.avgPutts?.toFixed(1) ?? '—',
      parAverages: performance.parAverages,
      bestHoles: performance.bestHoles,
      worstHoles: performance.worstHoles,
    };
  }, [calculatedRounds, scores, storedHandicap]);

  // Last 20 rounds data arrays for sparklines (chronological)
  const last20Rounds = useMemo(() => {
    return [...calculatedRounds].slice(0, 20).reverse();
  }, [calculatedRounds]);

  const sparklineFIR = useMemo(() => last20Rounds.map(r => r.firPct), [last20Rounds]);
  const sparklineGIR = useMemo(() => last20Rounds.map(r => r.girPct), [last20Rounds]);
  const sparklinePutts = useMemo(() => last20Rounds.map(r => r.totalPutts), [last20Rounds]);
  const diffsHistory = useMemo(() => {
    return last20Rounds
      .filter(r => r.handicap_differential !== null && !r.exclude_from_handicap)
      .map(r => r.handicap_differential as number);
  }, [last20Rounds]);

  // Target handicap projector logic
  const projectedRounds = useMemo(() => {
    if (!targetHandicap || isNaN(parseFloat(targetHandicap))) return null;
    const target = parseFloat(targetHandicap);

    // Get newest-first differentials
    const activeDiffs = calculatedRounds
      .filter(r => r.handicap_differential !== null && !r.exclude_from_handicap)
      .map(r => r.handicap_differential as number)
      .slice(0, 20); // Last 20

    if (activeDiffs.length === 0) return 'No round data';

    const calculateIndexFromDiffs = (dList: number[]) => {
      const sorted = [...dList].sort((a, b) => a - b);
      const count = sorted.length;
      let useCount = 1;
      if (count < 3) return null;
      else if (count <= 6) useCount = 1;
      else if (count <= 8) useCount = 2;
      else if (count <= 11) useCount = 3;
      else if (count <= 14) useCount = 4;
      else if (count <= 16) useCount = 5;
      else if (count <= 18) useCount = 6;
      else if (count === 19) useCount = 7;
      else useCount = 8;

      const best = sorted.slice(0, useCount);
      const avg = best.reduce((sum, d) => sum + d, 0) / useCount;
      return Math.floor(avg * 10) / 10;
    };

    let currentIndex = calculateIndexFromDiffs(activeDiffs);
    if (currentIndex !== null && currentIndex <= target) return 0;

    let simulated = [...activeDiffs];
    let roundsNeeded = 0;

    // Simulating replacement of old rounds with a round of 'target' diff
    while (roundsNeeded < 20) {
      simulated.unshift(target);
      if (simulated.length > 20) {
        simulated.pop();
      }
      roundsNeeded++;
      const index = calculateIndexFromDiffs(simulated);
      if (index !== null && index <= target) {
        return roundsNeeded;
      }
    }
    return '20+ rounds';
  }, [calculatedRounds, targetHandicap]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const openClubEdit = (club: any) => {
    setEditingClub(club);
    setEditCarryDist(club.carry_distance_metres?.toString() ?? '');
  };

  const saveClubCarry = async () => {
    if (!editingClub || !user) return;
    const parsed = parseInt(editCarryDist, 10);
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert('Invalid Carry', 'Please enter a valid carry distance in metres.');
      return;
    }

    setUpdatingClubCarry(true);
    try {
      const { error } = await supabase
        .from('user_clubs')
        .update({ carry_distance_metres: parsed })
        .eq('id', editingClub.id);

      if (error) throw error;

      // Update local state
      setUserClubs(prev => prev
        .map(c => c.id === editingClub.id ? { ...c, carry_distance_metres: parsed } : c)
        .sort((a, b) => (b.carry_distance_metres ?? 0) - (a.carry_distance_metres ?? 0))
      );
      setEditingClub(null);
    } catch (e: any) {
      Alert.alert('Save Error', e.message ?? 'Could not update carry distance.');
    } finally {
      setUpdatingClubCarry(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Tab Renderers
  // ---------------------------------------------------------------------------

  const renderDashboard = () => {
    if (!stats) return null;
    return (
      <View style={styles.tabContainer}>
        {/* Metric Cards with Sparklines */}
        <View style={styles.metricGrid}>
          {/* FIR% Card */}
          <View style={styles.sparklineCard}>
            <View style={styles.sparklineCardHeader}>
              <Text style={styles.sparklineCardValue}>{stats.firPct}%</Text>
              <Text style={styles.sparklineCardLabel}>Avg FIR</Text>
            </View>
            <Sparkline data={sparklineFIR} color={Colors.green} />
          </View>

          {/* GIR% Card */}
          <View style={styles.sparklineCard}>
            <View style={styles.sparklineCardHeader}>
              <Text style={styles.sparklineCardValue}>{stats.girPct}%</Text>
              <Text style={styles.sparklineCardLabel}>Avg GIR</Text>
            </View>
            <Sparkline data={sparklineGIR} color={Colors.green} />
          </View>

          {/* Putts Card */}
          <View style={styles.sparklineCard}>
            <View style={styles.sparklineCardHeader}>
              <Text style={styles.sparklineCardValue}>{stats.avgPutts}</Text>
              <Text style={styles.sparklineCardLabel}>Avg Putts</Text>
            </View>
            <Sparkline data={sparklinePutts} color={Colors.green} />
          </View>
        </View>

        {/* Scoring average by Par type (Bar Chart) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Scoring Average by Par Type</Text>
          <ParAveragesChart data={stats.parAverages} />
        </View>

        {/* Best / Worst Holes lists */}
        <View style={styles.holesSplitRow}>
          {/* Best Holes */}
          <View style={[styles.card, { flex: 1 }]}>
            <Text style={[styles.cardTitle, { color: Colors.green }]}>Best Holes</Text>
            <View style={styles.holesList}>
              {stats.bestHoles.map(h => (
                <View key={h.key} style={styles.holeStatRow}>
                  <View>
                    <Text style={styles.holeText}>Hole {h.holeNumber} (Par {h.par})</Text>
                    <Text style={styles.holeCourse}>{h.courseName} · {h.rounds} rounds</Text>
                  </View>
                  <Text style={[styles.holeVal, { color: Colors.green }]}>
                    {h.average.toFixed(1)} ({h.diff === 0 ? 'E' : h.diff > 0 ? `+${h.diff.toFixed(1)}` : h.diff.toFixed(1)})
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Worst Holes */}
          <View style={[styles.card, { flex: 1 }]}>
            <Text style={[styles.cardTitle, { color: Colors.red }]}>Worst Holes</Text>
            <View style={styles.holesList}>
              {stats.worstHoles.map(h => (
                <View key={h.key} style={styles.holeStatRow}>
                  <View>
                    <Text style={styles.holeText}>Hole {h.holeNumber} (Par {h.par})</Text>
                    <Text style={styles.holeCourse}>{h.courseName} · {h.rounds} rounds</Text>
                  </View>
                  <Text style={[styles.holeVal, { color: Colors.red }]}>
                    {h.average.toFixed(1)} (+{h.diff.toFixed(1)})
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderHistory = () => {
    return (
      <View style={styles.tabContainer}>
        <FlatList
          data={calculatedRounds}
          keyExtractor={r => r.id}
          scrollEnabled={false}
          renderItem={({ item: round }) => {
            const isExpanded = expandedRoundId === round.id;
            const parDiff = round.gross_total && round.par_total ? round.gross_total - round.par_total : null;
            const diffLabel = parDiff === null ? '—' : parDiff === 0 ? 'E' : parDiff > 0 ? `+${parDiff}` : String(parDiff);
            const scoreColor = parDiff === null ? Colors.textMuted : parDiff < 0 ? Colors.green : parDiff === 0 ? Colors.text : Colors.orange;

            return (
              <View style={styles.historyCard}>
                <TouchableOpacity
                  style={styles.historyCardHeader}
                  onPress={() => setExpandedRoundId(isExpanded ? null : round.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.historyCardLeft}>
                    <Text style={styles.historyCardDate}>
                      {format(new Date(round.date), 'dd MMM yyyy')}
                    </Text>
                    <Text style={styles.historyCardCourse}>{round.course_name}</Text>
                    {round.handicap_differential !== null && (
                      <Text style={styles.historyCardDiff}>Diff: {round.handicap_differential.toFixed(1)}</Text>
                    )}
                  </View>
                  <View style={styles.historyCardRight}>
                    <View style={styles.historyScoreBox}>
                      <Text style={styles.historyScoreText}>{round.gross_total ?? '—'}</Text>
                      <Text style={[styles.historyDiffText, { color: scoreColor }]}>({diffLabel})</Text>
                    </View>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={Colors.textMuted}
                    />
                  </View>
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.expandedScorecard}>
                    <ScorecardGrid round={round} scores={scores} />
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No completed rounds found</Text>
            </View>
          }
        />
      </View>
    );
  };

  const renderHandicap = () => {
    const isTrendingDown = diffsHistory.length >= 2 ? diffsHistory[diffsHistory.length - 1] < diffsHistory[0] : true;
    const trendIcon = isTrendingDown ? 'trending-down' : 'trending-up';
    const trendColor = isTrendingDown ? Colors.green : Colors.red;
    const trendLabel = isTrendingDown ? 'Handicap trending down (Improving)' : 'Handicap trending up';
    const currentDiff = diffsHistory.at(-1) ?? null;
    const bestDiff = diffsHistory.length > 0 ? Math.min(...diffsHistory) : null;
    const worstDiff = diffsHistory.length > 0 ? Math.max(...diffsHistory) : null;

    return (
      <View style={styles.tabContainer}>
        {/* Handicap Chart */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Differential History (Last 20 Rounds)</Text>
          <HandicapLineChart data={diffsHistory} width={SCREEN_WIDTH - 32} height={180} />
          <View style={styles.handicapLegend}>
            {[
              { label: 'Current', value: currentDiff, color: Colors.green },
              { label: 'Best', value: bestDiff, color: Colors.yellow },
              { label: 'Worst', value: worstDiff, color: Colors.red },
            ].map(item => (
              <View key={item.label} style={styles.handicapLegendItem}>
                <View style={[styles.handicapLegendDot, { backgroundColor: item.color }]} />
                <Text style={styles.handicapLegendLabel}>{item.label}</Text>
                <Text style={styles.handicapLegendValue}>
                  {item.value != null ? item.value.toFixed(1) : '—'}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.trendStrip}>
            <Ionicons name={trendIcon} size={16} color={trendColor} />
            <Text style={[styles.trendLabel, { color: trendColor }]}>{trendLabel}</Text>
          </View>
        </View>

        {/* Target handicap projection calculator */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Handicap Index Projection</Text>
          <Text style={styles.inputHint}>
            Simulate how many rounds shooting your target differential it takes to lower your handicap.
          </Text>

          <View style={styles.projectionRow}>
            <View style={styles.projectionInputBox}>
              <Text style={styles.projectionInputLabel}>Target Index</Text>
              <TextInput
                style={styles.projectionInput}
                value={targetHandicap}
                onChangeText={setTargetHandicap}
                placeholder="e.g. 12.0"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.projectionResultBox}>
              {projectedRounds !== null ? (
                <Text style={styles.projectionResultValue}>
                  {projectedRounds === 0 ? 'Goal Reached! 🎉' : projectedRounds}
                </Text>
              ) : (
                <Text style={styles.projectionResultValue}>—</Text>
              )}
              <Text style={styles.projectionResultLabel}>Rounds Needed</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderClubs = () => {
    return (
      <View style={styles.tabContainer}>
        <View style={styles.clubHelpCard}>
          <Text style={styles.cardTitle}>Update My Distances</Text>
          <Text style={styles.clubHelpText}>
            Select one club at a time to update manual carry. GPS averages replace manual carry
            when tracked shots are available.
          </Text>
        </View>
        <FlatList
          data={userClubs}
          keyExtractor={c => c.id}
          scrollEnabled={false}
          renderItem={({ item: club }) => {
            const gpsStats = gpsAverages[club.club_name];
            const effectiveCarry = gpsStats?.average ?? club.carry_distance_metres;
            return (
              <TouchableOpacity
                style={styles.clubRow}
                onPress={() => openClubEdit(club)}
                activeOpacity={0.7}
              >
                <View style={styles.clubInfo}>
                  <Text style={styles.clubIcon}>🏌️</Text>
                  <Text style={styles.clubName}>{club.club_name}</Text>
                </View>
                <View style={styles.clubDistances}>
                  <View style={styles.distanceColumn}>
                    <Text style={[styles.distanceVal, gpsStats && { color: Colors.green }]}>
                      {effectiveCarry != null ? convertDistance(effectiveCarry, units) : '—'}
                      {effectiveCarry != null ? distanceUnitLabel(units, true) : ''}
                    </Text>
                    <Text style={styles.distanceLabel}>{gpsStats ? 'GPS Carry' : 'Manual Carry'}</Text>
                  </View>
                  <View style={styles.distanceColumn}>
                    <Text style={styles.distanceVal}>
                      {gpsStats ? `±${convertDistance(gpsStats.stddev, units)}${distanceUnitLabel(units, true)}` : '—'}
                    </Text>
                    <Text style={styles.distanceLabel}>
                      {gpsStats ? `${gpsStats.samples} shots` : 'Dispersion'}
                    </Text>
                  </View>
                  <Ionicons name="create-outline" size={16} color={Colors.green} style={styles.editIcon} />
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No clubs in bag</Text>
            </View>
          }
        />
      </View>
    );
  };

  // ---------------------------------------------------------------------------
  // Main Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Stats</Text>
        <Text style={styles.headerSub}>Your completed rounds</Text>
      </View>

      {/* Tabs Menu */}
      <View style={styles.tabsRow}>
        {(['dashboard', 'history', 'handicap', 'clubs'] as TabKey[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabButtonText, activeTab === tab && styles.tabButtonTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color={Colors.green} size="large" style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Handicap Hero Card shown on all tabs */}
            {activeTab !== 'clubs' && stats && (
              <View style={styles.handicapCard}>
                <Text style={styles.handicapLabel}>Handicap Index</Text>
                <Text style={styles.handicapValue}>
                  {stats.handicapIndex != null ? stats.handicapIndex.toFixed(1) : '—'}
                </Text>
                <Text style={styles.handicapSub}>Based on {stats.totalRounds} rounds</Text>
              </View>
            )}

            {/* Tab specific content */}
            {activeTab === 'dashboard' && renderDashboard()}
            {activeTab === 'history' && renderHistory()}
            {activeTab === 'handicap' && renderHandicap()}
            {activeTab === 'clubs' && renderClubs()}
          </>
        )}
      </ScrollView>

      {/* Edit Club Carry Modal */}
      <Modal
        visible={editingClub !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingClub(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Edit {editingClub?.club_name} Carry</Text>
            <Text style={styles.modalDesc}>Set your manual carry distance (metres).</Text>

            <TextInput
              style={styles.modalInput}
              value={editCarryDist}
              onChangeText={setEditCarryDist}
              keyboardType="number-pad"
              autoFocus
              placeholder="e.g. 150"
              placeholderTextColor={Colors.textMuted}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setEditingClub(null)}
                disabled={updatingClubCarry}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnSave]}
                onPress={saveClubCarry}
                disabled={updatingClubCarry}
              >
                {updatingClubCarry ? (
                  <ActivityIndicator color={Colors.bg} size="small" />
                ) : (
                  <Text style={styles.modalBtnSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Main Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  header: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text, fontFamily: Font.bold },
  headerSub: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2, fontFamily: Font.regular },

  // Top Tabs
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface1,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  tabButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radius.md,
  },
  tabButtonActive: {
    backgroundColor: Colors.surface2,
    borderBottomWidth: 2,
    borderBottomColor: Colors.green,
  },
  tabButtonText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
    fontFamily: Font.semibold,
  },
  tabButtonTextActive: {
    color: Colors.green,
  },

  scroll: { flex: 1 },
  content: { padding: Spacing.base, gap: Spacing.base, paddingBottom: Spacing.xxl },

  // Handicap Hero Card
  handicapCard: {
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.green,
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.base,
  },
  handicapLabel: { fontSize: FontSize.xs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: Font.bold },
  handicapValue: { fontSize: FontSize.xxxl, fontWeight: FontWeight.black, color: Colors.green, lineHeight: 56, fontFamily: Font.black, letterSpacing: -0.96 },
  handicapSub: { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: Font.regular },

  // General Card
  card: {
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
  },
  cardTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.md,
    fontFamily: Font.bold,
  },
  tabContainer: { gap: Spacing.base },

  // Dashboard Sparkline Grid
  metricGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  sparklineCard: {
    flex: 1,
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 96,
  },
  sparklineCardHeader: {
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  sparklineCardValue: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    fontFamily: Font.bold,
  },
  sparklineCardLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: Font.regular,
    marginTop: 1,
  },

  // Dashboard Holes Split
  holesSplitRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  holesList: {
    gap: Spacing.sm,
  },
  holeStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  holeText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontFamily: Font.regular },
  holeCourse: { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: Font.regular, marginTop: 2 },
  holeVal: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, fontFamily: Font.bold },

  // History Card
  historyCard: {
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  historyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.base,
  },
  historyCardLeft: {
    flex: 1,
    gap: 2,
  },
  historyCardDate: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: Font.medium,
  },
  historyCardCourse: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
    fontFamily: Font.semibold,
  },
  historyCardDiff: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontFamily: Font.regular,
  },
  historyCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  historyScoreBox: {
    alignItems: 'flex-end',
  },
  historyScoreText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    fontFamily: Font.bold,
  },
  historyDiffText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    fontFamily: Font.medium,
  },
  expandedScorecard: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.base,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },

  // Handicap Trend
  trendStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    backgroundColor: Colors.surface2,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
  },
  trendLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    fontFamily: Font.semibold,
  },
  handicapLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  handicapLegendItem: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface2,
  },
  handicapLegendDot: { width: 8, height: 8, borderRadius: Radius.full, marginBottom: 4 },
  handicapLegendLabel: { color: Colors.textMuted, fontFamily: Font.medium, fontSize: FontSize.xs },
  handicapLegendValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.sm, marginTop: 2 },

  // Target input projection
  inputHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 16,
    marginBottom: Spacing.md,
    fontFamily: Font.regular,
  },
  projectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  projectionInputBox: {
    flex: 1,
    gap: Spacing.xs,
  },
  projectionInputLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontFamily: Font.bold,
  },
  projectionInput: {
    height: 44,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    color: Colors.text,
    fontSize: FontSize.md,
    fontFamily: Font.medium,
  },
  projectionResultBox: {
    width: 120,
    alignItems: 'center',
    backgroundColor: Colors.surface2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
  },
  projectionResultValue: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.green,
    fontFamily: Font.bold,
  },
  projectionResultLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: Font.regular,
    marginTop: 2,
  },

  // Club Row
  clubHelpCard: {
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface1,
  },
  clubHelpText: {
    color: Colors.textSecondary,
    fontFamily: Font.regular,
    fontSize: FontSize.sm,
    lineHeight: 19,
    marginTop: Spacing.xs,
  },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
  },
  clubInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  clubIcon: {
    fontSize: FontSize.md,
  },
  clubName: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
    fontFamily: Font.semibold,
  },
  clubDistances: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
  },
  distanceColumn: {
    alignItems: 'flex-end',
    width: 60,
  },
  distanceVal: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
    fontFamily: Font.bold,
  },
  distanceLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontFamily: Font.regular,
    marginTop: 1,
  },
  editIcon: {
    marginLeft: Spacing.xs,
  },

  // Empty List Fallback
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontFamily: Font.regular,
  },

  // Edit carry distance modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.backdrop,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modal: {
    width: '100%',
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
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
    fontFamily: Font.regular,
  },
  modalInput: {
    height: 48,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    paddingHorizontal: Spacing.md,
    textAlign: 'center',
    fontFamily: Font.bold,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnCancel: {
    backgroundColor: Colors.surface3,
  },
  modalBtnCancelText: {
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    fontFamily: Font.semibold,
  },
  modalBtnSave: {
    backgroundColor: Colors.green,
  },
  modalBtnSaveText: {
    color: Colors.bg,
    fontWeight: FontWeight.bold,
    fontFamily: Font.bold,
  },
});

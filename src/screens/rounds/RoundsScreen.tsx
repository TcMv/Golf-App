import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { format, isThisMonth, isThisYear } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import type { Round } from '../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RootStackParamList = {
  PlayHome: undefined;
  StartRound: undefined;
  ActiveRound: undefined;
  EndRound: undefined;
  RoundDetail: { roundId: string };
  Rounds: undefined;
  Stats: undefined;
  Settings: undefined;
  MyBag: undefined;
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

type FilterKey = 'all' | 'month' | 'year';

interface RoundRow extends Round {
  course_name: string;
  par_total: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'EEE d MMM yyyy');
  } catch {
    return dateStr;
  }
}

function toParLabel(gross: number | null, par: number | null): string {
  if (gross === null) return '—';
  const diff = par !== null ? gross - par : null;
  if (diff === null) return String(gross);
  const sign = diff > 0 ? '+' : diff < 0 ? '' : 'E';
  return diff === 0 ? `${gross} (E)` : `${gross} (${sign}${diff})`;
}

function applyFilter(rounds: RoundRow[], filter: FilterKey): RoundRow[] {
  if (filter === 'all') return rounds;
  return rounds.filter((r) => {
    const d = new Date(r.date);
    if (filter === 'month') return isThisMonth(d);
    if (filter === 'year') return isThisYear(d);
    return true;
  });
}

// ---------------------------------------------------------------------------
// RoundCard
// ---------------------------------------------------------------------------

function RoundCard({ item, onPress }: { item: RoundRow; onPress: () => void }) {
  const toPar = toParLabel(item.gross_total, item.par_total);
  const diff =
    item.handicap_differential !== null
      ? `⊘ ${item.handicap_differential.toFixed(1)}`
      : null;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardLeft}>
        <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
        <Text style={styles.cardCourse}>{item.course_name}</Text>
        {diff !== null && <Text style={styles.cardDiff}>{diff}</Text>}
      </View>
      <View style={styles.cardRight}>
        <Text style={styles.cardScore}>{toPar}</Text>
        {item.exclude_from_handicap && (
          <View style={styles.practiceBadge}>
            <Text style={styles.practiceBadgeText}>Practice</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
];

export default function RoundsScreen() {
  const navigation = useNavigation<Nav>();
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');

  const fetchRounds = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('rounds')
        .select(
          `
          *,
          courses:course_id ( name ),
          holes:course_id ( par )
        `,
        )
        .eq('completed', true)
        .order('date', { ascending: false });

      if (error) {
        console.error('Error fetching rounds:', error);
        return;
      }

      // Aggregate par totals from holes
      const rows: RoundRow[] = (data ?? []).map((r: any) => {
        const holesArr: { par: number }[] = r.holes ?? [];
        const parTotal =
          holesArr.length > 0
            ? holesArr.reduce((sum: number, h: { par: number }) => sum + h.par, 0)
            : null;
        return {
          ...r,
          course_name: r.courses?.name ?? 'Unknown Course',
          par_total: parTotal,
        };
      });

      setRounds(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRounds();
  }, [fetchRounds]);

  const filtered = applyFilter(rounds, filter);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Rounds</Text>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterTabText,
                filter === f.key && styles.filterTabTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.green} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.id}
          contentContainerStyle={
            filtered.length === 0 ? styles.emptyContainer : styles.listContent
          }
          renderItem={({ item }) => (
            <RoundCard
              item={item}
              onPress={() => navigation.navigate('RoundDetail', { roundId: item.id })}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyInner}>
              <Text style={styles.emptyText}>No rounds yet</Text>
              <Text style={styles.emptySubText}>Complete a round to see it here</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.base,
  },
  headerTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.base,
    gap: Spacing.sm,
    marginBottom: Spacing.base,
  },
  filterTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterTabActive: {
    backgroundColor: Colors.green,
    borderColor: Colors.green,
  },
  filterTabText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  filterTabTextActive: {
    color: Colors.bg,
    fontWeight: FontWeight.semibold,
  },
  listContent: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm,
  },
  emptyContainer: {
    flex: 1,
  },
  emptyInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  emptySubText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLeft: {
    flex: 1,
    gap: Spacing.xs,
  },
  cardDate: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  cardCourse: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  cardDiff: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  cardScore: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.text,
  },
  practiceBadge: {
    backgroundColor: Colors.surface3,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  practiceBadgeText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },
});

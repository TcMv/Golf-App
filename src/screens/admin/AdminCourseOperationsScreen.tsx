import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { Colors, Font, FontSize, Radius, Spacing } from '../../constants/theme';

type CourseStatus = 'draft' | 'review' | 'published';
type StatusFilter = 'all' | CourseStatus;

type CourseRow = {
  id: string;
  name: string;
  holes: number;
  publication_status: CourseStatus;
  lat: number | null;
  lng: number | null;
  last_verified_at: string | null;
  created_at: string;
};

type SuggestionRow = { course_id: string; review_status: 'pending' | 'accepted' | 'rejected' };
type ChangeEventRow = { course_id: string; event_type: string; created_at: string };

export default function AdminCourseOperationsScreen() {
  const navigation = useNavigation();
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [pendingByCourse, setPendingByCourse] = useState<Record<string, number>>({});
  const [latestChangeByCourse, setLatestChangeByCourse] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [courseResult, suggestionResult, eventResult] = await Promise.all([
      supabase.from('courses').select('id, name, holes, publication_status, lat, lng, last_verified_at, created_at').order('name'),
      supabase.from('course_mapping_suggestions').select('course_id, review_status').eq('review_status', 'pending'),
      supabase
        .from('course_admin_events')
        .select('course_id, event_type, created_at')
        .neq('event_type', 'course_verified')
        .order('created_at', { ascending: false })
        .limit(1000),
    ]);
    setLoading(false);

    const error = courseResult.error ?? suggestionResult.error ?? eventResult.error;
    if (error) { Alert.alert('Course Operations Error', error.message); return; }

    setCourses((courseResult.data ?? []) as CourseRow[]);
    const counts: Record<string, number> = {};
    for (const row of (suggestionResult.data ?? []) as SuggestionRow[]) counts[row.course_id] = (counts[row.course_id] ?? 0) + 1;
    setPendingByCourse(counts);

    const latest: Record<string, string> = {};
    for (const row of (eventResult.data ?? []) as ChangeEventRow[]) {
      if (!latest[row.course_id]) latest[row.course_id] = row.created_at;
    }
    setLatestChangeByCourse(latest);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const needsVerification = useCallback((course: CourseRow) => {
    const latestChange = latestChangeByCourse[course.id];
    if (!course.last_verified_at) return true;
    return latestChange != null && new Date(latestChange).getTime() > new Date(course.last_verified_at).getTime();
  }, [latestChangeByCourse]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return courses
      .filter(course => filter === 'all' || course.publication_status === filter)
      .filter(course => !needle || course.name.toLowerCase().includes(needle))
      .sort((a, b) => {
        const verifyDiff = Number(needsVerification(b)) - Number(needsVerification(a));
        if (verifyDiff !== 0) return verifyDiff;
        const pendingDiff = (pendingByCourse[b.id] ?? 0) - (pendingByCourse[a.id] ?? 0);
        if (pendingDiff !== 0) return pendingDiff;
        return a.name.localeCompare(b.name);
      });
  }, [courses, filter, needsVerification, pendingByCourse, query]);

  const totals = useMemo(() => ({
    all: courses.length,
    draft: courses.filter(course => course.publication_status === 'draft').length,
    review: courses.filter(course => course.publication_status === 'review').length,
    published: courses.filter(course => course.publication_status === 'published').length,
    pending: Object.values(pendingByCourse).reduce((sum, value) => sum + value, 0),
    verify: courses.filter(needsVerification).length,
  }), [courses, needsVerification, pendingByCourse]);

  const markVerified = useCallback(async (course: CourseRow) => {
    if (verifyingId) return;
    setVerifyingId(course.id);
    const { error } = await supabase.rpc('mark_course_verified', { p_course_id: course.id, p_notes: null });
    setVerifyingId(null);
    if (error) { Alert.alert('Verification failed', error.message); return; }
    await load();
  }, [load, verifyingId]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity>
        <View style={styles.titleWrap}><Text style={styles.headerTitle}>Course Operations</Text><Text style={styles.subtitle}>Admin work queue</Text></View>
        <TouchableOpacity onPress={() => void load()} style={styles.backButton}><Text style={styles.refreshText}>↻</Text></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.metricsRow}>
          <Metric value={totals.all} label="Courses" />
          <Metric value={totals.pending} label="Pending AI" />
          <Metric value={totals.verify} label="Verify" />
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search courses…"
          placeholderTextColor={Colors.textMuted}
          style={styles.search}
          autoCorrect={false}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {(['all', 'draft', 'review', 'published'] as const).map(value => {
            const active = value === filter;
            const count = value === 'all' ? totals.all : totals[value];
            return (
              <TouchableOpacity key={value} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setFilter(value)}>
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{value === 'all' ? 'All' : value} · {count}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? <ActivityIndicator color={Colors.green} style={{ marginTop: Spacing.xl }} /> : visible.length === 0 ? (
          <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No courses match</Text><Text style={styles.emptyText}>Change the search or status filter.</Text></View>
        ) : visible.map(course => {
          const pending = pendingByCourse[course.id] ?? 0;
          const needsCheck = needsVerification(course);
          const latestChange = latestChangeByCourse[course.id];
          const verifiedLabel = course.last_verified_at ? `Verified ${new Date(course.last_verified_at).toLocaleDateString()}` : 'Never verified';
          const changeLabel = latestChange ? `Latest change ${new Date(latestChange).toLocaleDateString()}` : 'No recorded changes';
          return (
            <View key={course.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.courseName}>{course.name}</Text>
                  <Text style={styles.meta}>{course.holes} holes · {verifiedLabel}</Text>
                  {needsCheck && <Text style={styles.changeMeta}>{changeLabel}</Text>}
                </View>
                <View style={styles.pillColumn}>
                  <View style={[styles.statusPill, course.publication_status === 'published' && styles.statusPublished, course.publication_status === 'review' && styles.statusReview]}>
                    <Text style={styles.statusText}>{course.publication_status}</Text>
                  </View>
                  {needsCheck && <View style={styles.verifyPill}><Text style={styles.verifyPillText}>Needs verification</Text></View>}
                </View>
              </View>

              <View style={styles.workRow}>
                <View style={styles.workItem}><Text style={styles.workValue}>{pending}</Text><Text style={styles.workLabel}>pending suggestions</Text></View>
                <View style={styles.workItem}><Text style={styles.workValue}>{course.lat != null && course.lng != null ? '✓' : '—'}</Text><Text style={styles.workLabel}>course centre</Text></View>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => (navigation as any).navigate('AdminCourseValidation')}><Text style={styles.secondaryText}>Readiness</Text></TouchableOpacity>
                {pending > 0 && <TouchableOpacity style={styles.secondaryButton} onPress={() => (navigation as any).navigate('AdminMappingSuggestions')}><Text style={styles.secondaryText}>Review AI</Text></TouchableOpacity>}
                <TouchableOpacity style={[styles.verifyButton, verifyingId === course.id && styles.disabled]} onPress={() => void markVerified(course)} disabled={verifyingId === course.id}>
                  {verifyingId === course.id ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.verifyText}>{needsCheck ? 'Mark verified' : 'Re-verify'}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { color: Colors.text, fontSize: FontSize.xxl },
  refreshText: { color: Colors.green, fontSize: FontSize.xl },
  titleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.lg },
  subtitle: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs },
  content: { padding: Spacing.base, paddingBottom: Spacing.xxl },
  metricsRow: { flexDirection: 'row', gap: Spacing.sm },
  metric: { flex: 1, padding: Spacing.base, borderRadius: Radius.lg, backgroundColor: Colors.surface1, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  metricValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.lg },
  metricLabel: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, marginTop: 3 },
  search: { marginTop: Spacing.md, minHeight: 46, borderRadius: Radius.md, backgroundColor: Colors.surface1, borderWidth: 1, borderColor: Colors.border, color: Colors.text, paddingHorizontal: Spacing.base, fontFamily: Font.regular, fontSize: FontSize.base },
  filterRow: { gap: Spacing.xs, paddingVertical: Spacing.md },
  filterChip: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.greenMuted, borderColor: Colors.green },
  filterText: { color: Colors.textSecondary, fontFamily: Font.medium, fontSize: FontSize.sm, textTransform: 'capitalize' },
  filterTextActive: { color: Colors.green, fontFamily: Font.bold },
  emptyCard: { marginTop: Spacing.md, padding: Spacing.xl, borderRadius: Radius.lg, backgroundColor: Colors.surface1, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  emptyTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.base },
  emptyText: { marginTop: 4, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.sm },
  card: { marginBottom: Spacing.md, padding: Spacing.base, borderRadius: Radius.lg, backgroundColor: Colors.surface1, borderWidth: 1, borderColor: Colors.border },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  courseName: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.base },
  meta: { marginTop: 4, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs },
  changeMeta: { marginTop: 4, color: Colors.yellow, fontFamily: Font.medium, fontSize: FontSize.xs },
  pillColumn: { alignItems: 'flex-end', gap: 5 },
  statusPill: { paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.surface3 },
  statusPublished: { backgroundColor: Colors.greenMuted },
  statusReview: { backgroundColor: Colors.yellowMuted },
  statusText: { color: Colors.textSecondary, fontFamily: Font.bold, fontSize: FontSize.xs, textTransform: 'capitalize' },
  verifyPill: { paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.yellowMuted },
  verifyPillText: { color: Colors.yellow, fontFamily: Font.bold, fontSize: FontSize.xs },
  workRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  workItem: { flex: 1, padding: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.surface2 },
  workValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.md },
  workLabel: { marginTop: 2, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs },
  actions: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.md },
  secondaryButton: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.surface3 },
  secondaryText: { color: Colors.textSecondary, fontFamily: Font.bold, fontSize: FontSize.xs },
  verifyButton: { flex: 1.2, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.green },
  verifyText: { color: Colors.bg, fontFamily: Font.bold, fontSize: FontSize.xs },
  disabled: { opacity: 0.5 },
});

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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import {
  summarizeCoverageBenchmarks,
  type SourceCoverageBenchmarkCourse,
  type SourceCoverageBenchmarkScan,
} from '../../utils/sourceCoverageBenchmarks';
import { Colors, Font, FontSize, Radius, Spacing } from '../../constants/theme';

export default function AdminSourceCoverageBenchmarksScreen() {
  const navigation = useNavigation();
  const [courses, setCourses] = useState<SourceCoverageBenchmarkCourse[]>([]);
  const [scans, setScans] = useState<SourceCoverageBenchmarkScan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [courseResult, scanResult] = await Promise.all([
      supabase.from('courses').select('id, name').order('name'),
      supabase
        .from('course_source_coverage_scans')
        .select('id, course_id, source_provider, scanned_at, source_score, approved_score, suggestions_count, directly_assigned, inferred_assignments, skipped_count, gap_count')
        .order('scanned_at', { ascending: false }),
    ]);
    setLoading(false);
    const error = courseResult.error ?? scanResult.error;
    if (error) {
      Alert.alert('Benchmark data unavailable', `${error.message}\n\nApply the Phase 11 source-coverage benchmark migration if this is a new private build.`);
      return;
    }
    setCourses((courseResult.data ?? []) as SourceCoverageBenchmarkCourse[]);
    setScans((scanResult.data ?? []) as SourceCoverageBenchmarkScan[]);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const summary = useMemo(() => summarizeCoverageBenchmarks(courses, scans), [courses, scans]);
  const benchmarkReady = summary.courseCount >= 5;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity>
        <View style={styles.titleWrap}><Text style={styles.headerTitle}>Coverage Benchmarks</Text><Text style={styles.subtitle}>Evidence for the data-source decision</Text></View>
        <TouchableOpacity onPress={() => void load()} style={styles.backButton}><Text style={styles.refreshText}>↻</Text></TouchableOpacity>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={Colors.green} /></View> : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.notice, benchmarkReady && styles.noticeReady]}>
            <Text style={styles.noticeTitle}>{benchmarkReady ? 'Benchmark sample is becoming useful' : 'Build the evidence set first'}</Text>
            <Text style={styles.noticeText}>
              {benchmarkReady
                ? `${summary.courseCount} courses have saved scans. Keep adding varied courses before making a licensing decision.`
                : `Save scans for at least 5 varied courses before treating the average as decision-grade evidence. Current sample: ${summary.courseCount}.`}
            </Text>
          </View>

          <Text style={styles.sectionLabel}>Portfolio snapshot</Text>
          <View style={styles.metricsRow}><Metric label="Scanned courses" value={String(summary.courseCount)} /><Metric label="Saved scans" value={String(summary.scanCount)} /><Metric label="OSM avg" value={`${summary.averageSourceScore}%`} /></View>
          <View style={styles.metricsRow}><Metric label="Approved avg" value={`${summary.averageApprovedScore}%`} /><Metric label="Inference avg" value={`${summary.averageInferenceRate}%`} /><Metric label="Target sample" value="5–10" /></View>

          <Text style={styles.sectionLabel}>Latest result by course</Text>
          {summary.latestByCourse.length === 0 ? (
            <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No saved coverage scans yet</Text><Text style={styles.emptyText}>Run Source Coverage Lab scans after applying the Phase 11 migration. Saved scans will accumulate here without changing playable geometry.</Text></View>
          ) : summary.latestByCourse.map(row => (
            <View key={row.courseId} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}><Text style={styles.courseName}>{row.courseName}</Text><Text style={styles.meta}>{row.scans} saved scan{row.scans === 1 ? '' : 's'} · latest {new Date(row.latest.scanned_at).toLocaleDateString()}</Text></View>
                <View style={styles.scorePill}><Text style={styles.scorePillValue}>{row.latest.source_score}%</Text><Text style={styles.scorePillLabel}>OSM</Text></View>
              </View>
              <View style={styles.detailRow}><Detail label="Approved" value={`${row.latest.approved_score}%`} /><Detail label="Inferred" value={`${row.inferenceRate}%`} /><Detail label="Gaps" value={String(row.latest.gap_count)} /><Detail label="Features" value={String(row.latest.suggestions_count)} /></View>
            </View>
          ))}

          <Text style={styles.footnote}>Courses are ordered from weakest to strongest OSM structural coverage so the gaps requiring another source or manual work appear first. This dashboard is evidence support, not a recommendation to buy or reject any licence by itself.</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}
function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}><Text style={styles.detailValue}>{value}</Text><Text style={styles.detailLabel}>{label}</Text></View>;
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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.base, paddingBottom: Spacing.xxl },
  notice: { padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.yellow, backgroundColor: Colors.yellowMuted },
  noticeReady: { borderColor: Colors.green, backgroundColor: Colors.greenMuted },
  noticeTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.sm },
  noticeText: { marginTop: 5, color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.xs, lineHeight: 18 },
  sectionLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  metricsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  metric: { flex: 1, padding: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.surface1, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  metricValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.lg },
  metricLabel: { marginTop: 2, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, textAlign: 'center' },
  emptyCard: { padding: Spacing.xl, borderRadius: Radius.lg, backgroundColor: Colors.surface1, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  emptyTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.base },
  emptyText: { marginTop: Spacing.sm, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  card: { marginBottom: Spacing.sm, padding: Spacing.base, borderRadius: Radius.lg, backgroundColor: Colors.surface1, borderWidth: 1, borderColor: Colors.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  courseName: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.base },
  meta: { marginTop: 4, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs },
  scorePill: { minWidth: 58, padding: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.surface3, alignItems: 'center' },
  scorePillValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.base },
  scorePillLabel: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs },
  detailRow: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.md },
  detail: { flex: 1, alignItems: 'center', paddingVertical: Spacing.xs, borderRadius: Radius.md, backgroundColor: Colors.surface2 },
  detailValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.sm },
  detailLabel: { marginTop: 2, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs },
  footnote: { marginTop: Spacing.md, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, lineHeight: 18, textAlign: 'center' },
});

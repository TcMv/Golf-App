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
  buildOverpassGolfQuery,
  convertOverpassGolfToMappingBatch,
  OSM_DATA_LICENSE,
  OSM_PUBLIC_OVERPASS_ENDPOINT,
  type OverpassResponse,
} from '../../utils/osmGolfMapping';
import {
  analyzeSourceCoverage,
  type CoverageHazard,
  type CoverageHole,
  type CoverageZone,
  type SourceCoverageReport,
} from '../../utils/sourceCoverage';
import { Colors, Font, FontSize, Radius, Spacing } from '../../constants/theme';

type CourseRow = { id: string; name: string; holes: number; lat: number | null; lng: number | null };
type SourceMeta = {
  suggestions: number;
  skipped: number;
  directlyAssigned: number;
  inferredAssignments: number;
  scannedAt: string;
  saved: boolean;
  saveError: string | null;
};

export default function AdminSourceCoverageScreen() {
  const navigation = useNavigation();
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [report, setReport] = useState<SourceCoverageReport | null>(null);
  const [sourceMeta, setSourceMeta] = useState<SourceMeta | null>(null);

  const selectedCourse = useMemo(() => courses.find(course => course.id === selectedCourseId) ?? null, [courses, selectedCourseId]);

  const loadCourses = useCallback(async () => {
    const { data, error } = await supabase.from('courses').select('id, name, holes, lat, lng').order('name');
    if (error) { Alert.alert('Course Error', error.message); return; }
    const loaded = (data ?? []) as CourseRow[];
    setCourses(loaded);
    setSelectedCourseId(current => current && loaded.some(course => course.id === current) ? current : loaded[0]?.id ?? null);
  }, []);

  useFocusEffect(useCallback(() => { void loadCourses(); }, [loadCourses]));

  const scan = async () => {
    if (!selectedCourse || scanning) return;
    if (selectedCourse.lat == null || selectedCourse.lng == null) {
      Alert.alert('Course centre required', 'Set the course latitude/longitude before running a source coverage scan.');
      return;
    }

    setScanning(true);
    setReport(null);
    setSourceMeta(null);
    try {
      const scannedAt = new Date().toISOString();
      const query = buildOverpassGolfQuery(selectedCourse.lat, selectedCourse.lng, 1800);
      const [osmResponse, holesResult, zonesResult, hazardsResult] = await Promise.all([
        fetch(OSM_PUBLIC_OVERPASS_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'User-Agent': 'GolfCaddie/1.0 source-coverage-admin',
          },
          body: `data=${encodeURIComponent(query)}`,
        }),
        supabase.from('holes').select('number, tee_lat, tee_lng, green_mid_lat, green_mid_lng').eq('course_id', selectedCourse.id).order('number'),
        supabase.from('hole_zones').select('hole_number, zone_type').eq('course_id', selectedCourse.id),
        supabase.from('hazards').select('hole_number, hole_numbers, type').eq('course_id', selectedCourse.id),
      ]);

      const dbError = holesResult.error ?? zonesResult.error ?? hazardsResult.error;
      if (dbError) throw dbError;
      if (!osmResponse.ok) throw new Error(`Overpass returned HTTP ${osmResponse.status}.`);

      const osm = await osmResponse.json() as OverpassResponse;
      const converted = convertOverpassGolfToMappingBatch({
        courseId: selectedCourse.id,
        courseHoles: selectedCourse.holes,
        response: osm,
        sourceReference: `Coverage scan ${scannedAt}`,
      });
      const nextReport = analyzeSourceCoverage({
        expectedHoles: selectedCourse.holes,
        suggestions: converted.batch.suggestions,
        holes: (holesResult.data ?? []) as CoverageHole[],
        zones: (zonesResult.data ?? []) as CoverageZone[],
        hazards: (hazardsResult.data ?? []) as CoverageHazard[],
      });

      setReport(nextReport);
      const { error: saveError } = await supabase.from('course_source_coverage_scans').insert({
        course_id: selectedCourse.id,
        source_provider: 'OpenStreetMap / Overpass',
        source_license: OSM_DATA_LICENSE,
        scanned_at: scannedAt,
        source_score: nextReport.sourceScore,
        approved_score: nextReport.approvedScore,
        suggestions_count: converted.batch.suggestions.length,
        directly_assigned: converted.directlyAssigned,
        inferred_assignments: converted.inferredAssignments,
        skipped_count: converted.skipped,
        gap_count: nextReport.gaps.length,
        source_feature_counts: nextReport.sourceFeatureCounts,
        hole_summary: nextReport.holes.map(hole => ({
          hole: hole.hole,
          source_score: hole.sourceScore,
          approved_score: hole.approvedScore,
          source_hazards: hole.source.hazards,
          approved_hazards: hole.approved.hazards,
        })),
      });

      setSourceMeta({
        suggestions: converted.batch.suggestions.length,
        skipped: converted.skipped,
        directlyAssigned: converted.directlyAssigned,
        inferredAssignments: converted.inferredAssignments,
        scannedAt,
        saved: !saveError,
        saveError: saveError?.message ?? null,
      });
    } catch (error: any) {
      Alert.alert('Coverage scan failed', error?.message ?? 'Could not complete the source coverage scan.');
    } finally {
      setScanning(false);
    }
  };

  const featureCounts = report ? Object.entries(report.sourceFeatureCounts).sort(([a], [b]) => a.localeCompare(b)) : [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity>
        <View style={styles.titleWrap}><Text style={styles.headerTitle}>Source Coverage Lab</Text><Text style={styles.subtitle}>Read-only OSM coverage measurement</Text></View>
        <TouchableOpacity onPress={() => (navigation as any).navigate('AdminSourceCoverageBenchmarks')} style={styles.backButton}><Text style={styles.chartText}>▦</Text></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Measure before we pay for coverage</Text>
          <Text style={styles.noticeText}>The scan compares OpenStreetMap with approved course geometry. It never queues mapping suggestions or changes playable course data. Phase 11 stores only the resulting benchmark summary.</Text>
          <Text style={styles.attribution}>{OSM_DATA_LICENSE}</Text>
        </View>

        <Text style={styles.sectionLabel}>Course</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {courses.map(course => {
            const active = course.id === selectedCourseId;
            return <TouchableOpacity key={course.id} style={[styles.chip, active && styles.chipActive]} onPress={() => { setSelectedCourseId(course.id); setReport(null); setSourceMeta(null); }}><Text style={[styles.chipText, active && styles.chipTextActive]}>{course.name}</Text></TouchableOpacity>;
          })}
        </ScrollView>

        {selectedCourse && <View style={styles.courseCard}><Text style={styles.courseTitle}>{selectedCourse.name}</Text><Text style={styles.courseMeta}>{selectedCourse.holes} holes · {selectedCourse.lat?.toFixed(5) ?? 'missing'}, {selectedCourse.lng?.toFixed(5) ?? 'missing'}</Text></View>}

        <TouchableOpacity style={[styles.scanButton, (scanning || !selectedCourse) && styles.disabled]} onPress={() => void scan()} disabled={scanning || !selectedCourse}>
          {scanning ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.scanText}>Run & Save Coverage Benchmark</Text>}
        </TouchableOpacity>

        {report && sourceMeta && <>
          <View style={[styles.saveBanner, !sourceMeta.saved && styles.saveBannerError]}>
            <Text style={styles.saveBannerTitle}>{sourceMeta.saved ? 'Benchmark saved' : 'Scan complete — benchmark not saved'}</Text>
            <Text style={styles.saveBannerText}>{sourceMeta.saved ? 'This result is now included in the multi-course benchmark dashboard.' : `${sourceMeta.saveError ?? 'Unknown save error'} Apply the Phase 11 migration, then scan again.`}</Text>
          </View>

          <Text style={styles.sectionLabel}>Coverage summary</Text>
          <View style={styles.metricsRow}><Metric label="OSM structural" value={`${report.sourceScore}%`} /><Metric label="Approved" value={`${report.approvedScore}%`} /><Metric label="Suggestions" value={String(sourceMeta.suggestions)} /></View>
          <View style={styles.metricsRow}><Metric label="Direct refs" value={String(sourceMeta.directlyAssigned)} /><Metric label="Inferred" value={String(sourceMeta.inferredAssignments)} /><Metric label="Skipped" value={String(sourceMeta.skipped)} /></View>
          <Text style={styles.smallNote}>Structural coverage asks whether each hole has tee, green, fairway and centreline classes. Hazard counts are separate. This is not the Course Readiness publishing score.</Text>

          <Text style={styles.sectionLabel}>Source features</Text>
          <View style={styles.card}>{featureCounts.length === 0 ? <Text style={styles.emptyText}>No usable OSM golf features were assigned to holes.</Text> : featureCounts.map(([feature, count]) => <View key={feature} style={styles.countRow}><Text style={styles.countLabel}>{feature.replaceAll('_', ' ')}</Text><Text style={styles.countValue}>{count}</Text></View>)}</View>

          <Text style={styles.sectionLabel}>Hole coverage</Text>
          <View style={styles.card}>
            {report.holes.map(hole => <View key={hole.hole} style={styles.holeRow}>
              <Text style={styles.holeNumber}>H{hole.hole}</Text>
              <View style={styles.holeMetric}><Text style={styles.holeValue}>{hole.sourceScore}%</Text><Text style={styles.holeLabel}>OSM</Text></View>
              <View style={styles.holeMetric}><Text style={styles.holeValue}>{hole.approvedScore}%</Text><Text style={styles.holeLabel}>approved</Text></View>
              <Text style={styles.hazardText}>{hole.source.hazards} src hazards · {hole.approved.hazards} approved</Text>
            </View>)}
          </View>

          <Text style={styles.sectionLabel}>OSM gaps</Text>
          <View style={styles.card}>{report.gaps.length === 0 ? <Text style={styles.successText}>OSM supplied all four structural feature classes for every hole.</Text> : report.gaps.map(gap => <View key={gap.hole} style={styles.gapRow}><Text style={styles.gapHole}>Hole {gap.hole}</Text><Text style={styles.gapText}>Missing: {gap.missing.join(', ')}</Text></View>)}</View>
          <TouchableOpacity style={styles.benchmarkButton} onPress={() => (navigation as any).navigate('AdminSourceCoverageBenchmarks')}><Text style={styles.benchmarkButtonText}>View Multi-Course Benchmarks</Text></TouchableOpacity>
          <Text style={styles.lastRun}>Scanned {new Date(sourceMeta.scannedAt).toLocaleString()}</Text>
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg }, header: { flexDirection: 'row', alignItems: 'center', padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }, backText: { color: Colors.text, fontSize: FontSize.xxl }, chartText: { color: Colors.green, fontSize: FontSize.lg },
  titleWrap: { flex: 1, alignItems: 'center' }, headerTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.lg }, subtitle: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs },
  content: { padding: Spacing.base, paddingBottom: Spacing.xxl }, notice: { padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.green, backgroundColor: Colors.greenMuted },
  noticeTitle: { color: Colors.green, fontFamily: Font.bold, fontSize: FontSize.sm }, noticeText: { marginTop: 5, color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.xs, lineHeight: 18 }, attribution: { marginTop: Spacing.sm, color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.xs },
  sectionLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: Spacing.lg, marginBottom: Spacing.sm }, chipRow: { gap: Spacing.xs },
  chip: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2 }, chipActive: { borderColor: Colors.green, backgroundColor: Colors.greenMuted }, chipText: { color: Colors.textSecondary, fontFamily: Font.medium, fontSize: FontSize.sm }, chipTextActive: { color: Colors.green, fontFamily: Font.bold },
  courseCard: { marginTop: Spacing.md, padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1 }, courseTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.base }, courseMeta: { marginTop: 4, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs },
  scanButton: { marginTop: Spacing.md, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.lg, backgroundColor: Colors.green }, scanText: { color: Colors.bg, fontFamily: Font.bold, fontSize: FontSize.base }, disabled: { opacity: 0.5 },
  saveBanner: { marginTop: Spacing.md, padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.green, backgroundColor: Colors.greenMuted }, saveBannerError: { borderColor: Colors.red, backgroundColor: Colors.surface1 }, saveBannerTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.sm }, saveBannerText: { marginTop: 3, color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.xs },
  metricsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm }, metric: { flex: 1, padding: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.surface1, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }, metricValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.lg }, metricLabel: { marginTop: 2, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, textAlign: 'center' },
  smallNote: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, lineHeight: 18 }, card: { borderRadius: Radius.lg, backgroundColor: Colors.surface1, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' }, countRow: { flexDirection: 'row', justifyContent: 'space-between', padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border }, countLabel: { color: Colors.textSecondary, fontFamily: Font.medium, fontSize: FontSize.sm, textTransform: 'capitalize' }, countValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.sm },
  holeRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.sm }, holeNumber: { width: 32, color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.sm }, holeMetric: { width: 58, alignItems: 'center' }, holeValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.sm }, holeLabel: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs }, hazardText: { flex: 1, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, textAlign: 'right' },
  gapRow: { padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border }, gapHole: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.sm }, gapText: { marginTop: 3, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, textTransform: 'capitalize' }, emptyText: { padding: Spacing.base, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.sm }, successText: { padding: Spacing.base, color: Colors.green, fontFamily: Font.bold, fontSize: FontSize.sm },
  benchmarkButton: { marginTop: Spacing.md, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.surface3 }, benchmarkButtonText: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.sm }, lastRun: { marginTop: Spacing.sm, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, textAlign: 'center' },
});

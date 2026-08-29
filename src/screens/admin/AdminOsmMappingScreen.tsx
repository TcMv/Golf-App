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
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import {
  buildOverpassGolfQuery,
  convertOverpassGolfToMappingBatch,
  OSM_DATA_LICENSE,
  OSM_PUBLIC_OVERPASS_ENDPOINT,
  type OsmConversionResult,
  type OverpassResponse,
} from '../../utils/osmGolfMapping';
import { Colors, Font, FontSize, Radius, Spacing } from '../../constants/theme';

type CourseRow = { id: string; name: string; holes: number; lat: number | null; lng: number | null };
type RouteParams = { courseId?: string; onboarding?: boolean };

export default function AdminOsmMappingScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const params = (route.params ?? {}) as RouteParams;
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(params.courseId ?? null);
  const [fetching, setFetching] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [result, setResult] = useState<OsmConversionResult | null>(null);

  const selectedCourse = useMemo(() => courses.find(course => course.id === selectedCourseId) ?? null, [courses, selectedCourseId]);
  const counts = useMemo(() => {
    const output: Record<string, number> = {};
    for (const suggestion of result?.batch.suggestions ?? []) output[suggestion.feature_type] = (output[suggestion.feature_type] ?? 0) + 1;
    return Object.entries(output).sort(([a], [b]) => a.localeCompare(b));
  }, [result]);

  const loadCourses = useCallback(async () => {
    const { data, error } = await supabase.from('courses').select('id, name, holes, lat, lng').order('name');
    if (error) { Alert.alert('Course Error', error.message); return; }
    const loaded = (data ?? []) as CourseRow[];
    setCourses(loaded);
    setSelectedCourseId(current => {
      const preferred = params.courseId && loaded.some(course => course.id === params.courseId) ? params.courseId : current;
      return preferred && loaded.some(course => course.id === preferred) ? preferred : loaded[0]?.id ?? null;
    });
  }, [params.courseId]);

  useFocusEffect(useCallback(() => { void loadCourses(); }, [loadCourses]));

  const generate = async () => {
    if (!selectedCourse || fetching) return;
    if (selectedCourse.lat == null || selectedCourse.lng == null) {
      Alert.alert('Course centre required', 'Set the course latitude/longitude before generating OpenStreetMap suggestions.');
      return;
    }
    setFetching(true);
    setResult(null);
    try {
      const query = buildOverpassGolfQuery(selectedCourse.lat, selectedCourse.lng, 1800);
      const response = await fetch(OSM_PUBLIC_OVERPASS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': 'GolfCaddie/1.0 course-mapping-admin' },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!response.ok) throw new Error(`Overpass returned HTTP ${response.status}.`);
      const json = await response.json() as OverpassResponse;
      setResult(convertOverpassGolfToMappingBatch({
        courseId: selectedCourse.id,
        courseHoles: selectedCourse.holes,
        response: json,
        sourceReference: `OpenStreetMap via Overpass · fetched ${new Date().toISOString()}`,
      }));
    } catch (error: any) {
      Alert.alert('OSM generation failed', error?.message ?? 'Could not load OpenStreetMap golf data.');
    } finally {
      setFetching(false);
    }
  };

  const queue = async () => {
    if (!result || !selectedCourse || result.batch.suggestions.length === 0 || queueing) return;
    setQueueing(true);
    try {
      const { error } = await supabase.from('course_mapping_suggestions').insert(result.batch.suggestions.map(suggestion => ({
        course_id: result.batch.course_id,
        hole_number: suggestion.hole_number,
        feature_type: suggestion.feature_type,
        geometry_type: suggestion.geometry_type,
        coordinates: suggestion.coordinates,
        confidence: suggestion.confidence,
        source_provider: result.batch.source.provider,
        source_reference: result.batch.source.reference,
        source_license: result.batch.source.license,
        metadata: suggestion.metadata,
        review_status: 'pending',
      })));
      if (error) throw error;
      const courseId = selectedCourse.id;
      const count = result.batch.suggestions.length;
      setResult(null);
      Alert.alert('Suggestions queued', `${count} features are waiting for human review. No playable geometry was changed.`, [
        { text: 'Stay here' },
        { text: 'Review now', onPress: () => (navigation as any).replace('AdminMappingSuggestions', { courseId, onboarding: params.onboarding === true }) },
      ]);
    } catch (error: any) {
      Alert.alert('Queue failed', error?.message ?? 'Could not add OpenStreetMap suggestions to the review queue.');
    } finally {
      setQueueing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity>
        <View style={styles.titleWrap}><Text style={styles.headerTitle}>Generate from OSM</Text><Text style={styles.subtitle}>{params.onboarding ? 'Course onboarding · mapping' : 'Automatic golf geometry'}</Text></View>
        <View style={styles.backButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Testing source · human-reviewed output</Text>
          <Text style={styles.noticeText}>OpenStreetMap data is used here to generate pending suggestions for the private testing workflow. Nothing becomes playable until it is reviewed and accepted.</Text>
          <Text style={styles.attribution}>{OSM_DATA_LICENSE}</Text>
        </View>

        <Text style={styles.sectionLabel}>Course</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {courses.map(course => {
            const active = course.id === selectedCourseId;
            return <TouchableOpacity key={course.id} style={[styles.chip, active && styles.chipActive]} onPress={() => { setSelectedCourseId(course.id); setResult(null); }}><Text style={[styles.chipText, active && styles.chipTextActive]}>{course.name}</Text></TouchableOpacity>;
          })}
        </ScrollView>

        {selectedCourse && <View style={styles.courseCard}><Text style={styles.courseTitle}>{selectedCourse.name}</Text><Text style={styles.courseMeta}>{selectedCourse.holes} holes · centre {selectedCourse.lat?.toFixed(5) ?? 'missing'}, {selectedCourse.lng?.toFixed(5) ?? 'missing'}</Text><Text style={styles.courseMeta}>Search radius: 1.8 km</Text></View>}

        <TouchableOpacity style={[styles.generateButton, (fetching || !selectedCourse) && styles.disabled]} onPress={() => void generate()} disabled={fetching || !selectedCourse}>
          {fetching ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.generateText}>Scan OpenStreetMap Golf Data</Text>}
        </TouchableOpacity>

        {result && <>
          <Text style={styles.sectionLabel}>Generated suggestions</Text>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>{result.batch.suggestions.length} features ready for review</Text>
            <View style={styles.metrics}><Metric label="Direct refs" value={result.directlyAssigned} /><Metric label="Inferred" value={result.inferredAssignments} /><Metric label="Skipped" value={result.skipped} /></View>
            {counts.map(([feature, count]) => <View key={feature} style={styles.countLine}><Text style={styles.countFeature}>{feature.replaceAll('_', ' ')}</Text><Text style={styles.countValue}>{count}</Text></View>)}
          </View>
          {result.issues.length > 0 && <View style={styles.issueCard}>{result.issues.slice(0, 12).map((issue, index) => <Text key={index} style={issue.severity === 'warning' ? styles.warningText : styles.infoText}>{issue.severity === 'warning' ? '⚠' : '•'} {issue.message}</Text>)}</View>}
          <TouchableOpacity style={[styles.queueButton, (queueing || result.batch.suggestions.length === 0) && styles.disabled]} onPress={() => void queue()} disabled={queueing || result.batch.suggestions.length === 0}>
            {queueing ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.queueText}>Queue {result.batch.suggestions.length} for Human Review</Text>}
          </TouchableOpacity>
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { color: Colors.text, fontSize: FontSize.xxl },
  titleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.lg },
  subtitle: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs },
  content: { padding: Spacing.base, paddingBottom: Spacing.xxl },
  notice: { padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.green, backgroundColor: Colors.greenMuted },
  noticeTitle: { color: Colors.green, fontFamily: Font.bold, fontSize: FontSize.sm },
  noticeText: { marginTop: 5, color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.xs, lineHeight: 18 },
  attribution: { marginTop: Spacing.sm, color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.xs },
  sectionLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  chipRow: { gap: Spacing.xs },
  chip: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2 },
  chipActive: { borderColor: Colors.green, backgroundColor: Colors.greenMuted },
  chipText: { color: Colors.textSecondary, fontFamily: Font.medium, fontSize: FontSize.sm },
  chipTextActive: { color: Colors.green, fontFamily: Font.bold },
  courseCard: { marginTop: Spacing.md, padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1 },
  courseTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.base },
  courseMeta: { marginTop: 4, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs },
  generateButton: { marginTop: Spacing.md, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.lg, backgroundColor: Colors.green },
  generateText: { color: Colors.bg, fontFamily: Font.bold, fontSize: FontSize.base },
  summaryCard: { padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1 },
  summaryTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.base },
  metrics: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, marginBottom: Spacing.sm },
  metric: { flex: 1, padding: Spacing.sm, alignItems: 'center', borderRadius: Radius.md, backgroundColor: Colors.surface3 },
  metricValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.lg },
  metricLabel: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs },
  countLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.border },
  countFeature: { color: Colors.textSecondary, fontFamily: Font.medium, fontSize: FontSize.sm, textTransform: 'capitalize' },
  countValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.sm },
  issueCard: { marginTop: Spacing.md, padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1 },
  warningText: { color: Colors.yellow, fontFamily: Font.regular, fontSize: FontSize.xs, marginBottom: 5 },
  infoText: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, marginBottom: 5 },
  queueButton: { marginTop: Spacing.md, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.lg, backgroundColor: Colors.green },
  queueText: { color: Colors.bg, fontFamily: Font.bold, fontSize: FontSize.base },
  disabled: { opacity: 0.5 },
});

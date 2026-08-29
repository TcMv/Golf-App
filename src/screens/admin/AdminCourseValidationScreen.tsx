import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import {
  validateCourseReadiness,
  type CourseValidationHole,
  type CourseValidationResult,
  type CourseValidationZone,
} from '../../utils/courseValidation';

type CourseStatus = 'draft' | 'review' | 'published';
type CourseRow = { id: string; name: string; lat: number | null; lng: number | null; holes: number; publication_status: CourseStatus; created_at: string };
type RouteParams = { courseId?: string; onboarding?: boolean };

const STATUS_LABELS: Record<CourseStatus, string> = { draft: 'Draft', review: 'Ready for review', published: 'Published' };

export default function AdminCourseValidationScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const params = (route.params ?? {}) as RouteParams;
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(params.courseId ?? null);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingValidation, setLoadingValidation] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [result, setResult] = useState<CourseValidationResult | null>(null);

  const selectedCourse = useMemo(() => courses.find(course => course.id === selectedCourseId) ?? null, [courses, selectedCourseId]);

  const loadCourses = useCallback(async () => {
    setLoadingCourses(true);
    const { data, error } = await supabase.from('courses').select('id, name, lat, lng, holes, publication_status, created_at').order('name');
    setLoadingCourses(false);
    if (error) { Alert.alert('Course Error', 'Could not load courses.'); return; }
    const loaded = (data ?? []) as CourseRow[];
    setCourses(loaded);
    setSelectedCourseId(current => {
      const preferred = params.courseId && loaded.some(course => course.id === params.courseId) ? params.courseId : current;
      return preferred && loaded.some(course => course.id === preferred) ? preferred : loaded[0]?.id ?? null;
    });
  }, [params.courseId]);

  const runValidation = useCallback(async (course: CourseRow) => {
    setLoadingValidation(true);
    const [holesResult, teeSetsResult, zonesResult] = await Promise.all([
      supabase.from('holes').select('number, par, stroke_index, white_metres, tee_lat, tee_lng, green_front_lat, green_front_lng, green_mid_lat, green_mid_lng, green_back_lat, green_back_lng').eq('course_id', course.id).order('number'),
      supabase.from('tee_sets').select('id', { count: 'exact', head: true }).eq('course_id', course.id),
      supabase.from('hole_zones').select('hole_number, zone_type, coordinates').eq('course_id', course.id),
    ]);
    setLoadingValidation(false);
    const error = holesResult.error ?? teeSetsResult.error ?? zonesResult.error;
    if (error) { Alert.alert('Validation Error', error.message); setResult(null); return; }
    setResult(validateCourseReadiness({
      expectedHoles: course.holes,
      teeSetCount: teeSetsResult.count ?? 0,
      holes: (holesResult.data ?? []) as CourseValidationHole[],
      zones: (zonesResult.data ?? []) as CourseValidationZone[],
    }));
  }, []);

  const setPublicationStatus = useCallback(async (status: CourseStatus) => {
    if (!selectedCourse || savingStatus) return;
    if ((status === 'review' || status === 'published') && !result?.publishable) {
      Alert.alert('Course not ready', 'Fix all core-data errors before advancing this course.');
      return;
    }
    setSavingStatus(true);
    const { error } = await supabase.from('courses').update({ publication_status: status }).eq('id', selectedCourse.id);
    setSavingStatus(false);
    if (error) { Alert.alert('Status Error', error.message); return; }
    setCourses(current => current.map(course => course.id === selectedCourse.id ? { ...course, publication_status: status } : course));
    if (status === 'published' && params.onboarding) {
      Alert.alert('Course published', `${selectedCourse.name} is now available to golfers.`, [
        { text: 'Stay here' },
        { text: 'Course Operations', onPress: () => (navigation as any).replace('AdminCourseOperations') },
      ]);
    }
  }, [navigation, params.onboarding, result?.publishable, savingStatus, selectedCourse]);

  useEffect(() => { void loadCourses(); }, [loadCourses]);
  useEffect(() => { setResult(null); if (selectedCourse) void runValidation(selectedCourse); }, [runValidation, selectedCourse]);

  const errors = result?.issues.filter(issue => issue.severity === 'error') ?? [];
  const warnings = result?.issues.filter(issue => issue.severity === 'warning') ?? [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity>
        <View style={styles.titleWrap}><Text style={styles.headerTitle}>Course Readiness</Text><Text style={styles.subtitle}>{selectedCourse?.name ?? 'Select a course'}{params.onboarding ? ' · onboarding' : ''}</Text></View>
        <TouchableOpacity style={styles.refreshButton} onPress={() => selectedCourse && void runValidation(selectedCourse)} disabled={!selectedCourse || loadingValidation}><Text style={styles.refreshText}>↻</Text></TouchableOpacity>
      </View>

      {loadingCourses ? <View style={styles.loading}><ActivityIndicator color={Colors.green} /></View> : <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>Course</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.courseRow}>
          {courses.map(course => <TouchableOpacity key={course.id} style={[styles.courseChip, course.id === selectedCourseId && styles.courseChipActive]} onPress={() => setSelectedCourseId(course.id)}><Text style={[styles.courseChipText, course.id === selectedCourseId && styles.courseChipTextActive]}>{course.name}</Text></TouchableOpacity>)}
        </ScrollView>

        {loadingValidation || !result ? <View style={styles.loadingCard}><ActivityIndicator color={Colors.green} /></View> : <>
          <View style={styles.heroCard}>
            <Text style={styles.score}>{result.completeness}%</Text>
            <Text style={styles.scoreLabel}>overall completeness</Text>
            <Text style={[styles.readinessText, result.publishable ? styles.ready : styles.notReady]}>{result.publishable ? 'Core data ready' : 'Core data needs work'}</Text>
            <Text style={styles.heroHint}>Publishing requires the scorecard, tee sets and essential GPS to pass. Rich geometry improves the caddie but remains a separate completeness measure.</Text>
          </View>

          {selectedCourse && <View style={styles.publicationCard}>
            <View style={styles.publicationHeader}><View><Text style={styles.publicationLabel}>Publication status</Text><Text style={styles.publicationStatus}>{STATUS_LABELS[selectedCourse.publication_status]}</Text></View>{savingStatus && <ActivityIndicator color={Colors.green} />}</View>
            <View style={styles.actions}>
              {selectedCourse.publication_status === 'draft' && <Action label="Mark Ready for Review" disabled={!result.publishable || savingStatus} onPress={() => void setPublicationStatus('review')} />}
              {selectedCourse.publication_status === 'review' && <><Action label="Back to Draft" secondary disabled={savingStatus} onPress={() => void setPublicationStatus('draft')} /><Action label="Publish Course" disabled={!result.publishable || savingStatus} onPress={() => void setPublicationStatus('published')} /></>}
              {selectedCourse.publication_status === 'published' && <Action label="Unpublish to Draft" secondary disabled={savingStatus} onPress={() => void setPublicationStatus('draft')} />}
            </View>
          </View>}

          <View style={styles.metricRow}><Metric label="Core" value={`${result.basicCompleteness}%`} /><Metric label="Geometry" value={`${result.geometryCompleteness}%`} /><Metric label="Errors" value={String(result.errors)} /><Metric label="Warnings" value={String(result.warnings)} /></View>
          <Text style={styles.sectionLabel}>Coverage</Text>
          <View style={styles.card}>
            <Coverage label="Hole rows" value={`${result.counts.loadedHoles}/${result.counts.expectedHoles}`} />
            <Coverage label="Tee sets" value={String(result.counts.teeSets)} />
            <Coverage label="Tee GPS" value={`${result.counts.teesMapped}/${result.counts.expectedHoles}`} />
            <Coverage label="Complete green GPS" value={`${result.counts.greensMapped}/${result.counts.expectedHoles}`} />
            <Coverage label="Green polygons" value={String(result.counts.greenPolygons)} />
            <Coverage label="Fairway polygons" value={String(result.counts.fairwayPolygons)} />
            <Coverage label="Centrelines" value={String(result.counts.centrelines)} />
          </View>

          {errors.length > 0 && <><Text style={styles.sectionLabel}>Must fix</Text><View style={styles.card}>{errors.map((issue, index) => <Issue key={`${issue.code}-${index}`} text={issue.message} danger />)}</View></>}
          {warnings.length > 0 && <><Text style={styles.sectionLabel}>Recommended</Text><View style={styles.card}>{warnings.map((issue, index) => <Issue key={`${issue.code}-${index}`} text={issue.message} />)}</View></>}
          {result.issues.length === 0 && <View style={styles.successCard}><Text style={styles.successTitle}>Course data is complete</Text><Text style={styles.successText}>No validation issues were found.</Text></View>}
        </>}
      </ScrollView>}
    </SafeAreaView>
  );
}

function Action({ label, onPress, disabled, secondary = false }: { label: string; onPress: () => void; disabled: boolean; secondary?: boolean }) { return <TouchableOpacity style={[styles.actionButton, secondary && styles.actionSecondary, disabled && styles.disabled]} onPress={onPress} disabled={disabled}><Text style={[styles.actionText, secondary && styles.actionTextSecondary]}>{label}</Text></TouchableOpacity>; }
function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function Coverage({ label, value }: { label: string; value: string }) { return <View style={styles.coverageRow}><Text style={styles.coverageLabel}>{label}</Text><Text style={styles.coverageValue}>{value}</Text></View>; }
function Issue({ text, danger = false }: { text: string; danger?: boolean }) { return <View style={styles.issueRow}><View style={[styles.issueDot, danger ? styles.errorDot : styles.warningDot]} /><Text style={styles.issueText}>{text}</Text></View>; }

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { color: Colors.text, fontSize: FontSize.xxl },
  titleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { color: Colors.text, fontFamily: Font.bold, fontWeight: FontWeight.bold, fontSize: FontSize.lg },
  subtitle: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs },
  refreshButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.surface2 },
  refreshText: { color: Colors.green, fontSize: FontSize.xl },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.base, paddingBottom: Spacing.xxl },
  sectionLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  courseRow: { gap: Spacing.xs },
  courseChip: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border },
  courseChipActive: { backgroundColor: Colors.greenMuted, borderColor: Colors.green },
  courseChipText: { color: Colors.textSecondary, fontFamily: Font.medium, fontSize: FontSize.sm },
  courseChipTextActive: { color: Colors.green, fontFamily: Font.bold },
  loadingCard: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  heroCard: { padding: Spacing.xl, alignItems: 'center', borderRadius: Radius.xl, backgroundColor: Colors.surface1, borderWidth: 1, borderColor: Colors.border },
  score: { color: Colors.text, fontFamily: Font.black, fontSize: 52, fontWeight: FontWeight.black },
  scoreLabel: { color: Colors.textMuted, fontFamily: Font.medium, fontSize: FontSize.sm },
  readinessText: { marginTop: Spacing.md, fontFamily: Font.bold, fontSize: FontSize.sm },
  ready: { color: Colors.green },
  notReady: { color: Colors.red },
  heroHint: { marginTop: Spacing.md, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, textAlign: 'center', lineHeight: 18 },
  publicationCard: { marginTop: Spacing.sm, padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1 },
  publicationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  publicationLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs },
  publicationStatus: { marginTop: 3, color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.base },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  actionButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.green },
  actionSecondary: { backgroundColor: Colors.surface3 },
  actionText: { color: Colors.bg, fontFamily: Font.bold, fontSize: FontSize.sm },
  actionTextSecondary: { color: Colors.textSecondary },
  disabled: { opacity: 0.45 },
  metricRow: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.sm },
  metric: { flex: 1, padding: Spacing.sm, alignItems: 'center', borderRadius: Radius.md, backgroundColor: Colors.surface1, borderWidth: 1, borderColor: Colors.border },
  metricValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.base },
  metricLabel: { marginTop: 2, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs },
  card: { borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1, overflow: 'hidden' },
  coverageRow: { flexDirection: 'row', justifyContent: 'space-between', padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border },
  coverageLabel: { color: Colors.textSecondary, fontFamily: Font.medium, fontSize: FontSize.sm },
  coverageValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.sm },
  issueRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border },
  issueDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  errorDot: { backgroundColor: Colors.red },
  warningDot: { backgroundColor: Colors.yellow },
  issueText: { flex: 1, color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.sm, lineHeight: 19 },
  successCard: { marginTop: Spacing.md, padding: Spacing.xl, alignItems: 'center', borderRadius: Radius.lg, backgroundColor: Colors.greenMuted, borderWidth: 1, borderColor: Colors.green },
  successTitle: { color: Colors.green, fontFamily: Font.bold, fontSize: FontSize.base },
  successText: { marginTop: 4, color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.sm },
});

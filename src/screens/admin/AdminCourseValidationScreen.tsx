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
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import type { Course, CoursePublicationStatus } from '../../types';
import {
  validateCourseReadiness,
  type CourseValidationHole,
  type CourseValidationResult,
  type CourseValidationZone,
} from '../../utils/courseValidation';

const STATUS_LABELS: Record<CoursePublicationStatus, string> = {
  draft: 'Draft',
  review: 'Ready for review',
  published: 'Published',
};

export default function AdminCourseValidationScreen() {
  const navigation = useNavigation();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingValidation, setLoadingValidation] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [result, setResult] = useState<CourseValidationResult | null>(null);

  const selectedCourse = useMemo(
    () => courses.find(course => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );

  const loadCourses = useCallback(async () => {
    setLoadingCourses(true);
    const { data, error } = await supabase
      .from('courses')
      .select('id, name, lat, lng, holes, publication_status, created_at')
      .order('name');
    setLoadingCourses(false);
    if (error) {
      Alert.alert('Course Error', 'Could not load courses.');
      return;
    }
    const loaded = (data ?? []) as Course[];
    setCourses(loaded);
    setSelectedCourseId(current => current && loaded.some(course => course.id === current)
      ? current
      : loaded[0]?.id ?? null);
  }, []);

  const runValidation = useCallback(async (course: Course) => {
    setLoadingValidation(true);
    const [holesResult, teeSetsResult, zonesResult] = await Promise.all([
      supabase
        .from('holes')
        .select('number, par, stroke_index, white_metres, tee_lat, tee_lng, green_front_lat, green_front_lng, green_mid_lat, green_mid_lng, green_back_lat, green_back_lng')
        .eq('course_id', course.id)
        .order('number'),
      supabase
        .from('tee_sets')
        .select('id', { count: 'exact', head: true })
        .eq('course_id', course.id),
      supabase
        .from('hole_zones')
        .select('hole_number, zone_type, coordinates')
        .eq('course_id', course.id),
    ]);
    setLoadingValidation(false);

    const error = holesResult.error ?? teeSetsResult.error ?? zonesResult.error;
    if (error) {
      Alert.alert('Validation Error', error.message);
      setResult(null);
      return;
    }

    setResult(validateCourseReadiness({
      expectedHoles: course.holes,
      teeSetCount: teeSetsResult.count ?? 0,
      holes: (holesResult.data ?? []) as CourseValidationHole[],
      zones: (zonesResult.data ?? []) as CourseValidationZone[],
    }));
  }, []);

  const setPublicationStatus = useCallback(async (status: CoursePublicationStatus) => {
    if (!selectedCourse || savingStatus) return;
    if ((status === 'review' || status === 'published') && !result?.publishable) {
      Alert.alert('Course not ready', 'Fix all core-data errors before advancing this course.');
      return;
    }

    setSavingStatus(true);
    const { error } = await supabase
      .from('courses')
      .update({ publication_status: status })
      .eq('id', selectedCourse.id);
    setSavingStatus(false);
    if (error) {
      Alert.alert('Status Error', error.message);
      return;
    }
    setCourses(current => current.map(course => (
      course.id === selectedCourse.id ? { ...course, publication_status: status } : course
    )));
  }, [result?.publishable, savingStatus, selectedCourse]);

  useEffect(() => { void loadCourses(); }, [loadCourses]);

  useEffect(() => {
    setResult(null);
    if (!selectedCourse) return;
    void runValidation(selectedCourse);
  }, [runValidation, selectedCourse]);

  const errors = result?.issues.filter(issue => issue.severity === 'error') ?? [];
  const warnings = result?.issues.filter(issue => issue.severity === 'warning') ?? [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.headerTitle}>Course Readiness</Text>
          <Text style={styles.subtitle}>{selectedCourse?.name ?? 'Select a course'}</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => selectedCourse && void runValidation(selectedCourse)}
          disabled={!selectedCourse || loadingValidation}
        >
          <Text style={styles.refreshText}>↻</Text>
        </TouchableOpacity>
      </View>

      {loadingCourses ? (
        <View style={styles.loading}><ActivityIndicator color={Colors.green} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionLabel}>Course</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.courseRow}>
            {courses.map(course => {
              const active = course.id === selectedCourseId;
              return (
                <TouchableOpacity
                  key={course.id}
                  style={[styles.courseChip, active && styles.courseChipActive]}
                  onPress={() => setSelectedCourseId(course.id)}
                >
                  <Text style={[styles.courseChipText, active && styles.courseChipTextActive]}>{course.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {loadingValidation || !result ? (
            <View style={styles.loadingCard}><ActivityIndicator color={Colors.green} /></View>
          ) : (
            <>
              <View style={styles.heroCard}>
                <Text style={styles.score}>{result.completeness}%</Text>
                <Text style={styles.scoreLabel}>overall completeness</Text>
                <View style={styles.statusPill}>
                  <Text style={[styles.statusText, result.publishable ? styles.readyText : styles.notReadyText]}>
                    {result.publishable ? 'Core data ready' : 'Core data needs work'}
                  </Text>
                </View>
                <Text style={styles.heroHint}>
                  Core readiness requires complete scorecard, tee sets and essential GPS. Rich geometry increases the overall completeness score but is not a hard publishing blocker.
                </Text>
              </View>

              {selectedCourse && (
                <View style={styles.publicationCard}>
                  <View style={styles.publicationHeader}>
                    <View>
                      <Text style={styles.publicationLabel}>Publication status</Text>
                      <Text style={styles.publicationStatus}>{STATUS_LABELS[selectedCourse.publication_status]}</Text>
                    </View>
                    {savingStatus && <ActivityIndicator color={Colors.green} />}
                  </View>
                  <Text style={styles.publicationHint}>
                    Only published courses are visible in Start Round and Home Course selection. Draft and review courses remain available in admin tools.
                  </Text>
                  <View style={styles.publicationActions}>
                    {selectedCourse.publication_status === 'draft' && (
                      <ActionButton
                        label="Mark Ready for Review"
                        disabled={!result.publishable || savingStatus}
                        onPress={() => void setPublicationStatus('review')}
                      />
                    )}
                    {selectedCourse.publication_status === 'review' && (
                      <>
                        <ActionButton
                          label="Back to Draft"
                          secondary
                          disabled={savingStatus}
                          onPress={() => void setPublicationStatus('draft')}
                        />
                        <ActionButton
                          label="Publish Course"
                          disabled={!result.publishable || savingStatus}
                          onPress={() => void setPublicationStatus('published')}
                        />
                      </>
                    )}
                    {selectedCourse.publication_status === 'published' && (
                      <ActionButton
                        label="Unpublish to Draft"
                        secondary
                        disabled={savingStatus}
                        onPress={() => void setPublicationStatus('draft')}
                      />
                    )}
                  </View>
                </View>
              )}

              <View style={styles.metricRow}>
                <Metric label="Core" value={`${result.basicCompleteness}%`} />
                <Metric label="Geometry" value={`${result.geometryCompleteness}%`} />
                <Metric label="Errors" value={String(result.errors)} />
                <Metric label="Warnings" value={String(result.warnings)} />
              </View>

              <Text style={styles.sectionLabel}>Coverage</Text>
              <View style={styles.card}>
                <CoverageRow label="Hole rows" value={`${result.counts.loadedHoles}/${result.counts.expectedHoles}`} />
                <CoverageRow label="Tee sets" value={String(result.counts.teeSets)} />
                <CoverageRow label="Tee GPS" value={`${result.counts.teesMapped}/${result.counts.expectedHoles}`} />
                <CoverageRow label="Complete green GPS" value={`${result.counts.greensMapped}/${result.counts.expectedHoles}`} />
                <CoverageRow label="Green polygons" value={String(result.counts.greenPolygons)} />
                <CoverageRow label="Fairway polygons" value={String(result.counts.fairwayPolygons)} />
                <CoverageRow label="Centrelines" value={String(result.counts.centrelines)} last />
              </View>

              {errors.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Must fix</Text>
                  <View style={styles.card}>
                    {errors.map((issue, index) => (
                      <IssueRow key={`${issue.code}-${issue.holeNumber ?? 'course'}-${index}`} text={issue.message} severity="error" last={index === errors.length - 1} />
                    ))}
                  </View>
                </>
              )}

              {warnings.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Recommended</Text>
                  <View style={styles.card}>
                    {warnings.map((issue, index) => (
                      <IssueRow key={`${issue.code}-${issue.holeNumber ?? 'course'}-${index}`} text={issue.message} severity="warning" last={index === warnings.length - 1} />
                    ))}
                  </View>
                </>
              )}

              {result.issues.length === 0 && (
                <View style={styles.successCard}>
                  <Text style={styles.successTitle}>Course data is complete</Text>
                  <Text style={styles.successText}>No validation issues were found.</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ActionButton({ label, onPress, disabled, secondary = false }: { label: string; onPress: () => void; disabled: boolean; secondary?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.actionButton, secondary && styles.actionButtonSecondary, disabled && styles.actionButtonDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.actionButtonText, secondary && styles.actionButtonTextSecondary]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function CoverageRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.coverageRow, !last && styles.rowDivider]}>
      <Text style={styles.coverageLabel}>{label}</Text>
      <Text style={styles.coverageValue}>{value}</Text>
    </View>
  );
}

function IssueRow({ text, severity, last }: { text: string; severity: 'error' | 'warning'; last: boolean }) {
  return (
    <View style={[styles.issueRow, !last && styles.rowDivider]}>
      <View style={[styles.issueDot, severity === 'error' ? styles.errorDot : styles.warningDot]} />
      <Text style={styles.issueText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { color: Colors.text, fontSize: FontSize.xxl },
  titleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { color: Colors.text, fontFamily: Font.bold, fontWeight: FontWeight.bold, fontSize: FontSize.lg },
  subtitle: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, marginTop: 2 },
  refreshButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.surface2 },
  refreshText: { color: Colors.green, fontSize: FontSize.xl },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.base, paddingBottom: Spacing.xxl },
  sectionLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  courseRow: { gap: Spacing.xs, paddingBottom: Spacing.xs },
  courseChip: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border },
  courseChipActive: { backgroundColor: Colors.greenMuted, borderColor: Colors.green },
  courseChipText: { color: Colors.textSecondary, fontFamily: Font.medium, fontSize: FontSize.sm },
  courseChipTextActive: { color: Colors.green, fontFamily: Font.bold },
  loadingCard: { minHeight: 180, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.xl, backgroundColor: Colors.surface1, borderWidth: 1, borderColor: Colors.border },
  heroCard: { padding: Spacing.xl, alignItems: 'center', borderRadius: Radius.xl, backgroundColor: Colors.surface1, borderWidth: 1, borderColor: Colors.border },
  score: { color: Colors.text, fontFamily: Font.black, fontSize: 52, fontWeight: FontWeight.black },
  scoreLabel: { color: Colors.textMuted, fontFamily: Font.medium, fontSize: FontSize.sm },
  statusPill: { marginTop: Spacing.md, paddingHorizontal: Spacing.base, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.surface3 },
  statusText: { fontFamily: Font.bold, fontSize: FontSize.sm },
  readyText: { color: Colors.green },
  notReadyText: { color: Colors.red },
  heroHint: { marginTop: Spacing.md, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, lineHeight: 18, textAlign: 'center' },
  publicationCard: { marginTop: Spacing.sm, padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1 },
  publicationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  publicationLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs, textTransform: 'uppercase' },
  publicationStatus: { marginTop: 3, color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.base },
  publicationHint: { marginTop: Spacing.sm, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, lineHeight: 18 },
  publicationActions: { marginTop: Spacing.md, flexDirection: 'row', gap: Spacing.sm },
  actionButton: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.green, paddingHorizontal: Spacing.sm },
  actionButtonSecondary: { backgroundColor: Colors.surface3 },
  actionButtonDisabled: { opacity: 0.45 },
  actionButtonText: { color: Colors.bg, fontFamily: Font.bold, fontSize: FontSize.sm, textAlign: 'center' },
  actionButtonTextSecondary: { color: Colors.textSecondary },
  metricRow: { flexDirection: 'row', marginTop: Spacing.sm, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1 },
  metric: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md },
  metricValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.md },
  metricLabel: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, marginTop: 3 },
  card: { borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1, overflow: 'hidden' },
  coverageRow: { minHeight: 48, paddingHorizontal: Spacing.base, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  coverageLabel: { color: Colors.textSecondary, fontFamily: Font.medium, fontSize: FontSize.sm },
  coverageValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.sm },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  issueRow: { minHeight: 52, padding: Spacing.base, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  issueDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  errorDot: { backgroundColor: Colors.red },
  warningDot: { backgroundColor: Colors.eagle },
  issueText: { flex: 1, color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.sm, lineHeight: 19 },
  successCard: { marginTop: Spacing.lg, padding: Spacing.xl, alignItems: 'center', borderRadius: Radius.lg, backgroundColor: Colors.greenMuted, borderWidth: 1, borderColor: Colors.green },
  successTitle: { color: Colors.green, fontFamily: Font.bold, fontSize: FontSize.base },
  successText: { marginTop: 4, color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.sm },
});

import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { Colors, Font, FontSize, Radius, Spacing } from '../../constants/theme';

type CheckStatus = 'pending' | 'pass' | 'fail';
type HealthCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
};
type CourseRow = { id: string; name: string; publication_status: 'draft' | 'review' | 'published'; last_verified_at: string | null };

type Summary = {
  courses: number;
  published: number;
  draft: number;
  review: number;
  pendingSuggestions: number;
  adminEvents: number;
};

const EMPTY_SUMMARY: Summary = { courses: 0, published: 0, draft: 0, review: 0, pendingSuggestions: 0, adminEvents: 0 };

export default function AdminDataHealthScreen() {
  const navigation = useNavigation();
  const runningRef = useRef(false);
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [smokeTesting, setSmokeTesting] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);

  const selectedCourse = useMemo(() => courses.find(course => course.id === selectedCourseId) ?? null, [courses, selectedCourseId]);
  const failed = checks.filter(check => check.status === 'fail').length;
  const passed = checks.filter(check => check.status === 'pass').length;

  const runChecks = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setChecks([
      { id: 'courses', label: 'Courses + Phase 7 columns', status: 'pending', detail: 'Checking…' },
      { id: 'events', label: 'Course admin audit table', status: 'pending', detail: 'Checking…' },
      { id: 'suggestions', label: 'Mapping source identity columns', status: 'pending', detail: 'Checking…' },
      { id: 'zones', label: 'Approved hole geometry', status: 'pending', detail: 'Checking…' },
    ]);

    try {
      const [courseResult, eventResult, suggestionResult, zoneResult] = await Promise.all([
        supabase.from('courses').select('id, name, publication_status, last_verified_at').order('name'),
        supabase.from('course_admin_events').select('id', { count: 'exact', head: true }),
        supabase.from('course_mapping_suggestions').select('id, source_feature_key, source_fingerprint', { count: 'exact' }).eq('review_status', 'pending').limit(1),
        supabase.from('hole_zones').select('course_id', { count: 'exact', head: true }),
      ]);

      const loadedCourses = courseResult.error ? [] : (courseResult.data ?? []) as CourseRow[];
      setCourses(loadedCourses);
      setSelectedCourseId(current => current && loadedCourses.some(course => course.id === current) ? current : loadedCourses[0]?.id ?? null);

      const nextChecks: HealthCheck[] = [
        courseResult.error
          ? { id: 'courses', label: 'Courses + Phase 7 columns', status: 'fail', detail: courseResult.error.message }
          : { id: 'courses', label: 'Courses + Phase 7 columns', status: 'pass', detail: `${loadedCourses.length} courses readable; publication + verification columns available.` },
        eventResult.error
          ? { id: 'events', label: 'Course admin audit table', status: 'fail', detail: eventResult.error.message }
          : { id: 'events', label: 'Course admin audit table', status: 'pass', detail: `${eventResult.count ?? 0} audit events currently stored.` },
        suggestionResult.error
          ? { id: 'suggestions', label: 'Mapping source identity columns', status: 'fail', detail: suggestionResult.error.message }
          : { id: 'suggestions', label: 'Mapping source identity columns', status: 'pass', detail: `${suggestionResult.count ?? 0} pending mapping suggestions; source identity columns available.` },
        zoneResult.error
          ? { id: 'zones', label: 'Approved hole geometry', status: 'fail', detail: zoneResult.error.message }
          : { id: 'zones', label: 'Approved hole geometry', status: 'pass', detail: `${zoneResult.count ?? 0} approved hole-zone records accessible.` },
      ];

      setChecks(nextChecks);
      setSummary({
        courses: loadedCourses.length,
        published: loadedCourses.filter(course => course.publication_status === 'published').length,
        draft: loadedCourses.filter(course => course.publication_status === 'draft').length,
        review: loadedCourses.filter(course => course.publication_status === 'review').length,
        pendingSuggestions: suggestionResult.error ? 0 : suggestionResult.count ?? 0,
        adminEvents: eventResult.error ? 0 : eventResult.count ?? 0,
      });
      setLastRunAt(new Date().toISOString());
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void runChecks(); }, [runChecks]));

  const runVerificationSmokeTest = useCallback(() => {
    if (!selectedCourse || smokeTesting) return;
    Alert.alert(
      'Run live verification test?',
      `This will update ${selectedCourse.name}'s verification timestamp and create a course_verified audit event. It does not change scorecard or playable course geometry.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Run Test',
          onPress: async () => {
            setSmokeTesting(true);
            const before = new Date().toISOString();
            const { error: rpcError } = await supabase.rpc('mark_course_verified', { p_course_id: selectedCourse.id, p_notes: 'Phase 8 data-health smoke test' });
            if (rpcError) {
              setSmokeTesting(false);
              Alert.alert('Smoke test failed', rpcError.message);
              return;
            }

            const { data: event, error: eventError } = await supabase
              .from('course_admin_events')
              .select('id, created_at')
              .eq('course_id', selectedCourse.id)
              .eq('event_type', 'course_verified')
              .gte('created_at', before)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            setSmokeTesting(false);
            if (eventError || !event) {
              Alert.alert('Partial success', 'Verification timestamp updated, but the expected audit event could not be confirmed. Check migrations and Course History.');
            } else {
              Alert.alert('Live check passed', 'Verification RPC and audit-event creation both worked against the connected Supabase project.');
            }
            await runChecks();
          },
        },
      ],
    );
  }, [runChecks, selectedCourse, smokeTesting]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity>
        <View style={styles.titleWrap}><Text style={styles.headerTitle}>Data Health</Text><Text style={styles.subtitle}>Live Supabase diagnostics</Text></View>
        <TouchableOpacity onPress={() => void runChecks()} style={styles.backButton} disabled={running}><Text style={styles.refreshText}>↻</Text></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Safe by default</Text>
          <Text style={styles.noticeText}>The automatic checks below only read data. The verification smoke test is separate and requires confirmation because it updates the selected course's verification timestamp.</Text>
        </View>

        <View style={styles.metricsRow}>
          <Metric value={summary.courses} label="Courses" />
          <Metric value={summary.pendingSuggestions} label="Pending" />
          <Metric value={summary.adminEvents} label="Audit events" />
        </View>
        <View style={styles.metricsRow}>
          <Metric value={summary.published} label="Published" />
          <Metric value={summary.review} label="Review" />
          <Metric value={summary.draft} label="Draft" />
        </View>

        <Text style={styles.sectionLabel}>Schema & data checks</Text>
        <View style={styles.card}>
          {checks.length === 0 && running ? <ActivityIndicator color={Colors.green} style={styles.loader} /> : checks.map((check, index) => (
            <View key={check.id} style={[styles.checkRow, index < checks.length - 1 && styles.divider]}>
              <View style={[styles.statusDot, check.status === 'pass' && styles.passDot, check.status === 'fail' && styles.failDot]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.checkLabel}>{check.label}</Text>
                <Text style={styles.checkDetail}>{check.detail}</Text>
              </View>
            </View>
          ))}
        </View>
        {lastRunAt && <Text style={styles.lastRun}>{passed} passed · {failed} failed · checked {new Date(lastRunAt).toLocaleTimeString()}</Text>}

        <Text style={styles.sectionLabel}>Live mutation smoke test</Text>
        <View style={styles.card}>
          <Text style={styles.smokeTitle}>Verification RPC + audit event</Text>
          <Text style={styles.smokeText}>Choose a course, then explicitly run the test. This is designed to confirm that the Phase 7 migration is actually live in Supabase.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.courseRow}>
            {courses.map(course => {
              const active = course.id === selectedCourseId;
              return (
                <TouchableOpacity key={course.id} style={[styles.courseChip, active && styles.courseChipActive]} onPress={() => setSelectedCourseId(course.id)}>
                  <Text style={[styles.courseChipText, active && styles.courseChipTextActive]}>{course.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={[styles.testButton, (!selectedCourse || smokeTesting) && styles.disabled]} onPress={runVerificationSmokeTest} disabled={!selectedCourse || smokeTesting}>
            {smokeTesting ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.testButtonText}>Run Verification Smoke Test</Text>}
          </TouchableOpacity>
        </View>
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
  notice: { padding: Spacing.base, borderRadius: Radius.lg, backgroundColor: Colors.greenMuted, borderWidth: 1, borderColor: Colors.green },
  noticeTitle: { color: Colors.green, fontFamily: Font.bold, fontSize: FontSize.sm },
  noticeText: { marginTop: 5, color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.xs, lineHeight: 18 },
  metricsRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  metric: { flex: 1, padding: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.surface1, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  metricValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.lg },
  metricLabel: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, marginTop: 2 },
  sectionLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  card: { padding: Spacing.base, borderRadius: Radius.lg, backgroundColor: Colors.surface1, borderWidth: 1, borderColor: Colors.border },
  loader: { paddingVertical: Spacing.xl },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: Spacing.sm },
  divider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, backgroundColor: Colors.textMuted },
  passDot: { backgroundColor: Colors.green },
  failDot: { backgroundColor: Colors.red },
  checkLabel: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.sm },
  checkDetail: { marginTop: 3, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, lineHeight: 17 },
  lastRun: { marginTop: Spacing.sm, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, textAlign: 'center' },
  smokeTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.base },
  smokeText: { marginTop: 5, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, lineHeight: 18 },
  courseRow: { gap: Spacing.xs, paddingVertical: Spacing.md },
  courseChip: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border },
  courseChipActive: { backgroundColor: Colors.greenMuted, borderColor: Colors.green },
  courseChipText: { color: Colors.textSecondary, fontFamily: Font.medium, fontSize: FontSize.sm },
  courseChipTextActive: { color: Colors.green, fontFamily: Font.bold },
  testButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.green },
  testButtonText: { color: Colors.bg, fontFamily: Font.bold, fontSize: FontSize.sm },
  disabled: { opacity: 0.5 },
});

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
import { Colors, Font, FontSize, Radius, Spacing } from '../../constants/theme';

type CourseRow = { id: string; name: string };
type AdminEvent = {
  id: string;
  course_id: string;
  event_type: string;
  actor_user_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

const EVENT_LABELS: Record<string, string> = {
  course_verified: 'Course verified',
  publication_status_changed: 'Publication status changed',
  mapping_suggestion_accepted: 'Mapping suggestion accepted',
  mapping_suggestion_rejected: 'Mapping suggestion rejected',
};

export default function AdminCourseHistoryScreen() {
  const navigation = useNavigation();
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const selectedCourse = useMemo(() => courses.find(course => course.id === selectedCourseId) ?? null, [courses, selectedCourseId]);

  const loadCourses = useCallback(async () => {
    const { data, error } = await supabase.from('courses').select('id, name').order('name');
    if (error) { Alert.alert('Course Error', error.message); return; }
    const loaded = (data ?? []) as CourseRow[];
    setCourses(loaded);
    setSelectedCourseId(current => current && loaded.some(course => course.id === current) ? current : loaded[0]?.id ?? null);
  }, []);

  const loadEvents = useCallback(async (courseId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('course_admin_events')
      .select('id, course_id, event_type, actor_user_id, details, created_at')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false })
      .limit(100);
    setLoading(false);
    if (error) { Alert.alert('History Error', error.message); setEvents([]); return; }
    setEvents((data ?? []) as AdminEvent[]);
  }, []);

  useFocusEffect(useCallback(() => { void loadCourses(); }, [loadCourses]));
  useFocusEffect(useCallback(() => {
    if (selectedCourseId) void loadEvents(selectedCourseId);
  }, [loadEvents, selectedCourseId]));

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity>
        <View style={styles.titleWrap}><Text style={styles.headerTitle}>Course History</Text><Text style={styles.subtitle}>{selectedCourse?.name ?? 'Admin audit trail'}</Text></View>
        <TouchableOpacity onPress={() => selectedCourseId && void loadEvents(selectedCourseId)} style={styles.backButton}><Text style={styles.refreshText}>↻</Text></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>Course</Text>
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

        <Text style={styles.sectionLabel}>Recent activity</Text>
        {loading ? <ActivityIndicator color={Colors.green} style={{ marginTop: Spacing.xl }} /> : events.length === 0 ? (
          <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No admin history yet</Text><Text style={styles.emptyText}>Verification, publication changes and mapping decisions will appear here.</Text></View>
        ) : events.map(event => <EventCard key={event.id} event={event} />)}
      </ScrollView>
    </SafeAreaView>
  );
}

function EventCard({ event }: { event: AdminEvent }) {
  const details = event.details ?? {};
  const detailLines: string[] = [];
  if (details.from != null || details.to != null) detailLines.push(`${String(details.from ?? '—')} → ${String(details.to ?? '—')}`);
  if (details.hole_number != null) detailLines.push(`Hole ${String(details.hole_number)}`);
  if (details.feature_type != null) detailLines.push(String(details.feature_type).replaceAll('_', ' '));
  if (details.source_provider != null) detailLines.push(String(details.source_provider));
  if (details.notes != null && String(details.notes).trim()) detailLines.push(String(details.notes));

  return (
    <View style={styles.eventCard}>
      <View style={styles.eventTop}>
        <Text style={styles.eventTitle}>{EVENT_LABELS[event.event_type] ?? event.event_type.replaceAll('_', ' ')}</Text>
        <Text style={styles.eventDate}>{new Date(event.created_at).toLocaleString()}</Text>
      </View>
      {detailLines.length > 0 && <Text style={styles.eventDetails}>{detailLines.join(' · ')}</Text>}
      <Text style={styles.eventActor}>{event.actor_user_id ? 'Authenticated admin action' : 'System action'}</Text>
    </View>
  );
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
  sectionLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  courseRow: { gap: Spacing.xs, paddingBottom: Spacing.xs },
  courseChip: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border },
  courseChipActive: { backgroundColor: Colors.greenMuted, borderColor: Colors.green },
  courseChipText: { color: Colors.textSecondary, fontFamily: Font.medium, fontSize: FontSize.sm },
  courseChipTextActive: { color: Colors.green, fontFamily: Font.bold },
  emptyCard: { padding: Spacing.xl, alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1 },
  emptyTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.base },
  emptyText: { marginTop: 5, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.sm, textAlign: 'center' },
  eventCard: { marginBottom: Spacing.sm, padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1 },
  eventTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  eventTitle: { flex: 1, color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.sm, textTransform: 'capitalize' },
  eventDate: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs },
  eventDetails: { marginTop: 6, color: Colors.textSecondary, fontFamily: Font.medium, fontSize: FontSize.sm, textTransform: 'capitalize' },
  eventActor: { marginTop: 5, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs },
});

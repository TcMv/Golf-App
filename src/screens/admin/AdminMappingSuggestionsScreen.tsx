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
import MappingSuggestionPreview from '../../components/admin/MappingSuggestionPreview';
import {
  validateMappingSuggestion,
  type MappingSuggestion,
  type MappingSuggestionFeature,
  type SuggestionCoordinate,
} from '../../utils/courseMappingSuggestions';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

type CourseRow = { id: string; name: string; holes: number };
type SuggestionRow = MappingSuggestion & {
  id: string;
  metadata: Record<string, unknown> | null;
  review_status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
};

export default function AdminMappingSuggestionsScreen() {
  const navigation = useNavigation();
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const selectedCourse = useMemo(() => courses.find(course => course.id === selectedCourseId) ?? null, [courses, selectedCourseId]);

  const loadCourses = useCallback(async () => {
    const { data, error } = await supabase.from('courses').select('id, name, holes').order('name');
    if (error) { Alert.alert('Course Error', error.message); return; }
    const loaded = (data ?? []) as CourseRow[];
    setCourses(loaded);
    setSelectedCourseId(current => current && loaded.some(course => course.id === current) ? current : loaded[0]?.id ?? null);
  }, []);

  const loadSuggestions = useCallback(async (courseId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('course_mapping_suggestions')
      .select('id, course_id, hole_number, feature_type, geometry_type, coordinates, confidence, source_provider, source_reference, source_license, metadata, review_status, created_at')
      .eq('course_id', courseId)
      .eq('review_status', 'pending')
      .order('hole_number')
      .order('confidence', { ascending: false, nullsFirst: false });
    setLoading(false);
    if (error) { Alert.alert('Suggestion Error', error.message); setSuggestions([]); return; }
    const loaded = (data ?? []) as SuggestionRow[];
    setSuggestions(loaded);
    setPreviewId(current => current && loaded.some(item => item.id === current) ? current : null);
  }, []);

  useEffect(() => { void loadCourses(); }, [loadCourses]);
  useEffect(() => {
    setPreviewId(null);
    if (!selectedCourseId) { setSuggestions([]); setLoading(false); return; }
    void loadSuggestions(selectedCourseId);
  }, [loadSuggestions, selectedCourseId]);

  const updateSuggestionCoordinates = useCallback((suggestionId: string, coordinates: SuggestionCoordinate[]) => {
    setSuggestions(current => current.map(item => item.id === suggestionId ? { ...item, coordinates } : item));
  }, []);

  const markSuggestion = useCallback(async (suggestion: SuggestionRow, status: 'accepted' | 'rejected') => {
    if (savingId) return;
    if (status === 'accepted') {
      const validation = validateMappingSuggestion(suggestion);
      if (!validation.valid) {
        Alert.alert('Suggestion is not valid', validation.errors.join(' '));
        return;
      }
      if (!suggestion.source_license?.trim()) {
        Alert.alert('License confirmation required', 'This suggestion has no source license recorded. Add/confirm source licensing before approving it.');
        return;
      }
    }

    setSavingId(suggestion.id);
    try {
      const { error } = await supabase.rpc('review_course_mapping_suggestion', {
        p_suggestion_id: suggestion.id,
        p_decision: status,
      });
      if (error) throw error;
      setSuggestions(current => current.filter(item => item.id !== suggestion.id));
      setPreviewId(current => current === suggestion.id ? null : current);
    } catch (error: any) {
      Alert.alert(status === 'accepted' ? 'Approval failed' : 'Reject failed', error?.message ?? 'Could not update suggestion.');
    } finally {
      setSavingId(null);
    }
  }, [savingId]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.headerTitle}>Mapping Review</Text>
          <Text style={styles.subtitle}>{selectedCourse?.name ?? 'Select a course'}</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={() => selectedCourseId && void loadSuggestions(selectedCourseId)}><Text style={styles.refreshText}>↻</Text></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>Course</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.courseRow}>
          {courses.map(course => {
            const active = course.id === selectedCourseId;
            return <TouchableOpacity key={course.id} style={[styles.courseChip, active && styles.courseChipActive]} onPress={() => setSelectedCourseId(course.id)}><Text style={[styles.courseChipText, active && styles.courseChipTextActive]}>{course.name}</Text></TouchableOpacity>;
          })}
        </ScrollView>

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Human approval boundary</Text>
          <Text style={styles.noticeText}>Machine suggestions do not affect playable course data until you accept them here. Review them against approved satellite geometry, correct vertices if needed, then approve. Missing source licensing still blocks approval.</Text>
        </View>

        <Text style={styles.sectionLabel}>Pending suggestions</Text>
        {loading ? <ActivityIndicator color={Colors.green} style={{ marginTop: Spacing.xl }} /> : suggestions.length === 0 ? (
          <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Nothing waiting for review</Text><Text style={styles.emptyText}>New machine-generated features will appear here before they can become approved course data.</Text></View>
        ) : suggestions.map(suggestion => (
          <SuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            saving={savingId === suggestion.id}
            previewOpen={previewId === suggestion.id}
            onTogglePreview={() => setPreviewId(current => current === suggestion.id ? null : suggestion.id)}
            onCoordinatesSaved={coordinates => updateSuggestionCoordinates(suggestion.id, coordinates)}
            onAccept={() => void markSuggestion(suggestion, 'accepted')}
            onReject={() => void markSuggestion(suggestion, 'rejected')}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function SuggestionCard({
  suggestion,
  saving,
  previewOpen,
  onTogglePreview,
  onCoordinatesSaved,
  onAccept,
  onReject,
}: {
  suggestion: SuggestionRow;
  saving: boolean;
  previewOpen: boolean;
  onTogglePreview: () => void;
  onCoordinatesSaved: (coordinates: SuggestionCoordinate[]) => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  const validation = validateMappingSuggestion(suggestion);
  const confidence = suggestion.confidence == null ? '—' : `${Math.round(suggestion.confidence * 100)}%`;
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Hole {suggestion.hole_number} · {featureLabel(suggestion.feature_type)}</Text>
          <Text style={styles.cardMeta}>{suggestion.geometry_type} · {suggestion.coordinates.length} points · confidence {confidence}</Text>
        </View>
        <View style={[styles.confidencePill, suggestion.confidence != null && suggestion.confidence >= 0.85 && styles.confidenceStrong]}><Text style={styles.confidenceText}>{confidence}</Text></View>
      </View>
      <Text style={styles.sourceText}>Source: {suggestion.source_provider ?? 'unknown'}{suggestion.source_reference ? ` · ${suggestion.source_reference}` : ''}</Text>
      <Text style={[styles.sourceText, !suggestion.source_license && styles.licenseMissing]}>License: {suggestion.source_license ?? 'MISSING'}</Text>
      {validation.warnings.map((warning, index) => <Text key={index} style={styles.warningText}>⚠ {warning}</Text>)}
      {validation.errors.map((error, index) => <Text key={index} style={styles.errorText}>✕ {error}</Text>)}

      <TouchableOpacity style={styles.previewButton} onPress={onTogglePreview}>
        <Text style={styles.previewButtonText}>{previewOpen ? 'Hide satellite review' : 'Review on satellite map'}</Text>
      </TouchableOpacity>

      {previewOpen && <MappingSuggestionPreview suggestion={suggestion} onSaved={onCoordinatesSaved} />}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.rejectButton} onPress={onReject} disabled={saving}><Text style={styles.rejectText}>Reject</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.acceptButton, (!validation.valid || !suggestion.source_license || saving) && styles.disabled]} onPress={onAccept} disabled={!validation.valid || !suggestion.source_license || saving}>
          {saving ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.acceptText}>Accept</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function featureLabel(feature: MappingSuggestionFeature) {
  return feature.replaceAll('_', ' ');
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
  content: { padding: Spacing.base, paddingBottom: Spacing.xxl },
  sectionLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  courseRow: { gap: Spacing.xs, paddingBottom: Spacing.xs },
  courseChip: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border },
  courseChipActive: { backgroundColor: Colors.greenMuted, borderColor: Colors.green },
  courseChipText: { color: Colors.textSecondary, fontFamily: Font.medium, fontSize: FontSize.sm },
  courseChipTextActive: { color: Colors.green, fontFamily: Font.bold },
  notice: { marginTop: Spacing.md, padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.green, backgroundColor: Colors.greenMuted },
  noticeTitle: { color: Colors.green, fontFamily: Font.bold, fontSize: FontSize.sm },
  noticeText: { marginTop: 4, color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.xs, lineHeight: 18 },
  emptyCard: { padding: Spacing.xl, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1, alignItems: 'center' },
  emptyTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.base },
  emptyText: { marginTop: Spacing.sm, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  card: { marginBottom: Spacing.md, padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.sm },
  cardTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.base, textTransform: 'capitalize' },
  cardMeta: { marginTop: 3, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs },
  confidencePill: { paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.surface3 },
  confidenceStrong: { backgroundColor: Colors.greenMuted },
  confidenceText: { color: Colors.textSecondary, fontFamily: Font.bold, fontSize: FontSize.xs },
  sourceText: { marginTop: Spacing.sm, color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.xs },
  licenseMissing: { color: Colors.red },
  warningText: { marginTop: 5, color: Colors.eagle, fontFamily: Font.regular, fontSize: FontSize.xs },
  errorText: { marginTop: 5, color: Colors.red, fontFamily: Font.regular, fontSize: FontSize.xs },
  previewButton: { marginTop: Spacing.md, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.blue, backgroundColor: Colors.blueMuted },
  previewButtonText: { color: Colors.blue, fontFamily: Font.bold, fontSize: FontSize.sm },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  rejectButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.surface3 },
  rejectText: { color: Colors.textSecondary, fontFamily: Font.bold, fontSize: FontSize.sm },
  acceptButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.green },
  acceptText: { color: Colors.bg, fontFamily: Font.bold, fontSize: FontSize.sm },
  disabled: { opacity: 0.45 },
});

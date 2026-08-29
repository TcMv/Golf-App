import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import {
  buildCourseImportFromDatabase,
  courseImportToGeoJson,
  courseImportToJson,
} from '../../utils/courseImportConverters';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

type OutputMode = 'json' | 'geojson';
type CourseRow = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  holes: number;
  publication_status: string;
  source_provider: string | null;
  source_id: string | null;
  source_url: string | null;
  source_retrieved_at: string | null;
  source_license: string | null;
  source_notes: string | null;
};

export default function AdminCourseExportScreen() {
  const navigation = useNavigation();
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingExport, setLoadingExport] = useState(false);
  const [outputMode, setOutputMode] = useState<OutputMode>('json');
  const [jsonOutput, setJsonOutput] = useState<string>('');
  const [geoJsonOutput, setGeoJsonOutput] = useState<string>('');

  const selectedCourse = useMemo(
    () => courses.find(course => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );

  const loadCourses = useCallback(async () => {
    setLoadingCourses(true);
    const { data, error } = await supabase
      .from('courses')
      .select('id, name, lat, lng, holes, publication_status, source_provider, source_id, source_url, source_retrieved_at, source_license, source_notes')
      .order('name');
    setLoadingCourses(false);
    if (error) {
      Alert.alert('Course Error', error.message);
      return;
    }
    const loaded = (data ?? []) as CourseRow[];
    setCourses(loaded);
    setSelectedCourseId(current => current && loaded.some(course => course.id === current) ? current : loaded[0]?.id ?? null);
  }, []);

  const buildExport = useCallback(async (course: CourseRow) => {
    setLoadingExport(true);
    setJsonOutput('');
    setGeoJsonOutput('');
    const [holesResult, teeSetsResult, zonesResult, hazardsResult] = await Promise.all([
      supabase.from('holes')
        .select('number, par, stroke_index, white_metres, tee_lat, tee_lng, green_front_lat, green_front_lng, green_mid_lat, green_mid_lng, green_back_lat, green_back_lng')
        .eq('course_id', course.id)
        .order('number'),
      supabase.from('tee_sets')
        .select('name, colour, total_metres, course_rating, slope_rating')
        .eq('course_id', course.id)
        .order('total_metres', { ascending: false }),
      supabase.from('hole_zones')
        .select('hole_number, zone_type, coordinates')
        .eq('course_id', course.id)
        .order('hole_number'),
      supabase.from('hazards')
        .select('hole_number, hole_numbers, type, label, coordinates')
        .eq('course_id', course.id),
    ]);
    setLoadingExport(false);
    const error = holesResult.error ?? teeSetsResult.error ?? zonesResult.error ?? hazardsResult.error;
    if (error) {
      Alert.alert('Export Error', error.message);
      return;
    }
    try {
      const exportData = buildCourseImportFromDatabase({
        course,
        holes: (holesResult.data ?? []) as any,
        teeSets: (teeSetsResult.data ?? []) as any,
        zones: (zonesResult.data ?? []) as any,
        hazards: (hazardsResult.data ?? []) as any,
      });
      setJsonOutput(courseImportToJson(exportData));
      setGeoJsonOutput(courseImportToGeoJson(exportData));
    } catch (error: any) {
      Alert.alert('Export Error', error?.message ?? 'Could not build export.');
    }
  }, []);

  useEffect(() => { void loadCourses(); }, [loadCourses]);
  useEffect(() => {
    if (!selectedCourse) return;
    void buildExport(selectedCourse);
  }, [buildExport, selectedCourse]);

  const output = outputMode === 'json' ? jsonOutput : geoJsonOutput;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.headerTitle}>Export Course</Text>
          <Text style={styles.subtitle}>{selectedCourse?.name ?? 'Select a course'}</Text>
        </View>
        <View style={styles.backButton} />
      </View>

      {loadingCourses ? <View style={styles.loading}><ActivityIndicator color={Colors.green} /></View> : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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

          {selectedCourse && <View style={styles.metaCard}>
            <Text style={styles.metaTitle}>{selectedCourse.name}</Text>
            <Text style={styles.metaText}>{selectedCourse.holes} holes · {selectedCourse.publication_status}</Text>
            <Text style={styles.metaText}>Source: {selectedCourse.source_provider ?? 'manual / unknown'}</Text>
          </View>}

          <Text style={styles.sectionLabel}>Output format</Text>
          <View style={styles.segmented}>
            {(['json', 'geojson'] as OutputMode[]).map(mode => (
              <TouchableOpacity key={mode} style={[styles.segment, outputMode === mode && styles.segmentActive]} onPress={() => setOutputMode(mode)}>
                <Text style={[styles.segmentText, outputMode === mode && styles.segmentTextActive]}>{mode === 'geojson' ? 'GeoJSON' : 'GolfCaddie JSON'}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Export data</Text>
          {loadingExport ? <View style={styles.loadingCard}><ActivityIndicator color={Colors.green} /></View> : (
            <>
              <TextInput
                style={styles.output}
                value={output}
                multiline
                editable
                selectTextOnFocus
                autoCapitalize="none"
                autoCorrect={false}
                textAlignVertical="top"
              />
              <Text style={styles.hint}>Tap the export text to select/copy it. JSON preserves the full GolfCaddie v1 contract; GeoJSON is convenient for GIS/mapping tools.</Text>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.base, paddingBottom: Spacing.xxl },
  sectionLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  courseRow: { gap: Spacing.xs, paddingBottom: Spacing.xs },
  courseChip: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border },
  courseChipActive: { backgroundColor: Colors.greenMuted, borderColor: Colors.green },
  courseChipText: { color: Colors.textSecondary, fontFamily: Font.medium, fontSize: FontSize.sm },
  courseChipTextActive: { color: Colors.green, fontFamily: Font.bold },
  metaCard: { marginTop: Spacing.md, padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1 },
  metaTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.base },
  metaText: { marginTop: 3, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.sm },
  segmented: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: Radius.md, backgroundColor: Colors.surface2 },
  segment: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm },
  segmentActive: { backgroundColor: Colors.green },
  segmentText: { color: Colors.textMuted, fontFamily: Font.semibold, fontSize: FontSize.sm },
  segmentTextActive: { color: Colors.bg },
  loadingCard: { minHeight: 220, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.lg, backgroundColor: Colors.surface1 },
  output: { minHeight: 320, padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1, color: Colors.text, fontFamily: Font.regular, fontSize: FontSize.xs },
  hint: { marginTop: Spacing.sm, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, lineHeight: 18 },
});

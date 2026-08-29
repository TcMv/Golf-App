import React, { useMemo, useState } from 'react';
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
import { haversineMetres } from '../../utils/distance';
import { parseCourseImportJson } from '../../utils/courseImport';
import { parseCourseImportCsv, parseCourseImportGeoJson } from '../../utils/courseImportConverters';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

const NEARBY_DUPLICATE_METRES = 250;
type ImportMode = 'json' | 'csv' | 'geojson';

export default function AdminCourseImportScreen() {
  const navigation = useNavigation();
  const [inputText, setInputText] = useState('');
  const [mode, setMode] = useState<ImportMode>('json');
  const [saving, setSaving] = useState(false);
  const [nearbyOverride, setNearbyOverride] = useState(false);

  const parsed = useMemo(() => {
    if (!inputText.trim()) return null;
    if (mode === 'csv') return parseCourseImportCsv(inputText);
    if (mode === 'geojson') return parseCourseImportGeoJson(inputText);
    return parseCourseImportJson(inputText);
  }, [inputText, mode]);
  const data = parsed?.data ?? null;
  const errors = parsed?.issues.filter(issue => issue.severity === 'error') ?? [];
  const warnings = parsed?.issues.filter(issue => issue.severity === 'warning') ?? [];

  const changeMode = (next: ImportMode) => {
    setMode(next);
    setInputText('');
    setNearbyOverride(false);
  };

  const importCourse = async () => {
    if (!data || saving) return;
    setSaving(true);
    try {
      const { data: existing, error: existingError } = await supabase
        .from('courses')
        .select('id, name, lat, lng');
      if (existingError) throw existingError;

      const sameName = (existing ?? []).find(course => course.name.trim().toLowerCase() === data.course.name.trim().toLowerCase());
      if (sameName) {
        Alert.alert('Course already exists', `${sameName.name} already exists in the database.`);
        return;
      }

      const nearby = (existing ?? [])
        .map(course => ({
          ...course,
          distance: haversineMetres(
            { latitude: data.course.latitude, longitude: data.course.longitude },
            { latitude: course.lat, longitude: course.lng },
          ),
        }))
        .filter(course => course.distance <= NEARBY_DUPLICATE_METRES)
        .sort((a, b) => a.distance - b.distance)[0];

      if (nearby && !nearbyOverride) {
        setNearbyOverride(true);
        Alert.alert(
          'Nearby course found',
          `${nearby.name} is only ${Math.round(nearby.distance)}m from this course centre. Review the coordinates, then tap Import again if this is intentionally a separate course.`,
        );
        return;
      }

      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({
          name: data.course.name,
          lat: data.course.latitude,
          lng: data.course.longitude,
          holes: data.course.holes,
          publication_status: 'draft',
          source_provider: data.source.provider,
          source_id: data.source.source_id,
          source_url: data.source.source_url,
          source_retrieved_at: data.source.retrieved_at,
          source_license: data.source.license,
          source_notes: data.source.notes,
        })
        .select('id')
        .single();
      if (courseError || !course) throw courseError ?? new Error('Course creation failed.');

      try {
        const { error: teeError } = await supabase.from('tee_sets').insert(data.tee_sets.map(tee => ({
          course_id: course.id,
          name: tee.name,
          colour: tee.colour,
          total_metres: tee.total_metres,
          course_rating: tee.course_rating,
          slope_rating: tee.slope_rating,
        })));
        if (teeError) throw teeError;

        const locations = new Map(data.hole_locations.map(location => [location.number, location]));
        const { error: holesError } = await supabase.from('holes').insert(data.scorecard.map(hole => {
          const location = locations.get(hole.number);
          return {
            course_id: course.id,
            number: hole.number,
            par: hole.par,
            stroke_index: hole.stroke_index,
            white_metres: hole.metres,
            tee_lat: location?.tee?.lat ?? null,
            tee_lng: location?.tee?.lng ?? null,
            green_front_lat: location?.green_front?.lat ?? null,
            green_front_lng: location?.green_front?.lng ?? null,
            green_mid_lat: location?.green_centre?.lat ?? null,
            green_mid_lng: location?.green_centre?.lng ?? null,
            green_back_lat: location?.green_back?.lat ?? null,
            green_back_lng: location?.green_back?.lng ?? null,
          };
        }));
        if (holesError) throw holesError;

        if (data.zones.length > 0) {
          const { error: zonesError } = await supabase.from('hole_zones').insert(data.zones.map(zone => ({
            course_id: course.id,
            hole_number: zone.hole_number,
            zone_type: zone.type,
            coordinates: zone.coordinates,
          })));
          if (zonesError) throw zonesError;
        }

        if (data.hazards.length > 0) {
          const { error: hazardsError } = await supabase.from('hazards').insert(data.hazards.map(hazard => ({
            course_id: course.id,
            hole_number: hazard.hole_numbers.length === 1 ? hazard.hole_numbers[0] : null,
            hole_numbers: hazard.hole_numbers,
            type: hazard.type,
            label: hazard.label,
            coordinates: hazard.coordinates,
          })));
          if (hazardsError) throw hazardsError;
        }
      } catch (downstreamError) {
        await supabase.from('courses').delete().eq('id', course.id);
        throw downstreamError;
      }

      Alert.alert(
        'Course imported',
        `${data.course.name} was imported as a draft. Open Course Readiness to review and publish it when complete.`,
        [{ text: 'Done', onPress: () => navigation.goBack() }],
      );
    } catch (error: any) {
      Alert.alert('Import failed', error?.message ?? 'The course could not be imported.');
    } finally {
      setSaving(false);
    }
  };

  const placeholder = mode === 'csv'
    ? 'Paste self-contained course CSV here…'
    : mode === 'geojson'
      ? 'Paste GolfCaddie GeoJSON FeatureCollection here…'
      : 'Paste golfcaddie.course.v1 JSON here…';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Import Course</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>Format</Text>
        <View style={styles.segmented}>
          {(['json', 'csv', 'geojson'] as ImportMode[]).map(option => (
            <TouchableOpacity key={option} style={[styles.segment, mode === option && styles.segmentActive]} onPress={() => changeMode(option)}>
              <Text style={[styles.segmentText, mode === option && styles.segmentTextActive]}>{option === 'geojson' ? 'GeoJSON' : option.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Course data</Text>
        <TextInput
          style={styles.dataInput}
          value={inputText}
          onChangeText={value => { setInputText(value); setNearbyOverride(false); }}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          textAlignVertical="top"
        />

        {!parsed && <View style={styles.notice}><Text style={styles.noticeText}>Nothing is written to Supabase until the input normalizes to GolfCaddie v1 and passes validation.</Text></View>}

        {parsed && (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>{data?.course.name ?? 'Import not valid'}</Text>
              {data && <>
                <Text style={styles.summaryText}>{data.course.holes} holes · {data.tee_sets.length} tee set{data.tee_sets.length === 1 ? '' : 's'} · {data.zones.length} zones · {data.hazards.length} hazards</Text>
                <Text style={styles.summaryText}>Source: {data.source.provider}</Text>
              </>}
              <View style={styles.countRow}><Count label="Errors" value={parsed.errors} bad={parsed.errors > 0} /><Count label="Warnings" value={parsed.warnings} /></View>
            </View>

            {errors.length > 0 && <><Text style={styles.sectionLabel}>Must fix</Text><View style={styles.issueCard}>{errors.map((issue, index) => <Issue key={`${issue.path}-${index}`} path={issue.path} text={issue.message} bad />)}</View></>}
            {warnings.length > 0 && <><Text style={styles.sectionLabel}>Warnings</Text><View style={styles.issueCard}>{warnings.map((issue, index) => <Issue key={`${issue.path}-${index}`} path={issue.path} text={issue.message} />)}</View></>}

            {data && <>
              <Text style={styles.sectionLabel}>Preview</Text>
              <View style={styles.issueCard}>
                <PreviewRow label="Course" value={data.course.name} />
                <PreviewRow label="Centre" value={`${data.course.latitude.toFixed(5)}, ${data.course.longitude.toFixed(5)}`} />
                <PreviewRow label="Scorecard" value={`${data.scorecard.length}/${data.course.holes} holes`} />
                <PreviewRow label="Tee sets" value={data.tee_sets.map(tee => tee.name).join(', ')} />
                <PreviewRow label="Hole GPS" value={`${data.hole_locations.length} rows`} />
                <PreviewRow label="Geometry" value={`${data.zones.length} zones`} />
                <PreviewRow label="Hazards" value={String(data.hazards.length)} last />
              </View>
              <TouchableOpacity style={[styles.importButton, saving && styles.disabled]} onPress={() => void importCourse()} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.importButtonText}>{nearbyOverride ? 'Import Anyway as Draft' : 'Import as Draft'}</Text>}
              </TouchableOpacity>
            </>}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Count({ label, value, bad = false }: { label: string; value: number; bad?: boolean }) {
  return <View style={styles.count}><Text style={[styles.countValue, bad && styles.badText]}>{value}</Text><Text style={styles.countLabel}>{label}</Text></View>;
}
function Issue({ path, text, bad = false }: { path: string; text: string; bad?: boolean }) {
  return <View style={styles.issueRow}><View style={[styles.issueDot, bad ? styles.errorDot : styles.warningDot]} /><View style={{ flex: 1 }}><Text style={styles.issuePath}>{path}</Text><Text style={styles.issueText}>{text}</Text></View></View>;
}
function PreviewRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return <View style={[styles.previewRow, !last && styles.divider]}><Text style={styles.previewLabel}>{label}</Text><Text style={styles.previewValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { color: Colors.text, fontSize: FontSize.xxl },
  headerTitle: { color: Colors.text, fontFamily: Font.bold, fontWeight: FontWeight.bold, fontSize: FontSize.lg },
  content: { padding: Spacing.base, paddingBottom: Spacing.xxl },
  sectionLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  segmented: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: Radius.md, backgroundColor: Colors.surface2 },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm },
  segmentActive: { backgroundColor: Colors.green },
  segmentText: { color: Colors.textMuted, fontFamily: Font.semibold, fontSize: FontSize.sm },
  segmentTextActive: { color: Colors.bg },
  dataInput: { minHeight: 220, padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1, color: Colors.text, fontFamily: Font.regular, fontSize: FontSize.sm },
  notice: { marginTop: Spacing.md, padding: Spacing.base, borderRadius: Radius.md, backgroundColor: Colors.surface2 },
  noticeText: { color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.sm, lineHeight: 20 },
  summaryCard: { marginTop: Spacing.lg, padding: Spacing.lg, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1 },
  summaryTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.lg },
  summaryText: { marginTop: 4, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.sm },
  countRow: { flexDirection: 'row', marginTop: Spacing.md, gap: Spacing.sm },
  count: { flex: 1, padding: Spacing.md, alignItems: 'center', borderRadius: Radius.md, backgroundColor: Colors.surface3 },
  countValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.xl },
  countLabel: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs },
  badText: { color: Colors.red },
  issueCard: { borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1 },
  issueRow: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border },
  issueDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  errorDot: { backgroundColor: Colors.red },
  warningDot: { backgroundColor: Colors.eagle },
  issuePath: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs },
  issueText: { marginTop: 2, color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.sm },
  previewRow: { minHeight: 50, paddingHorizontal: Spacing.base, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  previewLabel: { color: Colors.textMuted, fontFamily: Font.medium, fontSize: FontSize.sm },
  previewValue: { flex: 1, textAlign: 'right', color: Colors.text, fontFamily: Font.semibold, fontSize: FontSize.sm },
  divider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  importButton: { marginTop: Spacing.lg, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.lg, backgroundColor: Colors.green },
  importButtonText: { color: Colors.bg, fontFamily: Font.bold, fontSize: FontSize.base },
  disabled: { opacity: 0.6 },
});

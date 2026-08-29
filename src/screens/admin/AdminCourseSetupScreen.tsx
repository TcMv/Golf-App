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
import { Colors, Font, FontSize, Radius, Spacing } from '../../constants/theme';

type DraftHole = { number: number; par: string; strokeIndex: string; metres: string };
type ExistingCourse = { id: string; name: string; lat: number; lng: number };

const buildDraftHoles = (count: number): DraftHole[] =>
  Array.from({ length: count }, (_, index) => ({ number: index + 1, par: '', strokeIndex: '', metres: '' }));

const toNumber = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const distanceMetres = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const r = 6371000;
  const toRad = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const parseBulkRows = (text: string, holeCount: number): DraftHole[] => {
  const raw = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const lines = raw.filter((line, index) => index > 0 || !/[a-zA-Z]/.test(line));
  if (lines.length !== holeCount) throw new Error(`Expected ${holeCount} scorecard rows but found ${lines.length}.`);
  return lines.map((line, index) => {
    let cells = line.split(/[\t,;|]+/).map(cell => cell.trim()).filter(Boolean);
    if (cells.length < 3) cells = line.split(/\s+/).map(cell => cell.trim()).filter(Boolean);
    let holeNumber = index + 1;
    let values = cells;
    if (cells.length >= 4 && Number.isFinite(Number(cells[0]))) {
      holeNumber = Number(cells[0]);
      values = cells.slice(1);
    }
    if (holeNumber !== index + 1) throw new Error(`Expected hole ${index + 1} but row contains hole ${holeNumber}.`);
    if (values.length < 3) throw new Error(`Row ${index + 1} needs Par, SI and Metres.`);
    return { number: holeNumber, par: values[0], strokeIndex: values[1], metres: values[2] };
  });
};

export default function AdminCourseSetupScreen() {
  const navigation = useNavigation();
  const [saving, setSaving] = useState(false);
  const [courseName, setCourseName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [holeCount, setHoleCount] = useState<9 | 18>(18);
  const [teeName, setTeeName] = useState('White');
  const [teeColour, setTeeColour] = useState('white');
  const [courseRating, setCourseRating] = useState('');
  const [slopeRating, setSlopeRating] = useState('');
  const [holes, setHoles] = useState<DraftHole[]>(() => buildDraftHoles(18));
  const [bulkText, setBulkText] = useState('');

  const totalMetres = useMemo(() => holes.reduce((sum, hole) => sum + (toNumber(hole.metres) ?? 0), 0), [holes]);

  const updateHoleCount = (count: 9 | 18) => {
    setHoleCount(count);
    setHoles(current => count < current.length
      ? current.slice(0, count)
      : [...current, ...Array.from({ length: count - current.length }, (_, index) => ({ number: current.length + index + 1, par: '', strokeIndex: '', metres: '' }))]);
  };

  const updateHole = (number: number, field: 'par' | 'strokeIndex' | 'metres', value: string) => {
    setHoles(current => current.map(hole => hole.number === number ? { ...hole, [field]: value } : hole));
  };

  const validate = () => {
    const lat = toNumber(latitude);
    const lng = toNumber(longitude);
    const rating = toNumber(courseRating);
    const slope = toNumber(slopeRating);
    if (!courseName.trim()) return 'Enter the course name.';
    if (lat == null || lat < -90 || lat > 90) return 'Enter a valid latitude.';
    if (lng == null || lng < -180 || lng > 180) return 'Enter a valid longitude.';
    if (!teeName.trim() || !teeColour.trim()) return 'Enter the tee-set name and colour.';
    if (rating == null || rating <= 0 || rating > 100) return 'Enter a valid course rating.';
    if (slope == null || slope < 55 || slope > 155) return 'Enter a valid slope rating between 55 and 155.';
    const seen = new Set<number>();
    for (const hole of holes) {
      const par = toNumber(hole.par);
      const si = toNumber(hole.strokeIndex);
      const metres = toNumber(hole.metres);
      if (par == null || par < 3 || par > 6) return `Hole ${hole.number}: enter a par from 3 to 6.`;
      if (si == null || !Number.isInteger(si) || si < 1 || si > holeCount) return `Hole ${hole.number}: enter an SI from 1 to ${holeCount}.`;
      if (seen.has(si)) return `Stroke index ${si} is used more than once.`;
      seen.add(si);
      if (metres == null || metres < 40 || metres > 750) return `Hole ${hole.number}: enter a plausible tee distance.`;
    }
    return null;
  };

  const persistCourse = async (normalizedName: string, lat: number, lng: number): Promise<string> => {
    const { data: course, error: courseError } = await supabase.from('courses').insert({ name: normalizedName, lat, lng, holes: holeCount }).select('id').single();
    if (courseError || !course) throw courseError ?? new Error('Course creation failed.');
    const cleanup = async () => { await supabase.from('courses').delete().eq('id', course.id); };
    const { error: teeError } = await supabase.from('tee_sets').insert({
      course_id: course.id,
      name: teeName.trim(),
      colour: teeColour.trim().toLowerCase(),
      total_metres: totalMetres,
      course_rating: Number(courseRating.trim()),
      slope_rating: Number(slopeRating.trim()),
    });
    if (teeError) { await cleanup(); throw teeError; }
    const { error: holesError } = await supabase.from('holes').insert(holes.map(hole => ({
      course_id: course.id,
      number: hole.number,
      par: Number(hole.par),
      stroke_index: Number(hole.strokeIndex),
      white_metres: Number(hole.metres),
    })));
    if (holesError) { await cleanup(); throw holesError; }
    return course.id as string;
  };

  const createCourse = async (allowNearbyDuplicate = false) => {
    if (saving) return;
    const validationError = validate();
    if (validationError) { Alert.alert('Check course data', validationError); return; }
    setSaving(true);
    try {
      const lat = Number(latitude.trim());
      const lng = Number(longitude.trim());
      const normalizedName = courseName.trim();
      const { data: existingCourses, error: duplicateError } = await supabase.from('courses').select('id, name, lat, lng');
      if (duplicateError) throw duplicateError;
      const existing = (existingCourses ?? []) as ExistingCourse[];
      const exactName = existing.find(course => course.name.trim().toLowerCase() === normalizedName.toLowerCase());
      if (exactName) { Alert.alert('Course already exists', `${exactName.name} is already in the database.`); return; }
      const nearby = existing.map(course => ({ course, metresAway: distanceMetres(lat, lng, course.lat, course.lng) })).filter(item => item.metresAway <= 250).sort((a, b) => a.metresAway - b.metresAway)[0];
      if (nearby && !allowNearbyDuplicate) {
        Alert.alert('Possible duplicate nearby', `${nearby.course.name} is about ${Math.round(nearby.metresAway)} m away. Create separately anyway?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Create Anyway', onPress: () => { void createCourse(true); } },
        ]);
        return;
      }
      const courseId = await persistCourse(normalizedName, lat, lng);
      Alert.alert('Course created', `${normalizedName} is saved as a draft. Continue straight into automatic mapping?`, [
        { text: 'Later', onPress: () => navigation.goBack() },
        { text: 'Generate Mapping', onPress: () => (navigation as any).replace('AdminOsmMapping', { courseId, onboarding: true }) },
      ]);
    } catch (error: any) {
      Alert.alert('Create course failed', error?.message ?? 'The course could not be created.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}><TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}><Text style={styles.backText}>‹</Text></TouchableOpacity><Text style={styles.headerTitle}>New Course</Text><View style={styles.backButton} /></View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Section title="Course">
          <Field label="Course name" value={courseName} onChangeText={setCourseName} placeholder="e.g. Maroochy River Golf Club" />
          <View style={styles.row}><Field label="Latitude" value={latitude} onChangeText={setLatitude} placeholder="-26.65" /><Field label="Longitude" value={longitude} onChangeText={setLongitude} placeholder="153.08" /></View>
          <Text style={styles.label}>Holes</Text>
          <View style={styles.segmented}>{([9, 18] as const).map(count => <TouchableOpacity key={count} style={[styles.segment, holeCount === count && styles.segmentActive]} onPress={() => updateHoleCount(count)}><Text style={[styles.segmentText, holeCount === count && styles.segmentTextActive]}>{count}</Text></TouchableOpacity>)}</View>
        </Section>
        <Section title="Initial tee set">
          <View style={styles.row}><Field label="Name" value={teeName} onChangeText={setTeeName} placeholder="White" /><Field label="Colour" value={teeColour} onChangeText={setTeeColour} placeholder="white" /></View>
          <View style={styles.row}><Field label="Course rating" value={courseRating} onChangeText={setCourseRating} placeholder="68.4" /><Field label="Slope" value={slopeRating} onChangeText={setSlopeRating} placeholder="121" /></View>
          <Text style={styles.help}>Total distance: {totalMetres} m</Text>
        </Section>
        <Section title="Bulk scorecard paste">
          <Text style={styles.help}>Paste: Hole, Par, SI, Metres. Header optional.</Text>
          <TextInput style={styles.bulkInput} multiline value={bulkText} onChangeText={setBulkText} placeholder={'1,4,7,356\n2,3,15,142'} placeholderTextColor={Colors.textMuted} />
          <TouchableOpacity style={styles.secondaryButton} onPress={() => { try { setHoles(parseBulkRows(bulkText, holeCount)); } catch (error: any) { Alert.alert('Could not read scorecard', error?.message ?? 'Check the pasted format.'); } }}><Text style={styles.secondaryText}>Load Into Scorecard</Text></TouchableOpacity>
        </Section>
        <Text style={styles.sectionLabel}>Scorecard</Text>
        {holes.map(hole => <View key={hole.number} style={styles.scoreRow}><Text style={styles.hole}>{hole.number}</Text><ScoreInput value={hole.par} onChangeText={value => updateHole(hole.number, 'par', value)} /><ScoreInput value={hole.strokeIndex} onChangeText={value => updateHole(hole.number, 'strokeIndex', value)} /><ScoreInput value={hole.metres} onChangeText={value => updateHole(hole.number, 'metres', value)} /></View>)}
        <View style={styles.notice}><Text style={styles.help}>The course remains draft until readiness checks pass. After creation you can continue directly into machine mapping without reselecting it.</Text></View>
        <TouchableOpacity style={[styles.primaryButton, saving && styles.disabled]} onPress={() => void createCourse()} disabled={saving}>{saving ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.primaryText}>Create Course</Text>}</TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <><Text style={styles.sectionLabel}>{title}</Text><View style={styles.card}>{children}</View></>; }
function Field({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (v: string) => void; placeholder: string }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={Colors.textMuted} style={styles.input} autoCapitalize="none" /></View>; }
function ScoreInput({ value, onChangeText }: { value: string; onChangeText: (v: string) => void }) { return <TextInput value={value} onChangeText={onChangeText} keyboardType="number-pad" style={styles.scoreInput} placeholder="—" placeholderTextColor={Colors.textMuted} />; }

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { color: Colors.text, fontSize: FontSize.xxl },
  headerTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.lg },
  content: { padding: Spacing.base, paddingBottom: Spacing.xxl },
  sectionLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  card: { padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1, gap: Spacing.sm },
  row: { flexDirection: 'row', gap: Spacing.sm },
  field: { flex: 1 },
  label: { color: Colors.textSecondary, fontFamily: Font.bold, fontSize: FontSize.xs, marginBottom: 5 },
  input: { minHeight: 44, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2, color: Colors.text, paddingHorizontal: Spacing.sm, fontFamily: Font.regular },
  segmented: { flexDirection: 'row', gap: Spacing.xs },
  segment: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.surface2 },
  segmentActive: { backgroundColor: Colors.green },
  segmentText: { color: Colors.textSecondary, fontFamily: Font.bold },
  segmentTextActive: { color: Colors.bg },
  help: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, lineHeight: 18 },
  bulkInput: { minHeight: 110, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2, color: Colors.text, padding: Spacing.sm, textAlignVertical: 'top' },
  secondaryButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.surface3 },
  secondaryText: { color: Colors.textSecondary, fontFamily: Font.bold, fontSize: FontSize.sm },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.xs },
  hole: { width: 36, color: Colors.text, fontFamily: Font.bold, textAlign: 'center' },
  scoreInput: { flex: 1, minHeight: 42, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1, color: Colors.text, textAlign: 'center' },
  notice: { marginTop: Spacing.md, padding: Spacing.base, borderRadius: Radius.lg, backgroundColor: Colors.greenMuted, borderWidth: 1, borderColor: Colors.green },
  primaryButton: { marginTop: Spacing.md, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.lg, backgroundColor: Colors.green },
  primaryText: { color: Colors.bg, fontFamily: Font.bold, fontSize: FontSize.base },
  disabled: { opacity: 0.5 },
});

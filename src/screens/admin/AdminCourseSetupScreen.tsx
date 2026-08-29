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
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

type DraftHole = {
  number: number;
  par: string;
  strokeIndex: string;
  metres: string;
};

type ExistingCourse = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

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
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const parseBulkRows = (text: string, holeCount: number): DraftHole[] => {
  const rawLines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const lines = rawLines.filter((line, index) => {
    if (index > 0) return true;
    return !/[a-zA-Z]/.test(line);
  });

  if (lines.length !== holeCount) {
    throw new Error(`Expected ${holeCount} scorecard rows but found ${lines.length}.`);
  }

  return lines.map((line, index) => {
    let cells = line.split(/[\t,;|]+/).map(cell => cell.trim()).filter(Boolean);
    if (cells.length < 3) cells = line.split(/\s+/).map(cell => cell.trim()).filter(Boolean);

    let holeNumber = index + 1;
    let values = cells;
    if (cells.length >= 4) {
      const explicitHole = Number(cells[0]);
      if (Number.isFinite(explicitHole)) {
        holeNumber = explicitHole;
        values = cells.slice(1);
      }
    }

    if (values.length < 3) throw new Error(`Row ${index + 1} needs Par, SI and Metres.`);
    if (holeNumber !== index + 1) throw new Error(`Expected hole ${index + 1} but row contains hole ${holeNumber}.`);

    return {
      number: holeNumber,
      par: values[0],
      strokeIndex: values[1],
      metres: values[2],
    };
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

  const totalMetres = useMemo(
    () => holes.reduce((sum, hole) => sum + (toNumber(hole.metres) ?? 0), 0),
    [holes],
  );

  const updateHoleCount = (count: 9 | 18) => {
    setHoleCount(count);
    setHoles(current => {
      if (count === current.length) return current;
      if (count < current.length) return current.slice(0, count);
      return [...current, ...buildDraftHoles(count - current.length).map((hole, index) => ({
        ...hole,
        number: current.length + index + 1,
      }))];
    });
  };

  const updateHole = (number: number, field: keyof Omit<DraftHole, 'number'>, value: string) => {
    setHoles(current => current.map(hole => hole.number === number ? { ...hole, [field]: value } : hole));
  };

  const applyBulkScorecard = () => {
    try {
      const parsed = parseBulkRows(bulkText, holeCount);
      setHoles(parsed);
      Alert.alert('Scorecard loaded', `${holeCount} holes were loaded into the editor. Review the values before creating the course.`);
    } catch (error: any) {
      Alert.alert('Could not read scorecard', error?.message ?? 'Check the pasted format.');
    }
  };

  const validate = () => {
    const lat = toNumber(latitude);
    const lng = toNumber(longitude);
    const rating = toNumber(courseRating);
    const slope = toNumber(slopeRating);

    if (!courseName.trim()) return 'Enter the course name.';
    if (lat == null || lat < -90 || lat > 90) return 'Enter a valid latitude.';
    if (lng == null || lng < -180 || lng > 180) return 'Enter a valid longitude.';
    if (!teeName.trim()) return 'Enter the tee-set name.';
    if (!teeColour.trim()) return 'Enter the tee colour.';
    if (rating == null || rating <= 0 || rating > 100) return 'Enter a valid course rating.';
    if (slope == null || slope < 55 || slope > 155) return 'Enter a valid slope rating between 55 and 155.';

    const strokeIndexes = new Set<number>();
    for (const hole of holes) {
      const par = toNumber(hole.par);
      const strokeIndex = toNumber(hole.strokeIndex);
      const metres = toNumber(hole.metres);
      if (par == null || par < 3 || par > 6) return `Hole ${hole.number}: enter a par from 3 to 6.`;
      if (strokeIndex == null || strokeIndex < 1 || strokeIndex > holeCount) return `Hole ${hole.number}: enter a stroke index from 1 to ${holeCount}.`;
      if (!Number.isInteger(strokeIndex)) return `Hole ${hole.number}: stroke index must be a whole number.`;
      if (strokeIndexes.has(strokeIndex)) return `Stroke index ${strokeIndex} is used more than once.`;
      strokeIndexes.add(strokeIndex);
      if (metres == null || metres < 40 || metres > 750) return `Hole ${hole.number}: enter a plausible tee distance.`;
    }
    return null;
  };

  const persistCourse = async (normalizedName: string, lat: number, lng: number) => {
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .insert({ name: normalizedName, lat, lng, holes: holeCount })
      .select('id')
      .single();
    if (courseError || !course) throw courseError ?? new Error('Course creation failed.');

    const { error: teeError } = await supabase.from('tee_sets').insert({
      course_id: course.id,
      name: teeName.trim(),
      colour: teeColour.trim().toLowerCase(),
      total_metres: totalMetres,
      course_rating: Number(courseRating.trim()),
      slope_rating: Number(slopeRating.trim()),
    });
    if (teeError) {
      await supabase.from('courses').delete().eq('id', course.id);
      throw teeError;
    }

    const holeRows = holes.map(hole => ({
      course_id: course.id,
      number: hole.number,
      par: Number(hole.par),
      stroke_index: Number(hole.strokeIndex),
      white_metres: Number(hole.metres),
    }));
    const { error: holesError } = await supabase.from('holes').insert(holeRows);
    if (holesError) {
      await supabase.from('courses').delete().eq('id', course.id);
      throw holesError;
    }
  };

  const createCourse = async (allowNearbyDuplicate = false) => {
    if (saving) return;
    const validationError = validate();
    if (validationError) {
      Alert.alert('Check course data', validationError);
      return;
    }

    setSaving(true);
    try {
      const lat = Number(latitude.trim());
      const lng = Number(longitude.trim());
      const normalizedName = courseName.trim();

      const { data: existingCourses, error: duplicateError } = await supabase
        .from('courses')
        .select('id, name, lat, lng');
      if (duplicateError) throw duplicateError;

      const existing = (existingCourses ?? []) as ExistingCourse[];
      const exactName = existing.find(course => course.name.trim().toLowerCase() === normalizedName.toLowerCase());
      if (exactName) {
        Alert.alert('Course already exists', `${exactName.name} is already in the database. Open the existing course instead of creating a duplicate.`);
        return;
      }

      const nearby = existing
        .map(course => ({ course, metresAway: distanceMetres(lat, lng, course.lat, course.lng) }))
        .filter(item => item.metresAway <= 250)
        .sort((a, b) => a.metresAway - b.metresAway)[0];

      if (nearby && !allowNearbyDuplicate) {
        Alert.alert(
          'Possible duplicate nearby',
          `${nearby.course.name} is about ${Math.round(nearby.metresAway)} m from these coordinates. Create this as a separate course anyway?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Create Anyway', onPress: () => { void createCourse(true); } },
          ],
        );
        return;
      }

      await persistCourse(normalizedName, lat, lng);
      Alert.alert('Course created', `${normalizedName} is ready for GPS mapping.`, [{ text: 'Done', onPress: () => navigation.goBack() }]);
    } catch (error: any) {
      Alert.alert('Create course failed', error?.message ?? 'The course could not be created.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>New Course</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>Course</Text>
        <View style={styles.card}>
          <Field label="Course name" value={courseName} onChangeText={setCourseName} placeholder="e.g. Maroochy River Golf Club" />
          <View style={styles.rowFields}>
            <View style={styles.flexField}><Field label="Latitude" value={latitude} onChangeText={setLatitude} keyboardType="numbers-and-punctuation" placeholder="-26.65" /></View>
            <View style={styles.flexField}><Field label="Longitude" value={longitude} onChangeText={setLongitude} keyboardType="numbers-and-punctuation" placeholder="153.08" /></View>
          </View>
          <Text style={styles.inputLabel}>Holes</Text>
          <View style={styles.segmented}>
            {([9, 18] as const).map(count => (
              <TouchableOpacity key={count} style={[styles.segment, holeCount === count && styles.segmentActive]} onPress={() => updateHoleCount(count)}>
                <Text style={[styles.segmentText, holeCount === count && styles.segmentTextActive]}>{count}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Text style={styles.sectionLabel}>Initial tee set</Text>
        <View style={styles.card}>
          <View style={styles.rowFields}>
            <View style={styles.flexField}><Field label="Name" value={teeName} onChangeText={setTeeName} placeholder="White" /></View>
            <View style={styles.flexField}><Field label="Colour" value={teeColour} onChangeText={setTeeColour} placeholder="white" /></View>
          </View>
          <View style={styles.rowFields}>
            <View style={styles.flexField}><Field label="Course rating" value={courseRating} onChangeText={setCourseRating} keyboardType="decimal-pad" placeholder="68.4" /></View>
            <View style={styles.flexField}><Field label="Slope" value={slopeRating} onChangeText={setSlopeRating} keyboardType="number-pad" placeholder="121" /></View>
          </View>
          <Text style={styles.totalText}>Total distance: {totalMetres} m</Text>
        </View>

        <Text style={styles.sectionLabel}>Bulk scorecard paste</Text>
        <View style={styles.card}>
          <Text style={styles.helpText}>Paste one row per hole as: Hole, Par, SI, Metres. Tabs, commas, semicolons and pipes are accepted. A header row is optional.</Text>
          <TextInput
            style={styles.bulkInput}
            value={bulkText}
            onChangeText={setBulkText}
            placeholder={'1,4,7,356\n2,3,15,142\n3,4,3,389'}
            placeholderTextColor={Colors.textMuted}
            multiline
            textAlignVertical="top"
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.secondaryAction} onPress={applyBulkScorecard}>
            <Text style={styles.secondaryActionText}>Load Into Scorecard</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>Scorecard</Text>
        <View style={styles.scoreHeader}>
          <Text style={[styles.scoreHeaderText, styles.holeColumn]}>Hole</Text>
          <Text style={styles.scoreHeaderText}>Par</Text>
          <Text style={styles.scoreHeaderText}>SI</Text>
          <Text style={styles.scoreHeaderText}>Metres</Text>
        </View>
        {holes.map(hole => (
          <View key={hole.number} style={styles.scoreRow}>
            <Text style={[styles.holeNumber, styles.holeColumn]}>{hole.number}</Text>
            <ScoreInput value={hole.par} onChangeText={value => updateHole(hole.number, 'par', value)} />
            <ScoreInput value={hole.strokeIndex} onChangeText={value => updateHole(hole.number, 'strokeIndex', value)} />
            <ScoreInput value={hole.metres} onChangeText={value => updateHole(hole.number, 'metres', value)} />
          </View>
        ))}

        <View style={styles.notice}>
          <Text style={styles.noticeText}>Nothing is written until the complete scorecard validates. The app also checks for matching course names and courses within 250 m of the supplied centre coordinates.</Text>
        </View>

        <TouchableOpacity style={[styles.createButton, saving && styles.disabled]} onPress={() => { void createCourse(); }} disabled={saving}>
          {saving ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.createButtonText}>Create Course</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType = 'default' }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default' | 'number-pad' | 'decimal-pad' | 'numbers-and-punctuation' }) {
  return (
    <View style={styles.field}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        keyboardType={keyboardType}
        autoCapitalize="words"
      />
    </View>
  );
}

function ScoreInput({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) {
  return (
    <TextInput
      style={styles.scoreInput}
      value={value}
      onChangeText={onChangeText}
      keyboardType="number-pad"
      placeholder="—"
      placeholderTextColor={Colors.textMuted}
      textAlign="center"
    />
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { color: Colors.text, fontSize: FontSize.xxl },
  headerTitle: { color: Colors.text, fontFamily: Font.bold, fontWeight: FontWeight.bold, fontSize: FontSize.lg },
  content: { padding: Spacing.base, paddingBottom: Spacing.xxl },
  sectionLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  card: { padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1, gap: Spacing.md },
  field: { gap: 6 },
  inputLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs, textTransform: 'uppercase' },
  input: { minHeight: 46, paddingHorizontal: Spacing.base, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface3, color: Colors.text, fontSize: FontSize.base },
  rowFields: { flexDirection: 'row', gap: Spacing.sm },
  flexField: { flex: 1, minWidth: 0 },
  segmented: { flexDirection: 'row', gap: Spacing.xs },
  segment: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.surface3 },
  segmentActive: { backgroundColor: Colors.green },
  segmentText: { color: Colors.textSecondary, fontFamily: Font.semibold },
  segmentTextActive: { color: Colors.bg, fontFamily: Font.bold },
  totalText: { color: Colors.textSecondary, fontFamily: Font.semibold, textAlign: 'right' },
  helpText: { color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.sm, lineHeight: 20 },
  bulkInput: { minHeight: 130, padding: Spacing.base, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface3, color: Colors.text, fontSize: FontSize.sm },
  secondaryAction: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.surface3, borderWidth: 1, borderColor: Colors.border },
  secondaryActionText: { color: Colors.text, fontFamily: Font.semibold },
  scoreHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, marginBottom: 4 },
  scoreHeaderText: { flex: 1, color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs, textAlign: 'center', textTransform: 'uppercase' },
  holeColumn: { width: 48, flex: 0 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.xs },
  holeNumber: { color: Colors.text, fontFamily: Font.bold, textAlign: 'center' },
  scoreInput: { flex: 1, height: 44, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1, color: Colors.text, fontSize: FontSize.sm },
  notice: { marginTop: Spacing.md, padding: Spacing.base, borderRadius: Radius.md, backgroundColor: Colors.surface2 },
  noticeText: { color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.sm, lineHeight: 20 },
  createButton: { marginTop: Spacing.lg, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.lg, backgroundColor: Colors.green },
  createButtonText: { color: Colors.bg, fontFamily: Font.bold, fontSize: FontSize.base },
  disabled: { opacity: 0.6 },
});

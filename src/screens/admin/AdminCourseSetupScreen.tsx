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

const buildDraftHoles = (count: number): DraftHole[] =>
  Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    par: '',
    strokeIndex: '',
    metres: '',
  }));

const toNumber = (value: string): number | null => {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
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
    if (rating == null || rating <= 0) return 'Enter a valid course rating.';
    if (slope == null || slope < 55 || slope > 155) return 'Enter a valid slope rating between 55 and 155.';

    const strokeIndexes = new Set<number>();
    for (const hole of holes) {
      const par = toNumber(hole.par);
      const strokeIndex = toNumber(hole.strokeIndex);
      const metres = toNumber(hole.metres);
      if (par == null || par < 3 || par > 6) return `Hole ${hole.number}: enter a par from 3 to 6.`;
      if (strokeIndex == null || strokeIndex < 1 || strokeIndex > holeCount) return `Hole ${hole.number}: enter a stroke index from 1 to ${holeCount}.`;
      if (strokeIndexes.has(strokeIndex)) return `Stroke index ${strokeIndex} is used more than once.`;
      strokeIndexes.add(strokeIndex);
      if (metres == null || metres < 40 || metres > 750) return `Hole ${hole.number}: enter a plausible tee distance.`;
    }
    return null;
  };

  const createCourse = async () => {
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

      const { data: duplicateCourses, error: duplicateError } = await supabase
        .from('courses')
        .select('id, name, lat, lng')
        .ilike('name', normalizedName);
      if (duplicateError) throw duplicateError;
      if ((duplicateCourses ?? []).length > 0) {
        Alert.alert('Course already exists', 'A course with this name already exists. Open the existing course instead of creating a duplicate.');
        return;
      }

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

      Alert.alert(
        'Course created',
        `${normalizedName} is ready for GPS mapping.`,
        [{ text: 'Done', onPress: () => navigation.goBack() }],
      );
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Course</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>Course</Text>
        <View style={styles.card}>
          <Field label="Course name" value={courseName} onChangeText={setCourseName} placeholder="e.g. Maroochy River Golf Club" />
          <View style={styles.rowFields}>
            <View style={styles.flexField}>
              <Field label="Latitude" value={latitude} onChangeText={setLatitude} keyboardType="numbers-and-punctuation" placeholder="-26.65" />
            </View>
            <View style={styles.flexField}>
              <Field label="Longitude" value={longitude} onChangeText={setLongitude} keyboardType="numbers-and-punctuation" placeholder="153.08" />
            </View>
          </View>
          <Text style={styles.inputLabel}>Holes</Text>
          <View style={styles.segmented}>
            {([9, 18] as const).map(count => (
              <TouchableOpacity
                key={count}
                style={[styles.segment, holeCount === count && styles.segmentActive]}
                onPress={() => updateHoleCount(count)}
              >
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
          <Text style={styles.noticeText}>The course is only written to Supabase after the scorecard passes validation, so incomplete placeholder courses are not exposed to golfers.</Text>
        </View>

        <TouchableOpacity style={[styles.createButton, saving && styles.disabled]} onPress={() => { void createCourse(); }} disabled={saving}>
          {saving ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.createButtonText}>Create Course</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad' | 'numbers-and-punctuation';
}) {
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

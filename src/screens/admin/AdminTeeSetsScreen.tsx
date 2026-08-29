import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import type { Course, TeeSet } from '../../types';

type TeeDraft = {
  id: string | null;
  name: string;
  colour: string;
  totalMetres: string;
  courseRating: string;
  slopeRating: string;
};

const emptyDraft = (): TeeDraft => ({
  id: null,
  name: '',
  colour: '',
  totalMetres: '',
  courseRating: '',
  slopeRating: '',
});

const numberOrNull = (value: string): number | null => {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
};

export default function AdminTeeSetsScreen() {
  const navigation = useNavigation();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [teeSets, setTeeSets] = useState<TeeSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<TeeDraft>(emptyDraft);
  const [modalVisible, setModalVisible] = useState(false);

  const selectedCourse = useMemo(
    () => courses.find(course => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );

  const loadCourses = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('courses')
      .select('id, name, lat, lng, holes, created_at')
      .order('name');
    if (error) {
      setLoading(false);
      Alert.alert('Course Error', 'Could not load courses.');
      return;
    }
    const loaded = (data ?? []) as Course[];
    setCourses(loaded);
    setSelectedCourseId(current => current && loaded.some(course => course.id === current)
      ? current
      : loaded[0]?.id ?? null);
    setLoading(false);
  }, []);

  const loadTeeSets = useCallback(async (courseId: string) => {
    const { data, error } = await supabase
      .from('tee_sets')
      .select('id, course_id, name, colour, total_metres, course_rating, slope_rating')
      .eq('course_id', courseId)
      .order('total_metres', { ascending: false });
    if (error) {
      Alert.alert('Tee Error', 'Could not load tee sets for this course.');
      return;
    }
    setTeeSets((data ?? []) as TeeSet[]);
  }, []);

  useEffect(() => { void loadCourses(); }, [loadCourses]);

  useEffect(() => {
    if (!selectedCourseId) {
      setTeeSets([]);
      return;
    }
    void loadTeeSets(selectedCourseId);
  }, [loadTeeSets, selectedCourseId]);

  const openNew = () => {
    setDraft(emptyDraft());
    setModalVisible(true);
  };

  const openEdit = (tee: TeeSet) => {
    setDraft({
      id: tee.id,
      name: tee.name,
      colour: tee.colour,
      totalMetres: String(tee.total_metres),
      courseRating: String(tee.course_rating),
      slopeRating: String(tee.slope_rating),
    });
    setModalVisible(true);
  };

  const validateDraft = () => {
    const total = numberOrNull(draft.totalMetres);
    const rating = numberOrNull(draft.courseRating);
    const slope = numberOrNull(draft.slopeRating);
    if (!draft.name.trim()) return 'Enter a tee-set name.';
    if (!draft.colour.trim()) return 'Enter a tee colour.';
    if (total == null || total < 500 || total > 10000) return 'Enter a plausible total course distance.';
    if (rating == null || rating <= 0 || rating > 100) return 'Enter a valid course rating.';
    if (slope == null || slope < 55 || slope > 155) return 'Slope must be between 55 and 155.';
    return null;
  };

  const saveDraft = async () => {
    if (!selectedCourseId || saving) return;
    const validation = validateDraft();
    if (validation) {
      Alert.alert('Check tee data', validation);
      return;
    }
    setSaving(true);
    const payload = {
      course_id: selectedCourseId,
      name: draft.name.trim(),
      colour: draft.colour.trim().toLowerCase(),
      total_metres: Number(draft.totalMetres.trim()),
      course_rating: Number(draft.courseRating.trim()),
      slope_rating: Number(draft.slopeRating.trim()),
    };
    const result = draft.id
      ? await supabase.from('tee_sets').update(payload).eq('id', draft.id)
      : await supabase.from('tee_sets').insert(payload);
    setSaving(false);
    if (result.error) {
      Alert.alert('Save failed', result.error.message);
      return;
    }
    setModalVisible(false);
    setDraft(emptyDraft());
    await loadTeeSets(selectedCourseId);
  };

  const deleteTee = (tee: TeeSet) => {
    Alert.alert(
      'Delete tee set?',
      `${tee.name} will be removed from ${selectedCourse?.name ?? 'this course'}. Existing rounds may prevent deletion.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('tee_sets').delete().eq('id', tee.id);
            if (error) {
              Alert.alert('Delete failed', error.message);
              return;
            }
            if (selectedCourseId) await loadTeeSets(selectedCourseId);
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.headerTitle}>Tee Sets</Text>
          <Text style={styles.subtitle}>{selectedCourse?.name ?? 'Select course'}</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={openNew} disabled={!selectedCourseId}>
          <Text style={styles.addButtonText}>＋</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={Colors.green} /></View>
      ) : (
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

          <Text style={styles.sectionLabel}>Tee sets</Text>
          {teeSets.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No tee sets yet.</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={openNew}>
                <Text style={styles.primaryButtonText}>Add Tee Set</Text>
              </TouchableOpacity>
            </View>
          ) : teeSets.map(tee => (
            <View key={tee.id} style={styles.teeCard}>
              <View style={styles.teeInfo}>
                <View style={styles.teeTitleRow}>
                  <View style={styles.colourDot} />
                  <Text style={styles.teeName}>{tee.name}</Text>
                </View>
                <Text style={styles.teeMeta}>{tee.total_metres} m · Rating {tee.course_rating} · Slope {tee.slope_rating} · {tee.colour}</Text>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.actionButton} onPress={() => openEdit(tee)}><Text style={styles.actionText}>Edit</Text></TouchableOpacity>
                <TouchableOpacity style={styles.deleteButton} onPress={() => deleteTee(tee)}><Text style={styles.deleteText}>Delete</Text></TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{draft.id ? 'Edit Tee Set' : 'Add Tee Set'}</Text>
            <Field label="Name" value={draft.name} onChangeText={value => setDraft(current => ({ ...current, name: value }))} placeholder="White" />
            <Field label="Colour" value={draft.colour} onChangeText={value => setDraft(current => ({ ...current, colour: value }))} placeholder="white" />
            <Field label="Total metres" value={draft.totalMetres} onChangeText={value => setDraft(current => ({ ...current, totalMetres: value }))} placeholder="5200" numeric />
            <Field label="Course rating" value={draft.courseRating} onChangeText={value => setDraft(current => ({ ...current, courseRating: value }))} placeholder="68.4" numeric />
            <Field label="Slope" value={draft.slopeRating} onChangeText={value => setDraft(current => ({ ...current, slopeRating: value }))} placeholder="121" numeric />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setModalVisible(false)}><Text style={styles.secondaryText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.primaryButton, saving && { opacity: 0.5 }]} onPress={() => { void saveDraft(); }} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.primaryButtonText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, placeholder, numeric = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; numeric?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        keyboardType={numeric ? 'numbers-and-punctuation' : 'default'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { color: Colors.text, fontSize: FontSize.xxl },
  titleWrap: { alignItems: 'center', flex: 1 },
  headerTitle: { color: Colors.text, fontFamily: Font.bold, fontWeight: FontWeight.bold, fontSize: FontSize.lg },
  subtitle: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, marginTop: 2 },
  addButton: { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.green },
  addButtonText: { color: Colors.bg, fontSize: FontSize.xl, lineHeight: 26 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.base, paddingBottom: Spacing.xxl },
  sectionLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  courseRow: { gap: Spacing.xs, paddingBottom: Spacing.xs },
  courseChip: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border },
  courseChipActive: { backgroundColor: Colors.greenMuted, borderColor: Colors.green },
  courseChipText: { color: Colors.textSecondary, fontFamily: Font.medium, fontSize: FontSize.sm },
  courseChipTextActive: { color: Colors.green, fontFamily: Font.bold },
  emptyCard: { padding: Spacing.xl, borderRadius: Radius.lg, backgroundColor: Colors.surface1, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: Spacing.md },
  emptyText: { color: Colors.textSecondary, fontFamily: Font.regular },
  teeCard: { padding: Spacing.base, marginBottom: Spacing.sm, borderRadius: Radius.lg, backgroundColor: Colors.surface1, borderWidth: 1, borderColor: Colors.border },
  teeInfo: { gap: 6 },
  teeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  colourDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.text },
  teeName: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.base },
  teeMeta: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.sm },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  actionButton: { flex: 1, minHeight: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface3 },
  actionText: { color: Colors.text, fontFamily: Font.semibold },
  deleteButton: { minHeight: 40, paddingHorizontal: Spacing.base, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.redMuted },
  deleteText: { color: Colors.red, fontFamily: Font.semibold },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.backdrop },
  modalCard: { padding: Spacing.xl, gap: Spacing.md, backgroundColor: Colors.surface1, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl },
  modalTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.lg },
  field: { gap: 6 },
  fieldLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs, textTransform: 'uppercase' },
  input: { minHeight: 46, paddingHorizontal: Spacing.base, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface3, color: Colors.text, fontSize: FontSize.base },
  modalActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  primaryButton: { flex: 1, minHeight: 46, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.green, paddingHorizontal: Spacing.base },
  primaryButtonText: { color: Colors.bg, fontFamily: Font.bold },
  secondaryButton: { flex: 1, minHeight: 46, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface3 },
  secondaryText: { color: Colors.textSecondary, fontFamily: Font.semibold },
});

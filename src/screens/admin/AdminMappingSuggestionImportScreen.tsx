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
import { parseMappingSuggestionBatchJson } from '../../utils/courseMappingSuggestionBatch';
import { Colors, Font, FontSize, Radius, Spacing } from '../../constants/theme';

export default function AdminMappingSuggestionImportScreen() {
  const navigation = useNavigation();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => text.trim() ? parseMappingSuggestionBatchJson(text) : null, [text]);
  const data = parsed?.data ?? null;

  const importBatch = async () => {
    if (!data || !parsed || parsed.errors > 0 || saving) return;
    setSaving(true);
    try {
      const { data: course, error: courseError } = await supabase
        .from('courses')
        .select('id, name, holes')
        .eq('id', data.course_id)
        .maybeSingle();
      if (courseError) throw courseError;
      if (!course) throw new Error('The target course does not exist.');
      const invalidHole = parsed.rows.find(row => row.hole_number > course.holes);
      if (invalidHole) throw new Error(`Hole ${invalidHole.hole_number} is outside ${course.name}'s ${course.holes}-hole layout.`);

      const { error } = await supabase.from('course_mapping_suggestions').insert(parsed.rows.map(row => ({
        course_id: row.course_id,
        hole_number: row.hole_number,
        feature_type: row.feature_type,
        geometry_type: row.geometry_type,
        coordinates: row.coordinates,
        confidence: row.confidence,
        source_provider: row.source_provider,
        source_reference: row.source_reference,
        source_license: row.source_license,
        metadata: row.metadata ?? {},
        review_status: 'pending',
      })));
      if (error) throw error;

      Alert.alert(
        'Suggestions queued',
        `${parsed.rows.length} machine suggestion${parsed.rows.length === 1 ? '' : 's'} were added to ${course.name}. Nothing has changed in playable course geometry yet.`,
        [{ text: 'Review now', onPress: () => navigation.goBack() }],
      );
      setText('');
    } catch (error: any) {
      Alert.alert('Batch import failed', error?.message ?? 'Could not queue mapping suggestions.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Import Mapping Batch</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Machine input, not approved data</Text>
          <Text style={styles.noticeText}>Paste a golfcaddie.mapping-suggestions.v1 batch. Valid rows enter the pending review queue only; human approval is still required.</Text>
        </View>

        <Text style={styles.sectionLabel}>Batch JSON</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          style={styles.input}
          placeholder="Paste golfcaddie.mapping-suggestions.v1 JSON…"
          placeholderTextColor={Colors.textMuted}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          textAlignVertical="top"
        />

        {parsed && (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>{data ? `${data.suggestions.length} suggestions ready` : 'Batch needs attention'}</Text>
              {data && <Text style={styles.summaryText}>Course ID: {data.course_id}</Text>}
              {data && <Text style={styles.summaryText}>Source: {data.source.provider}</Text>}
              <View style={styles.countRow}>
                <Count label="Errors" value={parsed.errors} bad={parsed.errors > 0} />
                <Count label="Warnings" value={parsed.warnings} />
              </View>
            </View>

            {parsed.issues.length > 0 && (
              <View style={styles.issueCard}>
                {parsed.issues.map((issue, index) => (
                  <View key={`${issue.path}-${index}`} style={styles.issueRow}>
                    <Text style={issue.severity === 'error' ? styles.errorIcon : styles.warningIcon}>{issue.severity === 'error' ? '✕' : '⚠'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.issuePath}>{issue.path}</Text>
                      <Text style={styles.issueText}>{issue.message}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {data && (
              <TouchableOpacity style={[styles.importButton, saving && styles.disabled]} onPress={() => void importBatch()} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.importButtonText}>Queue for Human Review</Text>}
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Count({ label, value, bad = false }: { label: string; value: number; bad?: boolean }) {
  return <View style={styles.count}><Text style={[styles.countValue, bad && styles.badText]}>{value}</Text><Text style={styles.countLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { color: Colors.text, fontSize: FontSize.xxl },
  headerTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.lg },
  content: { padding: Spacing.base, paddingBottom: Spacing.xxl },
  notice: { padding: Spacing.base, borderRadius: Radius.lg, backgroundColor: Colors.greenMuted, borderWidth: 1, borderColor: Colors.green },
  noticeTitle: { color: Colors.green, fontFamily: Font.bold, fontSize: FontSize.sm },
  noticeText: { marginTop: 4, color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.xs, lineHeight: 18 },
  sectionLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  input: { minHeight: 240, padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1, color: Colors.text, fontFamily: Font.regular, fontSize: FontSize.sm },
  summaryCard: { marginTop: Spacing.lg, padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1 },
  summaryTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.base },
  summaryText: { marginTop: 4, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs },
  countRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  count: { flex: 1, padding: Spacing.sm, alignItems: 'center', borderRadius: Radius.md, backgroundColor: Colors.surface3 },
  countValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.lg },
  countLabel: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs },
  badText: { color: Colors.red },
  issueCard: { marginTop: Spacing.md, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1 },
  issueRow: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border },
  errorIcon: { color: Colors.red, fontFamily: Font.bold },
  warningIcon: { color: Colors.yellow, fontFamily: Font.bold },
  issuePath: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs },
  issueText: { marginTop: 2, color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.sm },
  importButton: { marginTop: Spacing.lg, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.lg, backgroundColor: Colors.green },
  importButtonText: { color: Colors.bg, fontFamily: Font.bold, fontSize: FontSize.base },
  disabled: { opacity: 0.5 },
});

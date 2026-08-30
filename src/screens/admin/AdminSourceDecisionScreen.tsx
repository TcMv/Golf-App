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
import {
  buildSourceDecisionEvidence,
  type CoverageEvidenceScan,
  type QualityEvidenceSuggestion,
  type SourceDecisionEvidence,
} from '../../utils/sourceDecisionEvidence';
import { Colors, Font, FontSize, Radius, Spacing } from '../../constants/theme';

const STATE_LABEL: Record<SourceDecisionEvidence['state'], string> = {
  insufficient: 'More evidence needed',
  'coverage-gap': 'Coverage gap',
  'quality-concern': 'Quality concern',
  promising: 'Promising evidence',
  mixed: 'Mixed evidence',
};

export default function AdminSourceDecisionScreen() {
  const navigation = useNavigation();
  const [coverage, setCoverage] = useState<CoverageEvidenceScan[]>([]);
  const [quality, setQuality] = useState<QualityEvidenceSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [coverageResult, qualityResult] = await Promise.all([
      supabase.from('course_source_coverage_scans').select('course_id, source_provider, scanned_at, source_score').order('scanned_at', { ascending: false }),
      supabase.from('course_mapping_suggestions').select('source_provider, review_status, manually_edited'),
    ]);
    setLoading(false);
    const error = coverageResult.error ?? qualityResult.error;
    if (error) {
      Alert.alert('Source decision evidence unavailable', `${error.message}\n\nApply the Phase 11 and Phase 12 migrations in the private build before using this scorecard.`);
      return;
    }
    setCoverage((coverageResult.data ?? []) as CoverageEvidenceScan[]);
    setQuality((qualityResult.data ?? []) as QualityEvidenceSuggestion[]);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const evidence = useMemo(() => buildSourceDecisionEvidence(coverage, quality), [coverage, quality]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity>
        <View style={styles.titleWrap}><Text style={styles.headerTitle}>Source Decision</Text><Text style={styles.subtitle}>Coverage + review quality together</Text></View>
        <TouchableOpacity onPress={() => void load()} style={styles.backButton}><Text style={styles.refreshText}>↻</Text></TouchableOpacity>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={Colors.green} /></View> : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Decision support, not an automatic purchasing verdict</Text>
            <Text style={styles.noticeText}>This screen combines the latest saved coverage scan for each course with actual mapping-review outcomes. It helps identify whether the problem is missing data, unreliable data, or simply not enough evidence yet.</Text>
          </View>

          {evidence.length === 0 ? (
            <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No combined evidence yet</Text><Text style={styles.emptyText}>Save Source Coverage benchmarks and review mapping suggestions. The scorecard will then compare coverage and quality by provider.</Text></View>
          ) : evidence.map(source => <SourceCard key={source.providerKey} source={source} />)}

          <View style={styles.frameworkCard}>
            <Text style={styles.frameworkTitle}>How to read it</Text>
            <Text style={styles.frameworkText}>High coverage + strong review outcomes means the source deserves more testing. High coverage + poor review outcomes means lots of correction work. Low coverage + strong outcomes means the source is useful but needs gap filling. Low coverage + poor quality is the strongest signal to investigate another source.</Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SourceCard({ source }: { source: SourceDecisionEvidence }) {
  return <View style={styles.card}>
    <View style={styles.cardHeader}>
      <View style={{ flex: 1 }}><Text style={styles.provider}>{source.providerLabel}</Text><Text style={styles.sample}>{source.courseCount} courses · {source.reviewed} reviewed suggestions</Text></View>
      <View style={[styles.statePill, source.state === 'promising' && styles.statePositive, source.state === 'quality-concern' && styles.stateConcern]}><Text style={styles.stateText}>{STATE_LABEL[source.state]}</Text></View>
    </View>
    <View style={styles.metricsRow}><Metric label="Coverage" value={`${source.averageCoverage}%`} /><Metric label="Accepted" value={source.reviewed ? `${source.acceptanceRate}%` : '—'} /><Metric label="Edited" value={source.reviewed ? `${source.editRate}%` : '—'} /></View>
    {source.notes.map((note, index) => <Text key={index} style={styles.note}>• {note}</Text>)}
  </View>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg }, header: { flexDirection: 'row', alignItems: 'center', padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border }, backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }, backText: { color: Colors.text, fontSize: FontSize.xxl }, refreshText: { color: Colors.green, fontSize: FontSize.xl }, titleWrap: { flex: 1, alignItems: 'center' }, headerTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.lg }, subtitle: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center' }, content: { padding: Spacing.base, paddingBottom: Spacing.xxl },
  notice: { padding: Spacing.base, marginBottom: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.green, backgroundColor: Colors.greenMuted }, noticeTitle: { color: Colors.green, fontFamily: Font.bold, fontSize: FontSize.sm }, noticeText: { marginTop: 5, color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.xs, lineHeight: 18 },
  emptyCard: { padding: Spacing.xl, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1, alignItems: 'center' }, emptyTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.base }, emptyText: { marginTop: Spacing.sm, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  card: { marginBottom: Spacing.md, padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1 }, cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm }, provider: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.base }, sample: { marginTop: 4, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs }, statePill: { maxWidth: 130, paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: Radius.full, backgroundColor: Colors.surface3 }, statePositive: { backgroundColor: Colors.greenMuted }, stateConcern: { backgroundColor: Colors.yellowMuted }, stateText: { color: Colors.textSecondary, fontFamily: Font.bold, fontSize: FontSize.xs, textAlign: 'center' }, metricsRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md }, metric: { flex: 1, alignItems: 'center', padding: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.surface2 }, metricValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.lg }, metricLabel: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs }, note: { marginTop: Spacing.sm, color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.xs, lineHeight: 18 },
  frameworkCard: { marginTop: Spacing.sm, padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2 }, frameworkTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.sm }, frameworkText: { marginTop: 5, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, lineHeight: 18 },
});

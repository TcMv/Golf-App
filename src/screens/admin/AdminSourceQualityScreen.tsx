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
  summarizeSourceQuality,
  type MappingQualitySuggestion,
  type QualityBucket,
} from '../../utils/sourceQuality';
import { Colors, Font, FontSize, Radius, Spacing } from '../../constants/theme';

export default function AdminSourceQualityScreen() {
  const navigation = useNavigation();
  const [rows, setRows] = useState<MappingQualitySuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('course_mapping_suggestions')
      .select('id, source_provider, feature_type, confidence, review_status, manually_edited, edit_count, metadata')
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      Alert.alert('Source quality unavailable', `${error.message}\n\nApply the Phase 12 mapping-quality migration if this is a new private build.`);
      return;
    }
    setRows((data ?? []) as MappingQualitySuggestion[]);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const summary = useMemo(() => summarizeSourceQuality(rows), [rows]);
  const enoughReviewed = summary.reviewed >= 20;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity>
        <View style={styles.titleWrap}><Text style={styles.headerTitle}>Source Quality</Text><Text style={styles.subtitle}>How reliable are mapping suggestions?</Text></View>
        <TouchableOpacity onPress={() => void load()} style={styles.backButton}><Text style={styles.refreshText}>↻</Text></TouchableOpacity>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={Colors.green} /></View> : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.notice, enoughReviewed && styles.noticeReady]}>
            <Text style={styles.noticeTitle}>{enoughReviewed ? 'Calibration sample is becoming useful' : 'Treat early rates as directional'}</Text>
            <Text style={styles.noticeText}>{enoughReviewed ? `${summary.reviewed} reviewed suggestions are available. Keep collecting decisions across courses and feature types.` : `Only ${summary.reviewed} reviewed suggestions are available. Acceptance rates can swing sharply with a small sample.`}</Text>
          </View>

          <Text style={styles.sectionLabel}>Overall</Text>
          <View style={styles.metricsRow}><Metric label="Reviewed" value={String(summary.reviewed)} /><Metric label="Accepted" value={`${summary.acceptanceRate}%`} /><Metric label="Edited" value={`${summary.editRate}%`} /></View>
          <View style={styles.metricsRow}><Metric label="Pending" value={String(summary.pending)} /><Metric label="Rejected" value={String(summary.rejected)} /><Metric label="Total" value={String(summary.total)} /></View>

          <Text style={styles.explainer}>Acceptance measures reviewed suggestions accepted into approved course data. Edited measures reviewed suggestions that needed a manual geometry correction first. Pending suggestions are excluded from both rates.</Text>

          <BucketSection title="By assignment method" buckets={summary.assignments} />
          <BucketSection title="By confidence" buckets={summary.confidenceBands} />
          <BucketSection title="By provider" buckets={summary.providers} />
          <BucketSection title="By feature" buckets={summary.features} />

          <Text style={styles.footnote}>A high coverage score with poor acceptance/edit rates means a source is plentiful but expensive to review. Strong acceptance with low coverage means it is accurate where present but still needs a gap-filling source. Use this alongside Coverage Benchmarks rather than in isolation.</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function BucketSection({ title, buckets }: { title: string; buckets: QualityBucket[] }) {
  return <><Text style={styles.sectionLabel}>{title}</Text><View style={styles.card}>{buckets.length === 0 ? <Text style={styles.emptyText}>No data yet.</Text> : buckets.map(bucket => <View key={bucket.key} style={styles.bucketRow}><View style={{ flex: 1 }}><Text style={styles.bucketLabel}>{bucket.label}</Text><Text style={styles.bucketMeta}>{bucket.reviewed} reviewed · {bucket.pending} pending · {bucket.edited} edited</Text></View><View style={styles.rateWrap}><Text style={styles.rateValue}>{bucket.reviewed ? `${bucket.acceptanceRate}%` : '—'}</Text><Text style={styles.rateLabel}>accepted</Text></View><View style={styles.rateWrap}><Text style={styles.rateValue}>{bucket.reviewed ? `${bucket.editRate}%` : '—'}</Text><Text style={styles.rateLabel}>edited</Text></View></View>)}</View></>;
}
function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg }, header: { flexDirection: 'row', alignItems: 'center', padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border }, backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }, backText: { color: Colors.text, fontSize: FontSize.xxl }, refreshText: { color: Colors.green, fontSize: FontSize.xl }, titleWrap: { flex: 1, alignItems: 'center' }, headerTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.lg }, subtitle: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center' }, content: { padding: Spacing.base, paddingBottom: Spacing.xxl },
  notice: { padding: Spacing.base, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.yellow, backgroundColor: Colors.yellowMuted }, noticeReady: { borderColor: Colors.green, backgroundColor: Colors.greenMuted }, noticeTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.sm }, noticeText: { marginTop: 5, color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.xs, lineHeight: 18 }, sectionLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  metricsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm }, metric: { flex: 1, padding: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.surface1, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' }, metricValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.lg }, metricLabel: { marginTop: 2, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs }, explainer: { marginTop: Spacing.xs, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, lineHeight: 18 },
  card: { borderRadius: Radius.lg, backgroundColor: Colors.surface1, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' }, bucketRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border }, bucketLabel: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.sm, textTransform: 'capitalize' }, bucketMeta: { marginTop: 3, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs }, rateWrap: { width: 54, alignItems: 'center' }, rateValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.sm }, rateLabel: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: 9 }, emptyText: { padding: Spacing.base, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.sm }, footnote: { marginTop: Spacing.lg, color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, lineHeight: 18, textAlign: 'center' },
});

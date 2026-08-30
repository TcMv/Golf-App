import React, { useCallback, useState } from 'react';
import {
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

type Nav = NativeStackNavigationProp<{
  MyBagSetup: { returnTo?: 'StartRound' | 'Main' } | undefined;
  AdminCourseOperations: undefined;
  AdminCourseHistory: undefined;
  AdminDataHealth: undefined;
  AdminSourceCoverage: undefined;
  AdminSourceQuality: undefined;
  AdminSourceDecision: undefined;
  AdminCourseSetup: undefined;
  AdminTeeSets: undefined;
  AdminHoleZones: undefined;
  AdminCourseValidation: undefined;
  AdminCourseImport: undefined;
  AdminCourseExport: undefined;
  AdminMappingSuggestions: undefined;
  AdminMappingSuggestionImport: undefined;
  AdminOsmMapping: undefined;
  AdminMap: undefined;
}>;

function Row({ label, value, onPress, danger = false }: { label: string; value?: string; onPress?: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress}>
      <Text style={[styles.rowLabel, danger && styles.dangerText]}>{label}</Text>
      <View style={styles.rowRight}>
        {value && <Text style={styles.rowValue}>{value}</Text>}
        {onPress && <Text style={styles.chevron}>›</Text>}
      </View>
    </TouchableOpacity>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Switch value={value} onValueChange={onChange} trackColor={{ false: Colors.surface3, true: Colors.greenDark }} thumbColor={value ? Colors.green : Colors.textMuted} /></View>;
}

export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [saving, setSaving] = useState(false);

  const updateProfile = useCallback(async (changes: Record<string, unknown>) => {
    if (!user?.id || saving) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update(changes).eq('id', user.id);
    setSaving(false);
    if (error) { Alert.alert('Save Error', error.message); return; }
    await refreshProfile();
  }, [refreshProfile, saving, user?.id]);

  const deleteAccount = useCallback(() => {
    Alert.alert('Delete Account', 'This permanently deletes your profile, rounds, scores, achievements, and club data.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete Permanently', style: 'destructive', onPress: async () => {
        const { error } = await supabase.rpc('delete_own_account');
        if (error) { Alert.alert('Delete Failed', error.message); return; }
        await signOut();
      } },
    ]);
  }, [signOut]);

  const units = profile?.units_preference ?? 'metres';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.backText}>‹</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>Units</Text>
        <View style={styles.card}>
          <View style={styles.segmented}>
            {(['metres', 'yards'] as const).map(unit => (
              <TouchableOpacity key={unit} style={[styles.segment, units === unit && styles.segmentActive]} onPress={() => updateProfile({ units_preference: unit })}>
                <Text style={[styles.segmentText, units === unit && styles.segmentTextActive]}>{unit === 'metres' ? 'Metres' : 'Yards'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Text style={styles.sectionLabel}>Notifications</Text>
        <View style={styles.card}>
          <ToggleRow label="Round reminders" value={profile?.notify_round_reminders ?? true} onChange={value => updateProfile({ notify_round_reminders: value })} />
          <View style={styles.divider} />
          <ToggleRow label="Streak alerts" value={profile?.notify_streak_alerts ?? true} onChange={value => updateProfile({ notify_streak_alerts: value })} />
          <View style={styles.divider} />
          <ToggleRow label="Achievement unlocks" value={profile?.notify_achievement_unlocks ?? true} onChange={value => updateProfile({ notify_achievement_unlocks: value })} />
        </View>

        <Text style={styles.sectionLabel}>Golf Setup</Text>
        <View style={styles.card}>
          <Row label="Club distances" value="Open setup" onPress={() => navigation.navigate('MyBagSetup', { returnTo: 'Main' })} />
          <View style={styles.divider} />
          <Row label="Course operations" value="Work queue & verification" onPress={() => navigation.navigate('AdminCourseOperations')} />
          <View style={styles.divider} />
          <Row label="Data health" value="Live Supabase checks" onPress={() => navigation.navigate('AdminDataHealth')} />
          <View style={styles.divider} />
          <Row label="Source coverage" value="Measure OSM gaps" onPress={() => navigation.navigate('AdminSourceCoverage')} />
          <View style={styles.divider} />
          <Row label="Source quality" value="Acceptance & edit rates" onPress={() => navigation.navigate('AdminSourceQuality')} />
          <View style={styles.divider} />
          <Row label="Source decision" value="Coverage + quality" onPress={() => navigation.navigate('AdminSourceDecision')} />
          <View style={styles.divider} />
          <Row label="Course history" value="Audit & verification log" onPress={() => navigation.navigate('AdminCourseHistory')} />
          <View style={styles.divider} />
          <Row label="Add new course" value="Course & scorecard" onPress={() => navigation.navigate('AdminCourseSetup')} />
          <View style={styles.divider} />
          <Row label="Import course data" value="JSON, CSV & GeoJSON" onPress={() => navigation.navigate('AdminCourseImport')} />
          <View style={styles.divider} />
          <Row label="Export course data" value="JSON & GeoJSON" onPress={() => navigation.navigate('AdminCourseExport')} />
          <View style={styles.divider} />
          <Row label="Generate from OpenStreetMap" value="Automatic golf geometry" onPress={() => navigation.navigate('AdminOsmMapping')} />
          <View style={styles.divider} />
          <Row label="Import mapping batch" value="Queue machine suggestions" onPress={() => navigation.navigate('AdminMappingSuggestionImport')} />
          <View style={styles.divider} />
          <Row label="Mapping review" value="Approve AI suggestions" onPress={() => navigation.navigate('AdminMappingSuggestions')} />
          <View style={styles.divider} />
          <Row label="Tee sets" value="Add, edit & delete" onPress={() => navigation.navigate('AdminTeeSets')} />
          <View style={styles.divider} />
          <Row label="Hole geometry" value="Fairway, green & centreline" onPress={() => navigation.navigate('AdminHoleZones')} />
          <View style={styles.divider} />
          <Row label="Course editor" value="Points & hazards" onPress={() => navigation.navigate('AdminMap')} />
          <View style={styles.divider} />
          <Row label="Course readiness" value="Completeness & issues" onPress={() => navigation.navigate('AdminCourseValidation')} />
        </View>

        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.card}>
          <Row label="Email" value={user?.email ?? ''} />
          <View style={styles.divider} />
          <Row label="Sign out" onPress={() => Alert.alert('Sign Out', 'Sign out of GolfCaddie?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign Out', style: 'destructive', onPress: signOut },
          ])} />
          <View style={styles.divider} />
          <Row label="Delete account" danger onPress={deleteAccount} />
        </View>
        <Text style={styles.appVersion}>GolfCaddie · Version 1.0.0 · Build 1</Text>
      </ScrollView>
    </SafeAreaView>
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
  card: { borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface1, overflow: 'hidden' },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base },
  rowLabel: { color: Colors.text, fontFamily: Font.medium, fontSize: FontSize.base },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexShrink: 1 },
  rowValue: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.sm, flexShrink: 1 },
  chevron: { color: Colors.textMuted, fontSize: FontSize.xl },
  dangerText: { color: Colors.red },
  divider: { height: 1, marginHorizontal: Spacing.base, backgroundColor: Colors.border },
  segmented: { flexDirection: 'row', padding: Spacing.xs, gap: Spacing.xs },
  segment: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
  segmentActive: { backgroundColor: Colors.green },
  segmentText: { color: Colors.textSecondary, fontFamily: Font.semibold, fontSize: FontSize.sm },
  segmentTextActive: { color: Colors.bg },
  appVersion: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.xxl },
});

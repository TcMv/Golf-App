import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useUserStats } from '../../hooks/useUserStats';
import AchievementGrid from '../../components/profile/AchievementGrid';
import { Ionicons } from '@expo/vector-icons';
import { normalizeGhin, profileInitials } from '../../utils/profile';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import type { Course } from '../../types';

type Nav = NativeStackNavigationProp<{ SettingsDetail: undefined }>;

export default function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { user, profile, refreshProfile } = useAuth();
  const { stats, badges, loading } = useUserStats();
  const [courses, setCourses] = useState<Course[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [ghin, setGhin] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [homeCourseId, setHomeCourseId] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(profile?.display_name ?? '');
    setGhin(profile?.ghin_number ?? '');
    setAvatarUrl(profile?.avatar_url ?? '');
    setHomeCourseId(profile?.home_course_id ?? null);
  }, [profile]);

  useEffect(() => {
    supabase
      .from('courses')
      .select('id, name, lat, lng, holes, publication_status, created_at')
      .eq('publication_status', 'published')
      .order('name')
      .then(({ data }) => setCourses((data ?? []) as Course[]));
  }, []);

  const saveProfile = useCallback(async () => {
    if (!user?.id || !displayName.trim()) {
      Alert.alert('Display Name Required', 'Enter the name shown on your profile.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      display_name: displayName.trim(),
      ghin_number: normalizeGhin(ghin),
      home_course_id: homeCourseId,
      avatar_url: avatarUrl.trim() || null,
    }).eq('id', user.id);
    setSaving(false);
    if (error) {
      Alert.alert('Save Error', error.message);
      return;
    }
    await refreshProfile();
    setEditing(false);
  }, [avatarUrl, displayName, ghin, homeCourseId, refreshProfile, user?.id]);

  const homeCourse = courses.find(course => course.id === profile?.home_course_id);
  const initials = profileInitials(profile?.display_name, user?.email);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity
          style={styles.settingsIconBtn}
          onPress={() => navigation.navigate('SettingsDetail')}
          accessibilityLabel="Open Settings"
        >
          <Ionicons name="settings-outline" size={22} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatar}><Text style={styles.initials}>{initials}</Text></View>
          )}
          <Text style={styles.name}>{profile?.display_name || 'Golfer'}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <Text style={styles.meta}>
            {profile?.ghin_number ? `GA ${profile.ghin_number}` : 'No GA number'} · {homeCourse?.name ?? 'No home course'}
          </Text>
          <TouchableOpacity style={styles.editButton} onPress={() => setEditing(true)}>
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>Stats Summary</Text>
        <View style={styles.statsStrip}>
          {[
            ['Rounds', stats?.total_rounds ?? 0],
            ['Birdies', stats?.total_birdies ?? 0],
            ['Best Streak', stats?.longest_streak ?? 0],
            ['Level', stats?.level ?? 1],
          ].map(([label, value]) => (
            <View key={label} style={styles.stat}>
              <Text style={styles.statValue}>{value}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Achievements</Text>
        {loading ? <ActivityIndicator color={Colors.green} /> : <AchievementGrid earned={badges} />}
      </ScrollView>

      <Modal visible={editing} transparent animationType="slide" onRequestClose={() => setEditing(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalBackdrop}>
            <ScrollView
              style={styles.modal}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <Text style={styles.inputLabel}>Display Name</Text>
            <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} />
            <Text style={styles.inputLabel}>Golf Australia Number (optional)</Text>
            <TextInput style={styles.input} value={ghin} onChangeText={setGhin} keyboardType="number-pad" />
            <Text style={styles.inputLabel}>Avatar Image URL (optional)</Text>
            <TextInput
              style={styles.input}
              value={avatarUrl}
              onChangeText={setAvatarUrl}
              autoCapitalize="none"
              keyboardType="url"
              placeholder="https://..."
              placeholderTextColor={Colors.textMuted}
            />
            <Text style={styles.inputLabel}>Home Course</Text>
            <ScrollView style={styles.courseList}>
              {courses.map(course => (
                <TouchableOpacity
                  key={course.id}
                  style={[styles.courseRow, homeCourseId === course.id && styles.courseRowActive]}
                  onPress={() => setHomeCourseId(course.id)}
                >
                  <Text style={styles.courseName}>{course.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setEditing(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={saveProfile} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.bg} /> : <Text style={styles.saveText}>Save</Text>}
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { color: Colors.text, fontFamily: Font.bold, fontWeight: FontWeight.bold, fontSize: FontSize.xl },
  settingsIconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.base, paddingBottom: Spacing.xxl },
  hero: { alignItems: 'center', padding: Spacing.xl, borderRadius: Radius.xl, backgroundColor: Colors.surface1, borderWidth: 1, borderColor: Colors.border },
  avatar: { width: 92, height: 92, borderRadius: Radius.full, backgroundColor: Colors.greenMuted, alignItems: 'center', justifyContent: 'center' },
  initials: { color: Colors.green, fontFamily: Font.black, fontSize: FontSize.xxl },
  name: { color: Colors.text, fontFamily: Font.black, fontWeight: FontWeight.black, fontSize: FontSize.xl, marginTop: Spacing.md },
  email: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.sm, marginTop: 2 },
  meta: { color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.sm, marginTop: Spacing.sm, textAlign: 'center' },
  editButton: { marginTop: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.green },
  editButtonText: { color: Colors.bg, fontFamily: Font.bold, fontSize: FontSize.sm },
  sectionLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs, letterSpacing: 0.8, marginTop: Spacing.xl, marginBottom: Spacing.sm, textTransform: 'uppercase' },
  statsStrip: { flexDirection: 'row', backgroundColor: Colors.surface1, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border },
  stat: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md },
  statValue: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.md },
  statLabel: { color: Colors.textMuted, fontFamily: Font.regular, fontSize: FontSize.xs, marginTop: 2 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.backdrop },
  modal: { maxHeight: '88%', borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, backgroundColor: Colors.surface1 },
  modalScrollContent: { padding: Spacing.xl, paddingBottom: Spacing.xxl, gap: Spacing.sm },
  modalTitle: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.lg, marginBottom: Spacing.sm },
  inputLabel: { color: Colors.textMuted, fontFamily: Font.bold, fontSize: FontSize.xs, textTransform: 'uppercase' },
  input: { height: 48, paddingHorizontal: Spacing.base, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface3, color: Colors.text },
  courseList: { maxHeight: 180, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  courseRow: { padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  courseRowActive: { backgroundColor: Colors.greenMuted },
  courseName: { color: Colors.text, fontFamily: Font.medium, fontSize: FontSize.sm },
  modalButtons: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  cancelButton: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.surface3 },
  cancelText: { color: Colors.textSecondary, fontFamily: Font.semibold },
  saveButton: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, backgroundColor: Colors.green },
  saveText: { color: Colors.bg, fontFamily: Font.bold },
});

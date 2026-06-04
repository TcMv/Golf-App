import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import type { Club, ClubType } from '../../types';

const CLUB_TYPES: ClubType[] = ['driver', 'wood', 'hybrid', 'iron', 'wedge', 'putter'];

const TYPE_ICONS: Record<ClubType, string> = {
  driver: '🏌',
  wood: '🌳',
  hybrid: '⚡',
  iron: '🔩',
  wedge: '🔧',
  putter: '🎯',
};

export default function MyBagScreen() {
  const navigation = useNavigation();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ClubType>('iron');
  const [newLoft, setNewLoft] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchClubs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('clubs').select('*').order('sort_order');
    setClubs((data ?? []) as Club[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchClubs(); }, [fetchClubs]);

  const handleDelete = useCallback((club: Club) => {
    Alert.alert(
      `Remove ${club.name}?`,
      'Remove this club from your bag.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('clubs').delete().eq('id', club.id);
            setClubs((prev) => prev.filter((c) => c.id !== club.id));
          },
        },
      ],
    );
  }, []);

  const handleAdd = useCallback(async () => {
    if (!newName.trim()) {
      Alert.alert('Required', 'Enter a club name.');
      return;
    }
    setSaving(true);
    const maxOrder = clubs.reduce((m, c) => Math.max(m, c.sort_order), 0);
    const { data, error } = await supabase
      .from('clubs')
      .insert({
        name: newName.trim(),
        type: newType,
        loft: newLoft ? parseFloat(newLoft) : null,
        sort_order: maxOrder + 1,
      })
      .select()
      .single();

    setSaving(false);
    if (error || !data) {
      Alert.alert('Error', 'Failed to add club.');
      return;
    }
    setClubs((prev) => [...prev, data as Club]);
    setModalVisible(false);
    setNewName('');
    setNewType('iron');
    setNewLoft('');
  }, [newName, newType, newLoft, clubs]);

  const groupedClubs = CLUB_TYPES.map((type) => ({
    type,
    clubs: clubs.filter((c) => c.type === type),
  })).filter((g) => g.clubs.length > 0);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Bag</Text>
        <Text style={styles.headerCount}>{clubs.length} clubs</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.green} size="large" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={groupedClubs}
          keyExtractor={(g) => g.type}
          contentContainerStyle={styles.listContent}
          renderItem={({ item: group }) => (
            <View style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupIcon}>{TYPE_ICONS[group.type]}</Text>
                <Text style={styles.groupTitle}>
                  {group.type.charAt(0).toUpperCase() + group.type.slice(1)}s
                </Text>
              </View>
              <View style={styles.groupCard}>
                {group.clubs.map((club, idx) => (
                  <View key={club.id}>
                    {idx > 0 && <View style={styles.clubDivider} />}
                    <View style={styles.clubRow}>
                      <View style={styles.clubInfo}>
                        <Text style={styles.clubName}>{club.custom_name ?? club.name}</Text>
                        {club.loft && (
                          <Text style={styles.clubLoft}>{club.loft}°</Text>
                        )}
                      </View>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDelete(club)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.deleteBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
          ListFooterComponent={
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setModalVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.addBtnText}>+ Add Club</Text>
            </TouchableOpacity>
          }
        />
      )}

      {/* Add Club Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Add Club</Text>

            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. 7 Iron, 56° Wedge"
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />

            <Text style={styles.inputLabel}>Type</Text>
            <View style={styles.typeGrid}>
              {CLUB_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeBtn, newType === type && styles.typeBtnActive]}
                  onPress={() => setNewType(type)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.typeIcon}>{TYPE_ICONS[type]}</Text>
                  <Text style={[styles.typeBtnText, newType === type && styles.typeBtnTextActive]}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Loft (optional)</Text>
            <TextInput
              style={styles.input}
              value={newLoft}
              onChangeText={setNewLoft}
              placeholder="e.g. 52"
              placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad"
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleAdd} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.saveBtnText}>Add Club</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: FontSize.xxl, color: Colors.text, lineHeight: FontSize.xxl + 4 },
  headerTitle: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.text, textAlign: 'center' },
  headerCount: { fontSize: FontSize.sm, color: Colors.textMuted, width: 60, textAlign: 'right' },
  listContent: { padding: Spacing.base, gap: Spacing.md, paddingBottom: Spacing.xxl },

  group: { gap: Spacing.sm },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  groupIcon: { fontSize: FontSize.base },
  groupTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  groupCard: {
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  clubDivider: { height: 1, backgroundColor: Colors.border, marginHorizontal: Spacing.base },
  clubInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  clubName: { fontSize: FontSize.base, fontWeight: FontWeight.medium, color: Colors.text },
  clubLoft: { fontSize: FontSize.xs, color: Colors.textMuted, backgroundColor: Colors.surface3, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: { fontSize: FontSize.xs, color: Colors.textMuted },

  addBtn: {
    height: 52,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  addBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.green },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: Colors.surface1,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    gap: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  inputLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    height: 48,
    backgroundColor: Colors.surface3,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.base,
    fontSize: FontSize.base,
    color: Colors.text,
  },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeBtnActive: { backgroundColor: Colors.greenMuted, borderColor: Colors.green },
  typeIcon: { fontSize: FontSize.sm },
  typeBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textSecondary },
  typeBtnTextActive: { color: Colors.green },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  saveBtn: {
    flex: 2,
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: '#000' },
});

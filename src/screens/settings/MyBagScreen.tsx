import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
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

const GROUP_LABELS: Record<ClubType, string> = {
  driver: 'Driver',
  wood: 'Woods',
  hybrid: 'Hybrids',
  iron: 'Irons',
  wedge: 'Wedges',
  putter: 'Putter',
};

type Preset = { name: string; type: ClubType; loft: number | null };

const CLUB_PRESETS: Preset[] = [
  { name: 'Driver', type: 'driver', loft: null },
  { name: '3 Wood', type: 'wood', loft: 15 },
  { name: '4 Wood', type: 'wood', loft: 17 },
  { name: '5 Wood', type: 'wood', loft: 18 },
  { name: '7 Wood', type: 'wood', loft: 21 },
  { name: '9 Wood', type: 'wood', loft: 24 },
  { name: '2 Hybrid', type: 'hybrid', loft: 17 },
  { name: '3 Hybrid', type: 'hybrid', loft: 19 },
  { name: '4 Hybrid', type: 'hybrid', loft: 22 },
  { name: '5 Hybrid', type: 'hybrid', loft: 25 },
  { name: '6 Hybrid', type: 'hybrid', loft: 28 },
  { name: '7 Hybrid', type: 'hybrid', loft: 31 },
  { name: '2 Iron', type: 'iron', loft: 18 },
  { name: '3 Iron', type: 'iron', loft: 21 },
  { name: '4 Iron', type: 'iron', loft: 24 },
  { name: '5 Iron', type: 'iron', loft: 27 },
  { name: '6 Iron', type: 'iron', loft: 30 },
  { name: '7 Iron', type: 'iron', loft: 34 },
  { name: '8 Iron', type: 'iron', loft: 38 },
  { name: '9 Iron', type: 'iron', loft: 42 },
  { name: 'Pitching Wedge', type: 'wedge', loft: 46 },
  { name: 'Gap Wedge', type: 'wedge', loft: 50 },
  { name: '52° Wedge', type: 'wedge', loft: 52 },
  { name: '54° Wedge', type: 'wedge', loft: 54 },
  { name: '56° Wedge', type: 'wedge', loft: 56 },
  { name: '58° Wedge', type: 'wedge', loft: 58 },
  { name: '60° Wedge', type: 'wedge', loft: 60 },
  { name: '62° Wedge', type: 'wedge', loft: 62 },
  { name: '64° Wedge', type: 'wedge', loft: 64 },
  { name: 'Sand Wedge', type: 'wedge', loft: 56 },
  { name: 'Lob Wedge', type: 'wedge', loft: 60 },
  { name: 'Putter', type: 'putter', loft: null },
];

const PRESET_GROUPS = CLUB_TYPES.map(type => ({
  type,
  label: GROUP_LABELS[type],
  presets: CLUB_PRESETS.filter(p => p.type === type),
}));

type EditState = { club: Club; carry: string };
type AddStep = 'pick' | 'carry';

export default function MyBagScreen() {
  const navigation = useNavigation();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addStep, setAddStep] = useState<AddStep>('pick');
  const [isCustom, setIsCustom] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ClubType>('iron');
  const [newLoft, setNewLoft] = useState('');
  const [newCarry, setNewCarry] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchClubs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('clubs')
      .select('id, name, type, loft, custom_name, sort_order, carry_metres, carry_stddev_metres')
      .order('sort_order');
    setClubs((data ?? []) as Club[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchClubs(); }, [fetchClubs]);

  const handleDelete = useCallback((club: Club) => {
    Alert.alert(
      `Remove ${club.custom_name ?? club.name}?`,
      'Remove this club from your bag.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            await supabase.from('clubs').delete().eq('id', club.id);
            setClubs(prev => prev.filter(c => c.id !== club.id));
          },
        },
      ],
    );
  }, []);

  const openAdd = useCallback(() => {
    setAddStep('pick');
    setIsCustom(false);
    setNewName(''); setNewType('iron'); setNewLoft(''); setNewCarry('');
    setAddModalVisible(true);
  }, []);

  const closeAdd = useCallback(() => {
    setAddModalVisible(false);
    setAddStep('pick');
    setIsCustom(false);
    setNewName(''); setNewType('iron'); setNewLoft(''); setNewCarry('');
  }, []);

  const selectPreset = useCallback((preset: Preset) => {
    setNewName(preset.name);
    setNewType(preset.type);
    setNewLoft(preset.loft?.toString() ?? '');
    setNewCarry('');
    setIsCustom(false);
    setAddStep('carry');
  }, []);

  const selectCustom = useCallback(() => {
    setNewName(''); setNewType('iron'); setNewLoft(''); setNewCarry('');
    setIsCustom(true);
    setAddStep('carry');
  }, []);

  const handleAdd = useCallback(async () => {
    if (!newName.trim()) { Alert.alert('Required', 'Enter a club name.'); return; }
    setSaving(true);
    const maxOrder = clubs.reduce((m, c) => Math.max(m, c.sort_order), 0);
    const { data, error } = await supabase
      .from('clubs')
      .insert({
        name: newName.trim(),
        type: newType,
        loft: newLoft ? parseFloat(newLoft) : null,
        carry_metres: newCarry ? parseInt(newCarry, 10) : null,
        sort_order: maxOrder + 1,
      })
      .select('id, name, type, loft, custom_name, sort_order, carry_metres, carry_stddev_metres')
      .single();
    setSaving(false);
    if (error || !data) { Alert.alert('Error', 'Failed to add club.'); return; }
    setClubs(prev => [...prev, data as Club]);
    closeAdd();
  }, [newName, newType, newLoft, newCarry, clubs, closeAdd]);

  const openEdit = useCallback((club: Club) => {
    setEditState({ club, carry: club.carry_metres?.toString() ?? '' });
  }, []);

  const saveCarry = useCallback(async () => {
    if (!editState) return;
    setSaving(true);
    const carry = editState.carry ? parseInt(editState.carry, 10) : null;
    const { error } = await supabase
      .from('clubs')
      .update({ carry_metres: carry })
      .eq('id', editState.club.id);
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setClubs(prev => prev.map(c => c.id === editState.club.id ? { ...c, carry_metres: carry } : c));
    setEditState(null);
  }, [editState]);

  const groupedClubs = CLUB_TYPES.map(type => ({
    type,
    clubs: clubs.filter(c => c.type === type),
  })).filter(g => g.clubs.length > 0);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Bag</Text>
        <Text style={styles.headerCount}>{clubs.length} clubs</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.green} size="large" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={groupedClubs}
          keyExtractor={g => g.type}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <Text style={styles.hint}>Tap a club to set carry distance</Text>
          }
          renderItem={({ item: group }) => (
            <View style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupIcon}>{TYPE_ICONS[group.type]}</Text>
                <Text style={styles.groupTitle}>{GROUP_LABELS[group.type]}</Text>
              </View>
              <View style={styles.groupCard}>
                {group.clubs.map((club, idx) => (
                  <View key={club.id}>
                    {idx > 0 && <View style={styles.clubDivider} />}
                    <TouchableOpacity
                      style={styles.clubRow}
                      onPress={() => openEdit(club)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.clubInfo}>
                        <Text style={styles.clubName}>{club.custom_name ?? club.name}</Text>
                        {club.loft != null && (
                          <Text style={styles.clubLoft}>{club.loft}°</Text>
                        )}
                      </View>
                      {club.carry_metres != null ? (
                        <Text style={styles.carrySet}>{club.carry_metres}m</Text>
                      ) : (
                        <Text style={styles.carryUnset}>Set carry</Text>
                      )}
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDelete(club)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close" size={14} color={Colors.textMuted} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          )}
          ListFooterComponent={
            <TouchableOpacity
              style={styles.addBtn}
              onPress={openAdd}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={20} color={Colors.green} />
              <Text style={styles.addBtnText}>Add Club</Text>
            </TouchableOpacity>
          }
        />
      )}

      {/* Edit carry modal */}
      <Modal
        visible={editState !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditState(null)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>
                {editState?.club.custom_name ?? editState?.club.name}
              </Text>
              <Text style={styles.inputLabel}>Carry Distance (metres)</Text>
              <TextInput
                style={styles.input}
                value={editState?.carry ?? ''}
                onChangeText={v => setEditState(prev => prev ? { ...prev, carry: v } : null)}
                placeholder="e.g. 155"
                placeholderTextColor={Colors.textMuted}
                keyboardType="number-pad"
                autoFocus
              />
              <Text style={styles.inputHint}>
                Average carry in metres from the middle of a clean strike.
                The caddie will refine this over time from your tracked shots.
              </Text>
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditState(null)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={saveCarry} disabled={saving}>
                  {saving
                    ? <ActivityIndicator color={Colors.bg} />
                    : <Text style={styles.saveBtnText}>Save</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Club Modal */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeAdd}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalBackdrop}>
            {addStep === 'pick' ? (
              /* Step 1: pick from catalog */
              <View style={styles.modal}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Add Club</Text>
                  <TouchableOpacity onPress={closeAdd} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close" size={22} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} style={styles.presetScroll}>
                  {PRESET_GROUPS.map(group => (
                    <View key={group.type} style={styles.presetGroup}>
                      <View style={styles.presetGroupHeader}>
                        <Text style={styles.presetGroupIcon}>{TYPE_ICONS[group.type]}</Text>
                        <Text style={styles.presetGroupLabel}>{group.label}</Text>
                      </View>
                      <View style={styles.presetCard}>
                        {group.presets.map((preset, idx) => (
                          <View key={preset.name}>
                            {idx > 0 && <View style={styles.clubDivider} />}
                            <TouchableOpacity
                              style={styles.presetRow}
                              onPress={() => selectPreset(preset)}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.presetName}>{preset.name}</Text>
                              {preset.loft != null && (
                                <Text style={styles.presetLoft}>{preset.loft}°</Text>
                              )}
                              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.customRow} onPress={selectCustom} activeOpacity={0.7}>
                    <Ionicons name="add-circle-outline" size={20} color={Colors.green} />
                    <Text style={styles.customRowText}>Custom Club</Text>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                </ScrollView>
              </View>
            ) : (
              /* Step 2: enter carry (and details if custom) */
              <ScrollView
                style={styles.modal}
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <TouchableOpacity style={styles.stepBackRow} onPress={() => setAddStep('pick')}>
                  <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
                  <Text style={styles.stepBackText}>All Clubs</Text>
                </TouchableOpacity>

                {isCustom ? (
                  <>
                    <Text style={styles.modalTitle}>Custom Club</Text>
                    <Text style={styles.inputLabel}>Name</Text>
                    <TextInput
                      style={styles.input}
                      value={newName}
                      onChangeText={setNewName}
                      placeholder="e.g. 5 Wood, 56° Wedge"
                      placeholderTextColor={Colors.textMuted}
                      autoFocus
                    />
                    <Text style={styles.inputLabel}>Type</Text>
                    <View style={styles.typeGrid}>
                      {CLUB_TYPES.map(type => (
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
                  </>
                ) : (
                  <View style={styles.presetConfirmRow}>
                    <Text style={styles.presetConfirmIcon}>{TYPE_ICONS[newType]}</Text>
                    <View>
                      <Text style={styles.presetConfirmName}>{newName}</Text>
                      {newLoft ? <Text style={styles.presetConfirmLoft}>{newLoft}°</Text> : null}
                    </View>
                  </View>
                )}

                <Text style={styles.inputLabel}>Carry Distance — metres (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={newCarry}
                  onChangeText={setNewCarry}
                  placeholder="e.g. 175"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="number-pad"
                  autoFocus={!isCustom}
                />
                <Text style={styles.inputHint}>You can always set this later by tapping the club in your bag.</Text>

                <View style={styles.modalBtns}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={closeAdd}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveBtn} onPress={handleAdd} disabled={saving}>
                    {saving
                      ? <ActivityIndicator color={Colors.bg} />
                      : <Text style={styles.saveBtnText}>Add to Bag</Text>
                    }
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1, fontSize: FontSize.md, fontFamily: Font.semibold, fontWeight: FontWeight.semibold,
    color: Colors.text, textAlign: 'center',
  },
  headerCount: { fontSize: FontSize.sm, fontFamily: Font.regular, color: Colors.textMuted, width: 60, textAlign: 'right' },
  listContent: { padding: Spacing.base, gap: Spacing.md, paddingBottom: Spacing.xxl },
  hint: { fontSize: FontSize.xs, fontFamily: Font.regular, color: Colors.textMuted, textAlign: 'center', marginBottom: Spacing.sm },
  group: { gap: Spacing.sm },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  groupIcon: { fontSize: FontSize.base },
  groupTitle: {
    fontSize: FontSize.xs, fontFamily: Font.semibold, fontWeight: FontWeight.semibold,
    color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6,
  },
  groupCard: {
    backgroundColor: Colors.surface1, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  clubRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  clubDivider: { height: 1, backgroundColor: Colors.border, marginHorizontal: Spacing.base },
  clubInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  clubName: { fontSize: FontSize.base, fontFamily: Font.medium, fontWeight: FontWeight.medium, color: Colors.text },
  clubLoft: {
    fontSize: FontSize.xs, fontFamily: Font.regular, color: Colors.textMuted,
    backgroundColor: Colors.surface3, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
  },
  carrySet: {
    fontSize: FontSize.base, fontFamily: Font.semibold, fontWeight: FontWeight.semibold,
    color: Colors.green, marginRight: Spacing.sm, minWidth: 44, textAlign: 'right',
  },
  carryUnset: {
    fontSize: FontSize.xs, fontFamily: Font.regular, color: Colors.textMuted,
    marginRight: Spacing.sm, minWidth: 54, textAlign: 'right',
  },
  deleteBtn: {
    width: 32, height: 32, borderRadius: Radius.full,
    backgroundColor: Colors.surface3,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtn: {
    minHeight: 48, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.borderStrong, borderStyle: 'dashed',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, marginTop: Spacing.sm,
  },
  addBtnText: { fontSize: FontSize.base, fontFamily: Font.semibold, fontWeight: FontWeight.semibold, color: Colors.green },
  modalBackdrop: { flex: 1, backgroundColor: Colors.backdrop, justifyContent: 'flex-end' },
  modal: {
    backgroundColor: Colors.surface1,
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    maxHeight: '90%',
  },
  modalScrollContent: { padding: Spacing.xl, gap: Spacing.md, paddingBottom: Spacing.xxl },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.xl, paddingBottom: Spacing.md,
  },
  modalTitle: { fontSize: FontSize.lg, fontFamily: Font.bold, fontWeight: FontWeight.bold, color: Colors.text },
  presetScroll: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xxl },
  presetGroup: { gap: Spacing.sm, marginBottom: Spacing.lg },
  presetGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  presetGroupIcon: { fontSize: FontSize.base },
  presetGroupLabel: {
    fontSize: FontSize.xs, fontFamily: Font.semibold, fontWeight: FontWeight.semibold,
    color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6,
  },
  presetCard: {
    backgroundColor: Colors.surface3, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  presetRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  presetName: { flex: 1, fontSize: FontSize.base, fontFamily: Font.medium, fontWeight: FontWeight.medium, color: Colors.text },
  presetLoft: {
    fontSize: FontSize.xs, fontFamily: Font.regular, color: Colors.textMuted,
    backgroundColor: Colors.surface1, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
  },
  customRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.md, marginBottom: Spacing.xxl,
  },
  customRowText: { flex: 1, fontSize: FontSize.base, fontFamily: Font.medium, fontWeight: FontWeight.medium, color: Colors.green },
  stepBackRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: Spacing.sm },
  stepBackText: { fontSize: FontSize.sm, fontFamily: Font.regular, color: Colors.textMuted },
  presetConfirmRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface3, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  presetConfirmIcon: { fontSize: FontSize.xl },
  presetConfirmName: { fontSize: FontSize.lg, fontFamily: Font.bold, fontWeight: FontWeight.bold, color: Colors.text },
  presetConfirmLoft: { fontSize: FontSize.sm, fontFamily: Font.regular, color: Colors.textMuted, marginTop: 2 },
  inputLabel: {
    fontSize: FontSize.xs, fontFamily: Font.semibold, fontWeight: FontWeight.semibold,
    color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  inputHint: { fontSize: FontSize.xs, fontFamily: Font.regular, color: Colors.textMuted, lineHeight: 18 },
  input: {
    height: 48, backgroundColor: Colors.surface3,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.base, fontSize: FontSize.base, color: Colors.text,
  },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.md, backgroundColor: Colors.surface3,
    borderWidth: 1, borderColor: Colors.border,
  },
  typeBtnActive: { backgroundColor: Colors.greenMuted, borderColor: Colors.green },
  typeIcon: { fontSize: FontSize.sm },
  typeBtnText: { fontSize: FontSize.sm, fontFamily: Font.medium, fontWeight: FontWeight.medium, color: Colors.textSecondary },
  typeBtnTextActive: { color: Colors.green },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  cancelBtn: {
    flex: 1, minHeight: 48, borderRadius: Radius.md,
    backgroundColor: Colors.surface3, alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { fontSize: FontSize.base, fontFamily: Font.semibold, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  saveBtn: {
    flex: 2, minHeight: 48, borderRadius: Radius.md,
    backgroundColor: Colors.green, alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { fontSize: FontSize.base, fontFamily: Font.bold, fontWeight: FontWeight.bold, color: Colors.bg },
});

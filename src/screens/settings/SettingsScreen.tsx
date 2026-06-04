import React, { useCallback, useEffect, useState } from 'react';
import {
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
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

type RootStackParamList = {
  PlayHome: undefined;
  MyBag: undefined;
  Settings: undefined;
};
type Nav = NativeStackNavigationProp<RootStackParamList>;

function SettingsRow({
  label,
  value,
  onPress,
  chevron = true,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  chevron?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        {value && <Text style={styles.rowValue}>{value}</Text>}
        {chevron && <Text style={styles.chevron}>›</Text>}
      </View>
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const [handicapIndex, setHandicapIndex] = useState<string>('');
  const [handicapModalVisible, setHandicapModalVisible] = useState(false);
  const [handicapInput, setHandicapInput] = useState('');

  const loadHandicap = useCallback(async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'handicap_index')
      .maybeSingle();
    setHandicapIndex(data?.value ?? '');
  }, []);

  useEffect(() => { loadHandicap(); }, [loadHandicap]);

  const saveHandicap = useCallback(async () => {
    const val = parseFloat(handicapInput);
    if (isNaN(val) || val < 0 || val > 54) {
      Alert.alert('Invalid', 'Enter a handicap between 0 and 54.0');
      return;
    }
    await supabase.from('app_settings').upsert({ key: 'handicap_index', value: val.toFixed(1) });
    setHandicapIndex(val.toFixed(1));
    setHandicapModalVisible(false);
  }, [handicapInput]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Profile */}
        <Text style={styles.sectionLabel}>Profile</Text>
        <View style={styles.card}>
          <SettingsRow
            label="Handicap Index"
            value={handicapIndex ? `${handicapIndex}` : 'Not set'}
            onPress={() => {
              setHandicapInput(handicapIndex);
              setHandicapModalVisible(true);
            }}
          />
        </View>

        {/* Bag */}
        <Text style={styles.sectionLabel}>Bag & Equipment</Text>
        <View style={styles.card}>
          <SettingsRow
            label="My Bag"
            value="14 clubs"
            onPress={() => navigation.navigate('MyBag')}
          />
        </View>

        {/* Courses */}
        <Text style={styles.sectionLabel}>Courses</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.courseInfo}>
              <View style={styles.activeDot} />
              <Text style={styles.rowLabel}>Nambour Golf Club</Text>
            </View>
            <Text style={styles.rowValue}>18 holes</Text>
          </View>
          <View style={styles.rowDivider} />
          <SettingsRow
            label="GPS Walk"
            value="Not completed"
            onPress={() => Alert.alert('GPS Walk', 'Start a round to record GPS data for each hole. Walk to the tee and green of each hole to set accurate distances.')}
          />
        </View>

        {/* Data */}
        <Text style={styles.sectionLabel}>Data</Text>
        <View style={styles.card}>
          <SettingsRow
            label="Export Data"
            onPress={() => Alert.alert('Coming Soon', 'Data export will be available in a future update.')}
          />
        </View>

        {/* About */}
        <Text style={styles.sectionLabel}>About</Text>
        <View style={styles.card}>
          <SettingsRow label="GolfCaddie" value="v1.0.0" chevron={false} />
          <View style={styles.rowDivider} />
          <SettingsRow label="Nambour Golf Club" value="White 4910m · 66.0/113" chevron={false} />
        </View>
      </ScrollView>

      {/* Handicap modal */}
      <Modal visible={handicapModalVisible} transparent animationType="fade" onRequestClose={() => setHandicapModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Handicap Index</Text>
            <Text style={styles.modalSub}>Enter your current GA handicap index</Text>
            <TextInput
              style={styles.input}
              value={handicapInput}
              onChangeText={setHandicapInput}
              keyboardType="decimal-pad"
              placeholder="e.g. 14.5"
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setHandicapModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveHandicap}>
                <Text style={styles.modalSaveText}>Save</Text>
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
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.text },
  scroll: { flex: 1 },
  content: { padding: Spacing.base, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  card: {
    backgroundColor: Colors.surface1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  rowDivider: { height: 1, backgroundColor: Colors.border, marginHorizontal: Spacing.base },
  rowLabel: { fontSize: FontSize.base, fontWeight: FontWeight.medium, color: Colors.text },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rowValue: { fontSize: FontSize.sm, color: Colors.textSecondary },
  chevron: { fontSize: FontSize.xl, color: Colors.textMuted, lineHeight: FontSize.xl },
  courseInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.green,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
  },
  modal: {
    width: '100%',
    backgroundColor: Colors.surface1,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text },
  modalSub: { fontSize: FontSize.sm, color: Colors.textSecondary },
  input: {
    height: 52,
    backgroundColor: Colors.surface3,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    paddingHorizontal: Spacing.base,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    color: Colors.text,
  },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  modalCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  modalSaveBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: '#000' },
});

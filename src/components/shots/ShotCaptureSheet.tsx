import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import type {
  Club,
  Lie,
  ShotMissDirection,
  ShotOutcome,
  ShotTarget,
  StrikeQuality,
} from '../../types';
import { convertDistance, distanceUnitLabel } from '../../utils/units';
import type { DistanceUnits } from '../../utils/units';

export type ShotCaptureValue = {
  club: Club;
  lie: Lie;
  endLie: Exclude<Lie, 'tee'>;
  target: ShotTarget;
  outcome: ShotOutcome;
  missDirection: ShotMissDirection | null;
  strikeQuality: StrikeQuality;
};

type Props = {
  visible: boolean;
  clubs: Club[];
  distanceMetres: number;
  shotNumber: number;
  initialLie: Lie;
  units: DistanceUnits;
  onCancel: () => void;
  onSave: (value: ShotCaptureValue) => void;
};

const START_LIES: Lie[] = ['tee', 'fairway', 'rough', 'bunker', 'recovery'];
const END_LIES: Exclude<Lie, 'tee'>[] = ['fairway', 'rough', 'bunker', 'recovery', 'green'];
const TARGETS: ShotTarget[] = ['fairway', 'green', 'layup', 'recovery'];
const STRIKES: StrikeQuality[] = ['pure', 'fat', 'thin', 'hosel', 'toe'];
const MISSES: ShotMissDirection[] = ['left', 'right', 'short', 'long'];

function label(value: string): string {
  return value.replace('_', ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function ChoiceRow<T extends string>({
  values,
  selected,
  onSelect,
  getLabel = label,
}: {
  values: T[];
  selected: T | null;
  onSelect: (value: T) => void;
  getLabel?: (value: T) => string;
}) {
  return (
    <View style={styles.choiceWrap}>
      {values.map(value => (
        <TouchableOpacity
          key={value}
          style={[styles.choice, selected === value && styles.choiceActive]}
          onPress={() => onSelect(value)}
        >
          <Text style={[styles.choiceText, selected === value && styles.choiceTextActive]}>
            {getLabel(value)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function ShotCaptureSheet({
  visible,
  clubs,
  distanceMetres,
  shotNumber,
  initialLie,
  units,
  onCancel,
  onSave,
}: Props) {
  const [clubId, setClubId] = useState<string | null>(null);
  const [lie, setLie] = useState<Lie>('tee');
  const [endLie, setEndLie] = useState<Exclude<Lie, 'tee'>>('fairway');
  const [target, setTarget] = useState<ShotTarget>('fairway');
  const [outcome, setOutcome] = useState<ShotOutcome>('hit');
  const [missDirection, setMissDirection] = useState<ShotMissDirection | null>(null);
  const [strikeQuality, setStrikeQuality] = useState<StrikeQuality>('pure');

  useEffect(() => {
    if (!visible) return;
    setClubId(null);
    setLie(initialLie);
    setEndLie('fairway');
    setTarget(shotNumber === 1 ? 'fairway' : 'green');
    setOutcome('hit');
    setMissDirection(null);
    setStrikeQuality('pure');
  }, [initialLie, shotNumber, visible]);

  const selectedClub = useMemo(
    () => clubs.find(club => club.id === clubId) ?? null,
    [clubId, clubs],
  );

  const chooseResult = (value: ShotOutcome | ShotMissDirection) => {
    if (value === 'hit' || value === 'no_chance') {
      setOutcome(value);
      setMissDirection(null);
      return;
    }
    if (value === 'miss') return;
    setOutcome('miss');
    setMissDirection(value);
  };

  const resultValue = outcome === 'miss' ? missDirection : outcome;
  const resultOptions = target === 'green'
    ? ['hit', ...MISSES, 'no_chance'] as const
    : ['hit', ...MISSES] as const;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Save shot {shotNumber}</Text>
              <Text style={styles.distance}>
                {convertDistance(Math.round(distanceMetres), units)}
                {distanceUnitLabel(units, true)} measured
              </Text>
            </View>
            <TouchableOpacity style={styles.close} onPress={onCancel}>
              <Text style={styles.closeText}>X</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.section}>Club</Text>
            <ChoiceRow
              values={clubs.map(club => club.id)}
              selected={clubId}
              onSelect={setClubId}
              getLabel={id => {
                const club = clubs.find(item => item.id === id);
                return club?.custom_name ?? club?.name ?? id;
              }}
            />

            <Text style={styles.section}>Started from</Text>
            <ChoiceRow values={START_LIES} selected={lie} onSelect={setLie} />

            <Text style={styles.section}>Target</Text>
            <ChoiceRow values={TARGETS} selected={target} onSelect={value => {
              setTarget(value);
              setOutcome('hit');
              setMissDirection(null);
            }} />

            <Text style={styles.section}>
              {target === 'fairway' ? 'Fairway result' : target === 'green' ? 'GIR result' : 'Result'}
            </Text>
            <ChoiceRow
              values={[...resultOptions]}
              selected={resultValue}
              onSelect={chooseResult}
            />

            <Text style={styles.section}>Strike</Text>
            <ChoiceRow values={STRIKES} selected={strikeQuality} onSelect={setStrikeQuality} />

            <Text style={styles.section}>Finished in</Text>
            <ChoiceRow values={END_LIES} selected={endLie} onSelect={setEndLie} />
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancel} onPress={onCancel}>
              <Text style={styles.cancelText}>Discard</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.save, !selectedClub && styles.saveDisabled]}
              disabled={!selectedClub}
              onPress={() => selectedClub && onSave({
                club: selectedClub,
                lie,
                endLie,
                target,
                outcome,
                missDirection,
                strikeQuality,
              })}
            >
              <Text style={styles.saveText}>Save Shot</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.backdrop },
  sheet: {
    maxHeight: '88%',
    backgroundColor: Colors.surface1,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { color: Colors.text, fontFamily: Font.bold, fontSize: FontSize.xl },
  distance: { color: Colors.green, fontFamily: Font.semibold, marginTop: 2 },
  close: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: Colors.textMuted, fontFamily: Font.bold },
  content: { padding: Spacing.base, paddingBottom: Spacing.xl },
  section: {
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    color: Colors.textSecondary,
    fontFamily: Font.bold,
    fontSize: FontSize.xs,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  choice: {
    minWidth: 72,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  choiceActive: { backgroundColor: Colors.green, borderColor: Colors.green },
  choiceText: { color: Colors.textSecondary, fontFamily: Font.semibold, fontSize: FontSize.sm },
  choiceTextActive: { color: Colors.bg },
  footer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.base,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cancel: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.surface3,
  },
  cancelText: { color: Colors.textSecondary, fontFamily: Font.semibold },
  save: {
    flex: 2,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.green,
  },
  saveDisabled: { opacity: 0.4 },
  saveText: { color: Colors.bg, fontFamily: Font.bold },
});

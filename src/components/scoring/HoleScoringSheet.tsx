import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import type { FairwayResult, GIRMissDirection, Hole, HoleScore } from '../../types';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_H * 0.88;

interface Props {
  visible: boolean;
  onClose: () => void;
  hole: Hole;
  initialScore?: Partial<HoleScore>;
  onSave: (score: Partial<HoleScore>) => void;
  onSaveAndNext: (score: Partial<HoleScore>) => void;
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <TouchableOpacity
          style={[styles.stepBtn, value <= min && styles.stepBtnDisabled]}
          onPress={() => value > min && onChange(value - 1)}
          activeOpacity={0.7}
        >
          <Text style={styles.stepBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.stepValue}>{value}</Text>
        <TouchableOpacity
          style={[styles.stepBtn, value >= max && styles.stepBtnDisabled]}
          onPress={() => value < max && onChange(value + 1)}
          activeOpacity={0.7}
        >
          <Text style={styles.stepBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function HoleScoringSheet({
  visible,
  onClose,
  hole,
  initialScore,
  onSave,
  onSaveAndNext,
}: Props) {
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  const [grossScore, setGrossScore] = useState<number | null>(null);
  const [fairwayHit, setFairwayHit] = useState<FairwayResult>('na');
  const [gir, setGir] = useState<boolean | null>(null);
  const [girMiss, setGirMiss] = useState<GIRMissDirection>('na');
  const [putts, setPutts] = useState(2);
  const [chips, setChips] = useState(0);
  const [sandShots, setSandShots] = useState(0);
  const [penalties, setPenalties] = useState(0);

  useEffect(() => {
    if (visible) {
      setGrossScore(initialScore?.gross_score ?? null);
      setFairwayHit(initialScore?.fairway_hit ?? 'na');
      setGir(initialScore?.gir ?? null);
      setGirMiss(initialScore?.gir_miss_direction ?? 'na');
      setPutts(initialScore?.putts ?? 2);
      setChips(initialScore?.chips ?? 0);
      setSandShots(initialScore?.sand_shots ?? 0);
      setPenalties(initialScore?.penalties ?? 0);

      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SHEET_HEIGHT,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, initialScore, slideAnim]);

  const buildScore = useCallback((): Partial<HoleScore> => ({
    gross_score: grossScore,
    fairway_hit: fairwayHit,
    gir: gir,
    gir_miss_direction: girMiss,
    putts,
    chips,
    sand_shots: sandShots,
    penalties,
  }), [grossScore, fairwayHit, gir, girMiss, putts, chips, sandShots, penalties]);

  const isPar4or5 = hole.par >= 4;
  const scoreNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.holeTitle}>Hole {hole.number}</Text>
            <Text style={styles.holeMeta}>Par {hole.par}  ·  SI {hole.stroke_index}</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.body}>
          {/* Score picker */}
          <Text style={styles.sectionLabel}>Score</Text>
          <View style={styles.scoreRow}>
            {scoreNumbers.map((n) => {
              const selected = grossScore === n;
              const diff = n - hole.par;
              let bg = Colors.surface3;
              if (selected) {
                if (diff <= -2) bg = Colors.eagle;
                else if (diff === -1) bg = Colors.birdie;
                else if (diff === 0) bg = Colors.scorePar;
                else if (diff === 1) bg = Colors.bogey;
                else bg = Colors.doublePlus;
              }
              return (
                <TouchableOpacity
                  key={n}
                  style={[styles.scoreBtn, selected && { backgroundColor: bg }]}
                  onPress={() => setGrossScore(n)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.scoreBtnText, selected && styles.scoreBtnTextSelected]}>
                    {n}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Fairway hit (par 4 and par 5 only) */}
          {isPar4or5 && (
            <>
              <Text style={styles.sectionLabel}>Fairway</Text>
              <View style={styles.buttonRow}>
                {(['left', 'hit', 'right'] as FairwayResult[]).map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.choiceBtn, fairwayHit === val && styles.choiceBtnActive]}
                    onPress={() => setFairwayHit(val)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.choiceBtnIcon}>
                      {val === 'left' ? '←' : val === 'right' ? '→' : '✓'}
                    </Text>
                    <Text style={[styles.choiceBtnText, fairwayHit === val && styles.choiceBtnTextActive]}>
                      {val === 'hit' ? 'Hit' : val === 'left' ? 'Left' : 'Right'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* GIR */}
          <Text style={styles.sectionLabel}>Green in Regulation</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.choiceBtn, styles.choiceBtnWide, gir === true && styles.choiceBtnActive]}
              onPress={() => { setGir(true); setGirMiss('na'); }}
              activeOpacity={0.7}
            >
              <Text style={styles.choiceBtnIcon}>✓</Text>
              <Text style={[styles.choiceBtnText, gir === true && styles.choiceBtnTextActive]}>Hit GIR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.choiceBtn, styles.choiceBtnWide, gir === false && styles.choiceBtnActiveDanger]}
              onPress={() => setGir(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.choiceBtnIcon}>✕</Text>
              <Text style={[styles.choiceBtnText, gir === false && { color: Colors.red }]}>Miss</Text>
            </TouchableOpacity>
          </View>

          {gir === false && (
            <View style={styles.missRow}>
              {(['short', 'left', 'right', 'long'] as GIRMissDirection[]).map((dir) => (
                <TouchableOpacity
                  key={dir}
                  style={[styles.missBtn, girMiss === dir && styles.missBtnActive]}
                  onPress={() => setGirMiss(dir)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.missBtnText, girMiss === dir && styles.missBtnTextActive]}>
                    {dir.charAt(0).toUpperCase() + dir.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Steppers */}
          <View style={styles.steppersCard}>
            <Stepper label="Putts" value={putts} min={0} max={6} onChange={setPutts} />
            <View style={styles.stepDivider} />
            <Stepper label="Chips" value={chips} min={0} max={5} onChange={setChips} />
            <View style={styles.stepDivider} />
            <Stepper label="Sand shots" value={sandShots} min={0} max={4} onChange={setSandShots} />
            <View style={styles.stepDivider} />
            <Stepper label="Penalties" value={penalties} min={0} max={4} onChange={setPenalties} />
          </View>

          <View style={{ height: Spacing.xxl }} />
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.backBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, !grossScore && styles.saveNextBtnDisabled]}
            onPress={() => grossScore !== null && onSave(buildScore())}
            activeOpacity={0.8}
          >
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveNextBtn, !grossScore && styles.saveNextBtnDisabled]}
            onPress={() => grossScore !== null && onSaveAndNext(buildScore())}
            activeOpacity={0.8}
          >
            <Text style={styles.saveNextBtnText}>Save & Next →</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.backdrop,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: Colors.surface1,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    overflow: 'hidden',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderStrong,
    alignSelf: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  holeTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    fontFamily: Font.bold,
    color: Colors.text,
  },
  holeMeta: {
    fontSize: FontSize.sm,
    fontFamily: Font.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.base,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    fontFamily: Font.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: Spacing.base,
    marginBottom: Spacing.sm,
  },
  scoreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  scoreBtn: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  scoreBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    fontFamily: Font.semibold,
    color: Colors.textSecondary,
  },
  scoreBtnTextSelected: {
    color: Colors.bg,
    fontWeight: FontWeight.bold,
    fontFamily: Font.bold,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  choiceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  choiceBtnWide: {
    flex: 1,
  },
  choiceBtnActive: {
    backgroundColor: Colors.greenMuted,
    borderColor: Colors.green,
  },
  choiceBtnActiveDanger: {
    backgroundColor: Colors.redMuted,
    borderColor: Colors.red,
  },
  choiceBtnIcon: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },
  choiceBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    fontFamily: Font.medium,
    color: Colors.textSecondary,
  },
  choiceBtnTextActive: {
    color: Colors.green,
  },
  missRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  missBtn: {
    flex: 1,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missBtnActive: {
    backgroundColor: Colors.redMuted,
    borderColor: Colors.red,
  },
  missBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    fontFamily: Font.medium,
    color: Colors.textSecondary,
  },
  missBtnTextActive: {
    color: Colors.red,
  },
  steppersCard: {
    backgroundColor: Colors.surface2,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: Spacing.base,
    overflow: 'hidden',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  stepDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.base,
  },
  stepperLabel: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
    fontFamily: Font.medium,
    color: Colors.text,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: {
    opacity: 0.3,
  },
  stepBtnText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    fontFamily: Font.bold,
    color: Colors.text,
    lineHeight: FontSize.lg + 2,
  },
  stepValue: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    fontFamily: Font.bold,
    color: Colors.text,
    width: 28,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.base,
    paddingBottom: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  saveBtn: {
    flex: 1,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: Colors.green,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.base,
  },
  backBtn: {
    flex: 1,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    fontFamily: Font.semibold,
    color: Colors.textSecondary,
  },
  saveNextBtn: {
    flex: 2,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveNextBtnDisabled: {
    opacity: 0.4,
  },
  saveNextBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    fontFamily: Font.bold,
    color: Colors.bg,
  },
});

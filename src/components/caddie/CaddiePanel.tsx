import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors, Font, FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { validatedCaddieFactor } from '../../utils/caddie';
import type { CaddieAdvice } from '../../utils/caddie';
import { convertDistance, distanceUnitLabel } from '../../utils/units';
import type { DistanceUnits } from '../../utils/units';

type Props = {
  advice: CaddieAdvice;
  onDismiss: () => void;
  units: DistanceUnits;
  llmText?: string | null;
  llmLoading?: boolean;
};

export default function CaddiePanel({ advice, onDismiss, units, llmText, llmLoading }: Props) {
  const { recommended, alternatives, distToPin, playingDistance, history } = advice;
  const clubLabel = recommended.club.custom_name ?? recommended.club.name;
  const unit = distanceUnitLabel(units, true);
  const primaryWarning = recommended.warnings[0];

  // Deterministic fallback lines (used if LLM is unavailable)
  const fallbackLines = [
    advice.shotType === 'recovery'
      ? advice.customTarget
        ? `Play ${clubLabel} to your selected ${convertDistance(advice.targetDistance, units)}${unit} recovery target.`
        : 'Select the safest visible recovery target on the map.'
      : advice.shotType === 'layup'
      ? `Hit ${clubLabel} to the ${convertDistance(advice.targetDistance, units)}${unit} landing area, leaving ${convertDistance(advice.remainingDistance, units)}${unit}.`
      : `Play this as ${convertDistance(playingDistance, units)}${unit} with ${clubLabel}.`,
    advice.aimInstruction,
    primaryWarning
      ? `${primaryWarning.type} is in play at ${convertDistance(primaryWarning.distanceMetres, units)}${unit} ${primaryWarning.side}.`
      : history
        ? `You average ${history.avg.toFixed(1)} here with ${history.girPct}% GIR.`
        : null,
  ].filter((line): line is string => line != null);

  const aiFactor = validatedCaddieFactor(llmText, advice);
  const shotLines = aiFactor
    ? [fallbackLines[0], aiFactor]
    : fallbackLines;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>CADDIE</Text>
          <Text style={styles.title}>{clubLabel}</Text>
        </View>
        <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss}>
          <Text style={styles.dismissText}>Done</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{convertDistance(distToPin, units)}{unit}</Text>
          <Text style={styles.metricLabel}>TO PIN</Text>
        </View>
        <View style={styles.metric}>
          <Text style={[styles.metricValue, styles.metricAccent]}>
            {convertDistance(
              advice.shotType === 'layup' || advice.shotType === 'recovery'
                ? advice.targetDistance
                : playingDistance,
              units,
            )}{unit}
          </Text>
          <Text style={styles.metricLabel}>
            {advice.shotType === 'layup' || advice.shotType === 'recovery' ? 'TARGET' : 'PLAYS LIKE'}
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>
            {convertDistance(
              advice.shotType === 'layup' || advice.shotType === 'recovery'
                ? advice.remainingDistance
                : recommended.adjustedCarry,
              units,
            )}{unit}
          </Text>
          <Text style={styles.metricLabel}>
            {advice.shotType === 'layup' || advice.shotType === 'recovery' ? 'LEFT' : 'EXPECTED'}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>SHOT PLAN</Text>
        {llmLoading && !aiFactor ? (
          <View style={styles.llmLoading}>
            <ActivityIndicator size="small" color={Colors.green} />
            <Text style={styles.llmLoadingText}>Getting caddie read…</Text>
          </View>
        ) : (
          shotLines.map((line, index) => (
            <View key={`${index}-${line}`} style={styles.strategyRow}>
              <Text style={styles.strategyNumber}>{index + 1}</Text>
              <Text style={styles.strategyText}>{line}</Text>
            </View>
          ))
        )}

        <Text style={styles.sectionLabel}>CONDITIONS</Text>
        <View style={styles.conditionCard}>
          <Text style={styles.conditionText}>Wind: {advice.windLabel}</Text>
          <Text style={styles.conditionText}>
            Wind effect: {advice.windAdjustment === 0 ? 'neutral' : `${advice.windAdjustment > 0 ? '+' : '-'}${convertDistance(Math.abs(advice.windAdjustment), units)}${unit} carry`}
          </Text>
          <Text style={styles.conditionText}>
            Elevation: {advice.elevDiff === 0 ? 'level' : `${advice.elevDiff > 0 ? '+' : '-'}${convertDistance(Math.abs(advice.elevDiff), units)}${unit}`}
          </Text>
        </View>

        {recommended.warnings.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>HAZARDS</Text>
            {recommended.warnings.map(warning => (
              <Text key={warning.label} style={styles.warningText}>
                {warning.type.toUpperCase()} · {convertDistance(warning.distanceMetres, units)}{unit} · {warning.side}
              </Text>
            ))}
          </>
        )}

        {alternatives.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>ALTERNATIVES</Text>
            <View style={styles.alternatives}>
              {alternatives.map(option => (
                <View key={option.club.id} style={styles.alternative}>
                  <Text style={styles.alternativeClub}>
                    {option.club.custom_name ?? option.club.name}
                  </Text>
                  <Text style={styles.alternativeCarry}>{convertDistance(option.adjustedCarry, units)}{unit}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {history && (
          <>
            <Text style={styles.sectionLabel}>YOUR HISTORY</Text>
            <View style={styles.historyCard}>
              <Text style={styles.historyValue}>{history.avg.toFixed(1)}</Text>
              <Text style={styles.historyText}>
                average · best {history.best} · GIR {history.girPct}% · {history.avgPutts.toFixed(1)} putts
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    maxHeight: '82%',
    backgroundColor: Colors.surface1,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  eyebrow: {
    color: Colors.green,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.xs,
    letterSpacing: 0.8,
  },
  title: {
    color: Colors.text,
    fontFamily: Font.black,
    fontWeight: FontWeight.black,
    fontSize: FontSize.xl,
    marginTop: 2,
  },
  dismissBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface3,
  },
  dismissText: {
    color: Colors.green,
    fontFamily: Font.semibold,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.sm,
  },
  metrics: {
    flexDirection: 'row',
    backgroundColor: Colors.surface2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  metricValue: {
    color: Colors.text,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.md,
  },
  metricAccent: { color: Colors.green },
  metricLabel: {
    color: Colors.textMuted,
    fontFamily: Font.medium,
    fontWeight: FontWeight.medium,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  scroll: { padding: Spacing.base },
  sectionLabel: {
    color: Colors.textMuted,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.xs,
    letterSpacing: 0.8,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  strategyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  strategyNumber: {
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    textAlign: 'center',
    lineHeight: 22,
    color: Colors.bg,
    backgroundColor: Colors.green,
    fontFamily: Font.bold,
    fontWeight: FontWeight.bold,
    fontSize: FontSize.xs,
  },
  strategyText: {
    flex: 1,
    color: Colors.text,
    fontFamily: Font.regular,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  llmLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  llmLoadingText: {
    color: Colors.textMuted,
    fontFamily: Font.regular,
    fontSize: FontSize.sm,
  },
  conditionCard: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface2,
    gap: Spacing.xs,
  },
  conditionText: { color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.sm },
  warningText: { color: Colors.bogey, fontFamily: Font.semibold, fontSize: FontSize.sm, marginBottom: Spacing.xs },
  alternatives: { flexDirection: 'row', gap: Spacing.sm },
  alternative: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface2,
  },
  alternativeClub: { color: Colors.text, fontFamily: Font.semibold, fontSize: FontSize.sm },
  alternativeCarry: { color: Colors.green, fontFamily: Font.bold, fontSize: FontSize.md, marginTop: 2 },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface2,
  },
  historyValue: { color: Colors.green, fontFamily: Font.black, fontSize: FontSize.xl },
  historyText: { flex: 1, color: Colors.textSecondary, fontFamily: Font.regular, fontSize: FontSize.sm },
});

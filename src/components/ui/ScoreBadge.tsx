import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, FontSize, FontWeight } from '../../constants/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Size = 'sm' | 'md' | 'lg';

interface ScoreBadgeProps {
  score: number | null;
  par: number;
  size?: Size;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ScoreCategory = 'eaglePlus' | 'birdie' | 'par' | 'bogey' | 'doublePlus' | 'none';

function getCategory(score: number | null, par: number): ScoreCategory {
  if (score === null) return 'none';
  const diff = score - par;
  if (diff <= -2) return 'eaglePlus';
  if (diff === -1) return 'birdie';
  if (diff === 0) return 'par';
  if (diff === 1) return 'bogey';
  return 'doublePlus';
}

// Size constants
const SIZE_PX: Record<Size, number> = {
  sm: 28,
  md: 36,
  lg: 48,
};

const FONT_SIZE: Record<Size, number> = {
  sm: FontSize.xs,
  md: FontSize.base,
  lg: FontSize.lg,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScoreBadge({ score, par, size = 'md' }: ScoreBadgeProps) {
  const category = getCategory(score, par);
  const diameter = SIZE_PX[size];
  const fontSize = FONT_SIZE[size];

  if (category === 'none') {
    return (
      <View style={[styles.base, { width: diameter, height: diameter, borderRadius: diameter / 2 }]}>
        <Text style={[styles.noScoreText, { fontSize }]}>-</Text>
      </View>
    );
  }

  const isPar = category === 'par';

  return (
    <View
      style={[
        styles.base,
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          backgroundColor: isPar ? 'transparent' : categoryColors[category],
          borderWidth: isPar ? 2 : 0,
          borderColor: isPar ? Colors.scorePar : 'transparent',
        },
      ]}
    >
      <Text
        style={[
          styles.scoreText,
          { fontSize, color: isPar ? Colors.scorePar : scoreTextColor[category] },
        ]}
      >
        {score}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Maps
// ---------------------------------------------------------------------------

const categoryColors: Record<Exclude<ScoreCategory, 'none' | 'par'>, string> = {
  eaglePlus: Colors.eagle,
  birdie: Colors.birdie,
  bogey: Colors.bogey,
  doublePlus: Colors.doublePlus,
};

const scoreTextColor: Record<Exclude<ScoreCategory, 'none'>, string> = {
  eaglePlus: '#000000',
  birdie: '#ffffff',
  par: Colors.scorePar,
  bogey: '#ffffff',
  doublePlus: '#ffffff',
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface3,
  },
  scoreText: {
    fontWeight: FontWeight.bold,
  },
  noScoreText: {
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },
});

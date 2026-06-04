export const Colors = {
  bg: '#0a0a0a',
  surface1: '#1a1a1a',
  surface2: '#242424',
  surface3: '#2e2e2e',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.15)',

  green: '#22c55e',
  greenDark: '#16a34a',
  greenMuted: 'rgba(34,197,94,0.15)',

  text: '#ffffff',
  textSecondary: '#a0a0a0',
  textMuted: '#606060',

  red: '#ef4444',
  redMuted: 'rgba(239,68,68,0.15)',
  yellow: '#fbbf24',
  blue: '#3b82f6',
  orange: '#f97316',

  // score colours matching golf convention
  eagle: '#fbbf24',
  birdie: '#3b82f6',
  scorePar: '#22c55e',
  bogey: '#f97316',
  doublePlus: '#ef4444',

  mapOverlay: 'rgba(10,10,10,0.82)',
  mapOverlayLight: 'rgba(26,26,26,0.90)',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  black: '900' as const,
};

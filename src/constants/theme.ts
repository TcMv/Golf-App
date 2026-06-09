export const Colors = {
  bg: '#0b1810',
  surface1: '#121f16',
  surface2: '#1c2e22',
  surface3: '#243828',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.15)',

  green: '#00e062',
  greenDark: '#00a847',
  greenMuted: 'rgba(0,224,98,0.12)',

  text: '#ffffff',
  textSecondary: '#8aab96',
  textMuted: '#6a8a72',

  red: '#ff5c5c',
  redMuted: 'rgba(255,92,92,0.15)',
  yellow: '#ffc940',
  blue: '#3b82f6',
  orange: '#ff9940',

  // score colours — golf convention
  eagle: '#ffc940',
  birdie: '#00e062',
  scorePar: '#ffffff',
  bogey: '#ff9940',
  doublePlus: '#ff5c5c',

  mapOverlay: 'rgba(11,24,16,0.85)',
  mapOverlayLight: 'rgba(18,31,22,0.92)',
};

// Strict 8pt grid
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const Radius = {
  sm: 6,
  md: 12,   // buttons
  lg: 16,   // cards
  xl: 24,   // modals / sheets
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

// Inter font family names (loaded in App.tsx via useFonts)
export const Font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  black: 'Inter_900Black',
} as const;

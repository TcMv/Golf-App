export const Colors = {
  bg: '#0b1810',
  surface1: '#121f16',
  surface2: '#1c2e22',
  // Backwards-compatible aliases. New UI should use surface1/surface2.
  surface3: '#1c2e22',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.08)',

  green: '#00e062',
  greenDark: '#00a847',
  greenMuted: 'rgba(0,224,98,0.12)',

  text: '#ffffff',
  textSecondary: '#6a8a72',
  textMuted: '#6a8a72',

  red: '#ff5c5c',
  redMuted: 'rgba(255,92,92,0.15)',
  yellow: '#ffc940',
  yellowMuted: 'rgba(255,201,64,0.15)',
  blue: '#6a8a72',
  orange: '#ff9940',
  orangeMuted: 'rgba(255,153,64,0.15)',

  // score colours — golf convention
  eagle: '#ffc940',
  birdie: '#00e062',
  scorePar: '#ffffff',
  bogey: '#ff9940',
  doublePlus: '#ff5c5c',

  mapOverlay: 'rgba(11,24,16,0.85)',
  mapOverlayLight: 'rgba(18,31,22,0.92)',
  backdrop: 'rgba(0,0,0,0.70)',
  subtle: 'rgba(255,255,255,0.04)',
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
  sm: 8,
  md: 12,   // buttons
  lg: 16,   // cards
  xl: 16,   // elevated cards / sheets
  full: 999,
} as const;

export const FontSize = {
  xs: 11,
  sm: 12,
  base: 15,
  md: 18,
  lg: 24,
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

export const Typography = {
  display: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.black,
    fontFamily: Font.black,
    letterSpacing: -0.96,
  },
  h1: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.black,
    fontFamily: Font.black,
    letterSpacing: -0.32,
  },
  h2: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    fontFamily: Font.bold,
  },
  h3: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    fontFamily: Font.semibold,
  },
  body: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.regular,
    fontFamily: Font.regular,
  },
  caption: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.regular,
    fontFamily: Font.regular,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    fontFamily: Font.bold,
    letterSpacing: 1.1,
    textTransform: 'uppercase' as const,
  },
} as const;

export const Shadow = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
} as const;

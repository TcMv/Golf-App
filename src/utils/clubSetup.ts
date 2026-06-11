export type SetupClub = {
  name: string;
  type: 'driver' | 'wood' | 'hybrid' | 'iron' | 'wedge';
  loft: number | null;
  defaultCarry: number;
  defaultSelected?: boolean;
  desc: string;
};

export const SETUP_CLUBS: SetupClub[] = [
  { name: 'Driver', type: 'driver', loft: null, defaultCarry: 210, defaultSelected: true, desc: 'Your primary tee club.' },
  { name: '3W', type: 'wood', loft: 15, defaultCarry: 190, desc: '3 Wood.' },
  { name: '4W', type: 'wood', loft: 17, defaultCarry: 185, desc: '4 Wood.' },
  { name: '5W', type: 'wood', loft: 18, defaultCarry: 180, defaultSelected: true, desc: '5 Wood.' },
  { name: '7W', type: 'wood', loft: 21, defaultCarry: 170, desc: '7 Wood.' },
  { name: '9W', type: 'wood', loft: 24, defaultCarry: 160, desc: '9 Wood.' },
  { name: '2H', type: 'hybrid', loft: 17, defaultCarry: 190, desc: '2 Hybrid.' },
  { name: '3H', type: 'hybrid', loft: 19, defaultCarry: 180, defaultSelected: true, desc: '3 Hybrid.' },
  { name: '4H', type: 'hybrid', loft: 22, defaultCarry: 170, desc: '4 Hybrid.' },
  { name: '5H', type: 'hybrid', loft: 25, defaultCarry: 160, desc: '5 Hybrid.' },
  { name: '6H', type: 'hybrid', loft: 28, defaultCarry: 150, desc: '6 Hybrid.' },
  { name: '7H', type: 'hybrid', loft: 31, defaultCarry: 140, desc: '7 Hybrid.' },
  { name: '2i', type: 'iron', loft: 18, defaultCarry: 190, desc: '2 Iron.' },
  { name: '3i', type: 'iron', loft: 21, defaultCarry: 180, desc: '3 Iron.' },
  { name: '4i', type: 'iron', loft: 24, defaultCarry: 165, defaultSelected: true, desc: '4 Iron.' },
  { name: '5i', type: 'iron', loft: 27, defaultCarry: 155, defaultSelected: true, desc: '5 Iron.' },
  { name: '6i', type: 'iron', loft: 30, defaultCarry: 145, defaultSelected: true, desc: '6 Iron.' },
  { name: '7i', type: 'iron', loft: 34, defaultCarry: 135, defaultSelected: true, desc: '7 Iron.' },
  { name: '8i', type: 'iron', loft: 38, defaultCarry: 125, defaultSelected: true, desc: '8 Iron.' },
  { name: '9i', type: 'iron', loft: 42, defaultCarry: 115, defaultSelected: true, desc: '9 Iron.' },
  { name: 'PW', type: 'wedge', loft: 46, defaultCarry: 105, defaultSelected: true, desc: 'Pitching Wedge.' },
  { name: '48°', type: 'wedge', loft: 48, defaultCarry: 100, desc: '48 degree wedge.' },
  { name: '50°', type: 'wedge', loft: 50, defaultCarry: 98, desc: '50 degree wedge.' },
  { name: '52°', type: 'wedge', loft: 52, defaultCarry: 95, defaultSelected: true, desc: '52 degree wedge.' },
  { name: '54°', type: 'wedge', loft: 54, defaultCarry: 90, desc: '54 degree wedge.' },
  { name: '56°', type: 'wedge', loft: 56, defaultCarry: 85, defaultSelected: true, desc: '56 degree wedge.' },
  { name: '58°', type: 'wedge', loft: 58, defaultCarry: 80, desc: '58 degree wedge.' },
  { name: '60°', type: 'wedge', loft: 60, defaultCarry: 75, desc: '60 degree wedge.' },
  { name: '62°', type: 'wedge', loft: 62, defaultCarry: 70, desc: '62 degree wedge.' },
  { name: '64°', type: 'wedge', loft: 64, defaultCarry: 65, desc: '64 degree wedge.' },
];

export const DEFAULT_SETUP_CLUBS = SETUP_CLUBS.filter(club => club.defaultSelected);

export function clubTypeFromBagName(
  name: string,
): SetupClub['type'] | 'putter' {
  const value = name.trim().toLowerCase();
  if (value.includes('putter')) return 'putter';
  if (value.includes('driver')) return 'driver';
  if (value.includes('wood') || /^\d+\s*w$/.test(value)) return 'wood';
  if (value.includes('hybrid') || /^\d+\s*h$/.test(value)) return 'hybrid';
  if (
    value.includes('wedge')
    || value.includes('°')
    || /^(pw|gw|sw|lw)$/.test(value)
  ) {
    return 'wedge';
  }
  return 'iron';
}

export function isValidClubCarry(club: SetupClub, carry: number): boolean {
  if (!Number.isFinite(carry)) return false;
  return carry >= 20 && carry <= 400;
}

export function clubSetupExitAction(
  returnTo: 'StartRound' | 'Main' | undefined,
  canGoBack: boolean,
): 'back' | 'main' {
  return returnTo === 'StartRound' && canGoBack ? 'back' : 'main';
}

export type SetupClub = {
  name: string;
  type: 'driver' | 'wood' | 'hybrid' | 'iron' | 'wedge';
  defaultCarry: number;
  desc: string;
};

export const SETUP_CLUBS: SetupClub[] = [
  { name: 'Driver', type: 'driver', defaultCarry: 210, desc: 'Your primary tee club. Metres of carry.' },
  { name: '3W', type: 'wood', defaultCarry: 190, desc: '3 Wood. Good for long fairway shots or tight tees.' },
  { name: '3H', type: 'hybrid', defaultCarry: 180, desc: '3 Hybrid. A forgiving long-club option.' },
  { name: '4H', type: 'hybrid', defaultCarry: 170, desc: '4 Hybrid. Bridges the gap into your irons.' },
  { name: '5i', type: 'iron', defaultCarry: 155, desc: '5 Iron.' },
  { name: '6i', type: 'iron', defaultCarry: 145, desc: '6 Iron.' },
  { name: '7i', type: 'iron', defaultCarry: 135, desc: '7 Iron. Standard mid iron carry.' },
  { name: '8i', type: 'iron', defaultCarry: 125, desc: '8 Iron.' },
  { name: '9i', type: 'iron', defaultCarry: 115, desc: '9 Iron.' },
  { name: 'PW', type: 'wedge', defaultCarry: 105, desc: 'Pitching Wedge. Short game approach.' },
  { name: 'GW (52°)', type: 'wedge', defaultCarry: 95, desc: 'Gap Wedge. Between PW and SW.' },
  { name: 'SW (56°)', type: 'wedge', defaultCarry: 85, desc: 'Sand Wedge. Essential for bunkers and short chips.' },
  { name: 'LW (60°)', type: 'wedge', defaultCarry: 75, desc: 'Lob Wedge. For high flop shots.' },
];

export function isValidClubCarry(club: SetupClub, carry: number): boolean {
  if (!Number.isFinite(carry)) return false;
  return carry >= 20 && carry <= 400;
}

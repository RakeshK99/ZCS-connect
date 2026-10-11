// Design tokens, taken from the Claude Design file (ZCS App.dc.html) which follows
// the ZCS Identity Guide: navy Pantone 282, maize Pantone 7406, Cabin headings.
// Maize appears only on navy or as a fill under navy text. Red is reserved for
// Emergency. In dark mode the primary flips to maize with navy text.

export const NAVY = '#041E42';
export const MAIZE = '#F1C400';
export const RED = '#B3261E';

export const light = {
  bg: '#F5F7F9',
  sf: '#FFFFFF',
  sf2: '#EDEFF3',
  tx: '#111C2C',
  tx2: '#52637A',
  tx3: '#627084',
  bd: '#DDE2E9',
  bdS: '#78879B',
  pri: NAVY,
  priTx: '#FFFFFF',
  link: NAVY,
  tint: '#E7EEF9',
  bar: 'rgba(255,255,255,0.92)',
  avBg: NAVY,
  avTx: MAIZE,
  badge: NAVY,
  badgeTx: '#FFFFFF',
  ok: '#117458',
  okBg: '#EBF9F5',
  swOff: '#D5DAE2',
  apple: '#000000',
  appleTx: '#FFFFFF',
  ph1: '#E6EAF0',
  ph2: '#D3DAE4',
  scrim: 'rgba(2,10,22,0.45)',
};

export type Palette = typeof light;

export const dark: Palette = {
  bg: '#07111F',
  sf: '#101D31',
  sf2: '#1A2A44',
  tx: '#EEF2F7',
  tx2: '#A9B6C8',
  tx3: '#909DB2',
  bd: '#22344F',
  bdS: '#6D7E97',
  pri: MAIZE,
  priTx: NAVY,
  link: MAIZE,
  tint: '#162A4B',
  bar: 'rgba(10,20,36,0.94)',
  avBg: MAIZE,
  avTx: NAVY,
  badge: MAIZE,
  badgeTx: NAVY,
  ok: '#4FC59E',
  okBg: '#0F2E28',
  swOff: '#33445E',
  apple: '#FFFFFF',
  appleTx: '#000000',
  ph1: '#16263C',
  ph2: '#21344F',
  scrim: 'rgba(2,10,22,0.6)',
};

export const font = {
  heading: 'Cabin-Bold',
  headingSemi: 'Cabin-SemiBold',
  headingMedium: 'Cabin-Medium',
};

export const radius = { sm: 10, md: 12, lg: 14, xl: 16, xxl: 18, sheet: 20 };

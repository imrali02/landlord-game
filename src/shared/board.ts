// Board definition. Edit this file to rename cities, change prices or rents,
// or swap countries. Tile 0 is Start; play moves through ids in ascending order.

import type { CountryId, Settings, TileDef } from './types';

export const COUNTRIES: Record<CountryId, { name: string; color: string }> = {
  palestine: { name: 'Palestine', color: '#a0674b' },
  pakistan: { name: 'Pakistan', color: '#38bdf8' },
  italy: { name: 'Italy', color: '#ec4899' },
  germany: { name: 'Germany', color: '#f59e0b' },
  china: { name: 'China', color: '#ef4444' },
  france: { name: 'France', color: '#eab308' },
  uk: { name: 'United Kingdom', color: '#22c55e' },
  usa: { name: 'United States', color: '#6366f1' },
};

const city = (
  id: number,
  name: string,
  country: CountryId,
  price: number,
  houseCost: number,
  rent: number[],
): TileDef => ({ id, type: 'property', name, country, price, houseCost, rent });

export const BOARD: TileDef[] = [
  { id: 0, type: 'start', name: 'Start', icon: '🏁' },
  city(1, 'Gaza', 'palestine', 60, 50, [2, 10, 30, 90, 160, 250]),
  { id: 2, type: 'treasure', name: 'Treasure', icon: '🎁' },
  city(3, 'Ramallah', 'palestine', 60, 50, [4, 20, 60, 180, 320, 450]),
  { id: 4, type: 'tax', name: 'Income Tax', tax: 200, icon: '💰' },
  { id: 5, type: 'airport', name: 'KHI Airport', price: 200, icon: '✈️' },
  city(6, 'Karachi', 'pakistan', 100, 50, [6, 30, 90, 270, 400, 550]),
  { id: 7, type: 'surprise', name: 'Surprise', icon: '❓' },
  city(8, 'Lahore', 'pakistan', 100, 50, [6, 30, 90, 270, 400, 550]),
  city(9, 'Islamabad', 'pakistan', 120, 50, [8, 40, 100, 300, 450, 600]),
  { id: 10, type: 'prison', name: 'Prison', icon: '🔒' },
  city(11, 'Rome', 'italy', 140, 100, [10, 50, 150, 450, 625, 750]),
  { id: 12, type: 'utility', name: 'Power Grid', price: 150, icon: '⚡' },
  city(13, 'Milan', 'italy', 140, 100, [10, 50, 150, 450, 625, 750]),
  city(14, 'Venice', 'italy', 160, 100, [12, 60, 180, 500, 700, 900]),
  { id: 15, type: 'airport', name: 'FRA Airport', price: 200, icon: '✈️' },
  city(16, 'Frankfurt', 'germany', 180, 100, [14, 70, 200, 550, 750, 950]),
  { id: 17, type: 'treasure', name: 'Treasure', icon: '🎁' },
  city(18, 'Munich', 'germany', 180, 100, [14, 70, 200, 550, 750, 950]),
  city(19, 'Berlin', 'germany', 200, 100, [16, 80, 220, 600, 800, 1000]),
  { id: 20, type: 'vacation', name: 'Vacation', icon: '🏖️' },
  city(21, 'Shenzhen', 'china', 220, 150, [18, 90, 250, 700, 875, 1050]),
  { id: 22, type: 'surprise', name: 'Surprise', icon: '❓' },
  city(23, 'Beijing', 'china', 220, 150, [18, 90, 250, 700, 875, 1050]),
  city(24, 'Shanghai', 'china', 240, 150, [20, 100, 300, 750, 925, 1100]),
  { id: 25, type: 'airport', name: 'PEK Airport', price: 200, icon: '✈️' },
  city(26, 'Lyon', 'france', 260, 150, [22, 110, 330, 800, 975, 1150]),
  city(27, 'Toulouse', 'france', 260, 150, [22, 110, 330, 800, 975, 1150]),
  { id: 28, type: 'utility', name: 'Water Works', price: 150, icon: '💧' },
  city(29, 'Paris', 'france', 280, 150, [24, 120, 360, 850, 1025, 1200]),
  { id: 30, type: 'gotoprison', name: 'Go to Prison', icon: '🚓' },
  city(31, 'Liverpool', 'uk', 300, 200, [26, 130, 390, 900, 1100, 1275]),
  city(32, 'Manchester', 'uk', 300, 200, [26, 130, 390, 900, 1100, 1275]),
  { id: 33, type: 'treasure', name: 'Treasure', icon: '🎁' },
  city(34, 'London', 'uk', 320, 200, [28, 150, 450, 1000, 1200, 1400]),
  { id: 35, type: 'airport', name: 'JFK Airport', price: 200, icon: '✈️' },
  { id: 36, type: 'surprise', name: 'Surprise', icon: '❓' },
  city(37, 'San Francisco', 'usa', 350, 200, [35, 175, 500, 1100, 1300, 1500]),
  { id: 38, type: 'tax', name: 'Luxury Tax', tax: 100, icon: '💎' },
  city(39, 'New York', 'usa', 400, 200, [50, 200, 600, 1400, 1700, 2000]),
];

export const BOARD_SIZE = BOARD.length;
export const PRISON_TILE = 10;
export const START_BONUS = 200;
export const BAIL = 50;
export const MAX_PRISON_TURNS = 3;
export const AIRPORT_RENT = [25, 50, 100, 200];
export const UTILITY_MULTIPLIER = [4, 10];
export const MORTGAGE_INTEREST = 0.1;

export const PLAYER_COLORS = ['#f43f5e', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#14b8a6', '#f97316', '#ec4899'];

export const DEFAULT_SETTINGS: Settings = {
  maxPlayers: 6,
  startingCash: 1500,
  auctions: true,
  vacationCash: true,
  noRentInPrison: false,
  evenBuild: true,
  doubleRentOnSet: true,
  randomOrder: true,
};

export const isOwnable = (t: TileDef) => t.type === 'property' || t.type === 'airport' || t.type === 'utility';

export const OWNABLE_IDS = BOARD.filter(isOwnable).map((t) => t.id);

/** Tile ids in the same group as `id`: a country, or all airports / all utilities. */
export function groupOf(id: number): number[] {
  const t = BOARD[id];
  if (t.type === 'property') return BOARD.filter((x) => x.country === t.country).map((x) => x.id);
  if (t.type === 'airport' || t.type === 'utility') return BOARD.filter((x) => x.type === t.type).map((x) => x.id);
  return [id];
}

// Pure rule helpers used by both the server (to enforce) and the client (to
// enable/disable buttons and show rents). Each `why*` function returns null
// when the action is allowed, otherwise a human-readable reason.

import { AIRPORT_RENT, BOARD, COUNTRIES, MORTGAGE_INTEREST, UTILITY_MULTIPLIER, groupOf, isOwnable } from './board';
import type { GameState, Player, TradeOffer } from './types';

export const playerById = (s: GameState, id: string | null | undefined): Player | undefined =>
  s.players.find((p) => p.id === id);

export const activePlayers = (s: GameState) => s.players.filter((p) => !p.bankrupt);

export function ownsWholeGroup(s: GameState, playerId: string, tileId: number): boolean {
  return groupOf(tileId).every((id) => s.tiles[id]?.owner === playerId);
}

export const mortgageValue = (tileId: number) => Math.floor((BOARD[tileId].price ?? 0) / 2);
export const unmortgageCost = (tileId: number) => Math.ceil(mortgageValue(tileId) * (1 + MORTGAGE_INTEREST));

/** Rent owed when landing on `tileId`. `diceTotal` is needed for utilities. */
export function rentFor(s: GameState, tileId: number, diceTotal: number): number {
  const def = BOARD[tileId];
  const ts = s.tiles[tileId];
  if (!ts || !ts.owner || ts.mortgaged) return 0;
  const owner = playerById(s, ts.owner);
  if (!owner || owner.bankrupt) return 0;
  if (s.settings.noRentInPrison && owner.inPrison) return 0;

  const ownedInGroup = groupOf(tileId).filter((id) => s.tiles[id]?.owner === ts.owner).length;
  switch (def.type) {
    case 'property': {
      const rent = def.rent!;
      if (ts.houses > 0) return rent[ts.houses];
      const full = ownsWholeGroup(s, ts.owner, tileId);
      return full && s.settings.doubleRentOnSet ? rent[0] * 2 : rent[0];
    }
    case 'airport':
      return AIRPORT_RENT[ownedInGroup - 1] ?? 0;
    case 'utility':
      return diceTotal * (UTILITY_MULTIPLIER[ownedInGroup - 1] ?? 0);
    default:
      return 0;
  }
}

function baseOwnership(s: GameState, playerId: string, tileId: number): string | null {
  if (s.phase !== 'playing') return 'The game is not running';
  const def = BOARD[tileId];
  if (!def || !isOwnable(def)) return 'That tile cannot be owned';
  const p = playerById(s, playerId);
  if (!p || p.bankrupt) return 'You are not in this game';
  if (s.tiles[tileId]?.owner !== playerId) return 'You do not own this';
  return null;
}

export function whyCannotBuild(s: GameState, playerId: string, tileId: number): string | null {
  const base = baseOwnership(s, playerId, tileId);
  if (base) return base;
  const def = BOARD[tileId];
  if (def.type !== 'property') return 'Only cities can have houses';
  if (s.turn?.playerId !== playerId) return 'You can only build on your turn';
  if (s.turn.stage === 'auction' || s.turn.stage === 'buy') return 'Finish the current decision first';
  if (!ownsWholeGroup(s, playerId, tileId)) return `You need every city in ${groupName(tileId)}`;
  const group = groupOf(tileId);
  if (group.some((id) => s.tiles[id].mortgaged)) return 'A city in this country is mortgaged';
  const ts = s.tiles[tileId];
  if (ts.houses >= 5) return 'Already has a hotel';
  if (s.settings.evenBuild) {
    const min = Math.min(...group.map((id) => s.tiles[id].houses));
    if (ts.houses > min) return 'Build evenly across the country';
  }
  if (playerById(s, playerId)!.cash < def.houseCost!) return 'Not enough cash';
  return null;
}

export function whyCannotSell(s: GameState, playerId: string, tileId: number): string | null {
  const base = baseOwnership(s, playerId, tileId);
  if (base) return base;
  const ts = s.tiles[tileId];
  if (ts.houses <= 0) return 'No houses to sell';
  if (s.settings.evenBuild) {
    const max = Math.max(...groupOf(tileId).map((id) => s.tiles[id].houses));
    if (ts.houses < max) return 'Sell evenly across the country';
  }
  return null;
}

export function whyCannotMortgage(s: GameState, playerId: string, tileId: number): string | null {
  const base = baseOwnership(s, playerId, tileId);
  if (base) return base;
  if (s.tiles[tileId].mortgaged) return 'Already mortgaged';
  if (groupOf(tileId).some((id) => s.tiles[id].houses > 0)) return 'Sell the houses in this country first';
  return null;
}

export function whyCannotUnmortgage(s: GameState, playerId: string, tileId: number): string | null {
  const base = baseOwnership(s, playerId, tileId);
  if (base) return base;
  if (!s.tiles[tileId].mortgaged) return 'Not mortgaged';
  if (playerById(s, playerId)!.cash < unmortgageCost(tileId)) return 'Not enough cash';
  return null;
}

/** Tiles a player could put into a trade (owned, and no houses anywhere in the group). */
export function tradableTiles(s: GameState, playerId: string): number[] {
  return Object.keys(s.tiles)
    .map(Number)
    .filter((id) => s.tiles[id].owner === playerId && groupOf(id).every((g) => s.tiles[g].houses === 0));
}

export function whyOfferInvalid(s: GameState, playerId: string, offer: TradeOffer): string | null {
  const p = playerById(s, playerId);
  if (!p || p.bankrupt) return 'Player is not in the game';
  if (!Number.isInteger(offer.cash) || offer.cash < 0) return 'Invalid cash amount';
  if (offer.cash > p.cash) return `${p.name} does not have that much cash`;
  if (!Number.isInteger(offer.pardons) || offer.pardons < 0 || offer.pardons > p.pardons)
    return `${p.name} does not have that many pardon cards`;
  const ok = new Set(tradableTiles(s, playerId));
  if (new Set(offer.tiles).size !== offer.tiles.length) return 'Duplicate tiles in offer';
  for (const id of offer.tiles) if (!ok.has(id)) return `${BOARD[id]?.name ?? 'Tile'} cannot be traded`;
  return null;
}

export const groupName = (tileId: number) => {
  const t = BOARD[tileId];
  return t.country ? COUNTRIES[t.country].name : t.type;
};

export const netWorth = (s: GameState, playerId: string) => {
  const p = playerById(s, playerId);
  if (!p) return 0;
  let total = p.cash;
  for (const [idStr, ts] of Object.entries(s.tiles)) {
    if (ts.owner !== playerId) continue;
    const id = Number(idStr);
    total += ts.mortgaged ? 0 : mortgageValue(id);
    total += Math.floor(((BOARD[id].houseCost ?? 0) * ts.houses) / 2);
  }
  return total;
};

export const totalDebt = (p: Player) => p.debts.reduce((a, d) => a + d.amount, 0);

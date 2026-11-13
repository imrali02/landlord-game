// Engine smoke test: plays many random games and checks invariants.
// Run with `npm test`.

import { BOARD, groupOf } from '../shared/board';
import { tradableTiles, whyCannotBuild } from '../shared/rules';
import type { Action, GameState } from '../shared/types';
import { Game, GameError } from './game';

const GAMES = Number(process.argv[2] ?? 300);
let seed = 12345;
const rand = (n: number) => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed % n;
};

function check(s: GameState) {
  const ids = new Set(s.players.filter((p) => !p.bankrupt).map((p) => p.id));
  for (const [id, t] of Object.entries(s.tiles)) {
    if (t.owner && !ids.has(t.owner)) throw new Error(`tile ${id} owned by inactive ${t.owner}`);
    if (t.houses < 0 || t.houses > 5) throw new Error(`tile ${id} has ${t.houses} houses`);
    if (t.houses && (t.mortgaged || BOARD[+id].type !== 'property')) throw new Error(`bad houses on ${id}`);
    if (t.houses && groupOf(+id).some((g) => s.tiles[g].owner !== t.owner)) throw new Error(`houses without set ${id}`);
  }
  for (const p of s.players) {
    if (p.position < 0 || p.position >= 40) throw new Error('bad position');
    if (!p.bankrupt && p.cash < 0) throw new Error(`${p.name} has negative cash ${p.cash}`);
  }
  if (s.phase === 'playing' && !s.turn) throw new Error('no turn');
  if (s.turn && s.players.find((p) => p.id === s.turn!.playerId)?.bankrupt && s.phase === 'playing' && s.turn.stage !== 'auction')
    throw new Error('bankrupt player has the turn');
}

let finished = 0;
let totalTurns = 0;
let rejected = 0;
for (let g = 0; g < GAMES; g++) {
  const game = new Game('TEST');
  let clock = 0;
  game.now = () => clock;
  game.rng = rand;
  const n = 2 + rand(5);
  const ids = Array.from({ length: n }, (_, i) => game.addPlayer(`P${i}`).playerId);
  game.handle(ids[0], { type: 'updateSettings', settings: { auctions: rand(2) === 0, noRentInPrison: rand(2) === 0 } });
  game.handle(ids[0], { type: 'start' });
  const s = () => game.state;
  const act = (id: string, a: Action) => {
    try {
      game.handle(id, a);
      return true;
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
      rejected++;
      return false;
    }
  };

  for (let step = 0; step < Number(process.argv[3] ?? 20000) && s().phase === 'playing'; step++) {
    clock += 300;
    game.tick();
    if (s().phase !== 'playing') break;
    const t = s().turn!;
    const me = s().players.find((p) => p.id === t.playerId)!;

    // Anyone with debts tries to raise cash, else goes bankrupt.
    const debtor = s().players.find((p) => !p.bankrupt && p.debts.length);
    if (debtor) {
      const mine = Object.keys(s().tiles).map(Number).filter((id) => s().tiles[id].owner === debtor.id);
      const done =
        mine.some((id) => act(debtor.id, { type: 'sell', tileId: id })) ||
        mine.some((id) => act(debtor.id, { type: 'mortgage', tileId: id }));
      if (!done) act(debtor.id, { type: 'bankrupt' });
      continue;
    }

    // Occasional random trade.
    if (rand(40) === 0) {
      const others = s().players.filter((p) => !p.bankrupt && p.id !== me.id);
      const other = others[rand(others.length)];
      const mine = tradableTiles(s(), me.id);
      const theirs = tradableTiles(s(), other.id);
      act(me.id, {
        type: 'proposeTrade',
        to: other.id,
        give: { cash: rand(Math.max(1, me.cash)), tiles: mine.slice(0, rand(2)), pardons: 0 },
        get: { cash: 0, tiles: theirs.slice(0, rand(2)), pardons: 0 },
      });
      const tr = s().trades.at(-1);
      if (tr && rand(2)) act(tr.to, { type: 'acceptTrade', tradeId: tr.id });
    }

    switch (t.stage) {
      case 'roll':
        if (me.inPrison && rand(3) === 0) act(me.id, { type: me.pardons ? 'usePardon' : 'payBail' });
        act(me.id, { type: 'roll' });
        break;
      case 'buy':
        if (rand(4) && act(me.id, { type: 'buy' })) break;
        act(me.id, { type: 'decline' });
        break;
      case 'auction': {
        const bidder = s().players.filter((p) => !p.bankrupt)[rand(n)];
        if (bidder && rand(2)) act(bidder.id, { type: 'bid', amount: (s().auction?.bid ?? 0) + 1 + rand(40) });
        clock += 4000;
        break;
      }
      case 'end': {
        for (const id of Object.keys(s().tiles).map(Number)) {
          if (!whyCannotBuild(s(), me.id, id) && rand(2)) act(me.id, { type: 'build', tileId: id });
          if (s().tiles[id].owner === me.id && s().tiles[id].mortgaged && rand(3) === 0)
            act(me.id, { type: 'unmortgage', tileId: id });
        }
        act(me.id, { type: 'endTurn' });
        break;
      }
    }
    check(s());
  }
  if (s().phase === 'ended') finished++;
  totalTurns += s().turnNumber;
  check(s());
}

console.log(
  `OK: ${GAMES} games simulated, ${finished} reached a winner, avg ${Math.round(totalTurns / GAMES)} turns, ${rejected} invalid actions rejected`,
);

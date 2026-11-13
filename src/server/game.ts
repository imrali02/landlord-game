// Authoritative game engine. One Game instance per room. All rules are
// enforced here; clients only send intents (Actions) and render GameState.

import crypto from 'node:crypto';
import {
  BAIL,
  BOARD,
  BOARD_SIZE,
  DEFAULT_SETTINGS,
  MAX_PRISON_TURNS,
  OWNABLE_IDS,
  PLAYER_COLORS,
  PRISON_TILE,
  START_BONUS,
} from '../shared/board';
import {
  activePlayers,
  mortgageValue,
  playerById,
  rentFor,
  unmortgageCost,
  whyCannotBuild,
  whyCannotMortgage,
  whyCannotSell,
  whyCannotUnmortgage,
  whyOfferInvalid,
} from '../shared/rules';
import type { Action, GameState, Player, Settings, TileState, TradeOffer } from '../shared/types';
import { SURPRISE, TREASURE, type CardApi } from './cards';

export class GameError extends Error {}
const fail = (msg: string): never => {
  throw new GameError(msg);
};

export const AUCTION_OPEN_MS = 12_000;
export const AUCTION_BID_MS = 7_000;
/** A disconnected player's turn is played automatically after this long. */
export const AFK_MS = 30_000;
const HOST_HANDOVER_MS = 20_000;
const LOG_LIMIT = 250;
const CHAT_LIMIT = 200;

const freshTiles = (): Record<number, TileState> =>
  Object.fromEntries(OWNABLE_IDS.map((id) => [id, { owner: null, houses: 0, mortgaged: false }]));

const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

export interface HandleResult {
  kicked?: string;
}

export class Game {
  state: GameState;
  /** playerId -> secret token used to reclaim a seat after a refresh. */
  private tokens = new Map<string, string>();
  private decks = { surprise: [] as number[], treasure: [] as number[] };
  private seq = 0;
  private disconnectedAt = new Map<string, number>();
  private lastAutoAction = 0;
  /** Injectable for tests. */
  rng: (maxExclusive: number) => number = (max) => crypto.randomInt(max);
  now: () => number = () => Date.now();

  constructor(roomId: string) {
    this.state = {
      roomId,
      phase: 'lobby',
      hostId: '',
      settings: { ...DEFAULT_SETTINGS },
      players: [],
      tiles: freshTiles(),
      turn: null,
      auction: null,
      trades: [],
      log: [],
      chat: [],
      vacationPot: 0,
      winner: null,
      lastCard: null,
      lastMove: null,
      turnNumber: 0,
      serverNow: Date.now(),
    };
  }

  // ---------------------------------------------------------------- identity

  addPlayer(rawName: string): { playerId: string; token: string } {
    const s = this.state;
    if (s.phase !== 'lobby') fail('This game has already started');
    if (s.players.length >= s.settings.maxPlayers) fail('This room is full');
    let name = cleanName(rawName);
    const taken = new Set(s.players.map((p) => p.name.toLowerCase()));
    for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${cleanName(rawName).slice(0, 17)} ${i}`;
    const used = new Set(s.players.map((p) => p.color));
    const color = PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[0];
    const id = crypto.randomBytes(6).toString('hex');
    const token = crypto.randomBytes(18).toString('base64url');
    s.players.push(this.freshPlayer(id, name, color));
    this.tokens.set(id, token);
    if (!s.hostId) s.hostId = id;
    this.log(`${name} joined`);
    return { playerId: id, token };
  }

  playerForToken(token: string | undefined): string | undefined {
    if (!token) return undefined;
    for (const [id, t] of this.tokens) if (t === token) return id;
    return undefined;
  }

  setConnected(playerId: string, connected: boolean) {
    const p = playerById(this.state, playerId);
    if (!p) return;
    p.connected = connected;
    if (connected) this.disconnectedAt.delete(playerId);
    else this.disconnectedAt.set(playerId, this.now());
  }

  get connectedCount() {
    return this.state.players.filter((p) => p.connected).length;
  }

  chat(playerId: string | null, text: string) {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!clean) return;
    const p = playerById(this.state, playerId);
    this.state.chat.push({
      id: ++this.seq,
      t: this.now(),
      playerId,
      name: p?.name ?? 'Spectator',
      color: p?.color ?? '#94a3b8',
      text: clean,
    });
    if (this.state.chat.length > CHAT_LIMIT) this.state.chat.splice(0, this.state.chat.length - CHAT_LIMIT);
  }

  // ----------------------------------------------------------------- actions

  handle(playerId: string, a: Action): HandleResult {
    const p = playerById(this.state, playerId) ?? fail('You are not a player in this room');
    let result: HandleResult = {};
    switch (a.type) {
      case 'start':
        this.start(p);
        break;
      case 'updateSettings':
        this.updateSettings(p, a.settings);
        break;
      case 'setColor':
        this.setColor(p, a.color);
        break;
      case 'kick':
        result = this.kick(p, a.playerId);
        break;
      case 'roll':
        this.roll(p);
        break;
      case 'buy':
        this.buy(p);
        break;
      case 'decline':
        this.decline(p);
        break;
      case 'bid':
        this.bid(p, a.amount);
        break;
      case 'endTurn':
        this.endTurn(p);
        break;
      case 'payBail':
        this.leavePrison(p, 'bail');
        break;
      case 'usePardon':
        this.leavePrison(p, 'pardon');
        break;
      case 'build':
        this.build(p, a.tileId);
        break;
      case 'sell':
        this.sell(p, a.tileId);
        break;
      case 'mortgage':
        this.mortgage(p, a.tileId);
        break;
      case 'unmortgage':
        this.unmortgage(p, a.tileId);
        break;
      case 'proposeTrade':
        this.proposeTrade(p, a.to, a.give, a.get);
        break;
      case 'acceptTrade':
        this.acceptTrade(p, a.tradeId);
        break;
      case 'declineTrade':
        this.removeTrade(p, a.tradeId, 'to');
        break;
      case 'cancelTrade':
        this.removeTrade(p, a.tradeId, 'from');
        break;
      case 'payDebts':
        break; // debts settle automatically below
      case 'bankrupt':
        this.requirePlaying();
        if (p.bankrupt) fail('You are already out');
        this.bankrupt(p, `${p.name} declared bankruptcy`);
        break;
      case 'rematch':
        this.rematch(p);
        break;
      default:
        fail('Unknown action');
    }
    this.settleDebts();
    return result;
  }

  /** Called about once a second by the server. Returns true if state changed. */
  tick(): boolean {
    const s = this.state;
    const now = this.now();
    let changed = false;

    if (s.auction && now >= s.auction.endsAt) {
      this.finishAuction();
      changed = true;
    }

    // Hand host duties to a connected player if the host disappears.
    const host = playerById(s, s.hostId);
    const hostAway = !host || (!host.connected && now - (this.disconnectedAt.get(host.id) ?? now) > HOST_HANDOVER_MS);
    if (hostAway) {
      const next = s.players.find((p) => p.connected && !p.bankrupt) ?? s.players.find((p) => p.connected);
      if (next) {
        s.hostId = next.id;
        this.log(`${next.name} is now the host`);
        changed = true;
      }
    }

    // Keep the game moving when the player whose turn it is has left,
    // but only while someone else is still here to play.
    if (s.phase === 'playing' && s.turn && now - this.lastAutoAction > 1500) {
      const others = s.players.some((p) => p.connected && !p.bankrupt && p.id !== s.turn!.playerId);
      const idle = (p: Player) => !p.connected && now - (this.disconnectedAt.get(p.id) ?? now) > AFK_MS;
      const cur = playerById(s, s.turn.playerId);
      if (others && cur && idle(cur)) {
        this.lastAutoAction = now;
        this.autoAct(cur);
        changed = true;
      } else if (others) {
        const debtor = s.players.find((p) => !p.bankrupt && p.debts.length && idle(p));
        if (debtor) {
          this.lastAutoAction = now;
          this.bankrupt(debtor, `${debtor.name} left with unpaid debts and went bankrupt`);
          changed = true;
        }
      }
    }
    if (changed) this.settleDebts();
    return changed;
  }

  private autoAct(p: Player) {
    const t = this.state.turn!;
    try {
      if (p.debts.length) return this.bankrupt(p, `${p.name} left with unpaid debts and went bankrupt`);
      if (t.stage === 'roll') {
        if (p.inPrison && p.pardons > 0) this.leavePrison(p, 'pardon');
        this.roll(p);
      } else if (t.stage === 'buy') this.decline(p);
      else if (t.stage === 'end' && !this.blockingDebtor()) this.endTurn(p);
    } catch {
      /* nothing sensible to do automatically */
    }
  }

  // ------------------------------------------------------------------- lobby

  private requireHost(p: Player) {
    if (p.id !== this.state.hostId) fail('Only the host can do that');
  }

  private requirePlaying() {
    if (this.state.phase !== 'playing') fail('The game is not running');
  }

  private freshPlayer(id: string, name: string, color: string): Player {
    return {
      id,
      name,
      color,
      cash: this.state.settings.startingCash,
      position: 0,
      inPrison: false,
      prisonTurns: 0,
      pardons: 0,
      bankrupt: false,
      connected: true,
      debts: [],
    };
  }

  private start(p: Player) {
    const s = this.state;
    this.requireHost(p);
    if (s.phase !== 'lobby') fail('The game has already started');
    if (s.players.length < 2) fail('You need at least 2 players to start');
    s.players = s.players.map((x) => ({ ...this.freshPlayer(x.id, x.name, x.color), connected: x.connected }));
    if (s.settings.randomOrder) s.players = shuffle(s.players);
    s.tiles = freshTiles();
    s.phase = 'playing';
    s.turn = null;
    s.turnNumber = 0;
    s.vacationPot = 0;
    this.decks = { surprise: [], treasure: [] };
    this.log(`The game has started with ${s.players.length} players`);
    this.nextTurn();
  }

  private updateSettings(p: Player, patch: Partial<Settings>) {
    const s = this.state;
    this.requireHost(p);
    if (s.phase !== 'lobby') fail('Settings can only change in the lobby');
    const next = { ...s.settings };
    if (patch.maxPlayers !== undefined) {
      const n = Math.round(Number(patch.maxPlayers));
      if (!(n >= 2 && n <= 8)) fail('Max players must be 2–8');
      if (n < s.players.length) fail('There are already more players than that');
      next.maxPlayers = n;
    }
    if (patch.startingCash !== undefined) {
      const n = Math.round(Number(patch.startingCash));
      if (!(n >= 500 && n <= 10000)) fail('Starting cash must be $500–$10,000');
      next.startingCash = n;
    }
    for (const k of ['auctions', 'vacationCash', 'noRentInPrison', 'evenBuild', 'doubleRentOnSet', 'randomOrder'] as const) {
      if (patch[k] !== undefined) next[k] = Boolean(patch[k]);
    }
    s.settings = next;
    for (const x of s.players) x.cash = next.startingCash;
  }

  private setColor(p: Player, color: string) {
    if (this.state.phase !== 'lobby') fail('Colors can only change in the lobby');
    if (!PLAYER_COLORS.includes(color)) fail('Unknown color');
    if (this.state.players.some((x) => x.id !== p.id && x.color === color)) fail('That color is taken');
    p.color = color;
  }

  private kick(p: Player, targetId: string): HandleResult {
    const s = this.state;
    this.requireHost(p);
    const target = playerById(s, targetId) ?? fail('No such player');
    if (target.id === p.id) fail('You cannot kick yourself');
    if (s.phase === 'lobby' || s.phase === 'ended') {
      s.players = s.players.filter((x) => x.id !== target.id);
      this.tokens.delete(target.id);
      this.log(`${target.name} was removed by the host`);
    } else {
      if (target.bankrupt) fail(`${target.name} is already out`);
      target.debts = []; // assets go back to the bank
      this.bankrupt(target, `${target.name} was removed by the host`);
    }
    return { kicked: target.id };
  }

  private rematch(p: Player) {
    const s = this.state;
    this.requireHost(p);
    if (s.phase !== 'ended') fail('The game has not ended');
    s.phase = 'lobby';
    s.players = s.players.map((x) => ({ ...this.freshPlayer(x.id, x.name, x.color), connected: x.connected }));
    s.tiles = freshTiles();
    s.turn = null;
    s.auction = null;
    s.trades = [];
    s.vacationPot = 0;
    s.winner = null;
    s.lastCard = null;
    s.lastMove = null;
    s.turnNumber = 0;
    this.log('Back to the lobby for a rematch');
  }

  // ------------------------------------------------------------------- turns

  private current(p: Player) {
    this.requirePlaying();
    const t = this.state.turn;
    if (!t || t.playerId !== p.id) fail("It's not your turn");
    return t!;
  }

  private nextTurn() {
    const s = this.state;
    const n = s.players.length;
    const idx = s.turn ? s.players.findIndex((x) => x.id === s.turn!.playerId) : -1;
    for (let i = 1; i <= n; i++) {
      const cand = s.players[(idx + i + n) % n];
      if (!cand.bankrupt) {
        s.turn = { playerId: cand.id, stage: 'roll', dice: null, rollId: s.turn?.rollId ?? 0, doublesCount: 0, rollAgain: false };
        s.turnNumber++;
        return;
      }
    }
  }

  private blockingDebtor(): Player | undefined {
    return this.state.players.find((x) => !x.bankrupt && x.debts.length > 0);
  }

  private roll(p: Player) {
    const t = this.current(p);
    if (t.stage !== 'roll') fail('You cannot roll right now');
    if (p.debts.length) fail('Pay your debts before rolling');
    const d1 = this.rng(6) + 1;
    const d2 = this.rng(6) + 1;
    t.dice = [d1, d2];
    t.rollId++;
    const doubles = d1 === d2;
    const total = d1 + d2;
    this.log(`${p.name} rolled ${d1} + ${d2}${doubles ? ' (doubles!)' : ''}`);

    if (p.inPrison) {
      t.rollAgain = false;
      if (doubles) {
        p.inPrison = false;
        p.prisonTurns = 0;
        this.log(`${p.name} rolled doubles and escaped prison`);
      } else {
        p.prisonTurns++;
        if (p.prisonTurns < MAX_PRISON_TURNS) {
          this.log(`${p.name} stays in prison (${MAX_PRISON_TURNS - p.prisonTurns} tries left)`);
          t.stage = 'end';
          return;
        }
        this.log(`${p.name} served their time and paid ${money(BAIL)} bail`);
        p.inPrison = false;
        p.prisonTurns = 0;
        this.charge(p, BAIL, null, 'bail', true);
      }
    } else if (doubles) {
      t.doublesCount++;
      if (t.doublesCount >= 3) {
        this.log(`${p.name} rolled doubles three times and was sent to prison`);
        this.sendToPrison(p);
        t.stage = 'end';
        return;
      }
      t.rollAgain = true;
    } else {
      t.rollAgain = false;
    }

    this.moveForward(p, total);
    if (t.stage !== 'buy') this.finishResolution();
  }

  /** After a landing is fully resolved: roll again on doubles, otherwise wait for End Turn. */
  private finishResolution() {
    const t = this.state.turn;
    if (!t) return;
    const p = playerById(this.state, t.playerId)!;
    if (p.bankrupt) return this.nextTurn();
    t.stage = t.rollAgain && !p.inPrison ? 'roll' : 'end';
  }

  private endTurn(p: Player) {
    const t = this.current(p);
    if (t.stage !== 'end') fail(t.stage === 'roll' ? 'Roll the dice first' : 'Finish the current decision first');
    const debtor = this.blockingDebtor();
    if (debtor) fail(debtor.id === p.id ? 'Pay your debts first (sell houses or mortgage)' : `Waiting for ${debtor.name} to pay their debts`);
    this.nextTurn();
  }

  private leavePrison(p: Player, how: 'bail' | 'pardon') {
    const t = this.current(p);
    if (t.stage !== 'roll') fail('You can only do that before rolling');
    if (!p.inPrison) fail('You are not in prison');
    if (how === 'pardon') {
      if (p.pardons <= 0) fail('You have no pardon cards');
      p.pardons--;
      this.log(`${p.name} used a pardon card to leave prison`);
    } else {
      if (p.cash < BAIL) fail('Not enough cash for bail');
      this.transfer(p, BAIL, null, true);
      this.log(`${p.name} paid ${money(BAIL)} bail`);
    }
    p.inPrison = false;
    p.prisonTurns = 0;
  }

  // ---------------------------------------------------------------- movement

  private setMove(p: Player, from: number, direct: boolean) {
    this.state.lastMove = { playerId: p.id, from, to: p.position, direct, id: ++this.seq };
  }

  private moveForward(p: Player, steps: number) {
    const from = p.position;
    const to = (from + steps) % BOARD_SIZE;
    if (from + steps >= BOARD_SIZE) {
      p.cash += START_BONUS;
      this.log(`${p.name} passed Start and collected ${money(START_BONUS)}`);
    }
    p.position = to;
    this.setMove(p, from, false);
    this.resolve(p);
  }

  private sendToPrison(p: Player) {
    const from = p.position;
    p.position = PRISON_TILE;
    p.inPrison = true;
    p.prisonTurns = 0;
    if (this.state.turn?.playerId === p.id) this.state.turn.rollAgain = false;
    this.setMove(p, from, true);
  }

  private resolve(p: Player) {
    const s = this.state;
    const def = BOARD[p.position];
    const t = s.turn!;
    switch (def.type) {
      case 'property':
      case 'airport':
      case 'utility': {
        const ts = s.tiles[def.id];
        if (!ts.owner) {
          t.stage = 'buy';
          return;
        }
        if (ts.owner === p.id) return;
        const owner = playerById(s, ts.owner)!;
        if (ts.mortgaged) {
          this.log(`${def.name} is mortgaged, so ${p.name} pays no rent`);
          return;
        }
        if (s.settings.noRentInPrison && owner.inPrison) {
          this.log(`${owner.name} is in prison and can't collect rent`);
          return;
        }
        const dice = t.dice ? t.dice[0] + t.dice[1] : 7;
        const rent = rentFor(s, def.id, dice);
        if (rent > 0) {
          this.log(`${p.name} owes ${owner.name} ${money(rent)} rent for ${def.name}`);
          this.charge(p, rent, owner, `rent for ${def.name}`);
        }
        return;
      }
      case 'tax':
        this.log(`${p.name} pays ${money(def.tax!)} ${def.name}`);
        this.charge(p, def.tax!, null, def.name, true);
        return;
      case 'surprise':
      case 'treasure':
        this.drawCard(p, def.type);
        return;
      case 'gotoprison':
        this.log(`${p.name} was sent to prison`);
        this.sendToPrison(p);
        return;
      case 'vacation':
        if (s.settings.vacationCash && s.vacationPot > 0) {
          this.log(`${p.name} enjoys a vacation and collects the ${money(s.vacationPot)} pot`);
          p.cash += s.vacationPot;
          s.vacationPot = 0;
        }
        return;
      default:
        return;
    }
  }

  private drawCard(p: Player, deck: 'surprise' | 'treasure') {
    const cards = deck === 'surprise' ? SURPRISE : TREASURE;
    if (!this.decks[deck].length) this.decks[deck] = shuffle(cards.map((_, i) => i));
    const card = cards[this.decks[deck].pop()!];
    this.state.lastCard = { deck, text: card.text, playerId: p.id, id: ++this.seq };
    this.log(`${p.name} drew ${deck === 'surprise' ? 'Surprise' : 'Treasure'}: ${card.text}`);
    const others = () => activePlayers(this.state).filter((x) => x.id !== p.id);
    const api: CardApi = {
      player: p,
      collect: (n) => {
        p.cash += n;
      },
      pay: (n) => this.charge(p, n, null, 'card', true),
      payEachPlayer: (n) => others().forEach((o) => this.charge(p, n, o, 'card')),
      collectFromEachPlayer: (n) => others().forEach((o) => this.charge(o, n, p, `${p.name}'s card`)),
      advanceTo: (id) => this.moveForward(p, (id - p.position + BOARD_SIZE) % BOARD_SIZE || BOARD_SIZE),
      moveBy: (steps) => {
        if (steps >= 0) return this.moveForward(p, steps);
        const from = p.position;
        p.position = (p.position + steps + BOARD_SIZE) % BOARD_SIZE;
        this.setMove(p, from, true);
        this.resolve(p);
      },
      advanceToNext: (type) => {
        for (let i = 1; i <= BOARD_SIZE; i++) {
          if (BOARD[(p.position + i) % BOARD_SIZE].type === type) return this.moveForward(p, i);
        }
      },
      goToPrison: () => this.sendToPrison(p),
      givePardon: () => {
        p.pardons++;
      },
      repairs: (perHouse, perHotel) => {
        let total = 0;
        for (const ts of Object.values(this.state.tiles)) {
          if (ts.owner !== p.id) continue;
          total += ts.houses === 5 ? perHotel : ts.houses * perHouse;
        }
        if (total > 0) this.charge(p, total, null, 'repairs', true);
        else this.log(`${p.name} has no buildings, so pays nothing`);
      },
    };
    card.run(api);
  }

  // ------------------------------------------------------------------- money

  private transfer(payer: Player, amount: number, creditor: Player | null, toPot: boolean) {
    payer.cash -= amount;
    if (creditor && !creditor.bankrupt) creditor.cash += amount;
    else if (toPot && this.state.settings.vacationCash) this.state.vacationPot += amount;
  }

  /** Charge a player. If they can't afford it, it becomes a debt they must clear. */
  private charge(payer: Player, amount: number, creditor: Player | null, reason: string, toPot = false) {
    if (amount <= 0 || payer.bankrupt) return;
    if (payer.debts.length === 0 && payer.cash >= amount) return this.transfer(payer, amount, creditor, toPot);
    payer.debts.push({ creditor: creditor?.id ?? null, amount, toPot, reason });
    this.log(`${payer.name} can't afford ${money(amount)} (${reason}) — sell or mortgage to pay, or go bankrupt`);
  }

  /** Automatically pay off any debts that players can now afford. */
  private settleDebts() {
    for (let pass = 0; pass < 5; pass++) {
      let paid = false;
      for (const p of this.state.players) {
        while (!p.bankrupt && p.debts.length && p.cash >= p.debts[0].amount) {
          const d = p.debts.shift()!;
          const cred = playerById(this.state, d.creditor) ?? null;
          this.transfer(p, d.amount, cred, d.toPot);
          this.log(`${p.name} paid ${money(d.amount)} they owed${cred ? ` to ${cred.name}` : ''}`);
          paid = true;
        }
      }
      if (!paid) break;
    }
  }

  private bankrupt(p: Player, message: string) {
    const s = this.state;
    if (p.bankrupt) return;
    const creditor = p.debts.map((d) => playerById(s, d.creditor)).find((c) => c && !c.bankrupt) ?? null;
    let cash = Math.max(0, p.cash);
    for (const [idStr, ts] of Object.entries(s.tiles)) {
      if (ts.owner !== p.id) continue;
      cash += Math.floor(((BOARD[Number(idStr)].houseCost ?? 0) * ts.houses) / 2);
      ts.houses = 0;
      if (creditor) ts.owner = creditor.id;
      else {
        ts.owner = null;
        ts.mortgaged = false;
      }
    }
    if (creditor) {
      creditor.cash += cash;
      creditor.pardons += p.pardons;
      this.log(`${message}. Everything they had goes to ${creditor.name}`);
    } else {
      this.log(`${message}. Their properties return to the bank`);
    }
    p.cash = 0;
    p.debts = [];
    p.pardons = 0;
    p.bankrupt = true;
    p.inPrison = false;
    s.trades = s.trades.filter((t) => t.from !== p.id && t.to !== p.id);
    if (s.auction?.bidder === p.id) {
      s.auction.bidder = null;
      s.auction.bid = 0;
    }

    const remaining = activePlayers(s);
    if (remaining.length <= 1) {
      s.phase = 'ended';
      s.winner = remaining[0]?.id ?? null;
      s.auction = null;
      if (s.turn) s.turn.stage = 'end';
      if (remaining[0]) this.log(`🏆 ${remaining[0].name} wins the game!`);
      return;
    }
    if (s.turn?.playerId === p.id && s.turn.stage !== 'auction') this.nextTurn();
  }

  // -------------------------------------------------------- buying & auction

  private buy(p: Player) {
    const t = this.current(p);
    if (t.stage !== 'buy') fail('There is nothing to buy right now');
    const def = BOARD[p.position];
    const ts = this.state.tiles[def.id];
    if (!ts || ts.owner) fail('This tile is not for sale');
    if (p.cash < def.price!) fail('Not enough cash');
    p.cash -= def.price!;
    ts.owner = p.id;
    this.log(`${p.name} bought ${def.name} for ${money(def.price!)}`);
    this.finishResolution();
  }

  private decline(p: Player) {
    const t = this.current(p);
    if (t.stage !== 'buy') fail('There is nothing to decline');
    const def = BOARD[p.position];
    if (this.state.settings.auctions) {
      this.state.auction = { tileId: def.id, bid: 0, bidder: null, endsAt: this.now() + AUCTION_OPEN_MS };
      t.stage = 'auction';
      this.log(`${def.name} is up for auction`);
    } else {
      this.log(`${p.name} decided not to buy ${def.name}`);
      this.finishResolution();
    }
  }

  private bid(p: Player, amount: number) {
    const a = this.state.auction ?? fail('There is no auction running');
    if (p.bankrupt) fail('You are out of the game');
    if (!Number.isInteger(amount) || amount <= a!.bid) fail(`Bid more than ${money(a!.bid)}`);
    if (amount > p.cash) fail('You cannot bid more cash than you have');
    a!.bid = amount;
    a!.bidder = p.id;
    a!.endsAt = Math.max(a!.endsAt, this.now() + AUCTION_BID_MS);
  }

  private finishAuction() {
    const s = this.state;
    const a = s.auction!;
    s.auction = null;
    const def = BOARD[a.tileId];
    const winner = playerById(s, a.bidder);
    if (winner && !winner.bankrupt && winner.cash >= a.bid && !s.tiles[a.tileId].owner) {
      winner.cash -= a.bid;
      s.tiles[a.tileId].owner = winner.id;
      this.log(`${winner.name} won ${def.name} at auction for ${money(a.bid)}`);
    } else {
      this.log(`Nobody bought ${def.name}`);
    }
    if (s.phase === 'playing') this.finishResolution();
  }

  // --------------------------------------------------------------- buildings

  private build(p: Player, tileId: number) {
    const why = whyCannotBuild(this.state, p.id, tileId);
    if (why) fail(why);
    const def = BOARD[tileId];
    const ts = this.state.tiles[tileId];
    p.cash -= def.houseCost!;
    ts.houses++;
    this.log(`${p.name} built ${ts.houses === 5 ? 'a hotel' : 'a house'} in ${def.name}`);
  }

  private sell(p: Player, tileId: number) {
    const why = whyCannotSell(this.state, p.id, tileId);
    if (why) fail(why);
    const def = BOARD[tileId];
    const ts = this.state.tiles[tileId];
    const refund = Math.floor(def.houseCost! / 2);
    ts.houses--;
    p.cash += refund;
    this.log(`${p.name} sold a building in ${def.name} for ${money(refund)}`);
  }

  private mortgage(p: Player, tileId: number) {
    const why = whyCannotMortgage(this.state, p.id, tileId);
    if (why) fail(why);
    this.state.tiles[tileId].mortgaged = true;
    p.cash += mortgageValue(tileId);
    this.log(`${p.name} mortgaged ${BOARD[tileId].name} for ${money(mortgageValue(tileId))}`);
  }

  private unmortgage(p: Player, tileId: number) {
    const why = whyCannotUnmortgage(this.state, p.id, tileId);
    if (why) fail(why);
    const cost = unmortgageCost(tileId);
    this.state.tiles[tileId].mortgaged = false;
    p.cash -= cost;
    this.log(`${p.name} paid off the mortgage on ${BOARD[tileId].name} (${money(cost)})`);
  }

  // ------------------------------------------------------------------ trades

  private proposeTrade(p: Player, toId: string, give: TradeOffer, get: TradeOffer) {
    const s = this.state;
    this.requirePlaying();
    if (p.bankrupt) fail('You are out of the game');
    const to = playerById(s, toId) ?? fail('No such player');
    if (to!.id === p.id) fail('You cannot trade with yourself');
    give = normalizeOffer(give);
    get = normalizeOffer(get);
    const why = whyOfferInvalid(s, p.id, give) ?? whyOfferInvalid(s, to!.id, get);
    if (why) fail(why);
    if (!give.cash && !give.tiles.length && !give.pardons && !get.cash && !get.tiles.length && !get.pardons)
      fail('The trade is empty');
    s.trades = s.trades.filter((t) => !(t.from === p.id && t.to === to!.id));
    s.trades.push({ id: crypto.randomBytes(5).toString('hex'), from: p.id, to: to!.id, give, get, createdAt: this.now() });
    this.log(`${p.name} sent a trade offer to ${to!.name}`);
  }

  private acceptTrade(p: Player, tradeId: string) {
    const s = this.state;
    this.requirePlaying();
    const t = s.trades.find((x) => x.id === tradeId) ?? fail('That trade no longer exists');
    if (t!.to !== p.id) fail('This trade is not addressed to you');
    const from = playerById(s, t!.from)!;
    const why = whyOfferInvalid(s, from.id, t!.give) ?? whyOfferInvalid(s, p.id, t!.get);
    if (why) {
      s.trades = s.trades.filter((x) => x.id !== tradeId);
      fail(`Trade is no longer valid: ${why}`);
    }
    from.cash += t!.get.cash - t!.give.cash;
    p.cash += t!.give.cash - t!.get.cash;
    from.pardons += t!.get.pardons - t!.give.pardons;
    p.pardons += t!.give.pardons - t!.get.pardons;
    for (const id of t!.give.tiles) s.tiles[id].owner = p.id;
    for (const id of t!.get.tiles) s.tiles[id].owner = from.id;
    this.log(`${p.name} accepted a trade from ${from.name}`);
    s.trades = s.trades.filter(
      (x) => x.id !== tradeId && !whyOfferInvalid(s, x.from, x.give) && !whyOfferInvalid(s, x.to, x.get),
    );
  }

  private removeTrade(p: Player, tradeId: string, side: 'from' | 'to') {
    const s = this.state;
    const t = s.trades.find((x) => x.id === tradeId) ?? fail('That trade no longer exists');
    if (t![side] !== p.id) fail('You cannot do that to this trade');
    s.trades = s.trades.filter((x) => x.id !== tradeId);
    const other = playerById(s, side === 'to' ? t!.from : t!.to);
    this.log(side === 'to' ? `${p.name} declined ${other?.name}'s trade` : `${p.name} withdrew a trade offer`);
  }

  // ----------------------------------------------------------------- logging

  private log(text: string) {
    const s = this.state;
    s.log.push({ id: ++this.seq, t: this.now(), text });
    if (s.log.length > LOG_LIMIT) s.log.splice(0, s.log.length - LOG_LIMIT);
  }
}

function cleanName(raw: string) {
  const n = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return n || 'Player';
}

function normalizeOffer(o: TradeOffer): TradeOffer {
  return {
    cash: Math.max(0, Math.floor(Number(o?.cash) || 0)),
    pardons: Math.max(0, Math.floor(Number(o?.pardons) || 0)),
    tiles: Array.isArray(o?.tiles) ? o.tiles.map(Number).filter((n) => Number.isInteger(n)) : [],
  };
}

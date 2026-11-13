// Types shared by the server (authoritative game engine) and the React client.

export type TileType =
  | 'start'
  | 'property'
  | 'airport'
  | 'utility'
  | 'tax'
  | 'surprise'
  | 'treasure'
  | 'prison'
  | 'vacation'
  | 'gotoprison';

export type CountryId = 'palestine' | 'pakistan' | 'italy' | 'germany' | 'china' | 'france' | 'uk' | 'usa';

export interface TileDef {
  id: number;
  type: TileType;
  name: string;
  /** Color group for city properties. */
  country?: CountryId;
  price?: number;
  /** Property rent: [base, 1 house, 2 houses, 3 houses, 4 houses, hotel]. */
  rent?: number[];
  houseCost?: number;
  /** Flat amount charged by a tax tile. */
  tax?: number;
  icon?: string;
}

export interface Settings {
  maxPlayers: number;
  startingCash: number;
  /** Unbought properties go to auction when the lander declines. */
  auctions: boolean;
  /** Taxes and fees collect in a pot that the next player to land on Vacation wins. */
  vacationCash: boolean;
  /** Owners in prison cannot collect rent. */
  noRentInPrison: boolean;
  /** Houses must be built and sold evenly across a country. */
  evenBuild: boolean;
  /** Base rent doubles when one player owns a whole country. */
  doubleRentOnSet: boolean;
  /** Shuffle the turn order when the game starts. */
  randomOrder: boolean;
}

export interface Debt {
  /** Player id that is owed, or null for the bank. */
  creditor: string | null;
  amount: number;
  /** When owed to the bank, whether the money goes to the vacation pot. */
  toPot: boolean;
  reason: string;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  cash: number;
  position: number;
  inPrison: boolean;
  prisonTurns: number;
  pardons: number;
  bankrupt: boolean;
  connected: boolean;
  debts: Debt[];
}

export interface TileState {
  owner: string | null;
  /** 0-4 houses, 5 = hotel. */
  houses: number;
  mortgaged: boolean;
}

/**
 * roll    – current player must roll (or deal with prison)
 * buy     – current player is deciding whether to buy the tile they landed on
 * auction – an auction is running
 * end     – current player may manage properties, then end the turn
 */
export type Stage = 'roll' | 'buy' | 'auction' | 'end';

export interface Turn {
  playerId: string;
  stage: Stage;
  dice: [number, number] | null;
  /** Increments every roll so the client can animate dice. */
  rollId: number;
  doublesCount: number;
  /** Whether the player earned another roll this turn. */
  rollAgain: boolean;
}

export interface Auction {
  tileId: number;
  bid: number;
  bidder: string | null;
  endsAt: number;
}

export interface TradeOffer {
  cash: number;
  tiles: number[];
  pardons: number;
}

export interface Trade {
  id: string;
  from: string;
  to: string;
  /** What `from` gives to `to`. */
  give: TradeOffer;
  /** What `from` asks for from `to`. */
  get: TradeOffer;
  createdAt: number;
}

export interface LogEntry {
  id: number;
  t: number;
  text: string;
}

export interface ChatMsg {
  id: number;
  t: number;
  playerId: string | null;
  name: string;
  color: string;
  text: string;
}

export interface CardDraw {
  deck: 'surprise' | 'treasure';
  text: string;
  playerId: string;
  id: number;
}

export interface Move {
  playerId: string;
  from: number;
  to: number;
  /** Teleports (prison, cards that send you back) skip the step-by-step animation. */
  direct: boolean;
  id: number;
}

export type Phase = 'lobby' | 'playing' | 'ended';

export interface GameState {
  roomId: string;
  phase: Phase;
  hostId: string;
  settings: Settings;
  players: Player[];
  tiles: Record<number, TileState>;
  turn: Turn | null;
  auction: Auction | null;
  trades: Trade[];
  log: LogEntry[];
  chat: ChatMsg[];
  vacationPot: number;
  winner: string | null;
  lastCard: CardDraw | null;
  lastMove: Move | null;
  turnNumber: number;
  /** Server clock at broadcast time, so clients can show accurate countdowns. */
  serverNow: number;
}

export type Action =
  | { type: 'start' }
  | { type: 'updateSettings'; settings: Partial<Settings> }
  | { type: 'setColor'; color: string }
  | { type: 'kick'; playerId: string }
  | { type: 'roll' }
  | { type: 'buy' }
  | { type: 'decline' }
  | { type: 'bid'; amount: number }
  | { type: 'endTurn' }
  | { type: 'payBail' }
  | { type: 'usePardon' }
  | { type: 'build'; tileId: number }
  | { type: 'sell'; tileId: number }
  | { type: 'mortgage'; tileId: number }
  | { type: 'unmortgage'; tileId: number }
  | { type: 'proposeTrade'; to: string; give: TradeOffer; get: TradeOffer }
  | { type: 'acceptTrade'; tradeId: string }
  | { type: 'declineTrade'; tradeId: string }
  | { type: 'cancelTrade'; tradeId: string }
  | { type: 'payDebts' }
  | { type: 'bankrupt' }
  | { type: 'rematch' };

export interface JoinResult {
  ok: boolean;
  error?: string;
  roomId?: string;
  playerId?: string;
  token?: string;
  spectator?: boolean;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface ServerToClient {
  state: (state: GameState) => void;
  kicked: () => void;
}

export interface ClientToServer {
  create: (p: { name: string }, ack: (r: JoinResult) => void) => void;
  join: (p: { roomId: string; name: string; token?: string }, ack: (r: JoinResult) => void) => void;
  action: (a: Action, ack: (r: ActionResult) => void) => void;
  chat: (text: string) => void;
}

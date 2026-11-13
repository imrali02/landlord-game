// Surprise and Treasure cards. Each card gets a small API from the game engine
// so card effects stay declarative and easy to add or change.

import type { Player } from '../shared/types';

export interface CardApi {
  player: Player;
  /** Receive money from the bank. */
  collect(amount: number): void;
  /** Pay the bank (goes to the vacation pot when that rule is on). */
  pay(amount: number): void;
  /** Pay each other active player. */
  payEachPlayer(amount: number): void;
  /** Collect from each other active player. */
  collectFromEachPlayer(amount: number): void;
  /** Move forward to a tile, collecting the Start bonus if passed, and resolve it. */
  advanceTo(tileId: number): void;
  /** Move by a relative number of steps (negative = backwards, no Start bonus) and resolve. */
  moveBy(steps: number): void;
  /** Advance to the next tile of the given type and resolve it. */
  advanceToNext(type: 'airport' | 'utility'): void;
  goToPrison(): void;
  givePardon(): void;
  /** Pay per house / per hotel owned. */
  repairs(perHouse: number, perHotel: number): void;
}

export interface Card {
  text: string;
  run(api: CardApi): void;
}

export const SURPRISE: Card[] = [
  { text: 'Advance to Start. Collect $200.', run: (c) => c.advanceTo(0) },
  { text: 'Take a flight to New York.', run: (c) => c.advanceTo(39) },
  { text: 'Visit Rome. Collect $200 if you pass Start.', run: (c) => c.advanceTo(11) },
  { text: 'Business trip to Shanghai. Collect $200 if you pass Start.', run: (c) => c.advanceTo(24) },
  { text: 'Head to the nearest airport.', run: (c) => c.advanceToNext('airport') },
  { text: 'Head to the nearest utility.', run: (c) => c.advanceToNext('utility') },
  { text: 'You forgot your passport. Go back 3 spaces.', run: (c) => c.moveBy(-3) },
  { text: 'Caught speeding. Go straight to prison.', run: (c) => c.goToPrison() },
  { text: 'Pardon card: get out of prison free. Keep it until needed.', run: (c) => c.givePardon() },
  { text: 'Your shares paid a dividend. Collect $50.', run: (c) => c.collect(50) },
  { text: 'Parking fine. Pay $15.', run: (c) => c.pay(15) },
  { text: 'Renovations: pay $25 per house and $100 per hotel.', run: (c) => c.repairs(25, 100) },
  { text: 'Your startup was acquired. Collect $150.', run: (c) => c.collect(150) },
  { text: 'You hosted a dinner for everyone. Pay each player $50.', run: (c) => c.payEachPlayer(50) },
];

export const TREASURE: Card[] = [
  { text: 'Bank error in your favour. Collect $200.', run: (c) => c.collect(200) },
  { text: 'Doctor visit. Pay $50.', run: (c) => c.pay(50) },
  { text: 'You sold some old furniture. Collect $50.', run: (c) => c.collect(50) },
  { text: 'Pardon card: get out of prison free. Keep it until needed.', run: (c) => c.givePardon() },
  { text: 'Tax audit gone wrong. Go straight to prison.', run: (c) => c.goToPrison() },
  { text: 'Your savings matured. Collect $100.', run: (c) => c.collect(100) },
  { text: 'Tax refund. Collect $20.', run: (c) => c.collect(20) },
  { text: "It's your birthday! Collect $10 from every player.", run: (c) => c.collectFromEachPlayer(10) },
  { text: 'Insurance payout. Collect $100.', run: (c) => c.collect(100) },
  { text: 'Hospital bill. Pay $100.', run: (c) => c.pay(100) },
  { text: 'University fees. Pay $50.', run: (c) => c.pay(50) },
  { text: 'Freelance gig. Collect $25.', run: (c) => c.collect(25) },
  { text: 'Street repairs: pay $40 per house and $115 per hotel.', run: (c) => c.repairs(40, 115) },
  { text: 'You won second prize in a cooking contest. Collect $10.', run: (c) => c.collect(10) },
  { text: 'You inherit $100.', run: (c) => c.collect(100) },
  { text: 'Advance to Start. Collect $200.', run: (c) => c.advanceTo(0) },
];

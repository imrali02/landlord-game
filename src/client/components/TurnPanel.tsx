import { useEffect, useState } from 'react';
import { BAIL, BOARD } from '../../shared/board';
import { playerById, totalDebt } from '../../shared/rules';
import type { Action, GameState } from '../../shared/types';
import { money } from '../format';
import { clock } from '../useRoom';

/** The context-sensitive controls: roll, buy, bid, end turn, pay debts. */
export function TurnPanel({
  state,
  playerId,
  act,
  onShowTile,
}: {
  state: GameState;
  playerId: string | null;
  act: (a: Action) => Promise<boolean>;
  onShowTile: (id: number) => void;
}) {
  const t = state.turn;
  const me = playerById(state, playerId);
  const current = playerById(state, t?.playerId);
  const mine = !!me && t?.playerId === me.id && !me.bankrupt;
  const [busy, setBusy] = useState(false);

  const run = async (a: Action) => {
    setBusy(true);
    await act(a);
    setBusy(false);
  };

  if (state.phase === 'ended') {
    const winner = playerById(state, state.winner);
    return (
      <div className="turn-panel">
        <div className="winner">🏆 {winner ? `${winner.name} wins!` : 'Game over'}</div>
        {playerId === state.hostId ? (
          <button className="btn btn-primary" onClick={() => run({ type: 'rematch' })}>
            Play again
          </button>
        ) : (
          <p className="muted small">The host can start a rematch.</p>
        )}
      </div>
    );
  }
  if (!t || !current) return null;

  if (state.auction) return <AuctionBox state={state} playerId={playerId} act={act} onShowTile={onShowTile} />;

  const debt = me ? totalDebt(me) : 0;
  const tile = BOARD[current.position];

  return (
    <div className="turn-panel">
      {debt > 0 && (
        <div className="debt-box">
          <strong>You owe {money(debt)}.</strong> Sell houses or mortgage properties (click your properties) to raise
          the cash. It is paid automatically once you have enough.
          <button
            className="btn btn-danger btn-sm"
            onClick={() => confirm('Declare bankruptcy? You will be out of the game.') && run({ type: 'bankrupt' })}
          >
            Declare bankruptcy
          </button>
        </div>
      )}

      {!mine && (
        <p className="turn-status">
          <span className="token-dot sm" style={{ background: current.color }} />
          {current.name}
          {t.stage === 'buy' ? ` is deciding on ${tile.name}` : current.connected ? "'s turn" : "'s turn (away)"}
        </p>
      )}

      {mine && t.stage === 'roll' && (
        <div className="actions">
          {me!.inPrison && <p className="muted small">You're in prison (try {me!.prisonTurns + 1} of 3). Roll doubles to escape.</p>}
          <button className="btn btn-primary btn-lg" disabled={busy || debt > 0} onClick={() => run({ type: 'roll' })}>
            🎲 {t.rollAgain ? 'Roll again' : 'Roll dice'}
          </button>
          {me!.inPrison && (
            <div className="row">
              <button className="btn" disabled={busy || me!.cash < BAIL} onClick={() => run({ type: 'payBail' })}>
                Pay {money(BAIL)} bail
              </button>
              {me!.pardons > 0 && (
                <button className="btn" disabled={busy} onClick={() => run({ type: 'usePardon' })}>
                  Use pardon ({me!.pardons})
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {mine && t.stage === 'buy' && (
        <div className="actions">
          <p>
            Buy <button className="link" onClick={() => onShowTile(tile.id)}>{tile.name}</button> for{' '}
            <strong>{money(tile.price!)}</strong>?
          </p>
          <div className="row">
            <button className="btn btn-primary" disabled={busy || me!.cash < tile.price!} onClick={() => run({ type: 'buy' })}>
              Buy
            </button>
            <button className="btn" disabled={busy} onClick={() => run({ type: 'decline' })}>
              {state.settings.auctions ? 'Auction it' : 'Skip'}
            </button>
          </div>
          {me!.cash < tile.price! && <p className="muted small">Not enough cash. Mortgage something or put it up for auction.</p>}
        </div>
      )}

      {mine && t.stage === 'end' && (
        <div className="actions">
          <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => run({ type: 'endTurn' })}>
            End turn
          </button>
          <p className="muted small">Tip: click your cities to build houses before ending your turn.</p>
        </div>
      )}
    </div>
  );
}

function AuctionBox({
  state,
  playerId,
  act,
  onShowTile,
}: {
  state: GameState;
  playerId: string | null;
  act: (a: Action) => Promise<boolean>;
  onShowTile: (id: number) => void;
}) {
  const a = state.auction!;
  const tile = BOARD[a.tileId];
  const me = playerById(state, playerId);
  const leader = playerById(state, a.bidder);
  const [now, setNow] = useState(clock.now());
  const [custom, setCustom] = useState('');
  useEffect(() => {
    const id = setInterval(() => setNow(clock.now()), 200);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((a.endsAt - now) / 1000));
  const canBid = me && !me.bankrupt;
  const bid = (amount: number) => act({ type: 'bid', amount });

  return (
    <div className="turn-panel auction">
      <div className="auction-head">
        <span>Auction</span>
        <span className={`countdown ${left <= 3 ? 'urgent' : ''}`}>{left}s</span>
      </div>
      <button className="link auction-tile" onClick={() => onShowTile(tile.id)}>
        {tile.name}
      </button>
      <div className="auction-bid">
        {leader ? (
          <>
            <strong>{money(a.bid)}</strong> by <span style={{ color: leader.color }}>{leader.name}</span>
          </>
        ) : (
          <span className="muted">No bids yet · list price {money(tile.price!)}</span>
        )}
      </div>
      {canBid && (
        <>
          <div className="row wrap">
            {[1, 10, 50, 100].map((inc) => (
              <button key={inc} className="btn btn-sm" disabled={a.bid + inc > me.cash} onClick={() => bid(a.bid + inc)}>
                +{money(inc)}
              </button>
            ))}
          </div>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Math.floor(Number(custom));
              if (n > 0) bid(n);
              setCustom('');
            }}
          >
            <input
              type="number"
              min={a.bid + 1}
              max={me.cash}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder={`Bid (you have ${money(me.cash)})`}
              aria-label="Custom bid"
            />
            <button className="btn btn-primary btn-sm">Bid</button>
          </form>
        </>
      )}
    </div>
  );
}

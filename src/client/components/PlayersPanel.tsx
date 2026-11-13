import { BOARD, COUNTRIES } from '../../shared/board';
import { netWorth, playerById, totalDebt } from '../../shared/rules';
import type { Action, GameState, Trade, TradeOffer } from '../../shared/types';
import { money } from '../format';

const chipColor = (id: number) => {
  const t = BOARD[id];
  if (t.country) return COUNTRIES[t.country].color;
  return t.type === 'airport' ? '#94a3b8' : '#64748b';
};

export function PlayersPanel({
  state,
  playerId,
  act,
  onShowTile,
  onTrade,
}: {
  state: GameState;
  playerId: string | null;
  act: (a: Action) => Promise<boolean>;
  onShowTile: (id: number) => void;
  onTrade: (targetId: string) => void;
}) {
  const me = playerById(state, playerId);
  const isHost = playerId === state.hostId;
  const playing = state.phase === 'playing';

  return (
    <div className="players">
      {state.players.map((p) => {
        const owned = Object.keys(state.tiles)
          .map(Number)
          .filter((id) => state.tiles[id].owner === p.id);
        const debt = totalDebt(p);
        const active = state.turn?.playerId === p.id && playing;
        return (
          <div key={p.id} className={`player ${active ? 'active' : ''} ${p.bankrupt ? 'out' : ''}`}>
            <div className="player-top">
              <span className="token-dot" style={{ background: p.color }}>
                {p.name[0]?.toUpperCase()}
              </span>
              <div className="player-name">
                <span>
                  {p.name}
                  {p.id === playerId && <span className="muted"> (you)</span>}
                </span>
                <span className="player-tags">
                  {p.id === state.hostId && <span title="Host">👑</span>}
                  {p.inPrison && <span title="In prison">🔒</span>}
                  {p.pardons > 0 && <span title="Pardon cards">🎫{p.pardons > 1 ? `×${p.pardons}` : ''}</span>}
                  {!p.connected && <span className="badge badge-warn">away</span>}
                  {p.bankrupt && <span className="badge">bankrupt</span>}
                </span>
              </div>
              <div className="player-cash">
                <strong>{money(p.cash)}</strong>
                {debt > 0 && <span className="debt">owes {money(debt)}</span>}
                {!p.bankrupt && <span className="muted tiny">worth {money(netWorth(state, p.id))}</span>}
              </div>
            </div>
            {owned.length > 0 && (
              <div className="chips">
                {owned.map((id) => (
                  <button
                    key={id}
                    className={`chip ${state.tiles[id].mortgaged ? 'mortgaged' : ''}`}
                    style={{ background: chipColor(id) }}
                    title={`${BOARD[id].name}${state.tiles[id].mortgaged ? ' (mortgaged)' : ''}`}
                    onClick={() => onShowTile(id)}
                  >
                    {state.tiles[id].houses > 0 ? (state.tiles[id].houses === 5 ? 'H' : state.tiles[id].houses) : ''}
                  </button>
                ))}
              </div>
            )}
            {playing && !p.bankrupt && p.id !== playerId && (
              <div className="player-actions">
                {me && !me.bankrupt && (
                  <button className="btn btn-sm" onClick={() => onTrade(p.id)}>
                    Trade
                  </button>
                )}
                {isHost && (
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() =>
                      confirm(`Remove ${p.name}? Their properties go back to the bank.`) &&
                      act({ type: 'kick', playerId: p.id })
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function describe(o: TradeOffer) {
  const parts = [...o.tiles.map((id) => BOARD[id].name)];
  if (o.cash) parts.push(money(o.cash));
  if (o.pardons) parts.push(`${o.pardons} pardon card${o.pardons > 1 ? 's' : ''}`);
  return parts.length ? parts.join(', ') : 'nothing';
}

export function TradesList({
  state,
  playerId,
  act,
}: {
  state: GameState;
  playerId: string | null;
  act: (a: Action) => Promise<boolean>;
}) {
  const mine = state.trades.filter((t) => t.from === playerId || t.to === playerId);
  if (!mine.length) return null;
  const name = (id: string) => playerById(state, id)?.name ?? '?';
  const row = (t: Trade) => {
    const incoming = t.to === playerId;
    return (
      <div key={t.id} className={`trade ${incoming ? 'incoming' : ''}`}>
        <p>
          {incoming ? (
            <>
              <strong>{name(t.from)}</strong> offers <em>{describe(t.give)}</em> for your <em>{describe(t.get)}</em>
            </>
          ) : (
            <>
              You offered <strong>{name(t.to)}</strong> <em>{describe(t.give)}</em> for <em>{describe(t.get)}</em>
            </>
          )}
        </p>
        <div className="row">
          {incoming ? (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => act({ type: 'acceptTrade', tradeId: t.id })}>
                Accept
              </button>
              <button className="btn btn-sm" onClick={() => act({ type: 'declineTrade', tradeId: t.id })}>
                Decline
              </button>
            </>
          ) : (
            <button className="btn btn-sm" onClick={() => act({ type: 'cancelTrade', tradeId: t.id })}>
              Withdraw
            </button>
          )}
        </div>
      </div>
    );
  };
  return (
    <div className="trades">
      <h3>Trade offers</h3>
      {mine.map(row)}
    </div>
  );
}

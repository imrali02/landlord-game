import { useState } from 'react';
import { BOARD, COUNTRIES } from '../../shared/board';
import { playerById, tradableTiles } from '../../shared/rules';
import type { Action, GameState, Player } from '../../shared/types';
import { money } from '../format';
import { Modal } from './Modal';

interface Side {
  tiles: Set<number>;
  cash: string;
  pardons: number;
}
const empty = (): Side => ({ tiles: new Set(), cash: '', pardons: 0 });

export function TradeModal({
  state,
  playerId,
  targetId,
  act,
  onClose,
}: {
  state: GameState;
  playerId: string;
  targetId: string;
  act: (a: Action) => Promise<boolean>;
  onClose: () => void;
}) {
  const me = playerById(state, playerId)!;
  const them = playerById(state, targetId)!;
  const [give, setGive] = useState<Side>(empty);
  const [get, setGet] = useState<Side>(empty);

  const submit = async () => {
    const ok = await act({
      type: 'proposeTrade',
      to: targetId,
      give: { tiles: [...give.tiles], cash: Number(give.cash) || 0, pardons: give.pardons },
      get: { tiles: [...get.tiles], cash: Number(get.cash) || 0, pardons: get.pardons },
    });
    if (ok) onClose();
  };

  return (
    <Modal onClose={onClose} label={`Trade with ${them.name}`}>
      <h2 className="modal-title">Trade with {them.name}</h2>
      <div className="trade-grid">
        <TradeSide title="You give" player={me} state={state} side={give} onChange={setGive} />
        <TradeSide title={`${them.name} gives`} player={them} state={state} side={get} onChange={setGet} />
      </div>
      <div className="row end">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={submit}>
          Send offer
        </button>
      </div>
    </Modal>
  );
}

function TradeSide({
  title,
  player,
  state,
  side,
  onChange,
}: {
  title: string;
  player: Player;
  state: GameState;
  side: Side;
  onChange: (s: Side) => void;
}) {
  const tiles = tradableTiles(state, player.id);
  const toggle = (id: number) => {
    const next = new Set(side.tiles);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...side, tiles: next });
  };
  return (
    <div className="trade-side">
      <h3>{title}</h3>
      <label className="field">
        <span>Cash (has {money(player.cash)})</span>
        <input
          type="number"
          min={0}
          max={player.cash}
          value={side.cash}
          onChange={(e) => onChange({ ...side, cash: e.target.value })}
          placeholder="0"
        />
      </label>
      {player.pardons > 0 && (
        <label className="field">
          <span>Pardon cards (has {player.pardons})</span>
          <input
            type="number"
            min={0}
            max={player.pardons}
            value={side.pardons}
            onChange={(e) => onChange({ ...side, pardons: Math.max(0, Math.min(player.pardons, Number(e.target.value) || 0)) })}
          />
        </label>
      )}
      <div className="trade-tiles">
        {tiles.length === 0 && <p className="muted small">No tradable properties. Properties in a country with houses can't be traded.</p>}
        {tiles.map((id) => {
          const t = BOARD[id];
          return (
            <label key={id} className={`trade-tile ${side.tiles.has(id) ? 'on' : ''}`}>
              <input type="checkbox" checked={side.tiles.has(id)} onChange={() => toggle(id)} />
              <span className="chip-dot" style={{ background: t.country ? COUNTRIES[t.country].color : '#94a3b8' }} />
              <span className="grow">{t.name}</span>
              {state.tiles[id].mortgaged && <span className="muted tiny">mortgaged</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}

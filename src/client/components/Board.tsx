import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BOARD, BOARD_SIZE, COUNTRIES, PRISON_TILE } from '../../shared/board';
import type { GameState, Player, TileDef } from '../../shared/types';
import { money } from '../format';
import { Flag } from './Flag';

type Side = 'bottom' | 'left' | 'top' | 'right' | 'corner';

/** Map a tile id onto the 11×11 grid. Start is bottom-right; play runs clockwise. */
function gridPos(id: number): { row: number; col: number; side: Side } {
  if (id % 10 === 0) {
    const corners: Record<number, [number, number]> = { 0: [11, 11], 10: [11, 1], 20: [1, 1], 30: [1, 11] };
    const [row, col] = corners[id];
    return { row, col, side: 'corner' };
  }
  if (id < 10) return { row: 11, col: 11 - id, side: 'bottom' };
  if (id < 20) return { row: 11 - (id - 10), col: 1, side: 'left' };
  if (id < 30) return { row: 1, col: 1 + (id - 20), side: 'top' };
  return { row: 1 + (id - 30), col: 11, side: 'right' };
}

/** Walk tokens one tile at a time toward their real position; long jumps teleport. */
function useAnimatedPositions(players: Player[]) {
  const ref = useRef(players);
  ref.current = players;
  const [shown, setShown] = useState<Record<string, number>>(() =>
    Object.fromEntries(players.map((p) => [p.id, p.position])),
  );
  useEffect(() => {
    const timer = setInterval(() => {
      setShown((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const p of ref.current) {
          const cur = next[p.id];
          if (cur === p.position) continue;
          changed = true;
          if (cur === undefined) {
            next[p.id] = p.position;
            continue;
          }
          const dist = (p.position - cur + BOARD_SIZE) % BOARD_SIZE;
          next[p.id] = dist > 12 ? p.position : (cur + 1) % BOARD_SIZE;
        }
        return changed ? next : prev;
      });
    }, 150);
    return () => clearInterval(timer);
  }, []);
  return shown;
}

function Houses({ n }: { n: number }) {
  if (n === 0) return null;
  if (n === 5) return <span className="hotel" title="Hotel" />;
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="house" />
      ))}
    </>
  );
}

function Tile({
  def,
  state,
  here,
  onClick,
  focused,
}: {
  def: TileDef;
  state: GameState;
  here: Player[];
  onClick: () => void;
  focused: boolean;
}) {
  const pos = gridPos(def.id);
  const ts = state.tiles[def.id];
  const owner = ts?.owner ? state.players.find((p) => p.id === ts.owner) : undefined;
  const band = def.country ? COUNTRIES[def.country].color : undefined;
  const style = { gridRow: pos.row, gridColumn: pos.col, '--owner': owner?.color } as CSSProperties;
  const cls = [
    'tile',
    `side-${pos.side}`,
    `t-${def.type}`,
    owner ? 'owned' : '',
    ts?.mortgaged ? 'mortgaged' : '',
    focused ? 'focused' : '',
  ].join(' ');

  let sub: ReactNode = null;
  if (def.price) sub = owner ? <span className="owner-name">{owner.name}</span> : money(def.price);
  else if (def.type === 'tax') sub = `Pay ${money(def.tax!)}`;
  else if (def.type === 'vacation' && state.settings.vacationCash && state.vacationPot > 0) sub = money(state.vacationPot);
  else if (def.type === 'start') sub = 'Collect $200';

  const prisoners = def.id === PRISON_TILE ? here.filter((p) => p.inPrison) : [];
  const visitors = def.id === PRISON_TILE ? here.filter((p) => !p.inPrison) : here;

  return (
    <button className={cls} style={style} onClick={onClick} aria-label={def.name}>
      {band && (
        <div className="band" style={{ background: band }}>
          <Houses n={ts?.houses ?? 0} />
        </div>
      )}
      <div className="tile-body">
        {def.country ? <Flag country={def.country} width={20} /> : <span className="tile-icon">{def.icon}</span>}
        <span className="tile-name">{def.id === PRISON_TILE ? 'Prison' : def.name}</span>
        {sub && <span className="tile-sub">{sub}</span>}
        {ts?.mortgaged && <span className="mortgage-tag">Mortgaged</span>}
      </div>
      {(visitors.length > 0 || prisoners.length > 0) && (
        <div className="tokens">
          {prisoners.map((p) => (
            <span key={p.id} className="token jailed" style={{ background: p.color }} title={`${p.name} (in prison)`}>
              {p.name[0]?.toUpperCase()}
            </span>
          ))}
          {visitors.map((p) => (
            <span key={p.id} className="token" style={{ background: p.color }} title={p.name}>
              {p.name[0]?.toUpperCase()}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

export function Board({
  state,
  onTile,
  focusedTile,
  children,
}: {
  state: GameState;
  onTile: (id: number) => void;
  focusedTile: number | null;
  children: ReactNode;
}) {
  const shown = useAnimatedPositions(state.players);
  const active = state.players.filter((p) => !p.bankrupt);
  return (
    <div className="board">
      {BOARD.map((def) => (
        <Tile
          key={def.id}
          def={def}
          state={state}
          here={active.filter((p) => (shown[p.id] ?? p.position) === def.id)}
          onClick={() => onTile(def.id)}
          focused={focusedTile === def.id}
        />
      ))}
      <div className="board-center">{children}</div>
    </div>
  );
}

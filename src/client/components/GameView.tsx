import { useCallback, useEffect, useRef, useState } from 'react';
import { BOARD } from '../../shared/board';
import { playerById } from '../../shared/rules';
import type { GameState } from '../../shared/types';
import { money } from '../format';
import { BASE, roomUrl } from '../socket';
import { useToast } from '../toast';
import type { RoomHandle } from '../useRoom';
import { Board } from './Board';
import { Chat } from './Chat';
import { Dice } from './Dice';
import { PlayersPanel, TradesList } from './PlayersPanel';
import { PropertyModal } from './PropertyModal';
import { TradeModal } from './TradeModal';
import { TurnPanel } from './TurnPanel';

export function GameView({ room, state }: { room: RoomHandle; state: GameState }) {
  const { playerId, act } = room;
  const [tile, setTile] = useState<number | null>(null);
  const [tradeWith, setTradeWith] = useState<string | null>(null);
  const me = playerById(state, playerId);
  const current = playerById(state, state.turn?.playerId);
  const myTurn = !!me && current?.id === me.id && state.phase === 'playing';
  const toast = useToast();
  const closeTile = useCallback(() => setTile(null), []);
  const closeTrade = useCallback(() => setTradeWith(null), []);

  // Tab title nudges you when it's your turn or someone sends you a trade.
  const incoming = state.trades.filter((t) => t.to === playerId).length;
  useEffect(() => {
    document.title = myTurn ? '● Your turn — Landlord' : incoming ? `(${incoming}) Trade offer — Landlord` : 'Landlord';
    return () => {
      document.title = 'Landlord';
    };
  }, [myTurn, incoming]);

  const prevIncoming = useRef(incoming);
  useEffect(() => {
    if (incoming > prevIncoming.current) toast('You received a trade offer', 'info');
    prevIncoming.current = incoming;
  }, [incoming, toast]);

  const leave = () => {
    if (me && !me.bankrupt && state.phase === 'playing') {
      if (!confirm('Leave the game? You will go bankrupt and your properties return to the bank.')) return;
      act({ type: 'bankrupt' }).then(() => (location.href = BASE));
    } else location.href = BASE;
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl(state.roomId));
      toast('Link copied. Anyone with it can watch.', 'info');
    } catch {
      toast(roomUrl(state.roomId), 'info');
    }
  };

  return (
    <main className="game">
      <aside className="side pane-left">
        <div className="side-head">
          <a href={BASE} className="brand small">
            <span className="brand-mark">🏠</span>
            <span>Landlord</span>
          </a>
          <button className="btn btn-sm btn-ghost" onClick={copyLink} title="Copy room link">
            {state.roomId}
          </button>
        </div>
        {!me && <p className="spectating">You're watching this game.</p>}
        <PlayersPanel state={state} playerId={playerId} act={act} onShowTile={setTile} onTrade={setTradeWith} />
        <TradesList state={state} playerId={playerId} act={act} />
        <button className="btn btn-sm btn-ghost leave" onClick={leave}>
          {me && !me.bankrupt && state.phase === 'playing' ? 'Leave game' : 'Back to home'}
        </button>
      </aside>

      <section className="board-wrap">
        <Board state={state} onTile={setTile} focusedTile={current?.position ?? null}>
          <div className="center-top">
            <Dice dice={state.turn?.dice ?? null} rollId={state.turn?.rollId ?? 0} />
            {state.settings.vacationCash && state.vacationPot > 0 && (
              <div className="pot" title="Vacation pot">
                🏖️ {money(state.vacationPot)}
              </div>
            )}
          </div>
          <LastCard state={state} />
          <TurnPanel state={state} playerId={playerId} act={act} onShowTile={setTile} />
          <GameLog state={state} />
        </Board>
      </section>

      <aside className="side pane-right">
        <h3>Chat</h3>
        <Chat state={state} />
      </aside>

      {tile !== null && <PropertyModal state={state} playerId={playerId} tileId={tile} act={act} onClose={closeTile} />}
      {tradeWith && playerId && playerById(state, tradeWith) && (
        <TradeModal state={state} playerId={playerId} targetId={tradeWith} act={act} onClose={closeTrade} />
      )}
    </main>
  );
}

function LastCard({ state }: { state: GameState }) {
  const card = state.lastCard;
  const [visible, setVisible] = useState<number | null>(null);
  useEffect(() => {
    if (!card) return;
    setVisible(card.id);
    const t = setTimeout(() => setVisible(null), 6000);
    return () => clearTimeout(t);
  }, [card?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!card || visible !== card.id) return null;
  const who = playerById(state, card.playerId);
  return (
    <div className={`card-pop ${card.deck}`} onClick={() => setVisible(null)}>
      <div className="card-deck">
        {card.deck === 'surprise' ? '❓ Surprise' : '🎁 Treasure'} · {who?.name}
      </div>
      <div className="card-text">{card.text}</div>
    </div>
  );
}

function GameLog({ state }: { state: GameState }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = state.log.at(-1)?.id;
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [last]);
  return (
    <div className="log" ref={ref} aria-label="Game log">
      {state.log.slice(-60).map((l) => (
        <div key={l.id} className="log-line">
          {highlight(l.text, state)}
        </div>
      ))}
    </div>
  );
}

/** Color player names in log lines. */
function highlight(text: string, state: GameState) {
  const names = state.players.map((p) => p.name).sort((a, b) => b.length - a.length);
  if (!names.length) return text;
  const esc = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = text.split(new RegExp(`(${esc.join('|')})`, 'g'));
  return parts.map((part, i) => {
    const p = state.players.find((x) => x.name === part);
    return p ? (
      <strong key={i} style={{ color: p.color }}>
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    );
  });
}

export const tileName = (id: number) => BOARD[id].name;

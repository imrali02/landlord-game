import { AIRPORT_RENT, BOARD, COUNTRIES, UTILITY_MULTIPLIER, groupOf, isOwnable } from '../../shared/board';
import {
  mortgageValue,
  playerById,
  unmortgageCost,
  whyCannotBuild,
  whyCannotMortgage,
  whyCannotSell,
  whyCannotUnmortgage,
} from '../../shared/rules';
import type { Action, GameState } from '../../shared/types';
import { money } from '../format';
import { Flag } from './Flag';
import { Modal } from './Modal';

const SPECIAL_TEXT: Record<string, string> = {
  start: 'Collect $200 every time you pass or land on Start.',
  surprise: 'Draw a Surprise card.',
  treasure: 'Draw a Treasure card.',
  prison: 'Just visiting, unless you were sent here. To leave: roll doubles, pay $50 bail, or use a pardon card. After 3 failed tries you pay bail and move.',
  vacation: 'Relax. With Vacation cash on, you collect every tax and fee paid so far.',
  gotoprison: 'Go directly to Prison. Do not pass Start.',
};

export function PropertyModal({
  state,
  playerId,
  tileId,
  act,
  onClose,
}: {
  state: GameState;
  playerId: string | null;
  tileId: number;
  act: (a: Action) => Promise<boolean>;
  onClose: () => void;
}) {
  const def = BOARD[tileId];
  const ts = state.tiles[tileId];
  const owner = playerById(state, ts?.owner);
  const mine = !!playerId && ts?.owner === playerId;
  const country = def.country ? COUNTRIES[def.country] : null;
  const header = country?.color ?? (def.type === 'airport' ? '#64748b' : '#334155');

  const groupLabel = country
    ? `${country.name} · ${groupOf(tileId).length} cities`
    : def.type === 'airport'
      ? 'Airport'
      : def.type === 'utility'
        ? 'Utility'
        : '';

  return (
    <Modal onClose={onClose} label={def.name}>
      <div className="deed">
        <div className="deed-head" style={{ background: header }}>
          {def.country ? <Flag country={def.country} width={40} /> : <span className="deed-icon">{def.icon}</span>}
          <div>
            <div className="deed-group">{groupLabel}</div>
            <h2>{def.name}</h2>
          </div>
        </div>

        {!isOwnable(def) ? (
          <p className="deed-text">{def.type === 'tax' ? `Pay ${money(def.tax!)} to the bank.` : SPECIAL_TEXT[def.type]}</p>
        ) : (
          <>
            <table className="rent-table">
              <tbody>
                {def.type === 'property' && (
                  <>
                    <tr>
                      <td>Rent</td>
                      <td>{money(def.rent![0])}</td>
                    </tr>
                    {state.settings.doubleRentOnSet && (
                      <tr>
                        <td>With whole country</td>
                        <td>{money(def.rent![0] * 2)}</td>
                      </tr>
                    )}
                    {[1, 2, 3, 4].map((h) => (
                      <tr key={h} className={ts.houses === h ? 'hl' : ''}>
                        <td>
                          With {h} house{h > 1 ? 's' : ''}
                        </td>
                        <td>{money(def.rent![h])}</td>
                      </tr>
                    ))}
                    <tr className={ts.houses === 5 ? 'hl' : ''}>
                      <td>With hotel</td>
                      <td>{money(def.rent![5])}</td>
                    </tr>
                  </>
                )}
                {def.type === 'airport' &&
                  AIRPORT_RENT.map((r, i) => (
                    <tr key={i}>
                      <td>
                        If {i + 1} airport{i ? 's' : ''} owned
                      </td>
                      <td>{money(r)}</td>
                    </tr>
                  ))}
                {def.type === 'utility' &&
                  UTILITY_MULTIPLIER.map((m, i) => (
                    <tr key={i}>
                      <td>
                        If {i + 1} utilit{i ? 'ies' : 'y'} owned
                      </td>
                      <td>{m}× dice roll</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <dl className="deed-facts">
              <div>
                <dt>Price</dt>
                <dd>{money(def.price!)}</dd>
              </div>
              {def.houseCost && (
                <div>
                  <dt>House cost</dt>
                  <dd>{money(def.houseCost)}</dd>
                </div>
              )}
              <div>
                <dt>Mortgage value</dt>
                <dd>{money(mortgageValue(tileId))}</dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd style={{ color: owner?.color }}>
                  {owner ? owner.name : 'For sale'}
                  {ts.mortgaged ? ' (mortgaged)' : ''}
                </dd>
              </div>
            </dl>

            {mine && state.phase === 'playing' && (
              <div className="deed-actions">
                {def.type === 'property' && (
                  <>
                    <ActionBtn
                      label={ts.houses === 4 ? `Build hotel (${money(def.houseCost!)})` : `Build house (${money(def.houseCost!)})`}
                      why={whyCannotBuild(state, playerId, tileId)}
                      onClick={() => act({ type: 'build', tileId })}
                      primary
                    />
                    <ActionBtn
                      label={`Sell ${ts.houses === 5 ? 'hotel' : 'house'} (+${money(Math.floor(def.houseCost! / 2))})`}
                      why={whyCannotSell(state, playerId, tileId)}
                      onClick={() => act({ type: 'sell', tileId })}
                    />
                  </>
                )}
                {ts.mortgaged ? (
                  <ActionBtn
                    label={`Unmortgage (${money(unmortgageCost(tileId))})`}
                    why={whyCannotUnmortgage(state, playerId, tileId)}
                    onClick={() => act({ type: 'unmortgage', tileId })}
                  />
                ) : (
                  <ActionBtn
                    label={`Mortgage (+${money(mortgageValue(tileId))})`}
                    why={whyCannotMortgage(state, playerId, tileId)}
                    onClick={() => act({ type: 'mortgage', tileId })}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function ActionBtn({ label, why, onClick, primary }: { label: string; why: string | null; onClick: () => void; primary?: boolean }) {
  return (
    <div className="action-btn">
      <button className={`btn ${primary ? 'btn-primary' : ''}`} disabled={!!why} onClick={onClick}>
        {label}
      </button>
      {why && <span className="muted tiny">{why}</span>}
    </div>
  );
}

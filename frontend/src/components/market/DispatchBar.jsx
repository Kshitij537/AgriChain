import React from 'react';
import { formatINR } from '../../utils/marketHelpers';

/**
 * Sticky action bar: the one thing to actually do, always in reach.
 *
 * @param {object} props
 * @param {object} props.market - Currently selected market
 * @param {object} props.batch
 * @param {Function} props.onCallAgent
 * @param {Function} props.onNavigate
 */
const DispatchBar = ({ market, batch, onCallAgent, onNavigate }) => {
  if (!market) return null;

  return (
    <div className="sticky bottom-6 z-30 bg-surface-container-lowest/95 backdrop-blur-xl rounded-2xl p-4 shadow-xl border border-surface-container flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center font-bold shrink-0">
          ₹
        </div>
        <div className="min-w-0">
          <span className="text-xs text-on-surface-variant block">
            Ready to dispatch {batch?.quantityKg} kg {batch?.crop?.toLowerCase()}?
          </span>
          <span className="font-headline font-bold text-sm text-on-surface">
            Target: {market.shortName || market.name} • Estimated net:{' '}
            <strong>{formatINR(market.netReturn)}</strong>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
        <button
          type="button"
          onClick={onCallAgent}
          className="flex-1 sm:flex-initial px-5 py-2.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold transition-all"
        >
          Call Mandi Agent
        </button>
        <button
          type="button"
          onClick={onNavigate}
          className="flex-1 sm:flex-initial px-6 py-2.5 rounded-full bg-gradient-to-r from-primary-container to-secondary text-on-primary text-xs font-headline font-bold tracking-wide shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-1.5"
        >
          <span className="material-symbols-outlined text-base">directions</span>
          <span>Start Navigation{market.route ? ` (${market.route})` : ''}</span>
        </button>
      </div>
    </div>
  );
};

export default DispatchBar;

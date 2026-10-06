import React from 'react';
import { formatINR, formatDuration } from '../../utils/marketHelpers';

/**
 * Severity banding for a spoilage percentage. Kept as one function so the
 * dot, the bar and the label can never disagree.
 * @param {number} pct
 */
const bandFor = (pct) => {
  if (pct <= 3) return { label: 'Safe', dot: 'bg-primary-fixed-dim', bar: 'bg-primary', text: 'text-primary' };
  if (pct <= 7) return { label: 'Caution', dot: 'bg-amber-500', bar: 'bg-amber-500', text: 'text-amber-700' };
  return { label: 'High Risk', dot: 'bg-error', bar: 'bg-error', text: 'text-error' };
};

/**
 * How far the produce travels vs how much of it arrives unsellable.
 *
 * @param {object} props
 * @param {Array} props.markets - Ranked markets with computed spoilage
 * @param {object} props.batch
 */
const SpoilageMatrix = ({ markets, batch }) => {
  if (!markets?.length) return null;

  // Scale bars against the worst option so the comparison is visually honest.
  const worst = Math.max(...markets.map((m) => m.spoilagePct), 1);
  const byDistance = [...markets].sort((a, b) => a.distanceKm - b.distanceKm);

  return (
    <div className="bg-surface-container-lowest rounded-3xl p-6 sm:p-7 shadow-sm flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between mb-4 gap-4">
          <div>
            <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider">
              Perishability Dynamics
            </span>
            <h2 className="font-headline font-extrabold text-xl text-on-surface">
              Transport vs Spoilage Rate
            </h2>
          </div>
          <span className="material-symbols-outlined text-2xl text-amber-600 shrink-0">hourglass_bottom</span>
        </div>
        <p className="text-xs text-on-surface-variant mb-6">
          {batch?.crop} has thin skin and crushes easily on bumpy Vidarbha roads during peak daytime heat.
        </p>

        <div className="space-y-4">
          {byDistance.map((market) => {
            const band = bandFor(market.spoilagePct);
            return (
              <div key={market.id} className="p-4 rounded-2xl bg-surface-container-low flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs gap-2">
                  <span className="font-bold text-on-surface flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${band.dot}`} />
                    <span className="truncate">
                      {market.shortName || market.name} ({market.distanceKm} km •{' '}
                      {formatDuration(market.travelMinutes)})
                    </span>
                  </span>
                  <span className={`font-bold shrink-0 ${band.text}`}>
                    {market.spoilagePct}% ({band.label})
                  </span>
                </div>
                <div className="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${band.bar}`}
                    style={{ width: `${Math.min(100, (market.spoilagePct / worst) * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] text-on-surface-variant">
                  Estimated loss: ~{market.spoilageKg} kg (~{formatINR(market.spoilageCost)})
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 pt-3 flex items-center gap-2 text-xs text-on-surface-variant font-medium">
        <span className="material-symbols-outlined text-sm text-primary">sensors</span>
        <span>
          Crop Perishability Index:{' '}
          <strong className="text-on-surface">
            {batch?.crop} = {batch?.perishabilityLabel || 'HIGH (1–2 days max)'}
          </strong>
        </span>
      </div>
    </div>
  );
};

export default SpoilageMatrix;

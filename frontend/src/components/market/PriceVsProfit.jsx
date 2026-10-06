import React from 'react';
import { formatINR } from '../../utils/marketHelpers';

/**
 * One side of the head-to-head: a mandi with its deductions laid bare.
 */
const ComparisonCard = ({ market, isWinner, delta }) => (
  <div
    className={`bg-surface-container-lowest rounded-2xl p-4 relative overflow-hidden border-l-4 ${
      isWinner ? 'shadow-md border-primary' : 'shadow-sm border-error'
    }`}
  >
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <span className="font-headline font-bold text-sm text-on-surface">{market.name}</span>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
            isWinner ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error'
          }`}
        >
          {isWinner ? `Recommended (${market.distanceKm} km)` : `Long Haul (${market.distanceKm} km)`}
        </span>
      </div>
      <div className="text-right shrink-0">
        <span className="text-xs text-on-surface-variant">Quoted</span>
        <span className="font-bold text-sm text-on-surface ml-1">
          {formatINR(market.pricePerQuintal)}/q
        </span>
      </div>
    </div>

    <div className="grid grid-cols-3 gap-2 py-2 text-[11px] text-on-surface-variant bg-surface-container-low rounded-xl px-2.5 mb-2">
      <div>
        <span className="block opacity-75">Gross Sale</span>
        <span className="font-semibold text-on-surface">{formatINR(market.grossSale)}</span>
      </div>
      <div>
        <span className="block opacity-75">Transport</span>
        <span className={`font-semibold ${isWinner ? 'text-primary' : 'text-error'}`}>
          −{formatINR(market.transportCost)}
        </span>
      </div>
      <div>
        <span className="block opacity-75">Heat Spoil ({market.spoilagePct}%)</span>
        <span className={`font-semibold ${isWinner ? 'text-primary' : 'text-error'}`}>
          −{formatINR(market.spoilageCost)}
        </span>
      </div>
    </div>

    <div className="flex items-center justify-between pt-1">
      <span className={`text-xs ${isWinner ? 'font-bold text-primary' : 'font-medium text-on-surface-variant'}`}>
        Actual Cash in Pocket:
      </span>
      <div className="flex items-baseline gap-1.5">
        <span
          className={`font-headline font-extrabold ${
            isWinner ? 'text-xl text-primary' : 'text-lg text-error'
          }`}
        >
          {formatINR(market.netReturn)}
        </span>
        {isWinner && delta > 0 && (
          <span className="text-xs font-bold text-primary">({formatINR(delta, { signed: true })} MORE)</span>
        )}
      </div>
    </div>
  </div>
);

/**
 * The core lesson of the page: the mandi quoting the highest price is not
 * necessarily the one that leaves the most cash in the farmer's hand.
 *
 * Only renders when a genuinely higher-priced but lower-netting mandi exists —
 * if the best price also wins on net return, there is no lesson to teach.
 *
 * @param {object} props
 * @param {object} props.recommended - Winning market
 * @param {Array} props.markets - All ranked markets
 */
const PriceVsProfit = ({ recommended, markets }) => {
  if (!recommended || !markets?.length) return null;

  // The trap: quotes more per quintal, yet nets less overall.
  const trap = markets.find(
    (m) => m.id !== recommended.id && m.pricePerQuintal > recommended.pricePerQuintal
  );
  if (!trap) return null;

  const delta = recommended.netReturn - trap.netReturn;
  const priceGapPerQuintal = trap.pricePerQuintal - recommended.pricePerQuintal;
  const extraKm = trap.distanceKm - recommended.distanceKm;
  const extraSpoilKg = trap.spoilageKg - recommended.spoilageKg;

  return (
    <div className="flex flex-col bg-surface-container rounded-3xl p-6 sm:p-7 justify-between h-full">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed text-xs font-headline font-bold mb-3">
          <span className="material-symbols-outlined text-sm">visibility</span>
          <span>CRITICAL LESSON</span>
        </div>
        <h2 className="font-headline font-extrabold text-2xl text-on-surface leading-tight">
          Higher Mandi Price ≠ Higher Profit
        </h2>
        <p className="text-xs text-on-surface-variant mt-1.5 leading-relaxed">
          Many farmers drive to {trap.shortName || trap.name} for a seemingly higher quote. Here is
          why doing that today actually shrinks your pocket:
        </p>

        <div className="mt-6 flex flex-col gap-4">
          <ComparisonCard market={trap} isWinner={false} />
          <ComparisonCard market={recommended} isWinner delta={delta} />
        </div>
      </div>

      <div className="mt-5 p-4 rounded-2xl bg-surface-container-lowest shadow-sm flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
          <span className="material-symbols-outlined text-lg">lightbulb</span>
        </div>
        <p className="text-xs text-on-surface leading-relaxed">
          <strong>Key Mandi Insight:</strong> {trap.shortName || trap.name} looks tempting at{' '}
          {formatINR(priceGapPerQuintal, { signed: true })}/quintal, but burning an extra {extraKm} km
          of diesel freight and enduring the longer transit heat rots an extra{' '}
          {extraSpoilKg} kg of produce. You lose <strong>{formatINR(delta)}</strong> by chasing the
          nominal price.
        </p>
      </div>
    </div>
  );
};

export default PriceVsProfit;

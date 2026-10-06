import React from 'react';
import { formatINR, formatDuration } from '../../utils/marketHelpers';

/**
 * One bullet in the "why this mandi" grid.
 */
const Reason = ({ icon, title, body, wide }) => (
  <div
    className={`flex items-start gap-2.5 p-2.5 rounded-xl text-xs ${
      wide
        ? 'col-span-1 sm:col-span-2 bg-primary-fixed/20 text-on-primary-fixed-variant'
        : 'bg-surface-container-low text-on-surface'
    }`}
  >
    <span className="material-symbols-outlined text-primary text-base shrink-0 mt-0.5">{icon}</span>
    <span>
      <strong>{title}:</strong> {body}
    </span>
  </div>
);

/**
 * Hero card for the winning mandi — headline price, net cash projection and
 * the reasons the ranking picked it.
 *
 * @param {object} props
 * @param {object} props.market - The recommended market, already priced
 * @param {object} props.runnerUp - Next best market, for the delta claim
 * @param {object} props.batch
 * @param {object} props.ambient - { tempC }
 */
const TopRecommendation = ({ market, runnerUp, batch, ambient }) => {
  if (!market) return null;

  const advantage = runnerUp ? market.netReturn - runnerUp.netReturn : null;

  return (
    <div className="flex flex-col bg-surface-container-lowest rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden h-full">
      <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-bl from-primary-fixed/30 via-transparent to-transparent pointer-events-none rounded-bl-full" />

      {/* Badge & mandi head */}
      <div className="flex items-start justify-between gap-4 mb-6 relative">
        <div className="flex flex-col">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary text-on-primary text-[11px] font-headline font-extrabold uppercase tracking-widest mb-3 shadow-sm w-fit">
            <span className="text-xs">🏆</span> TOP RECOMMENDATION
          </div>
          <h2 className="font-headline font-extrabold text-2xl sm:text-3xl text-on-surface leading-tight">
            {market.name}
          </h2>
          <p className="text-sm text-on-surface-variant flex items-center gap-1.5 mt-1">
            <span className="material-symbols-outlined text-base text-secondary">navigation</span>
            <span>
              {market.distanceKm} km away • ~{formatDuration(market.travelMinutes)} travel
              {market.route ? ` via ${market.route}` : ''}
            </span>
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-[11px] font-label uppercase text-on-surface-variant font-bold block">
            Quoted Price
          </span>
          <span className="font-headline font-extrabold text-2xl sm:text-3xl text-primary">
            {formatINR(market.pricePerQuintal)}
          </span>
          <span className="text-xs text-on-surface-variant font-semibold block">/ quintal</span>
        </div>
      </div>

      {/* Net return banner */}
      <div className="bg-gradient-to-r from-primary-container to-primary text-on-primary rounded-2xl p-5 sm:p-6 mb-6 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs uppercase tracking-wider font-label text-primary-fixed-dim font-bold">
              In-Hand Cash Projection
            </span>
            <div className="font-headline font-extrabold text-3xl sm:text-4xl tracking-tight mt-0.5">
              {formatINR(market.netReturn)}{' '}
              <span className="text-base font-normal opacity-85">Net Return</span>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 bg-surface-container-lowest/15 backdrop-blur-md px-3.5 py-2 rounded-xl text-xs font-semibold">
            <span className="material-symbols-outlined text-base text-primary-fixed">local_shipping</span>
            <span>After {formatINR(market.transportCost)} Freight &amp; Transit</span>
          </div>
        </div>
        <p className="text-xs text-on-primary/80 mt-3 pt-3 border-t border-white/10 leading-relaxed">
          Estimated in hand after mini-truck freight (−{formatINR(market.transportCost)}) and expected
          transit spoilage (−{formatINR(market.spoilageCost)}).
          <span className="text-[11px] block mt-1 opacity-70 italic">
            Calculated estimate based on APMC arrivals &amp; ambient weather, not a guaranteed auction bid.
          </span>
        </p>
      </div>

      {/* Why this mandi */}
      <div className="mt-auto">
        <h3 className="text-xs font-label font-bold uppercase tracking-wider text-on-surface-variant mb-3 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm text-primary">psychology</span>
          Why AgriChain chose {market.shortName || market.name} for this lot:
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {market.activeAgents && (
            <Reason
              icon="verified"
              title="High Liquidity"
              body={`Fast cash turnover & ${market.activeAgents} active ${(batch?.crop || 'crop').toLowerCase()} commission agents today.`}
            />
          )}
          <Reason
            icon="route"
            title={`Short ${market.distanceKm} km Route`}
            body="Less vibration damage keeps perishable produce whole."
          />
          <Reason
            icon="thermostat"
            title={`Lowest Spoilage (${market.spoilagePct}%)`}
            body={`Journey finishes before the worst of the ${ambient?.tempC ?? 33}°C afternoon heat.`}
          />
          {advantage > 0 && (
            <Reason
              icon="payments"
              title="Highest Net Return"
              body={`Puts ${formatINR(advantage, { signed: true })} more cash in your pocket than the next best mandi.`}
            />
          )}
          <Reason
            wide
            icon="schedule"
            title="Optimal Timing Window"
            body="Depart by 6:30 AM to enter the morning auction queue before 8:00 AM."
          />
        </div>
      </div>
    </div>
  );
};

export default TopRecommendation;

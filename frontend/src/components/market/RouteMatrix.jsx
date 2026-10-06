import React from 'react';
import { formatINR, formatDuration } from '../../utils/marketHelpers';

const ORIGIN = { x: 160, y: 210 };

/**
 * Stylised positions for destination mandis on the schematic map.
 *
 * This is an illustrative map, not a GIS projection — markets are placed by
 * rank so the layout stays readable whatever the backend returns. Swapping in
 * a real Leaflet map later only needs real lat/lon on each market.
 */
const DESTINATION_LAYOUT = [
  { x: 510, y: 110, curve: 'C 220 220 280 180 340 170 C 400 160 440 130 510 110', anchor: 'middle' },
  { x: 260, y: 320, curve: 'Q 180 270 260 320', anchor: 'start' },
  { x: 60, y: 100, curve: 'Q 120 140 60 100', anchor: 'start' }
];

/**
 * Schematic route map from the farm to each candidate mandi.
 */
const RouteMap = ({ markets, selected, origin }) => (
  <svg
    className="w-full h-full"
    fill="none"
    viewBox="0 0 700 380"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label={`Route map from ${origin} to ${markets.map((m) => m.shortName || m.name).join(', ')}`}
  >
    <rect fill="#e8eae4" height="380" width="700" />
    {/* Farmland patches */}
    <path d="M-20 60 Q80 20 180 80 T360 110 T520 70 T720 120 V380 H-20 Z" fill="#e0e4db" opacity="0.6" />
    <path
      d="M120 220 C200 210 320 250 420 210 C520 170 610 240 720 210 V380 H120 Z"
      fill="#d7ddd2"
      opacity="0.7"
    />
    {/* Canal */}
    <path
      d="M0 290 C120 270 230 330 360 300 C480 270 590 320 710 310"
      opacity="0.4"
      stroke="#b0c6ff"
      strokeLinecap="round"
      strokeWidth="12"
    />
    {/* Road grid */}
    <path
      d="M80 0 V380 M240 0 V380 M430 0 V380 M600 0 V380"
      opacity="0.7"
      stroke="#ffffff"
      strokeDasharray="6 6"
      strokeWidth="2.5"
    />
    <path
      d="M0 90 H700 M0 190 H700 M0 280 H700"
      opacity="0.7"
      stroke="#ffffff"
      strokeDasharray="6 6"
      strokeWidth="2.5"
    />

    {markets.slice(0, DESTINATION_LAYOUT.length).map((market, index) => {
      const layout = DESTINATION_LAYOUT[index];
      const isSelected = market.id === selected?.id;
      const path = `M ${ORIGIN.x} ${ORIGIN.y} ${layout.curve}`;

      return (
        <g key={market.id}>
          {isSelected ? (
            <>
              <path
                d={path}
                stroke="#004a31"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="7"
              />
              <path
                d={path}
                stroke="#6ffbbe"
                strokeDasharray="8 8"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
              />
            </>
          ) : (
            <path
              d={path}
              opacity="0.5"
              stroke="#707970"
              strokeDasharray="6 6"
              strokeWidth="4"
            />
          )}

          <g transform={`translate(${layout.x}, ${layout.y})`}>
            {isSelected ? (
              <>
                <circle className="animate-ping" fill="#27c38a" opacity="0.25" r="26" />
                <circle fill="#00311f" r="15" />
                <circle fill="#ffffff" r="7" />
                <rect
                  fill="#00311f"
                  filter="drop-shadow(0 4px 6px rgba(0,0,0,0.2))"
                  height="34"
                  rx="8"
                  width="190"
                  x="-95"
                  y="-46"
                />
                <text
                  fill="#6ffbbe"
                  fontFamily="Inter"
                  fontSize="10"
                  fontWeight="700"
                  letterSpacing="0.5"
                  textAnchor="middle"
                  x="0"
                  y="-31"
                >
                  SELECTED DESTINATION
                </text>
                <text
                  fill="#ffffff"
                  fontFamily="Inter"
                  fontSize="11"
                  fontWeight="bold"
                  textAnchor="middle"
                  x="0"
                  y="-18"
                >
                  {market.name} ({market.distanceKm} km)
                </text>
              </>
            ) : (
              <>
                <circle fill="#eeeee9" r="7" stroke="#707970" strokeWidth="2.5" />
                <text
                  fill="#404941"
                  fontFamily="Inter"
                  fontSize="12"
                  fontWeight="600"
                  textAnchor={layout.anchor}
                  x={layout.anchor === 'start' ? 15 : 0}
                  y={layout.anchor === 'start' ? 5 : -16}
                >
                  {market.shortName || market.name} ({market.distanceKm} km)
                </text>
              </>
            )}
          </g>
        </g>
      );
    })}

    {/* Origin */}
    <g transform={`translate(${ORIGIN.x}, ${ORIGIN.y})`}>
      <circle fill="#00311f" opacity="0.15" r="22" />
      <circle fill="#004a31" r="12" />
      <circle fill="#6ffbbe" r="5" />
      <rect
        fill="#ffffff"
        filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))"
        height="28"
        rx="8"
        width="150"
        x="-75"
        y="18"
      />
      <text
        fill="#00311f"
        fontFamily="Inter"
        fontSize="11"
        fontWeight="700"
        textAnchor="middle"
        x="0"
        y="36"
      >
        🏡 {origin} (Origin)
      </text>
    </g>
  </svg>
);

/**
 * One selectable mandi card beneath the map.
 */
const MarketCard = ({ market, isSelected, best, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(market.id)}
    aria-pressed={isSelected}
    className={`p-3.5 rounded-2xl flex flex-col justify-between text-left transition-all ${
      isSelected
        ? 'bg-primary-fixed/20 border-2 border-primary-container'
        : 'bg-surface-container hover:bg-surface-container-high border-2 border-transparent'
    }`}
  >
    <div className="flex items-center justify-between mb-2 gap-2">
      <span
        className={`font-headline font-bold text-sm truncate ${
          isSelected ? 'text-primary' : 'text-on-surface'
        }`}
      >
        {market.rank}. {market.shortName || market.name}
      </span>
      {isSelected ? (
        <span className="text-[10px] font-extrabold uppercase bg-primary text-on-primary px-2 py-0.5 rounded-md shrink-0">
          Selected
        </span>
      ) : (
        <span className="text-[10px] font-bold text-on-surface-variant shrink-0">
          {market.distanceKm} km
        </span>
      )}
    </div>
    <div className="flex items-baseline justify-between text-xs mb-2 gap-2">
      <span className="text-on-surface-variant truncate">
        {formatINR(market.pricePerQuintal)}/q
        {isSelected ? ` • ${market.distanceKm} km` : ''}
      </span>
      <span className={`font-bold text-sm shrink-0 ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
        {formatINR(market.netReturn)}
      </span>
    </div>
    <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
      <div
        className={market.recommended ? 'bg-primary h-full' : 'bg-error h-full'}
        style={{ width: `${best ? Math.max(4, (market.netReturn / best) * 100) : 100}%` }}
      />
    </div>
  </button>
);

/**
 * Route map, mandi picker and trip logistics for the selected destination.
 *
 * Selecting a different mandi re-drives the ledger on the page, so a farmer
 * can ask "what would I actually get if I drove to Wardha instead?".
 *
 * @param {object} props
 * @param {Array} props.markets
 * @param {object} props.selected
 * @param {Function} props.onSelect
 * @param {object} props.batch
 */
const RouteMatrix = ({ markets, selected, onSelect, batch }) => {
  if (!markets?.length || !selected) return null;

  const bestNet = Math.max(...markets.map((m) => m.netReturn));

  return (
    <div className="bg-surface-container-lowest rounded-3xl p-6 sm:p-8 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="font-headline font-extrabold text-2xl text-on-surface">
            Transit &amp; Road Route Matrix
          </h2>
          <p className="text-xs sm:text-sm text-on-surface-variant">
            Live distance, transit time and freight dispatch estimates
          </p>
        </div>
        {selected.route && (
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-primary bg-primary-fixed/20 px-3 py-1.5 rounded-full shrink-0">
            <span className="material-symbols-outlined text-base">alt_route</span>
            <span>Fastest Road: {selected.route}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 flex flex-col">
          <div className="relative w-full h-80 sm:h-96 rounded-2xl bg-surface-container-high overflow-hidden shadow-inner">
            <RouteMap markets={markets} selected={selected} origin={batch?.origin?.name || 'Farm'} />

            <div className="absolute bottom-4 left-4 right-4 sm:right-auto bg-surface-container-lowest/95 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-lg flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-3 h-3 rounded-full bg-primary-fixed-dim shrink-0" />
                <div className="min-w-0">
                  <span className="text-xs font-bold text-on-surface block font-headline truncate">
                    {selected.route || 'Direct route'}
                  </span>
                  <span className="text-[11px] text-on-surface-variant font-medium">
                    {selected.distanceKm} km • {formatDuration(selected.travelMinutes)} •{' '}
                    {selected.roadQuality || 'Mixed surface'}
                  </span>
                </div>
              </div>
              <span className="text-[11px] font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full shrink-0">
                {selected.recommended ? 'Optimal Flow' : 'Alternative'}
              </span>
            </div>

            <div className="absolute top-4 right-4 w-9 h-9 rounded-full bg-surface-container-lowest shadow-md flex items-center justify-center text-on-surface font-headline text-xs font-bold">
              N
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            {markets.map((market) => (
              <MarketCard
                key={market.id}
                market={market}
                isSelected={market.id === selected.id}
                best={bestNet}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>

        {/* Trip logistics */}
        <div className="lg:col-span-4 flex flex-col justify-between bg-surface-container rounded-2xl p-5">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-primary text-on-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-lg">local_shipping</span>
              </div>
              <h3 className="font-headline font-bold text-base text-on-surface">Trip Logistics Spec</h3>
            </div>

            <dl className="flex flex-col gap-3 text-xs">
              {[
                ['Total Route Distance', `${selected.distanceKm} km (one-way)`],
                ['Standard Drive Time', `~${formatDuration(selected.travelMinutes)}`],
                ['Recommended Vehicle', batch?.vehicle || 'Tata Ace / Mini Tempo'],
                ['Local Freight Estimate', `${formatINR(selected.transportCost)} standard fee`]
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex justify-between items-center gap-2 py-2 border-b border-surface-container-highest"
                >
                  <dt className="text-on-surface-variant">{label}</dt>
                  <dd className="font-semibold text-on-surface font-headline text-right">{value}</dd>
                </div>
              ))}
              <div className="flex justify-between items-center gap-2 py-2">
                <dt className="text-on-surface-variant">Estimated Spoilage Rate</dt>
                <dd className="font-bold text-primary text-right">
                  {selected.spoilagePct}% (~{formatINR(selected.spoilageCost)})
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-6 p-4 rounded-xl bg-amber-500/10 text-amber-900 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 font-headline font-bold text-xs">
              <span className="material-symbols-outlined text-sm text-amber-700">alarm</span>
              <span>Departure Advice</span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-950">
              Leave the farm between <strong>6:00 AM – 7:00 AM</strong>. This guarantees arrival before
              peak auction crowds and prevents crate heating above 28°C.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RouteMatrix;

import React, { useMemo } from 'react';
import { formatINR } from '../../utils/marketHelpers';

const CHART_WIDTH = 500;
const CHART_HEIGHT = 100;
const CHART_PAD_Y = 12;

/**
 * Projects forecast points onto the SVG viewbox.
 *
 * x is spaced by how many days out the point is (so a 7-day point sits far
 * from a 3-day one), y is scaled across the observed price range.
 *
 * @param {Array} points
 * @returns {Array} points with svg x/y attached
 */
const toChartPoints = (points) => {
  if (!points?.length) return [];
  const prices = points.map((p) => p.pricePerQuintal);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const maxDays = Math.max(...points.map((p) => p.offsetDays)) || 1;
  const usableHeight = CHART_HEIGHT - CHART_PAD_Y * 2;

  return points.map((point) => ({
    ...point,
    x: (point.offsetDays / maxDays) * CHART_WIDTH,
    y: CHART_PAD_Y + (1 - (point.pricePerQuintal - min) / span) * usableHeight
  }));
};

/**
 * A single day snapshot tile.
 */
const ForecastTile = ({ point }) => (
  <div
    className={`p-3.5 rounded-2xl flex flex-col ${
      point.isToday ? 'bg-primary/10 border-2 border-primary/40' : 'bg-surface-container-low'
    }`}
  >
    <span
      className={`text-[11px] font-bold uppercase ${
        point.isToday ? 'text-primary' : 'text-on-surface-variant'
      }`}
    >
      {point.label}
    </span>
    <span
      className={`font-headline mt-1 text-lg ${
        point.isToday ? 'font-extrabold text-primary' : 'font-bold text-on-surface'
      }`}
    >
      {formatINR(point.pricePerQuintal)}
    </span>
    {point.isToday ? (
      <span className="text-[10px] text-on-surface-variant font-medium">Current Mandi</span>
    ) : (
      <span className={`text-[10px] font-bold ${point.changePct >= 0 ? 'text-primary' : 'text-error'}`}>
        {point.changePct >= 0 ? '+' : ''}
        {point.changePct.toFixed(1)}% expected
      </span>
    )}
  </div>
);

/**
 * Price forecast plus the sell-or-hold verdict.
 *
 * The verdict is the point of the section: a rising forecast does not mean
 * hold, because a ripe perishable rots faster than the price climbs.
 *
 * @param {object} props
 * @param {object} props.forecast
 * @param {object} props.decision - Output of buildSellingDecision()
 */
const PriceForecast = ({ forecast, decision }) => {
  const chartPoints = useMemo(() => toChartPoints(forecast?.points), [forecast]);

  if (!forecast?.points?.length) return null;

  const linePath = chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L ${CHART_WIDTH},${CHART_HEIGHT} L 0,${CHART_HEIGHT} Z`;
  const first = forecast.points[0];
  const last = forecast.points[forecast.points.length - 1];

  return (
    <div className="bg-surface-container-lowest rounded-3xl p-6 sm:p-8 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container text-xs font-semibold mb-2">
            <span className="w-2 h-2 rounded-full bg-primary-fixed animate-pulse" />
            <span>AgriChain Neural Price Engine</span>
          </div>
          <h2 className="font-headline font-extrabold text-2xl text-on-surface">
            Price Forecast &amp; Selling Window
          </h2>
          <p className="text-xs sm:text-sm text-on-surface-variant">
            Projected mandi rates over the next 7 days vs harvest perishability risk
          </p>
        </div>
        {forecast.confidencePct && (
          <div className="flex items-center gap-2 self-start md:self-auto bg-surface-container px-3 py-1.5 rounded-full text-xs font-medium text-on-surface-variant shrink-0">
            <span className="material-symbols-outlined text-base text-outline">info</span>
            <span>
              Confidence: <strong className="text-on-surface">{forecast.confidencePct}%</strong>
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Forecast tiles + trendline */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {forecast.points.map((point) => (
              <ForecastTile key={point.label} point={point} />
            ))}
          </div>

          <div className="bg-surface-container-low rounded-2xl p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-on-surface-variant mb-1 font-medium gap-2">
              <span>Price Trend Curve (₹ / Quintal)</span>
              {forecast.trend && <span className="text-primary font-semibold">{forecast.trend}</span>}
            </div>
            <div className="w-full h-28 relative">
              <svg
                className="w-full h-full"
                fill="none"
                preserveAspectRatio="none"
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                role="img"
                aria-label={`Price trend from ${formatINR(first.pricePerQuintal)} to ${formatINR(last.pricePerQuintal)} per quintal`}
              >
                {[15, 45, 80].map((y) => (
                  <line
                    key={y}
                    stroke="#dadad5"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                    x1="0"
                    x2={CHART_WIDTH}
                    y1={y}
                    y2={y}
                  />
                ))}
                <defs>
                  <linearGradient
                    gradientUnits="userSpaceOnUse"
                    id="priceGradient"
                    x1="0"
                    x2="0"
                    y1="0"
                    y2={CHART_HEIGHT}
                  >
                    <stop stopColor="#4edea3" stopOpacity="0.8" />
                    <stop offset="1" stopColor="#fafaf5" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={areaPath} fill="url(#priceGradient)" opacity="0.3" />
                <path
                  d={linePath}
                  stroke="#004a31"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3.5"
                />
                {chartPoints.map((p, i) => (
                  <circle
                    key={p.label}
                    cx={p.x}
                    cy={p.y}
                    r={i === chartPoints.length - 1 ? 5 : 4.5}
                    fill={i === chartPoints.length - 1 ? '#27c38a' : '#004a31'}
                  />
                ))}
              </svg>
            </div>
            <div className="flex justify-between text-[11px] text-on-surface-variant font-label mt-1">
              <span>
                {first.label} ({formatINR(first.pricePerQuintal)})
              </span>
              <span>
                {last.label} ({formatINR(last.pricePerQuintal)})
              </span>
            </div>
          </div>
        </div>

        {/* Verdict */}
        {decision && (
          <div className="lg:col-span-5 bg-gradient-to-br from-primary-container to-primary text-on-primary rounded-3xl p-6 sm:p-7 flex flex-col justify-between shadow-lg">
            <div>
              <div className="inline-flex items-center gap-2 bg-surface-container-lowest/15 backdrop-blur-md px-3 py-1 rounded-full text-xs font-headline font-bold text-primary-fixed mb-4">
                <span className="material-symbols-outlined text-sm">notification_important</span>
                <span>ACTIONABLE DECISION</span>
              </div>
              <h3 className="font-headline font-extrabold text-2xl text-on-primary mb-2">
                {decision.action}
              </h3>
              <span className="inline-block px-2.5 py-0.5 rounded bg-primary-fixed text-on-primary-fixed text-xs font-bold mb-4">
                🟢 {decision.windowLabel}
              </span>

              <div className="bg-black/15 rounded-2xl p-4 text-xs text-on-primary/95 leading-relaxed space-y-2.5">
                <p>
                  <strong>Crucial Biological Rationale:</strong> Market prices are projected to move{' '}
                  {formatINR(decision.priceGain, { signed: true })} on this lot over the next{' '}
                  {decision.holdDays} days, but your produce is already fully ripe in ambient{' '}
                  <strong>{decision.ambientTempC}°C heat</strong>.
                </p>
                <p>
                  Without cold storage, holding it that long costs about{' '}
                  <strong>{decision.holdingSpoilagePct}% to spoilage and softening</strong> — roughly{' '}
                  <strong>{formatINR(decision.rotLoss)}</strong> of grade loss,{' '}
                  {decision.sellNow ? (
                    <>
                      which wipes out the price gain and leaves you{' '}
                      <strong>{formatINR(Math.abs(decision.netOfHolding))} worse off</strong>.
                    </>
                  ) : (
                    <>
                      still leaving <strong>{formatINR(decision.netOfHolding)} ahead</strong> if you wait.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between gap-3">
              <span className="text-xs text-primary-fixed-dim">Holding Risk:</span>
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-lg shrink-0 ${
                  decision.sellNow
                    ? 'text-error-container bg-error/20'
                    : 'text-primary-fixed bg-black/20'
                }`}
              >
                {decision.sellNow ? 'High' : 'Acceptable'} Rot Risk ({decision.holdingSpoilagePct}%)
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PriceForecast;

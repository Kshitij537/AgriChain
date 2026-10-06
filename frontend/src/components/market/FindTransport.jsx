import React, { useState } from 'react';
import { formatINR } from '../../utils/marketHelpers';
import { buildTelHref } from '../../services/transportService';
import TransporterDetailsDialog from './TransporterDetailsDialog';

/**
 * Find Transport — transport businesses near the recommended mandi.
 *
 * Reuses the existing market card shell (`bg-surface-container-lowest
 * rounded-3xl`), label/heading typography, pill buttons and material icons, so
 * it sits alongside RouteMatrix and AlternativeChannels without new styling.
 *
 * TWO INDEPENDENT SOURCES, NEVER CONFLATED
 * ----------------------------------------
 *   Google Places  ->  who the business is: name, address, phone, website, rating
 *   AgriChain      ->  the estimated trip cost, from the farm-to-mandi distance
 *
 * So the cost line reads "Estimated trip cost" and carries our attribution, never
 * "ABC Transport charges ₹875". Availability always reads "Contact to confirm",
 * because Google publishes no availability data.
 *
 * The estimated cost renders even when Google fails or returns nothing, because
 * it does not depend on Google at all.
 *
 * @param {object} props
 * @param {object} props.transport - state from services/transportService
 * @param {object} props.market - the selected mandi (component-shaped)
 * @param {object} props.batch - the harvest batch, for the quantity line
 * @param {Function} props.onRetry
 */

/** The cost block, shown in every state including the empty and error ones. */
const EstimatedCost = ({ tripEstimate }) => {
  if (!tripEstimate) return null;

  return (
    <div className="p-4 rounded-2xl bg-primary-fixed/20 border border-primary/30 flex items-start gap-3">
      <span className="material-symbols-outlined text-primary text-xl shrink-0">payments</span>
      <div className="min-w-0">
        <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider block">
          Estimated trip cost
        </span>
        <span className="font-headline font-extrabold text-xl text-on-surface block leading-tight">
          {formatINR(tripEstimate.totalCost)}
        </span>
        <span className="text-[11px] text-on-surface-variant block mt-1">
          {tripEstimate.distanceKm} km farm to mandi
          {tripEstimate.vehicle ? ` • ${tripEstimate.vehicle.label}` : ''}
          {tripEstimate.trips > 1 ? ` • ${tripEstimate.trips} trips` : ''}
          {!tripEstimate.isRoadRoute ? ' • distance estimated, no road route' : ''}
        </span>
        <span className="text-[11px] text-on-surface-variant block mt-0.5">
          Estimated using AgriChain transport rates. Final price may vary.
        </span>
      </div>
    </div>
  );
};

/** One transporter card. */
const TransporterCard = ({ transporter, marketName, onViewDetails }) => {
  const telHref = buildTelHref(transporter);

  return (
    <div className="p-4 rounded-2xl bg-surface-container-low hover:bg-surface-container transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-secondary-fixed/50 text-secondary flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-xl">local_shipping</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="font-headline font-bold text-sm text-on-surface block truncate">
                {transporter.name}
              </span>
              <span className="text-xs text-on-surface-variant block truncate">
                {transporter.address || 'Address not listed'}
              </span>
            </div>
            {transporter.rating !== null && (
              <span className="flex items-center gap-0.5 text-xs font-bold text-on-surface shrink-0">
                <span className="material-symbols-outlined text-sm text-amber-600">star</span>
                {transporter.rating}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-on-surface-variant">
            {transporter.distanceFromMarketKm !== null && (
              <span className="inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">place</span>
                {transporter.distanceFromMarketKm} km from {marketName}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">call</span>
              {/* A missing number is stated, never left blank or faked. */}
              {transporter.phone || 'Phone number not listed'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              {transporter.estimatedTripCost !== null && (
                <div>
                  <span className="text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-wider block">
                    Estimated trip cost
                  </span>
                  <span className="font-headline font-bold text-sm text-on-surface">
                    {formatINR(transporter.estimatedTripCost)}
                  </span>
                </div>
              )}
              <div>
                <span className="text-[10px] font-label font-bold text-on-surface-variant uppercase tracking-wider block">
                  Availability
                </span>
                {/* Never "Vehicle available": Google has no such data. */}
                <span className="text-xs font-semibold text-on-surface">Contact to confirm</span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onViewDetails(transporter)}
                className="px-4 py-2 rounded-full bg-surface-container-high hover:bg-surface-container text-on-surface text-xs font-semibold transition-all"
              >
                View Details
              </button>
              {/* Rendered only when a number exists, so the button always works. */}
              {telHref && (
                <a
                  href={telHref}
                  className="px-4 py-2 rounded-full bg-primary text-on-primary text-xs font-bold transition-all hover:opacity-90 flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">call</span>
                  <span>Call</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Failure reasons a retry can actually resolve.
 *
 * A missing key or a disabled feature is server CONFIGURATION: retrying is
 * guaranteed to fail identically, and each attempt still costs a routing call on
 * the backend. Offering the button there invites a farmer to click it repeatedly
 * for nothing, which is exactly what happened in testing.
 */
const RETRYABLE_REASONS = new Set([
  'PLACES_TIMEOUT',
  'PLACES_UNAVAILABLE',
  'PLACES_RATE_LIMITED',
  'PLACES_ERROR',
  'UNEXPECTED_RESPONSE',
  'REQUEST_FAILED'
]);

const FindTransport = ({ transport, market, batch, onRetry }) => {
  const [selected, setSelected] = useState(null);

  if (!market) return null;

  const marketName = market.shortName || market.name;
  const { loading, transporters = [], tripEstimate, available, message, attribution } =
    transport || {};

  return (
    <div className="bg-surface-container-lowest rounded-3xl p-6 sm:p-7 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider">
            Getting it there
          </span>
          <h2 className="font-headline font-extrabold text-xl text-on-surface">
            Find Transport to {marketName}
          </h2>
          <p className="text-xs text-on-surface-variant mt-1">
            Transport services near your selected market
            {batch?.quantityKg ? ` for your ${batch.quantityKg} kg batch` : ''}.
          </p>
        </div>
        <span className="material-symbols-outlined text-2xl text-secondary shrink-0">
          local_shipping
        </span>
      </div>

      {/* The cost estimate sits above the listings because it is ours and is
          always available, even when Google is not. */}
      {tripEstimate && (
        <div className="mb-5">
          <EstimatedCost tripEstimate={tripEstimate} />
        </div>
      )}

      {/* Loading — no placeholder cards, which would look like real results. */}
      {loading && (
        <div className="flex items-center justify-center gap-3 py-10">
          <span className="material-symbols-outlined text-2xl text-primary animate-spin">
            progress_activity
          </span>
          <span className="text-sm text-on-surface-variant">
            Finding transport options near your selected market...
          </span>
        </div>
      )}

      {/* Google unavailable — the recommendation and the cost still stand. */}
      {!loading && available === false && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
          <span className="material-symbols-outlined text-amber-700 text-xl shrink-0">
            info
          </span>
          <div className="min-w-0">
            <p className="text-xs text-amber-950 leading-relaxed">
              {message || 'Transporter details are temporarily unavailable.'}
            </p>
            {onRetry && RETRYABLE_REASONS.has(transport?.reason) && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 text-xs font-bold text-primary hover:underline"
              >
                Try again
              </button>
            )}
          </div>
        </div>
      )}

      {/* Searched successfully, genuinely nothing listed nearby. */}
      {!loading && available === true && transporters.length === 0 && (
        <div className="flex flex-col items-center text-center py-8">
          <div className="w-12 h-12 rounded-2xl bg-surface-container-high text-on-surface-variant flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-2xl">search_off</span>
          </div>
          <p className="text-sm font-semibold text-on-surface mb-1">
            No transport services found nearby
          </p>
          <p className="text-xs text-on-surface-variant max-w-sm">
            Try contacting local transport operators, or check another nearby market. Your
            estimated transport cost above is unaffected.
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && transporters.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider">
              {transporters.length} transporter{transporters.length === 1 ? '' : 's'} near{' '}
              {marketName}
            </span>
          </div>

          <div className="space-y-3">
            {transporters.map((t) => (
              <TransporterCard
                key={t.placeId}
                transporter={t}
                marketName={marketName}
                onViewDetails={setSelected}
              />
            ))}
          </div>

          <p className="text-[11px] text-on-surface-variant mt-4 leading-relaxed">
            Transport costs are AgriChain estimates. Contact the transporter for their final
            price and to confirm vehicle availability.
            {attribution ? ` ${attribution}.` : ''}
          </p>
        </>
      )}

      <TransporterDetailsDialog
        transporter={selected}
        market={{ name: marketName }}
        attribution={attribution}
        onClose={() => setSelected(null)}
      />
    </div>
  );
};

export default FindTransport;

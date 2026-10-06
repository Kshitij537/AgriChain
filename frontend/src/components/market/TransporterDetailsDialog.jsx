import React from 'react';
import { formatINR } from '../../utils/marketHelpers';
import { buildTelHref } from '../../services/transportService';

/**
 * Expanded view of one transport business.
 *
 * Uses the same dialog shell, tokens, radii and button styles as
 * BatchSetupDialog so it reads as part of the existing design system.
 *
 * HONESTY RULES BAKED INTO THIS VIEW
 * ----------------------------------
 * - A field Google did not provide is shown as "not listed", never blank and
 *   never filled with a plausible placeholder.
 * - The trip cost is labelled as AgriChain's estimate. It is NOT presented as
 *   this business's quote, because Google Places gives no pricing.
 * - Availability always reads "Contact to confirm". Google publishes no
 *   vehicle-availability feed, so any stronger claim would be invented.
 *
 * @param {object} props
 * @param {object|null} props.transporter
 * @param {object} props.market - selected mandi { name }
 * @param {string|null} props.attribution - required Google attribution text
 * @param {Function} props.onClose
 */

/** One label/value row. */
const DetailRow = ({ label, children, missing = false }) => (
  <div className="py-3 border-b border-surface-container last:border-b-0">
    <span className="block text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1">
      {label}
    </span>
    <span
      className={`text-sm font-medium ${
        missing ? 'text-on-surface-variant italic' : 'text-on-surface'
      }`}
    >
      {children}
    </span>
  </div>
);

const TransporterDetailsDialog = ({ transporter, market, attribution, onClose }) => {
  if (!transporter) return null;

  const telHref = buildTelHref(transporter);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transporter-details-title"
    >
      <div className="bg-surface-container-lowest w-full sm:max-w-lg max-h-[92vh] rounded-t-3xl sm:rounded-3xl shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-surface-container">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-secondary-fixed/50 text-secondary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-2xl">local_shipping</span>
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider block">
                Transporter details
              </span>
              <h2
                id="transporter-details-title"
                className="font-headline font-extrabold text-lg text-on-surface leading-tight"
              >
                {transporter.name}
              </h2>
              <span className="text-xs text-on-surface-variant">
                {transporter.serviceLabel || 'Transport service'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-xl hover:bg-surface-container flex items-center justify-center shrink-0"
          >
            <span className="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-2">
          <DetailRow label="Address" missing={!transporter.address}>
            {transporter.address || 'Address not listed'}
          </DetailRow>

          <DetailRow label={`Distance from ${market?.name || 'market'}`} missing={transporter.distanceFromMarketKm === null}>
            {transporter.distanceFromMarketKm !== null ? (
              <>
                {transporter.distanceFromMarketKm} km
                {/* The basis matters: this is proximity to the yard, in a straight
                    line, not a driving route. */}
                <span className="text-on-surface-variant font-normal">
                  {' '}(straight-line)
                </span>
              </>
            ) : (
              'Distance not available'
            )}
          </DetailRow>

          <DetailRow label="Phone" missing={!transporter.phone}>
            {transporter.phone || 'Phone number not listed'}
          </DetailRow>

          <DetailRow label="Website" missing={!transporter.website}>
            {transporter.website ? (
              <a
                href={transporter.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all"
              >
                {transporter.website}
              </a>
            ) : (
              'Website not listed'
            )}
          </DetailRow>

          {transporter.rating !== null && (
            <DetailRow label="Google rating">
              <span className="inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-base text-amber-600">star</span>
                {transporter.rating}
                {transporter.userRatingCount !== null && (
                  <span className="text-on-surface-variant font-normal">
                    {' '}({transporter.userRatingCount} rating
                    {transporter.userRatingCount === 1 ? '' : 's'})
                  </span>
                )}
              </span>
            </DetailRow>
          )}

          <DetailRow label="Estimated trip cost" missing={transporter.estimatedTripCost === null}>
            {transporter.estimatedTripCost !== null ? (
              <>
                <strong className="font-headline font-bold text-base">
                  {formatINR(transporter.estimatedTripCost)}
                </strong>
                <span className="block text-[11px] text-on-surface-variant font-normal mt-1">
                  {transporter.estimatedTripCostBasis ||
                    'Estimated using AgriChain transport rates. Final price may vary.'}
                </span>
              </>
            ) : (
              'Enter a quantity to see the estimated trip cost'
            )}
          </DetailRow>

          <DetailRow label="Availability">
            Contact to confirm
            <span className="block text-[11px] text-on-surface-variant font-normal mt-1">
              Vehicle availability is not published online.
            </span>
          </DetailRow>

          <DetailRow label="Final transport price">
            Contact transporter
            <span className="block text-[11px] text-on-surface-variant font-normal mt-1">
              This business has not quoted a price to AgriChain. The figure above is our own
              estimate for the trip.
            </span>
          </DetailRow>

          {attribution && (
            <p className="text-[11px] text-on-surface-variant py-3">{attribution}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 pt-4 border-t border-surface-container">
          {transporter.website && (
            <a
              href={transporter.website}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">language</span>
              <span>Visit Website</span>
            </a>
          )}
          {/* No number means no button, rather than one that silently fails. */}
          {telHref && (
            <a
              href={telHref}
              className="px-6 py-2.5 rounded-full bg-gradient-to-r from-primary-container to-secondary text-on-primary text-xs font-headline font-bold tracking-wide shadow-md hover:opacity-95 transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">call</span>
              <span>Call Transporter</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransporterDetailsDialog;

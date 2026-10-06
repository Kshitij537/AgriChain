import React from 'react';
import { formatINR } from '../../utils/marketHelpers';

/**
 * One line of the ledger: a sign badge, a description and an amount.
 */
const LedgerRow = ({ sign, signClass, title, detail, amount, amountClass }) => (
  <div className="flex items-center justify-between p-3 rounded-2xl bg-surface-container-low gap-3">
    <div className="flex items-center gap-3 min-w-0">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${signClass}`}>
        {sign}
      </div>
      <div className="min-w-0">
        <span className="font-semibold text-on-surface block">{title}</span>
        <span className="text-xs text-on-surface-variant">{detail}</span>
      </div>
    </div>
    <span className={`font-headline font-bold text-base shrink-0 ${amountClass}`}>{amount}</span>
  </div>
);

/**
 * Transparent arithmetic for the recommended sale: every deduction a farmer
 * would otherwise discover at the mandi gate, shown up front.
 *
 * @param {object} props
 * @param {object} props.market - Recommended market with computed economics
 * @param {object} props.batch
 */
const NetReturnLedger = ({ market, batch }) => {
  if (!market) return null;

  // Each charge with the rate it came from, so a farmer can verify the line
  // against their own mandi slip. Rows with no amount are dropped rather than
  // shown as zero; rows whose rate the backend did not send lose only the rate
  // text, never the amount.
  const b = market.feesBreakdown || {};
  const r = market.feesRates || {};
  const pct = (v) => (v || v === 0 ? `${v}% of the sale value` : 'percentage of the sale value');
  const perQtl = (v) => (v || v === 0 ? `₹${v} per quintal` : 'per quintal charge');

  // The rate this sale is valued at, described for what it is: the modal
  // (most-traded) price in one day's arrivals at that mandi, not a quote.
  const priceDetail = [
    `${batch?.quintals} quintals × ${formatINR(market.pricePerQuintal)} modal rate`,
    market.minPrice && market.maxPrice
      ? `that day's range ${formatINR(market.minPrice)}–${formatINR(market.maxPrice)}`
      : null
  ].filter(Boolean).join(' · ');

  const age = market.priceAgeInDays;
  const ageText = age === null || age === undefined
    ? ''
    : age === 0 ? "today's arrivals" : age === 1 ? "yesterday's arrivals" : `${age} days old`;

  // Attribution for a REAL provider observation. No demo notice is rendered here
  // by product decision; the page header still carries the demo indicator, and
  // every market row still carries isDemoData for any consumer that needs it.
  const priceBasis = !market.isDemoData && market.priceSource
    ? {
      label: market.priceSource === 'MANDI_API' ? 'Mandi rate' : market.priceSource,
      className: 'bg-primary/10 text-primary',
      note: `Modal price for ${market.shortName || market.name}`
        + `${market.observationDate ? ` on ${market.observationDate}` : ''}`
        + `${ageText ? ` (${ageText})` : ''}. A market-wide rate, not a quote for your lot.`
    }
    : null;

  // Freight, described by the vehicle the engine chose and the number of hires.
  const vehicleLabel = market.vehicle?.label || 'Vehicle';
  const trips = Number(market.trips) || 1;
  const freightTitle = trips > 1
    ? `${vehicleLabel} Freight × ${trips} trips`
    : `${vehicleLabel} Freight`;
  const freightDetail = [
    `${batch?.origin?.name || 'Farm'} to ${market.shortName || market.name}`,
    `${market.distanceKm} km loaded`,
    market.vehicle?.ratePerKm ? `₹${market.vehicle.ratePerKm}/km` : null,
    market.vehicle?.returnTripFactor > 1
      ? `includes the transporter's empty return (×${market.vehicle.returnTripFactor})`
      : null
  ].filter(Boolean).join(' · ');

  // How well-grounded that ₹/km is. A quoted rate has a transporter behind it; an
  // indexed or configured rate does not, and must not look like it does.
  const FREIGHT_BASIS = {
    TRANSPORTER_QUOTE: {
      label: 'Quoted rate',
      className: 'bg-primary/10 text-primary'
    },
    ESTIMATE_FUEL_INDEXED: {
      label: 'Estimate, tracking diesel',
      className: 'bg-secondary-fixed text-on-secondary-fixed'
    },
    CONFIGURED_ESTIMATE: {
      label: 'Estimated rate',
      className: 'bg-surface-container-high text-on-surface-variant'
    }
  };
  const freightBasis = FREIGHT_BASIS[market.freightRateSource] || null;

  const feeRows = [
    { title: 'Trader / Arhatiya Commission', amount: b.commission, detail: pct(r.commissionPercent) },
    { title: 'APMC Market Cess', amount: b.marketCess, detail: pct(r.marketCessPercent) },
    { title: 'Hamali (Loading & Unloading)', amount: b.hamali, detail: perQtl(r.hamaliPerQuintal) },
    { title: 'Weighing & Grading', amount: b.weighing, detail: perQtl(r.weighingPerQuintal) }
  ].filter((row) => Number(row.amount) > 0);

  return (
    <div className="bg-surface-container-lowest rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between mb-4 gap-4">
          <div>
            <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider">
              Transparent Calculation
            </span>
            <h2 className="font-headline font-extrabold text-2xl text-on-surface">
              Expected Net Return Arithmetic
            </h2>
          </div>
          <span className="material-symbols-outlined text-2xl text-primary shrink-0">receipt_long</span>
        </div>
        <p className="text-xs text-on-surface-variant mb-6">
          We deduct every unavoidable real-world friction point so you don&rsquo;t get surprise
          deductions at the mandi gate.
        </p>

        <div className="flex flex-col gap-3 font-body text-sm">
          <LedgerRow
            sign="+"
            signClass="bg-primary/10 text-primary"
            title="Gross Sale Value"
            detail={priceDetail}
            amount={formatINR(market.grossSale)}
            amountClass="text-on-surface"
          />

          {/* Where the rate came from. "auction quote" used to sit here, which was
              wrong twice: nobody quoted this farmer anything, and a modal price is
              a market-wide statistic for one day's arrivals, not an offer. */}
          {priceBasis && (
            <div className="flex items-start gap-2 -mt-1 ml-11 pr-1">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-label font-bold uppercase tracking-wider shrink-0 ${priceBasis.className}`}>
                {priceBasis.label}
              </span>
              <span className="text-[11px] text-on-surface-variant leading-snug">
                {priceBasis.note}
              </span>
            </div>
          )}
          {/* The vehicle is whatever the engine actually priced, not a fixed
              "Mini-Truck / Tempo": a 500-quintal load is four large-truck hires,
              and calling that a tempo hides why the freight is what it is. */}
          <LedgerRow
            sign="−"
            signClass="bg-error/10 text-error"
            title={freightTitle}
            detail={freightDetail}
            amount={`− ${formatINR(market.transportCost)}`}
            amountClass="text-error"
          />

          {/* Where the ₹/km came from. Shown next to the amount rather than buried
              in a footnote, because a quoted rate and an estimated one are worth
              very different amounts of trust. */}
          {freightBasis && (
            <div className="flex items-start gap-2 -mt-1 ml-11 pr-1">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-label font-bold uppercase tracking-wider shrink-0 ${freightBasis.className}`}>
                {freightBasis.label}
              </span>
              {market.freightRateSourceNote && (
                <span className="text-[11px] text-on-surface-variant leading-snug">
                  {market.freightRateSourceNote}
                </span>
              )}
            </div>
          )}
          <LedgerRow
            sign="−"
            signClass="bg-error/10 text-error"
            title="Transit Spoilage & Crushing"
            detail={`${market.spoilagePct}% bruised/unusable (~${market.spoilageKg} kg) during transit`}
            amount={`− ${formatINR(market.spoilageCost)}`}
            amountClass="text-error"
          />
          {/* Mandi charges, itemised. Previously one row titled "APMC Cess &
              Mandi Weighing Fee" subtitled "Maharashtra state farmer exemption
              applied" - which described neither the amount nor reality: the figure
              is the sum of four charges, the largest being the trader commission,
              and nothing is exempted. A farmer reading "exemption applied" next to
              a five-figure deduction cannot check their own mandi slip against it. */}
          {market.feesCost > 0 && feeRows.length > 0 && feeRows.map((row) => (
            <LedgerRow
              key={row.title}
              sign="−"
              signClass="bg-error/10 text-error"
              title={row.title}
              detail={row.detail}
              amount={`− ${formatINR(row.amount)}`}
              amountClass="text-error"
            />
          ))}

          {/* No itemisation available (older stored recommendation): show the
              total rather than nothing, but do not invent a composition for it. */}
          {market.feesCost > 0 && feeRows.length === 0 && (
            <LedgerRow
              sign="−"
              signClass="bg-error/10 text-error"
              title="Mandi Charges"
              detail="Commission, market cess, hamali and weighing"
              amount={`− ${formatINR(market.feesCost)}`}
              amountClass="text-error"
            />
          )}

          {!market.feesCost && (
            <LedgerRow
              sign="−"
              signClass="bg-error/10 text-error"
              title="Mandi Charges"
              detail="No deductions configured for this sale"
              amount="₹0"
              amountClass="text-primary"
            />
          )}

          <div className="flex items-center justify-between p-4 rounded-2xl bg-primary text-on-primary mt-2 shadow-sm gap-3">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-primary-fixed-dim uppercase tracking-wider">
                Expected Money In Hand
              </span>
              <span className="text-[11px] text-on-primary/75">
                After freight, spoilage and mandi charges &mdash; before your growing cost
              </span>
            </div>
            <span className="font-headline font-extrabold text-2xl sm:text-3xl text-primary-fixed shrink-0">
              {formatINR(market.netReturn)}
            </span>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-on-surface-variant italic mt-5">
        {'*Final realization depends on the grade your lot is bid at, which can fall anywhere in '
          + "the day's observed range above."}
        {market.feesSource === 'CONFIGURED_ESTIMATE' && (
          <>
            {' '}Mandi charge rates are indicative Vidarbha APMC estimates, not verified rates for
            this market committee &mdash; confirm the actual deductions with your mandi.
          </>
        )}
        {market.freightRateSource && !market.freightIsRealRate && (
          <>
            {' '}The freight rate is an estimate, not a transporter&rsquo;s quote &mdash; call one of
            the transporters listed below to confirm before you book.
          </>
        )}
      </p>
    </div>
  );
};

export default NetReturnLedger;

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import mp from '../services/marketplaceService';

/**
 * Compare all selling options — mandis and direct buyers, one ranking.
 *
 * Answers the farmer's real question: "of everywhere I could sell this load,
 * which leaves me the most money?" — across both channels at once.
 *
 * WHY THE COMPARISON IS HONEST
 * ----------------------------
 * Both sides of this page are costed by the same engine. A mandi option and a
 * direct-buyer option both come out of netReturnService, using the same spoilage
 * model, the same routing and the same freight rates
 * (buyerComparisonService -> marketService -> netReturnService). So the two
 * numbers are directly subtractable; this is not a mandi estimate placed beside a
 * buyer estimate calculated differently.
 *
 * WHY MONEY KEPT, NOT PRICE
 * -------------------------
 * The whole point is that these two orderings disagree. The demo scenario makes
 * it concrete: a buyer advertising ₹31/kg 135 km away leaves the farmer less than
 * one advertising ₹28/kg who collects from the farm. Ranking by price would send
 * the farmer to the wrong one, so every list here is ordered by expected money and
 * the page says so wherever a price is shown.
 *
 * DATA SHAPE
 * ----------
 * GET /api/marketplace/selling-options returns:
 *   combined[]            thin, already ranked across both channels
 *   mandiChannel.options[]        full ledger per option
 *   directBuyerChannel.options[]  full ledger per option
 *   bestOverall           the winner, same thin shape as combined[]
 *
 * `combined[]` carries only summary fields, so the detail cards look the full
 * record up from its channel array by id — see `fullOptionFor`.
 */

const CHANNEL = {
  mandi: {
    label: 'APMC mandi',
    icon: 'storefront',
    chip: 'bg-secondary-container text-on-secondary-container'
  },
  direct_buyer: {
    label: 'Direct buyer',
    icon: 'handshake',
    chip: 'bg-primary-container text-on-primary-container'
  }
};

const labelClass =
  'text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider';

/** Rupees, whole numbers — paise are noise at this scale. */
const inr = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `₹${Math.round(Number(value)).toLocaleString('en-IN')}`;
};

const kg = (value) =>
  value === null || value === undefined ? '—' : `${Math.round(Number(value)).toLocaleString('en-IN')} kg`;

/** One line of the deduction ledger. */
const LedgerRow = ({ label, value, hint, negative, strong }) => (
  <div className={`flex items-baseline justify-between gap-3 py-1.5 ${strong ? 'pt-2.5 mt-1 border-t border-surface-container-high' : ''}`}>
    <div className="min-w-0">
      <span className={`text-xs ${strong ? 'font-bold text-on-surface' : 'text-on-surface-variant'}`}>
        {label}
      </span>
      {hint && <span className="block text-[10px] text-on-surface-variant opacity-80">{hint}</span>}
    </div>
    <span className={`shrink-0 tabular-nums ${
      strong
        ? 'font-headline font-extrabold text-base text-primary'
        : `text-xs font-semibold ${negative ? 'text-error' : 'text-on-surface'}`
    }`}>
      {negative && value ? '− ' : ''}{inr(value)}
    </span>
  </div>
);

/**
 * The winner, across both channels.
 *
 * Deliberately mirrors the Market page's TopRecommendation so a farmer who has
 * used that screen recognises this one — same badge, same in-hand headline, same
 * "why this was chosen" grid. The difference is that this one can crown a private
 * buyer, which the mandi-only screen cannot.
 */
const BestOverall = ({ best, full, runnerUp, availability, onAct }) => {
  if (!best) return null;

  const meta = CHANNEL[best.channel] || CHANNEL.mandi;
  const advantage = runnerUp ? best.expectedMoney - runnerUp.expectedMoney : null;
  const isBuyer = best.channel === 'direct_buyer';

  return (
    <div className="relative overflow-hidden bg-surface-container-lowest rounded-3xl p-6 sm:p-8 shadow-md mb-6">
      <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-bl from-primary-fixed/30 via-transparent to-transparent pointer-events-none rounded-bl-full" />

      <div className="relative flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary text-on-primary text-[11px] font-headline font-extrabold uppercase tracking-widest mb-3 shadow-sm">
            <span className="text-xs">🏆</span> BEST OVERALL
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-headline font-extrabold text-2xl sm:text-3xl text-on-surface leading-tight">
              {best.name}
            </h2>
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${meta.chip}`}>
              {meta.label}
            </span>
            {isBuyer && full?.isVerifiedBuyer && (
              <span className="px-2.5 py-1 rounded-full bg-primary-container text-on-primary-container text-[10px] font-bold">
                Verified
              </span>
            )}
          </div>
          <p className="text-sm text-on-surface-variant flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="material-symbols-outlined text-base text-secondary">location_on</span>
            <span>
              {full?.district || full?.buyerDistrict || 'Location not recorded'}
              {best.distanceKm > 0 && ` · ${best.distanceKm} km away`}
              {best.distanceKm === 0 && isBuyer && ' · collects from your farm'}
              {full?.travelTimeMinutes ? ` · ~${full.travelTimeMinutes} min` : ''}
            </span>
          </p>
        </div>

        <div className="text-right shrink-0">
          <span className={`${labelClass} block`}>Price offered</span>
          <span className="font-headline font-extrabold text-2xl sm:text-3xl text-on-surface">
            ₹{best.pricePerKg}
          </span>
          <span className="text-xs text-on-surface-variant font-semibold block">per kg</span>
          <span className="text-[10px] text-on-surface-variant block mt-0.5">
            {best.isAdvertisedPrice ? 'advertised, not agreed' : 'observed mandi price'}
          </span>
        </div>
      </div>

      {/* The number that decided it. */}
      <div className="relative bg-gradient-to-r from-primary-container to-primary text-on-primary rounded-2xl p-5 sm:p-6 mb-6 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs uppercase tracking-wider font-label text-primary-fixed-dim font-bold">
              Money you keep
            </span>
            <div className="font-headline font-extrabold text-3xl sm:text-4xl tracking-tight mt-0.5">
              {inr(best.expectedMoney)}
            </div>
            <span className="text-xs opacity-85">for {kg(best.matchedQuantityKg)} of {availability?.cropLabel}</span>
          </div>
          <div className="inline-flex items-center gap-2 bg-surface-container-lowest/15 backdrop-blur-md px-3.5 py-2 rounded-xl text-xs font-semibold">
            <span className="material-symbols-outlined text-base text-primary-fixed">local_shipping</span>
            <span>
              {best.whoPaysTransport === 'buyer'
                ? 'Buyer pays freight'
                : `After ${inr(best.transportCost)} freight`}
            </span>
          </div>
        </div>
        <p className="text-xs text-on-primary/80 mt-3 pt-3 border-t border-white/10 leading-relaxed">
          After expected crop loss ({inr(best.estimatedLossValue)})
          {best.transportCost > 0 ? `, freight (${inr(best.transportCost)})` : ''} and selling charges.
          <span className="text-[11px] block mt-1 opacity-70 italic">
            An AgriChain estimate, not a guaranteed sale.
          </span>
        </p>
      </div>

      {/* Why this one won — stated as facts the farmer can check. */}
      <div>
        <h3 className={`${labelClass} mb-3 flex items-center gap-1.5`}>
          <span className="material-symbols-outlined text-sm text-primary">psychology</span>
          Why this is the best option for this lot
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {advantage > 0 && (
            <Reason
              icon="payments"
              title="Most money in hand"
              body={`Leaves you ${inr(advantage)} more than the next best option.`}
            />
          )}
          {best.whoPaysTransport === 'buyer' ? (
            <Reason
              icon="local_shipping"
              title="No freight for you"
              body="The buyer collects from your farm at their own cost."
            />
          ) : (
            <Reason
              icon="route"
              title={`${best.distanceKm} km away`}
              body={`Freight of ${inr(best.transportCost)} is already subtracted above.`}
            />
          )}
          {full?.estimatedLossPercent !== undefined && (
            <Reason
              icon="thermostat"
              title={`${full.estimatedLossPercent}% expected loss`}
              body={`${full.spoilageRisk} spoilage risk${
                full.spoilageFactors?.length ? ` — ${full.spoilageFactors.slice(0, 2).join(', ').toLowerCase()}` : ''
              }.`}
            />
          )}
          {/* The headline claim of the whole product, shown only when true. */}
          {best.isAdvertisedPrice === true && (
            <Reason
              icon="info"
              title="Price is negotiable"
              body="This is what the buyer advertised. You can counter with an offer."
            />
          )}
          {full?.priceFreshness && (
            <Reason
              icon="schedule"
              title={`Price is ${full.priceFreshness.toLowerCase()}`}
              body={`Observed ${full.priceObservationDate}${
                full.priceAgeInDays ? `, ${full.priceAgeInDays} days ago` : ''
              }.`}
            />
          )}
        </div>
      </div>

      <div className="flex gap-3 mt-6 flex-wrap">
        {isBuyer ? (
          <>
            <button
              type="button"
              onClick={() => onAct('chat', best)}
              className="px-6 py-3 rounded-full bg-primary text-on-primary text-sm font-bold hover:opacity-90 flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">chat</span>
              <span>Message this buyer</span>
            </button>
            <button
              type="button"
              onClick={() => onAct('offer', best)}
              className="px-6 py-3 rounded-full bg-surface-container-high text-on-surface text-sm font-bold hover:bg-surface-container"
            >
              Send an offer
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => onAct('mandi', best)}
            className="px-6 py-3 rounded-full bg-primary text-on-primary text-sm font-bold hover:opacity-90 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">trending_up</span>
            <span>See this mandi in Market</span>
          </button>
        )}
      </div>
    </div>
  );
};

const Reason = ({ icon, title, body }) => (
  <div className="flex items-start gap-2.5 p-2.5 rounded-xl text-xs bg-surface-container-low text-on-surface">
    <span className="material-symbols-outlined text-primary text-base shrink-0 mt-0.5">{icon}</span>
    <span><strong>{title}:</strong> {body}</span>
  </div>
);

/**
 * Head-to-head: the best of each channel.
 *
 * The single most useful comparison on the page, because it is the decision the
 * farmer actually faces — sell at the mandi, or sell direct.
 */
const ChannelHeadToHead = ({ bestMandi, bestBuyer }) => {
  if (!bestMandi || !bestBuyer) return null;

  const delta = bestBuyer.expectedMoney - bestMandi.expectedMoney;
  const buyerWins = delta > 0;

  const Side = ({ option, meta, wins }) => (
    <div className={`flex-1 min-w-[180px] p-4 rounded-2xl border-2 ${
      wins ? 'border-primary/40 bg-primary-fixed/10' : 'border-surface-container-high bg-surface-container-low'
    }`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="material-symbols-outlined text-base text-on-surface-variant">{meta.icon}</span>
        <span className={labelClass}>{meta.label}</span>
      </div>
      <p className="font-headline font-bold text-sm text-on-surface truncate">{option.name}</p>
      <p className="font-headline font-extrabold text-xl text-primary mt-1">{inr(option.expectedMoney)}</p>
      <p className="text-[11px] text-on-surface-variant">
        ₹{option.pricePerKg}/kg
        {option.distanceKm > 0 ? ` · ${option.distanceKm} km` : ' · collects from farm'}
      </p>
    </div>
  );

  return (
    <div className="bg-surface-container-lowest rounded-3xl p-5 shadow-sm mb-6">
      <h3 className="font-headline font-bold text-base text-on-surface mb-1">Mandi or direct buyer?</h3>
      <p className="text-xs text-on-surface-variant mb-4">
        The best of each channel, costed the same way.
      </p>
      <div className="flex gap-3 flex-wrap items-stretch">
        <Side option={bestMandi} meta={CHANNEL.mandi} wins={!buyerWins} />
        <div className="flex items-center justify-center px-1">
          <span className="text-xs font-bold text-on-surface-variant">vs</span>
        </div>
        <Side option={bestBuyer} meta={CHANNEL.direct_buyer} wins={buyerWins} />
      </div>
      <p className="text-xs text-on-surface mt-4 p-3 rounded-xl bg-surface-container-low">
        <strong>{buyerWins ? bestBuyer.name : bestMandi.name}</strong> leaves you{' '}
        <strong className="text-primary">{inr(Math.abs(delta))} more</strong>
        {' '}than the best {buyerWins ? 'mandi' : 'direct buyer'}
        {buyerWins && bestBuyer.pricePerKg < bestMandi.pricePerKg
          ? ' — even though its price per kg is lower.'
          : '.'}
      </p>
    </div>
  );
};

/** One row in the full ranking, expandable to the deduction ledger. */
const OptionRow = ({ option, full, rank, isBest, availability }) => {
  const [open, setOpen] = useState(false);
  const meta = CHANNEL[option.channel] || CHANNEL.mandi;

  return (
    <div className={`rounded-2xl border-2 transition-colors ${
      isBest ? 'border-primary/40 bg-primary-fixed/10' : 'border-transparent bg-surface-container-low'
    }`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left p-4 flex items-center gap-4 flex-wrap"
      >
        <span className="font-headline font-extrabold text-base text-on-surface-variant w-6 shrink-0">
          {rank}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-headline font-bold text-sm text-on-surface">{option.name}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${meta.chip}`}>
              {meta.label}
            </span>
            {isBest && (
              <span className="px-2 py-0.5 rounded-full bg-primary text-on-primary text-[10px] font-bold">
                MOST MONEY
              </span>
            )}
          </div>
          <span className="text-[11px] text-on-surface-variant block mt-0.5">
            ₹{option.pricePerKg}/kg {option.isAdvertisedPrice ? 'advertised' : 'observed'}
            {option.distanceKm > 0 ? ` · ${option.distanceKm} km` : ' · collects from farm'}
            {option.whoPaysTransport === 'buyer' ? ' · buyer pays freight' : ''}
          </span>
        </div>

        <div className="text-right shrink-0">
          <span className="font-headline font-extrabold text-lg text-primary tabular-nums">
            {inr(option.expectedMoney)}
          </span>
          <span className="text-[10px] text-on-surface-variant block">you keep</span>
        </div>

        <span className="material-symbols-outlined text-on-surface-variant shrink-0">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && full && (
        <div className="px-4 pb-4">
          <div className="p-3.5 rounded-xl bg-surface-container-lowest">
            <span className={`${labelClass} block mb-1`}>How this figure is reached</span>
            <LedgerRow
              label={`Sale value (${kg(full.matchedQuantityKg)} at ₹${option.pricePerKg})`}
              value={full.grossSaleValue}
            />
            <LedgerRow
              label="Expected crop loss"
              value={full.estimatedLossValue}
              negative
              hint={`${full.estimatedLossPercent}% — ${full.spoilageRisk} risk${
                full.spoilageFactors?.length ? `, ${full.spoilageFactors.slice(0, 2).join(', ').toLowerCase()}` : ''
              }`}
            />
            <LedgerRow
              label="Transport"
              value={full.transportCost}
              negative={full.transportCost > 0}
              hint={full.transportArrangement}
            />
            <LedgerRow
              label="Selling charges"
              value={full.otherCosts}
              negative
              hint={full.otherCostsBreakdown
                ? Object.entries(full.otherCostsBreakdown)
                    .map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').toLowerCase()} ${inr(v)}`)
                    .join(' · ')
                : 'commission, cess, hamali, weighing'}
            />
            <LedgerRow label="Money you keep" value={full.expectedMoney} strong />

            {full.retentionPercent !== undefined && (
              <p className="text-[10px] text-on-surface-variant mt-2">
                You keep {full.retentionPercent}% of the sale value.
                {full.priceFreshness && ` Mandi price observed ${full.priceObservationDate} (${full.priceFreshness.toLowerCase()}).`}
                {full.routeMethod === 'STRAIGHT_LINE_ESTIMATE' && ' Distance is a straight-line estimate, not a road route.'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const SellingOptions = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [user] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  const [listings, setListings] = useState([]);
  const [selectedId, setSelectedId] = useState(location.state?.availabilityId ?? null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/login');
  };

  // Which crops the farmer actually has to sell.
  useEffect(() => {
    (async () => {
      const result = await mp.getMyAvailability({ withStockOnly: 'true' });
      if (!result.ok) { setError(result.message); setLoading(false); return; }
      const rows = result.data || [];
      setListings(rows);
      setSelectedId((current) => current ?? rows[0]?.id ?? null);
      if (!rows.length) setLoading(false);
    })();
  }, []);

  const load = useCallback(async (availabilityId) => {
    if (!availabilityId) return;
    setLoading(true);
    setError('');
    const result = await mp.getSellingOptions(availabilityId);
    setLoading(false);
    if (!result.ok) { setError(result.message); setData(null); return; }
    setData(result.data);
  }, []);

  useEffect(() => { load(selectedId); }, [selectedId, load]);

  /**
   * `combined[]` is a summary shape; the deduction ledger lives on the channel
   * arrays. This resolves one back to its full record.
   */
  const fullOptionFor = useCallback((option) => {
    if (!data || !option) return null;
    if (option.channel === 'mandi') {
      return (data.mandiChannel?.options || []).find((o) => o.marketId === option.marketId) || null;
    }
    return (data.directBuyerChannel?.options || [])
      .find((o) => o.requirementId === option.requirementId) || null;
  }, [data]);

  const combined = data?.combined || [];
  const best = data?.bestOverall || null;
  const runnerUp = combined.length > 1 ? combined[1] : null;

  const bestMandi = useMemo(
    () => combined.find((o) => o.channel === 'mandi') || null,
    [combined]
  );
  const bestBuyer = useMemo(
    () => combined.find((o) => o.channel === 'direct_buyer') || null,
    [combined]
  );

  /** Routes the hero's buttons to where the action actually lives. */
  const handleAct = (action, option) => {
    if (action === 'mandi') { navigate('/market'); return; }
    // Chat and offers are driven from the buyer list, which already holds the
    // dialogs and the availability context they need.
    navigate('/marketplace', { state: { availabilityId: selectedId, focusRequirementId: option.requirementId } });
  };

  const selected = listings.find((l) => l.id === selectedId) || null;

  return (
    <div className="flex min-h-screen bg-surface-container-low font-body">
      <Sidebar onLogout={handleLogout} />

      <div className="ml-72 w-[calc(100%-18rem)]">
        <Header user={user} searchPlaceholder="Search mandis, buyers..." />

        <main className="pt-24 px-8 pb-12">
          <section className="mb-6">
            <button
              type="button"
              onClick={() => navigate('/marketplace')}
              className="text-xs font-bold text-on-surface-variant hover:text-on-surface flex items-center gap-1 mb-3"
            >
              <span className="material-symbols-outlined text-base">arrow_back</span>
              <span>Back to buyers</span>
            </button>
            <h1 className="font-headline font-extrabold text-3xl text-on-surface tracking-tight mb-2">
              All selling options
            </h1>
            <p className="text-sm text-on-surface-variant">
              Every mandi and every direct buyer for this crop, ranked by the money you would actually
              keep — not by the price on the board.
            </p>
          </section>

          {/* Crop selector */}
          {listings.length > 1 && (
            <div className="bg-surface-container-lowest rounded-3xl p-5 shadow-sm mb-6">
              <span className={`${labelClass} block mb-3`}>Which crop are you selling?</span>
              <div className="flex gap-3 flex-wrap">
                {listings.map((listing) => (
                  <button
                    key={listing.id}
                    type="button"
                    onClick={() => setSelectedId(listing.id)}
                    className={`px-4 py-3 rounded-2xl text-left transition-all border-2 ${
                      listing.id === selectedId
                        ? 'border-primary bg-primary/5'
                        : 'border-surface-container-high bg-surface-container-low hover:border-primary/40'
                    }`}
                  >
                    <span className="font-headline font-bold text-sm text-on-surface block">
                      {listing.cropLabel}
                    </span>
                    <span className="text-[11px] text-on-surface-variant block">
                      {kg(listing.availableKg)} to sell
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-error-container text-on-error-container p-4 rounded-2xl mb-6">
              <p className="text-sm font-semibold">{error}</p>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-3 py-20">
              <span className="material-symbols-outlined text-3xl text-primary animate-spin">progress_activity</span>
              <span className="text-sm text-on-surface-variant">Costing every option…</span>
            </div>
          )}

          {!loading && !listings.length && (
            <div className="bg-surface-container-lowest rounded-3xl p-10 text-center shadow-sm">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3 block">inventory_2</span>
              <h2 className="font-headline font-bold text-lg text-on-surface mb-2">
                Tell us what you have to sell
              </h2>
              <p className="text-sm text-on-surface-variant max-w-md mx-auto mb-6">
                Add your crop and how many kilograms you have. We already know your fields and their
                location — only the quantity is new.
              </p>
              <button
                type="button"
                onClick={() => navigate('/marketplace/my-crops')}
                className="px-6 py-3 rounded-full bg-primary text-on-primary text-sm font-bold"
              >
                Add my crop
              </button>
            </div>
          )}

          {!loading && data && (
            <>
              <BestOverall
                best={best}
                full={fullOptionFor(best)}
                runnerUp={runnerUp}
                availability={data.availability}
                onAct={handleAct}
              />

              <ChannelHeadToHead bestMandi={bestMandi} bestBuyer={bestBuyer} />

              {/* Channels that returned nothing say why, rather than vanishing. */}
              {data.mandiChannel?.available === false && (
                <div className="bg-surface-container-lowest rounded-2xl p-4 mb-6 flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-base text-on-surface-variant shrink-0">info</span>
                  <p className="text-xs text-on-surface-variant">
                    No mandi options: {data.mandiChannel.unavailableReason || 'no price data for this crop nearby.'}
                  </p>
                </div>
              )}
              {data.directBuyerChannel?.available === false && (
                <div className="bg-surface-container-lowest rounded-2xl p-4 mb-6 flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-base text-on-surface-variant shrink-0">info</span>
                  <p className="text-xs text-on-surface-variant">
                    No direct buyers are asking for this crop right now.
                  </p>
                </div>
              )}

              {combined.length > 0 && (
                <div className="bg-surface-container-lowest rounded-3xl p-5 shadow-sm mb-6">
                  <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
                    <h3 className="font-headline font-bold text-base text-on-surface">
                      All {combined.length} options, ranked
                    </h3>
                    <span className="text-[11px] text-on-surface-variant">
                      Tap any row for the full working
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant mb-4">
                    Ordered by money kept after transport, expected crop loss and selling charges.
                  </p>

                  <div className="space-y-2.5">
                    {combined.map((option, index) => (
                      <OptionRow
                        key={`${option.channel}-${option.marketId ?? option.requirementId}`}
                        option={option}
                        full={fullOptionFor(option)}
                        rank={index + 1}
                        isBest={index === 0}
                        availability={data.availability}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Conditions feed the spoilage estimate, so they are shown with it. */}
              {data.conditions?.available && (
                <div className="bg-surface-container-lowest rounded-3xl p-5 shadow-sm mb-6">
                  <span className={`${labelClass} block mb-2`}>Weather used for the crop-loss estimate</span>
                  <p className="text-sm text-on-surface">
                    {data.conditions.temperatureC}°C · {data.conditions.humidity}% humidity ·{' '}
                    {data.conditions.description}
                    <span className="text-[11px] text-on-surface-variant block mt-0.5">
                      {data.conditions.source}
                      {data.conditions.observedAt
                        ? ` · observed ${new Date(data.conditions.observedAt).toLocaleString('en-IN')}`
                        : ''}
                    </span>
                  </p>
                </div>
              )}

              {data.disclaimer && (
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  {data.disclaimer}
                  {data.engineVersion ? ` (engine ${data.engineVersion})` : ''}
                </p>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default SellingOptions;

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import ConfirmRemoveDialog from '../components/ConfirmRemoveDialog';
import mp from '../services/marketplaceService';
import { t } from '../utils/translations';
import { getPrimaryUserType } from '../utils/userUtils';

/**
 * Marketplace page that adapts to user role:
 * - Buyers: See available farmers and their crops
 * - Farmers: See buyers looking for crops
 *
 * The farmer's entry point to the marketplace. Reuses the existing AgriChain
 * shell (Sidebar + Header + `bg-surface-container-low` page, `rounded-3xl`
 * `bg-surface-container-lowest` cards, `font-headline` headings,
 * material-symbols icons) so it reads as part of the app rather than a bolt-on.
 *
 * LANGUAGE
 * --------
 * Written for a farmer on a phone: "Price per kg", "Money you keep",
 * "Contact Buyer". No "match confidence", no "net realizable value" - the brief
 * bans those and they would be meaningless to the reader anyway.
 *
 * WHAT THE NUMBERS MEAN
 * ---------------------
 * Buyer prices are ADVERTISED offers, labelled as such everywhere they appear. The
 * ranking is by money-in-hand from the backend, never by the headline price, and
 * the deduction breakdown is shown so a farmer can see why a cheaper buyer won.
 */

/** One deduction line in the money breakdown. */
const LedgerRow = ({ label, value, negative = false, strong = false, hint = null }) => (
  <div className="flex items-baseline justify-between gap-3 py-1.5">
    <span className={`text-xs ${strong ? 'font-bold text-on-surface' : 'text-on-surface-variant'}`}>
      {label}
      {hint && <span className="block text-[10px] text-on-surface-variant">{hint}</span>}
    </span>
    <span
      className={`shrink-0 tabular-nums ${
        strong ? 'font-headline font-extrabold text-base text-on-surface' : 'text-xs font-semibold text-on-surface'
      }`}
    >
      {negative && value !== null ? '− ' : ''}{mp.formatRupees(value)}
    </span>
  </div>
);

/** Verification badge. Only ever rendered from the backend's status. */
const VerificationBadge = ({ status, label }) => (
  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${mp.verificationBadgeClass(status)}`}>
    {status === 'verified' && (
      <span className="material-symbols-outlined text-[11px] align-middle mr-0.5">verified</span>
    )}
    {label}
  </span>
);

/**
 * The answer, before the farmer scrolls.
 *
 * The buyer cards below already carry a "MOST MONEY" badge, but it only reads as
 * a recommendation once you have compared two cards yourself. This states the
 * conclusion outright — who to sell to, what you keep, and why it beat a higher
 * advertised price — which is the same job the Market page's TopRecommendation
 * does for mandis.
 */
const BestBuyerBanner = ({ best, runnerUp, onCompare, onChat }) => {
  if (!best || !best.isComplete) return null;

  const advantage = runnerUp?.isComplete ? best.expectedMoney - runnerUp.expectedMoney : null;
  // The counter-intuitive case worth calling out: a lower price per kg that still
  // leaves more money. This is the entire thesis of the ranking.
  const beatsHigherPrice = runnerUp?.isComplete
    && runnerUp.offeredPricePerKg > best.offeredPricePerKg;

  return (
    <div className="relative overflow-hidden bg-surface-container-lowest rounded-3xl p-6 shadow-md mb-6">
      <div className="absolute top-0 right-0 w-60 h-60 bg-gradient-to-bl from-primary-fixed/30 via-transparent to-transparent pointer-events-none rounded-bl-full" />

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary text-on-primary text-[11px] font-headline font-extrabold uppercase tracking-widest mb-3">
            <span className="text-xs">🏆</span> BEST BUYER FOR THIS CROP
          </div>
          <h2 className="font-headline font-extrabold text-2xl text-on-surface leading-tight">
            {best.buyerName}
          </h2>
          <p className="text-sm text-on-surface-variant flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="material-symbols-outlined text-base text-secondary">location_on</span>
            <span>
              {best.buyerDistrict || 'Location not recorded'}
              {best.distanceKm > 0 ? ` · ${best.distanceKm} km away` : ''}
              {best.whoPaysTransport === 'buyer' ? ' · collects from your farm' : ' · you deliver'}
            </span>
          </p>
        </div>

        <div className="text-right shrink-0">
          <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider block">
            Money you keep
          </span>
          <span className="font-headline font-extrabold text-3xl text-primary leading-tight block">
            {mp.formatRupees(best.expectedMoney)}
          </span>
          <span className="text-[11px] text-on-surface-variant">
            for {mp.formatQuantity(best.matchedQuantityKg)} at ₹{best.offeredPricePerKg}/kg
          </span>
        </div>
      </div>

      <div className="relative flex flex-wrap gap-2.5 mt-5">
        {advantage > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-low text-xs text-on-surface">
            <span className="material-symbols-outlined text-base text-primary">payments</span>
            <span>
              <strong>{mp.formatRupees(advantage)} more</strong> than the next buyer
            </span>
          </span>
        )}
        {beatsHigherPrice && (
          <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-fixed/20 text-xs text-on-surface">
            <span className="material-symbols-outlined text-base text-primary">info</span>
            <span>
              Beats a higher ₹{runnerUp.offeredPricePerKg}/kg offer after freight and crop loss
            </span>
          </span>
        )}
        {best.whoPaysTransport === 'buyer' && (
          <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-low text-xs text-on-surface">
            <span className="material-symbols-outlined text-base text-primary">local_shipping</span>
            <span>No freight cost for you</span>
          </span>
        )}
      </div>

      <div className="relative flex gap-3 mt-5 flex-wrap">
        <button type="button" onClick={() => onChat(best)}
          className="px-5 py-2.5 rounded-full bg-primary text-on-primary text-sm font-bold hover:opacity-90 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-base">chat</span>
          <span>Message {best.buyerName?.split(' ').slice(0, 2).join(' ')}</span>
        </button>
        <button type="button" onClick={onCompare}
          className="px-5 py-2.5 rounded-full bg-surface-container-high text-on-surface text-sm font-bold hover:bg-surface-container flex items-center gap-1.5">
          <span className="material-symbols-outlined text-base">balance</span>
          <span>Compare against mandis</span>
        </button>
      </div>
    </div>
  );
};

/**
 * One buyer card, with the full money breakdown.
 */
const BuyerCard = ({ option, onChat, onOffer, onViewBuyer, busy }) => {
  const [showWorking, setShowWorking] = useState(false);

  return (
    <div
      className={`p-5 rounded-2xl transition-colors ${
        option.recommended
          ? 'bg-primary-fixed/20 border-2 border-primary/40'
          : 'bg-surface-container-low border-2 border-transparent'
      }`}
    >
      {/* Who */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-headline font-bold text-base text-on-surface">
              {option.buyerName}
            </span>
            <VerificationBadge
              status={option.verificationStatus}
              label={option.isVerifiedBuyer ? 'Verified' : 'Not verified'}
            />
            {option.recommended && (
              <span className="px-2 py-0.5 rounded-full bg-primary text-on-primary text-[10px] font-bold">
                MOST MONEY
              </span>
            )}
          </div>
          <span className="text-xs text-on-surface-variant block mt-0.5">
            {option.buyerType?.replace(/_/g, ' ')}
            {option.buyerDistrict ? ` • ${option.buyerDistrict}` : ''}
            {option.distanceKm !== null ? ` • ${option.distanceKm} km away` : ''}
          </span>
        </div>
      </div>

      {/* The headline: what the farmer keeps, not what the buyer advertises. */}
      <div className="flex items-end justify-between gap-4 mb-3 pb-3 border-b border-surface-container">
        <div>
          <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider block">
            Money you keep
          </span>
          {option.isComplete ? (
            <span className="font-headline font-extrabold text-2xl text-primary leading-tight">
              {mp.formatRupees(option.expectedMoney)}
            </span>
          ) : (
            <span className="font-headline font-bold text-base text-on-surface-variant">
              Cannot be worked out
            </span>
          )}
          <span className="text-[11px] text-on-surface-variant block">
            for {mp.formatQuantity(option.matchedQuantityKg)}
          </span>
        </div>
        <div className="text-right shrink-0">
          <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider block">
            Price per kg
          </span>
          <span className="font-headline font-bold text-lg text-on-surface">
            ₹{option.offeredPricePerKg}
          </span>
          {/* An advertised ask, never a settled price. */}
          <span className="text-[10px] text-on-surface-variant block">
            advertised{option.priceNegotiable ? ' • negotiable' : ''}
          </span>
        </div>
      </div>

      {/* Why this buyer ranks where it does */}
      {option.isHighestPriceButNotBest && (
        <div className="flex items-start gap-2 p-2.5 mb-3 rounded-xl bg-amber-500/10">
          <span className="material-symbols-outlined text-amber-700 text-base shrink-0">info</span>
          <p className="text-[11px] text-amber-950 leading-relaxed">
            This buyer offers the highest price per kg, but after transport and crop loss you keep
            less than the buyer marked <strong>Most Money</strong>.
          </p>
        </div>
      )}

      {!option.isComplete && option.incompleteReasons?.length > 0 && (
        <div className="flex items-start gap-2 p-2.5 mb-3 rounded-xl bg-amber-500/10">
          <span className="material-symbols-outlined text-amber-700 text-base shrink-0">warning</span>
          <p className="text-[11px] text-amber-950 leading-relaxed">
            {option.incompleteReasons.join(' ')}
          </p>
        </div>
      )}

      {/* Key facts */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-3 text-xs">
        <span className="text-on-surface-variant">Wants by</span>
        <span className="font-semibold text-on-surface text-right">
          {mp.formatShortDate(option.requiredBy)}
        </span>
        <span className="text-on-surface-variant">Transport</span>
        <span className="font-semibold text-on-surface text-right">
          {option.whoPaysTransport === 'buyer' ? 'Buyer collects' : 'You deliver'}
        </span>
        <span className="text-on-surface-variant">Crop loss on the way</span>
        <span className="font-semibold text-on-surface text-right">
          {option.estimatedLossPercent}% ({option.spoilageRisk})
        </span>
      </div>

      {/* Show your working */}
      <button
        type="button"
        onClick={() => setShowWorking((v) => !v)}
        className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1 mb-2"
        aria-expanded={showWorking}
      >
        <span>{showWorking ? 'Hide' : 'How is this worked out?'}</span>
        <span className={`material-symbols-outlined text-sm transition-transform ${showWorking ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>

      {showWorking && (
        <div className="p-3 mb-3 rounded-xl bg-surface-container-lowest">
          <LedgerRow label={`Sale value (${mp.formatQuantity(option.matchedQuantityKg)})`} value={option.grossSaleValue} />
          <LedgerRow label="Crop lost on the way" value={option.estimatedLossValue} negative
            hint={`${option.estimatedLossPercent}% — ${option.spoilageFactors?.slice(0, 2).join(', ') || 'estimated'}`} />
          <LedgerRow
            label="Transport"
            value={option.transportCost}
            negative={option.transportCost > 0}
            hint={option.whoPaysTransport === 'buyer' ? 'Buyer pays — nothing for you' : option.transportArrangement}
          />
          <LedgerRow label="Mandi-style charges" value={option.otherCosts} negative />
          <div className="border-t border-surface-container mt-1 pt-1">
            <LedgerRow label="Money you keep" value={option.expectedMoney} strong />
          </div>
          {option.assumptions?.length > 0 && (
            <ul className="mt-2 pt-2 border-t border-surface-container space-y-1">
              {option.assumptions.map((a, i) => (
                <li key={i} className="text-[10px] text-on-surface-variant leading-relaxed">• {a}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onChat(option)}
          disabled={busy}
          className="flex-1 min-w-[120px] px-4 py-2.5 rounded-full bg-primary text-on-primary text-xs font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          <span className="material-symbols-outlined text-base">chat</span>
          <span>Contact Buyer</span>
        </button>
        <button
          type="button"
          onClick={() => onOffer(option)}
          disabled={busy}
          className="flex-1 min-w-[110px] px-4 py-2.5 rounded-full bg-surface-container-high hover:bg-surface-container text-on-surface text-xs font-bold disabled:opacity-50"
        >
          Send Offer
        </button>
        <button
          type="button"
          onClick={() => onViewBuyer(option)}
          className="px-3 py-2.5 rounded-full hover:bg-surface-container text-on-surface-variant text-xs font-semibold"
        >
          Details
        </button>
      </div>
    </div>
  );
};

/** Send-offer dialog, matching the BatchSetupDialog shell. */
const OfferDialog = ({ open, option, availability, onSend, onClose, busy, error }) => {
  const [quantityKg, setQuantityKg] = useState('');
  const [pricePerKg, setPricePerKg] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (open && option) {
      setQuantityKg(String(option.matchedQuantityKg ?? ''));
      setPricePerKg(String(option.offeredPricePerKg ?? ''));
      setMessage('');
    }
  }, [open, option]);

  if (!open || !option) return null;

  const qty = Number(quantityKg);
  const price = Number(pricePerKg);
  const valid = qty > 0 && price > 0;
  const total = valid ? qty * price : 0;

  const inputClass =
    'w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-surface-container-high ' +
    'text-sm text-on-surface font-medium focus:outline-none focus:border-primary';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/40"
      role="dialog" aria-modal="true">
      <div className="bg-surface-container-lowest w-full sm:max-w-md max-h-[92vh] rounded-t-3xl sm:rounded-3xl shadow-xl flex flex-col">
        <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-surface-container">
          <div>
            <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider">
              Send offer to
            </span>
            <h2 className="font-headline font-extrabold text-lg text-on-surface">{option.buyerName}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-9 h-9 rounded-xl hover:bg-surface-container flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-error-container text-on-error-container text-xs">{error}</div>
          )}

          <div>
            <label className="block text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
              How many kg will you sell?
            </label>
            <input type="number" min="1" inputMode="numeric" value={quantityKg}
              onChange={(e) => setQuantityKg(e.target.value)} className={inputClass} />
            <p className="text-[11px] text-on-surface-variant mt-1">
              You have {mp.formatQuantity(availability?.availableKg)}. They still need{' '}
              {mp.formatQuantity(option.requirementQuantityRemainingKg)}.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
              Your price per kg (₹)
            </label>
            <input type="number" min="1" step="0.5" inputMode="decimal" value={pricePerKg}
              onChange={(e) => setPricePerKg(e.target.value)} className={inputClass} />
            <p className="text-[11px] text-on-surface-variant mt-1">
              They advertised ₹{option.offeredPricePerKg}/kg
              {option.priceNegotiable ? ' and said the price is negotiable.' : '.'}
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
              Message (optional)
            </label>
            <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Grade A, picked this morning" className={inputClass} />
          </div>

          {valid && (
            <div className="p-3 rounded-xl bg-primary-fixed/20">
              <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider block">
                Total you are asking for
              </span>
              <span className="font-headline font-extrabold text-xl text-on-surface">
                {mp.formatRupees(total)}
              </span>
              <span className="text-[10px] text-on-surface-variant block mt-0.5">
                Before transport and crop loss. Nothing is agreed until the buyer accepts.
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 pt-4 border-t border-surface-container">
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-on-surface-variant hover:bg-surface-container">
            Cancel
          </button>
          <button type="button" disabled={!valid || busy}
            onClick={() => onSend({ quantityKg: qty, pricePerKg: price, message })}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold ${
              valid && !busy ? 'bg-primary text-on-primary hover:opacity-90'
                : 'bg-surface-container text-on-surface-variant cursor-not-allowed'
            }`}>
            {busy ? 'Sending…' : 'Send Offer'}
          </button>
        </div>
      </div>
    </div>
  );
};

const BuyerMarketplace = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  // Detect user type and redirect buyers to their dashboard
  useEffect(() => {
    const userType = getPrimaryUserType();
    if (userType === 'buyer') {
      // Buyers should use the buyer dashboard, not the farmer marketplace
      navigate('/buyer', { replace: true });
    }
  }, [navigate]);

  const [listings, setListings] = useState([]);
  const [selectedListingId, setSelectedListingId] = useState(null);
  const [buyers, setBuyers] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [offerDialog, setOfferDialog] = useState({ open: false, option: null, error: '' });
  const [filters, setFilters] = useState({ verifiedOnly: false });
  // Removing a crop listing. `selectMode` exists so a single tap on a chip still
  // means "show me this crop's buyers" — the common action — and only becomes a
  // tick box once the farmer has explicitly asked to select.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedForRemoval, setSelectedForRemoval] = useState([]);
  const [removeDialog, setRemoveDialog] = useState({ open: false, error: '' });

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/login');
  };

  const selectedListing = useMemo(
    () => listings.find((l) => l.id === selectedListingId) || null,
    [listings, selectedListingId]
  );

  const listingsForRemoval = useMemo(
    () => listings.filter((l) => selectedForRemoval.includes(l.id)),
    [listings, selectedForRemoval]
  );

  // Reserved crop cannot go: a buyer is relying on that quantity.
  const promisedListings = useMemo(
    () => listingsForRemoval.filter((l) => l.reservedKg > 0),
    [listingsForRemoval]
  );
  const removableListings = useMemo(
    () => listingsForRemoval.filter((l) => l.reservedKg <= 0),
    [listingsForRemoval]
  );

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedForRemoval([]);
  };

  const toggleForRemoval = (id) => {
    setSelectedForRemoval((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  };

  /**
   * Loads the farmer's crop listings.
   *
   * Also used after a removal, so the chosen crop is re-resolved rather than left
   * pointing at a listing that is no longer on the market: the current choice is
   * kept when it survived, otherwise the first remaining crop is selected.
   */
  const loadListings = useCallback(async ({ preferId = null } = {}) => {
    const result = await mp.getMyAvailability({ withStockOnly: 'true' });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setListings(result.data);
    setSelectedListingId((current) => {
      if (preferId && result.data.some((l) => l.id === preferId)) return preferId;
      if (current && result.data.some((l) => l.id === current)) return current;
      return result.data[0]?.id ?? null;
    });
  }, []);

  // Load the farmer's crop listings.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Context passed from the Market page's "Explore Direct Buyers" entry point,
      // so the farmer does not re-pick a crop they already chose.
      await loadListings({ preferId: location.state?.availabilityId ?? null });
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [loadListings, location.state]);

  // Compare buyers for the chosen crop.
  const loadBuyers = useCallback(async (availabilityId) => {
    if (!availabilityId) { setBuyers([]); setComparison(null); return; }
    setLoading(true);
    setError('');
    const result = await mp.getTopBuyers(availabilityId, {
      verifiedOnly: filters.verifiedOnly ? 'true' : undefined
    });
    if (!result.ok) {
      setError(result.message);
      setBuyers([]);
    } else {
      setBuyers(result.data.buyers || []);
      setComparison(result.data.comparison || null);
    }
    setLoading(false);
  }, [filters.verifiedOnly]);

  useEffect(() => { loadBuyers(selectedListingId); }, [selectedListingId, loadBuyers]);

  const handleChat = async (option) => {
    setBusy(true);
    setError('');
    const result = await mp.startConversation({
      requirementId: option.requirementId,
      availabilityId: selectedListingId
    });
    setBusy(false);
    if (!result.ok) { setError(result.message); return; }
    navigate(`/marketplace/messages/${result.data.id}`);
  };

  const handleSendOffer = async ({ quantityKg, pricePerKg, message }) => {
    setBusy(true);
    setOfferDialog((d) => ({ ...d, error: '' }));
    const result = await mp.sendOffer({
      requirementId: offerDialog.option.requirementId,
      availabilityId: selectedListingId,
      quantityKg, pricePerKg, message,
      deliveryTerms: offerDialog.option.whoPaysTransport === 'buyer'
        ? 'buyer_pickup' : 'farmer_delivers'
    });
    setBusy(false);
    if (!result.ok) {
      setOfferDialog((d) => ({ ...d, error: result.message }));
      return;
    }
    setOfferDialog({ open: false, option: null, error: '' });
    setNotice('Offer sent. You will be told as soon as the buyer replies.');
    loadBuyers(selectedListingId);
  };

  /**
   * Removes every ticked listing, then reports exactly what happened.
   *
   * Each id is a separate request because the API deletes one listing at a time, so
   * a partial outcome is possible: whatever succeeded is removed, and the failures
   * stay ticked with their own reason shown, rather than the whole batch being
   * reported as failed.
   */
  const handleRemoveSelected = async () => {
    const ids = removableListings.map((l) => l.id);
    if (!ids.length) return;

    setBusy(true);
    setRemoveDialog((d) => ({ ...d, error: '' }));
    const results = await Promise.all(ids.map((id) => mp.deleteAvailability(id)));
    setBusy(false);

    const failed = ids.filter((_, i) => !results[i].ok);
    const removedCount = ids.length - failed.length;

    if (removedCount > 0) {
      setNotice(
        `${removedCount === 1 ? 'Crop removed' : `${removedCount} crops removed`}. ` +
        'Buyers can no longer make offers on it.'
      );
      await loadListings();
    }

    if (failed.length) {
      // Keep the failures ticked so the farmer can retry them without re-selecting.
      setSelectedForRemoval(failed);
      const firstMessage = results.find((r) => !r.ok)?.message;
      setRemoveDialog({ open: true, error: firstMessage || 'Some crops could not be removed.' });
      return;
    }

    setRemoveDialog({ open: false, error: '' });
    exitSelectMode();
  };

  return (
    <div className="flex min-h-screen bg-surface-container-low font-body">
      <Sidebar onLogout={handleLogout} />

      <div className="ml-72 w-[calc(100%-18rem)]">
        <Header user={user} searchPlaceholder="Search buyers, crops, or district..." />

        <main className="relative pt-24 px-8 pb-12">
          <div className="absolute -top-8 -left-20 w-96 h-96 rounded-full bg-primary-fixed/20 blur-3xl pointer-events-none" />
          <div className="relative">

            {/* Page header */}
            <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-high text-primary font-semibold text-xs mb-2">
                  <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
                  <span>Direct Buyers</span>
                </div>
                <h1 className="font-headline font-extrabold text-3xl sm:text-4xl text-on-surface tracking-tight">
                  Buyers Looking for Your Crop
                </h1>
                <p className="font-body text-base text-on-surface-variant max-w-2xl mt-1.5">
                  Sell straight to businesses instead of the mandi. Buyers are ordered by the money
                  you would actually keep, after transport and crop loss — not by who advertises the
                  highest price.
                </p>
              </div>
              <button type="button" onClick={() => navigate('/marketplace/deals')}
                className="px-5 py-2.5 rounded-full bg-surface-container-lowest shadow-sm text-on-surface text-xs font-bold shrink-0 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-base">handshake</span>
                <span>My Deals</span>
              </button>
            </section>

            {notice && (
              <div className="mb-6 flex items-center justify-between gap-3 p-4 rounded-2xl bg-primary-fixed/20">
                <span className="text-xs text-on-surface">{notice}</span>
                <button type="button" onClick={() => setNotice('')} className="text-xs font-bold underline shrink-0">
                  Dismiss
                </button>
              </div>
            )}

            {error && (
              <div className="mb-6 flex items-center justify-between gap-3 p-4 rounded-2xl bg-error-container text-on-error-container">
                <span className="text-xs">{error}</span>
                <button type="button" onClick={() => setError('')} className="text-xs font-bold underline shrink-0">
                  Dismiss
                </button>
              </div>
            )}

            {/* No crop listed yet */}
            {!loading && listings.length === 0 && (
              <div className="bg-surface-container-lowest rounded-3xl p-10 shadow-sm flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-3xl bg-primary-container text-on-primary flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-3xl">inventory_2</span>
                </div>
                <h2 className="font-headline font-bold text-xl text-on-surface mb-1.5">
                  Tell us what you have to sell
                </h2>
                <p className="text-sm text-on-surface-variant max-w-md mb-6">
                  Add your crop and how many kilograms you have. We already know your fields and
                  their location — you only need to enter the quantity.
                </p>
                <button type="button" onClick={() => navigate('/marketplace/my-crops')}
                  className="px-6 py-3 rounded-xl bg-primary text-on-primary text-sm font-bold hover:opacity-90">
                  Add my crop
                </button>
              </div>
            )}

            {/* Crop selector, doubling as the place crops are removed from sale */}
            {listings.length > 0 && (
              <div className="bg-surface-container-lowest rounded-3xl p-5 shadow-sm mb-8">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider">
                    {selectMode ? 'Tick the crops to remove' : 'Which crop are you selling?'}
                  </span>
                  <button type="button"
                    onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold shrink-0 flex items-center gap-1 ${
                      selectMode
                        ? 'bg-surface-container-high text-on-surface'
                        : 'text-on-surface-variant hover:bg-surface-container'
                    }`}>
                    <span className="material-symbols-outlined text-sm">
                      {selectMode ? 'close' : 'check_box'}
                    </span>
                    <span>{selectMode ? 'Cancel' : 'Select'}</span>
                  </button>
                </div>

                <div className="flex gap-3 flex-wrap">
                  {listings.map((listing) => {
                    const ticked = selectedForRemoval.includes(listing.id);
                    // In select mode a chip is a real checkbox, so the keyboard and
                    // screen readers get the tick state for free.
                    const chipBody = (
                      <>
                        <span className="font-headline font-bold text-sm text-on-surface block">
                          {listing.cropLabel}
                        </span>
                        <span className="text-[11px] text-on-surface-variant block">
                          {mp.formatQuantity(listing.availableKg)} to sell
                        </span>
                        {listing.reservedKg > 0 && (
                          <span className="text-[10px] text-secondary block">
                            {listing.reservedKg} kg already promised
                          </span>
                        )}
                      </>
                    );

                    if (selectMode) {
                      return (
                        <label key={listing.id}
                          className={`flex items-start gap-2.5 px-4 py-3 rounded-2xl text-left cursor-pointer transition-all border-2 ${
                            ticked
                              ? 'border-error bg-error/5'
                              : 'border-surface-container-high bg-surface-container-low hover:border-error/40'
                          }`}>
                          <input type="checkbox" checked={ticked}
                            onChange={() => toggleForRemoval(listing.id)}
                            className="mt-0.5 rounded shrink-0" />
                          <span className="block">{chipBody}</span>
                        </label>
                      );
                    }

                    return (
                      <button key={listing.id} type="button" onClick={() => setSelectedListingId(listing.id)}
                        className={`px-4 py-3 rounded-2xl text-left transition-all border-2 ${
                          listing.id === selectedListingId
                            ? 'border-primary bg-primary/5'
                            : 'border-surface-container-high bg-surface-container-low hover:border-primary/40'
                        }`}>
                        {chipBody}
                      </button>
                    );
                  })}
                  {!selectMode && (
                    <button type="button" onClick={() => navigate('/marketplace/my-crops')}
                      className="px-4 py-3 rounded-2xl border-2 border-dashed border-surface-container-high text-on-surface-variant hover:border-primary/40 text-xs font-bold">
                      + Add crop
                    </button>
                  )}
                </div>

                {selectMode ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-surface-container">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-on-surface">
                        {selectedForRemoval.length} selected
                      </span>
                      <button type="button"
                        onClick={() => setSelectedForRemoval(
                          selectedForRemoval.length === listings.length ? [] : listings.map((l) => l.id)
                        )}
                        className="text-[11px] font-bold text-primary hover:underline">
                        {selectedForRemoval.length === listings.length ? 'Clear all' : 'Select all'}
                      </button>
                    </div>
                    <button type="button" disabled={selectedForRemoval.length === 0}
                      onClick={() => setRemoveDialog({ open: true, error: '' })}
                      className={`px-5 py-2.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                        selectedForRemoval.length === 0
                          ? 'bg-surface-container text-on-surface-variant cursor-not-allowed'
                          : 'bg-error text-on-error hover:opacity-90'
                      }`}>
                      <span className="material-symbols-outlined text-base">delete</span>
                      <span>
                        Remove{selectedForRemoval.length > 0 ? ` (${selectedForRemoval.length})` : ''}
                      </span>
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 mt-4 pt-3 border-t border-surface-container cursor-pointer">
                    <input type="checkbox" checked={filters.verifiedOnly}
                      onChange={(e) => setFilters((f) => ({ ...f, verifiedOnly: e.target.checked }))}
                      className="rounded" />
                    <span className="text-xs text-on-surface">Only show verified businesses</span>
                  </label>
                )}
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center gap-3 py-20">
                <span className="material-symbols-outlined text-3xl text-primary animate-spin">progress_activity</span>
                <span className="text-sm text-on-surface-variant">Finding buyers for your crop…</span>
              </div>
            )}

            {/* No buyers */}
            {!loading && listings.length > 0 && buyers.length === 0 && !error && (
              <div className="bg-surface-container-lowest rounded-3xl p-10 shadow-sm flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-surface-container-high text-on-surface-variant flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-2xl">search_off</span>
                </div>
                <h2 className="font-headline font-bold text-lg text-on-surface mb-1">
                  No buyers want {selectedListing?.cropLabel} right now
                </h2>
                <p className="text-sm text-on-surface-variant max-w-md mb-5">
                  Nobody has posted a requirement for this crop yet. Check the mandi prices meanwhile,
                  or browse everything buyers are asking for.
                </p>
                <div className="flex gap-3 flex-wrap justify-center">
                  <button type="button" onClick={() => navigate('/market')}
                    className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-bold">
                    See mandi prices
                  </button>
                  <button type="button" onClick={() => navigate('/marketplace/browse')}
                    className="px-5 py-2.5 rounded-xl bg-surface-container-high text-on-surface text-xs font-bold">
                    Browse all requirements
                  </button>
                </div>
              </div>
            )}

            {/* Buyers */}
            {!loading && buyers.length > 0 && (
              <>
                <BestBuyerBanner
                  best={buyers[0]}
                  runnerUp={buyers[1]}
                  onChat={handleChat}
                  onCompare={() => navigate('/marketplace/compare', {
                    state: { availabilityId: selectedListingId }
                  })}
                />

                {comparison?.note && (
                  <p className="text-xs text-on-surface-variant mb-4 flex items-start gap-1.5">
                    <span className="material-symbols-outlined text-sm shrink-0">sort</span>
                    <span>{comparison.note}</span>
                  </p>
                )}
                {comparison?.quantityWarning && (
                  <div className="mb-4 flex items-start gap-2 p-3 rounded-2xl bg-amber-500/10">
                    <span className="material-symbols-outlined text-amber-700 text-base shrink-0">info</span>
                    <p className="text-[11px] text-amber-950">{comparison.quantityWarning}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
                  {buyers.map((option) => (
                    <BuyerCard
                      key={option.requirementId}
                      option={option}
                      busy={busy}
                      onChat={handleChat}
                      onOffer={(o) => setOfferDialog({ open: true, option: o, error: '' })}
                      onViewBuyer={() => navigate('/marketplace/compare', {
                        state: { availabilityId: selectedListingId }
                      })}
                    />
                  ))}
                </div>

                <div className="bg-surface-container-lowest rounded-3xl p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-xs text-on-surface-variant">
                    Want to compare these buyers against the mandi as well?
                  </p>
                  <button type="button"
                    onClick={() => navigate('/marketplace/compare', { state: { availabilityId: selectedListingId } })}
                    className="px-5 py-2.5 rounded-full bg-gradient-to-r from-primary-container to-secondary text-on-primary text-xs font-headline font-bold shrink-0 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-base">balance</span>
                    <span>Compare all selling options</span>
                  </button>
                </div>
              </>
            )}

            <p className="text-[11px] text-on-surface-variant mt-6 leading-relaxed">
              Prices shown are what each buyer advertised, not agreed sales. Transport and crop-loss
              figures are AgriChain estimates. Payment and handover happen directly between you and
              the buyer, outside AgriChain.
            </p>
          </div>
        </main>
      </div>

      {/* Crop promised to an agreed deal is named up front: the backend refuses
          those, and saying so beats showing the farmer three errors afterwards. */}
      <ConfirmRemoveDialog
        open={removeDialog.open}
        title={`Remove ${listingsForRemoval.length === 1 ? 'this crop' : `these ${listingsForRemoval.length} crops`}?`}
        description={
          `Buyers will stop seeing ${listingsForRemoval.length === 1 ? 'it' : 'them'} and can make ` +
          'no new offers. Deals you have already agreed are not affected.'
        }
        items={listingsForRemoval.map((listing) => ({
          key: listing.id,
          primary: listing.cropLabel,
          secondary: listing.farmName,
          trailing: mp.formatQuantity(listing.availableKg)
        }))}
        warning={promisedListings.length > 0 ? (
          <>
            {promisedListings.map((l) => `${l.cropLabel} (${l.reservedKg} kg promised)`).join(', ')}
            {promisedListings.length === 1 ? ' is' : ' are'} promised to an agreed deal, so{' '}
            {promisedListings.length === 1 ? 'it' : 'they'} cannot be removed yet. Cancel or
            complete the deal first.
            {removableListings.length > 0 && ` The other ${removableListings.length === 1 ? 'crop' : `${removableListings.length} crops`} will still be removed.`}
          </>
        ) : null}
        confirmLabel={`Remove ${removableListings.length || ''}`.trim()}
        cancelLabel={`Keep ${listingsForRemoval.length === 1 ? 'it' : 'them'}`}
        confirmDisabled={removableListings.length === 0}
        busy={busy}
        error={removeDialog.error}
        onConfirm={handleRemoveSelected}
        onClose={() => setRemoveDialog({ open: false, error: '' })}
      />

      <OfferDialog
        open={offerDialog.open}
        option={offerDialog.option}
        availability={selectedListing}
        busy={busy}
        error={offerDialog.error}
        onSend={handleSendOffer}
        onClose={() => setOfferDialog({ open: false, option: null, error: '' })}
      />
    </div>
  );
};

export default BuyerMarketplace;

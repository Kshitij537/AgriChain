import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import mp from '../services/marketplaceService';
import { getCrops } from '../services/marketService';
import {
  ContactDialog, OfferDialog, eligibleRequirements
} from '../components/marketplace/ApproachDialogs';

/**
 * Browse Farmers — the buyer's side of the marketplace.
 *
 * Lists every farmer's sellable crop from GET /api/marketplace/availability, and
 * lets the buyer open a conversation or send an offer on any of it.
 *
 * EVERY APPROACH IS ANCHORED TO A REQUIREMENT
 * -------------------------------------------
 * The backend will not let a buyer contact an arbitrary farmer, and it will not
 * accept an offer that is not tied to one of the buyer's own open requirements
 * for that same crop (see conversationService.findOrCreate and
 * offerService.resolveContext). That is a deliberate rule, not a limitation: it
 * is what stops the marketplace becoming a cold-contact list, and it means every
 * thread a farmer receives already says what it is about.
 *
 * So both actions here first ask which requirement the approach is for, offering
 * only the buyer's open requirements for that crop. When there are none, the page
 * says so plainly and links to the form, rather than failing at the API.
 *
 * DISTANCES ARE ESTIMATES, AND SOMETIMES ABSENT
 * ---------------------------------------------
 * The backend measures straight-line distance from the buyer's registered
 * business location and never sends farm coordinates. A buyer with no saved
 * location gets listings with no distances; `meta.distanceAvailable` reports
 * which, and the page explains it instead of rendering a blank.
 */

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-surface-container-high ' +
  'text-sm text-on-surface font-medium focus:outline-none focus:border-primary';
const labelClass =
  'block text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5';

const GRADE_OPTIONS = [
  ['', 'Any grade'],
  ['A+', 'A+ only'],
  ['A', 'A or better'],
  ['B', 'B or better'],
  ['C', 'C or better']
];

/** Harvest states that read as "ready now" versus "coming later". */
const readyChipClass = (isSellableNow) =>
  isSellableNow
    ? 'bg-primary-container text-on-primary-container'
    : 'bg-surface-container-high text-on-surface-variant';

/** One farmer's crop, with what a buyer needs to judge it. */
const ListingCard = ({ listing, onContact, onOffer }) => (
  <div className="bg-surface-container-lowest rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between mb-4 gap-3">
      <div className="min-w-0">
        <h3 className="font-headline font-bold text-lg text-on-surface truncate">
          {listing.farmerName}
        </h3>
        <p className="text-xs text-on-surface-variant">
          {listing.farmLocation || 'Location not recorded'}
        </p>
      </div>
      {listing.straightLineKm !== null && (
        <span className="px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container text-xs font-bold whitespace-nowrap">
          ~{listing.straightLineKm} km
        </span>
      )}
    </div>

    <div className="bg-surface-container-low rounded-2xl p-4 mb-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <span className="text-[11px] font-bold text-on-surface-variant uppercase block mb-1">Crop</span>
          <span className="text-sm font-bold text-on-surface">
            {listing.cropLabel || listing.crop}
            {listing.variety ? <span className="font-medium opacity-70"> · {listing.variety}</span> : null}
          </span>
        </div>
        <div>
          <span className="text-[11px] font-bold text-on-surface-variant uppercase block mb-1">Available</span>
          <span className="text-sm font-bold text-on-surface">
            {mp.formatQuantity(listing.availableKg)}
          </span>
        </div>
        <div>
          <span className="text-[11px] font-bold text-on-surface-variant uppercase block mb-1">Grade</span>
          <span className="text-sm font-bold text-on-surface">
            {listing.qualityGrade ? `Grade ${listing.qualityGrade}` : 'Ungraded'}
          </span>
        </div>
        <div>
          <span className="text-[11px] font-bold text-on-surface-variant uppercase block mb-1">Harvest</span>
          <span className="text-sm font-bold text-on-surface">
            {listing.harvestDate ? mp.formatShortDate(listing.harvestDate) : '—'}
          </span>
        </div>
      </div>
    </div>

    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${readyChipClass(listing.isSellableNow)}`}>
        {listing.harvestStatusLabel}
      </span>
      {listing.perishability && (
        <span className="px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant text-[11px] font-bold">
          {listing.perishability} perishability
          {listing.shelfLifeDays ? ` · ~${listing.shelfLifeDays}d` : ''}
        </span>
      )}
      {listing.isDemoData && (
        <span className="px-2.5 py-1 rounded-full bg-tertiary-container text-on-tertiary-container text-[11px] font-bold">
          Demo listing
        </span>
      )}
    </div>

    <div className="flex gap-3">
      <button
        onClick={() => onContact(listing)}
        className="flex-1 px-4 py-3 rounded-full bg-primary text-on-primary text-sm font-bold hover:opacity-90 flex items-center justify-center gap-2"
      >
        <span className="material-symbols-outlined text-lg">chat</span>
        <span>Message</span>
      </button>
      <button
        onClick={() => onOffer(listing)}
        className="flex-1 px-4 py-3 rounded-full bg-surface-container-high text-on-surface text-sm font-bold hover:bg-surface-container"
      >
        Make offer
      </button>
    </div>
  </div>
);

const BrowseFarmers = () => {
  const navigate = useNavigate();
  const [user] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  const [listings, setListings] = useState([]);
  const [meta, setMeta] = useState({});
  const [crops, setCrops] = useState([]);
  const [myRequirements, setMyRequirements] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [filters, setFilters] = useState({
    crop: '', minQuantityKg: '', maxDistanceKm: '', qualityGrade: '', sellableOnly: false
  });

  const [contactDialog, setContactDialog] = useState({ open: false, listing: null, error: '' });
  const [offerDialog, setOfferDialog] = useState({ open: false, listing: null, error: '' });

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/login');
  };

  const loadListings = useCallback(async () => {
    setLoading(true);
    setError('');

    const result = await mp.browseAvailability({
      crop: filters.crop || undefined,
      minQuantityKg: filters.minQuantityKg || undefined,
      maxDistanceKm: filters.maxDistanceKm || undefined,
      qualityGrade: filters.qualityGrade || undefined,
      sellableOnly: filters.sellableOnly ? 'true' : undefined,
      limit: 50
    });

    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      setListings([]);
      setMeta({});
      return;
    }
    setListings(result.data || []);
    setMeta(result.meta || {});
  }, [filters]);

  useEffect(() => { loadListings(); }, [loadListings]);

  // The crop catalogue and the buyer's own requirements do not change with the
  // filters, so they are fetched once rather than on every search.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [cropList, requirementResult] = await Promise.all([
        getCrops(),
        mp.listRequirements({ mine: 'true', limit: 100 })
      ]);
      if (cancelled) return;

      setCrops(cropList);
      if (requirementResult.ok) setMyRequirements(requirementResult.data || []);
    })();

    return () => { cancelled = true; };
  }, []);



  const handleContact = async (requirementId) => {
    const listing = contactDialog.listing;
    setBusy(true);
    setContactDialog((d) => ({ ...d, error: '' }));

    const result = await mp.startConversation({
      requirementId,
      availabilityId: listing.availabilityId,
      farmerUserId: listing.farmerUserId
    });

    setBusy(false);
    if (!result.ok) {
      setContactDialog((d) => ({ ...d, error: result.message }));
      return;
    }
    navigate(`/marketplace/messages/${result.data.id}`);
  };

  const handleSendOffer = async ({ requirementId, quantityKg, pricePerKg, deliveryTerms, message }) => {
    const listing = offerDialog.listing;
    setBusy(true);
    setOfferDialog((d) => ({ ...d, error: '' }));

    const result = await mp.sendOffer({
      requirementId,
      availabilityId: listing.availabilityId,
      quantityKg,
      pricePerKg,
      deliveryTerms,
      message
    });

    setBusy(false);
    if (!result.ok) {
      setOfferDialog((d) => ({ ...d, error: result.message }));
      return;
    }

    setOfferDialog({ open: false, listing: null, error: '' });
    setNotice(
      `Offer sent to ${listing.farmerName}: ${mp.formatQuantity(quantityKg)} at ₹${pricePerKg}/kg. ` +
      'You will be told as soon as they reply.'
    );
    // The requirement's remaining quantity is unchanged by a pending offer, but
    // refreshing keeps the list honest if the farmer's stock moved meanwhile.
    loadListings();
  };

  const setFilter = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const hasActiveFilters = Boolean(
    filters.crop || filters.minQuantityKg || filters.maxDistanceKm
    || filters.qualityGrade || filters.sellableOnly
  );

  return (
    <div className="flex min-h-screen bg-surface-container-low font-body">
      <Sidebar onLogout={handleLogout} userType="buyer" />

      <div className="ml-72 w-[calc(100%-18rem)]">
        <Header user={user} searchPlaceholder="Search farmers, crops..." />

        <main className="pt-24 px-8 pb-12">
          <div className="mb-8">
            <h1 className="font-headline font-extrabold text-3xl text-on-surface tracking-tight mb-2">
              Browse Farmers
            </h1>
            <p className="text-sm text-on-surface-variant">
              Crop that farmers have ready to sell right now.
              {meta.distanceNote ? ` ${meta.distanceNote}` : ''}
            </p>
          </div>

          {/* Filters */}
          <div className="bg-surface-container-lowest rounded-3xl p-6 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-headline font-bold text-base text-on-surface">Filters</h2>
              {hasActiveFilters && (
                <button
                  onClick={() => setFilters({
                    crop: '', minQuantityKg: '', maxDistanceKm: '', qualityGrade: '', sellableOnly: false
                  })}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className={labelClass}>Crop</label>
                <select value={filters.crop} onChange={setFilter('crop')} className={inputClass}>
                  <option value="">Any crop</option>
                  {crops.map((c) => (
                    <option key={c.crop} value={c.crop}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Minimum quantity (kg)</label>
                <input
                  type="number" min="0"
                  value={filters.minQuantityKg}
                  onChange={setFilter('minQuantityKg')}
                  placeholder="Any"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Within distance (km)</label>
                <input
                  type="number" min="1"
                  value={filters.maxDistanceKm}
                  onChange={setFilter('maxDistanceKm')}
                  placeholder="Any"
                  disabled={meta.distanceAvailable === false}
                  className={`${inputClass} disabled:opacity-50`}
                />
                {meta.distanceAvailable === false && (
                  <p className="text-[11px] text-on-surface-variant mt-1">
                    Needs a business location on your profile.
                  </p>
                )}
              </div>
              <div>
                <label className={labelClass}>Quality grade</label>
                <select value={filters.qualityGrade} onChange={setFilter('qualityGrade')} className={inputClass}>
                  {GRADE_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2.5 mt-4 cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={filters.sellableOnly}
                onChange={setFilter('sellableOnly')}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm font-medium text-on-surface">
                Only crop that can ship now
              </span>
            </label>
          </div>

          {notice && (
            <div className="bg-primary-container text-on-primary-container p-4 rounded-2xl mb-6 flex items-start justify-between gap-4">
              <p className="text-sm font-semibold">{notice}</p>
              <button onClick={() => setNotice('')} className="shrink-0">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
          )}

          {error && (
            <div className="bg-error-container text-on-error-container p-4 rounded-2xl mb-6">
              <p className="text-sm font-semibold">{error}</p>
            </div>
          )}

          {loading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
              <p className="text-sm text-on-surface-variant mt-4">Loading available crops…</p>
            </div>
          )}

          {!loading && !error && listings.length > 0 && (
            <>
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-4">
                {meta.count} of {meta.total} listing{meta.total === 1 ? '' : 's'}
                {meta.filteredByDistance > 0 && ` · ${meta.filteredByDistance} beyond your distance limit`}
                {meta.distanceAvailable && ' · nearest first'}
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {listings.map((listing) => (
                  <ListingCard
                    key={listing.availabilityId}
                    listing={listing}
                    onContact={(l) => setContactDialog({ open: true, listing: l, error: '' })}
                    onOffer={(l) => setOfferDialog({ open: true, listing: l, error: '' })}
                  />
                ))}
              </div>
            </>
          )}

          {/* Empty states say which of the two situations this is, because the
              answer changes what the buyer should do next. */}
          {!loading && !error && listings.length === 0 && (
            <div className="bg-surface-container-lowest rounded-3xl p-12 text-center">
              <span className="material-symbols-outlined text-6xl text-on-surface-variant mb-4 block">
                agriculture
              </span>
              <h3 className="font-headline font-bold text-lg text-on-surface mb-2">
                {hasActiveFilters ? 'No crop matches these filters' : 'No crop listed for sale yet'}
              </h3>
              <p className="text-sm text-on-surface-variant mb-6 max-w-md mx-auto">
                {hasActiveFilters
                  ? (meta.filteredByDistance > 0
                      ? `${meta.filteredByDistance} listing${meta.filteredByDistance === 1 ? '' : 's'} were beyond your distance limit. Try widening it.`
                      : 'Try a different crop, a lower minimum quantity, or a wider distance.')
                  : 'No farmer has listed crop for sale yet. Post a requirement and farmers with that crop will be shown it and can come to you.'}
              </p>
              {hasActiveFilters ? (
                <button
                  onClick={() => setFilters({
                    crop: '', minQuantityKg: '', maxDistanceKm: '', qualityGrade: '', sellableOnly: false
                  })}
                  className="px-6 py-3 rounded-full bg-primary text-on-primary text-sm font-bold hover:opacity-90"
                >
                  Clear filters
                </button>
              ) : (
                <button
                  onClick={() => navigate('/buyer/requirements')}
                  className="px-6 py-3 rounded-full bg-primary text-on-primary text-sm font-bold hover:opacity-90"
                >
                  Post a requirement
                </button>
              )}
            </div>
          )}
        </main>
      </div>

      {contactDialog.open && (
        <ContactDialog
          farmerCrop={contactDialog.listing}
          requirements={eligibleRequirements(myRequirements, contactDialog.listing)}
          busy={busy}
          error={contactDialog.error}
          onClose={() => setContactDialog({ open: false, listing: null, error: '' })}
          onConfirm={handleContact}
          onPostRequirement={() => navigate('/buyer/requirements')}
        />
      )}

      {offerDialog.open && (
        <OfferDialog
          farmerCrop={offerDialog.listing}
          requirements={eligibleRequirements(myRequirements, offerDialog.listing)}
          busy={busy}
          error={offerDialog.error}
          onClose={() => setOfferDialog({ open: false, listing: null, error: '' })}
          onSubmit={handleSendOffer}
          onPostRequirement={() => navigate('/buyer/requirements')}
        />
      )}
    </div>
  );
};

export default BrowseFarmers;

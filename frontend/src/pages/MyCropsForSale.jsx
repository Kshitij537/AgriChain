import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import mp from '../services/marketplaceService';

/**
 * My Crops for Sale.
 *
 * The farmer tells the marketplace what they actually have. Everything AgriChain
 * already knows — which fields exist, where they are, what is planted — is
 * pre-filled from the saved field records, so the ONLY thing the farmer types is
 * the number of kilograms. That is the one fact no existing table holds.
 *
 * THE FOUR QUANTITIES
 * -------------------
 * Shown separately rather than as one number, because a farmer whose "available"
 * figure drops after agreeing a deal needs to see where the crop went:
 *   harvested / to sell / promised (reserved) / sold
 */

/** Add-crop dialog, pre-filled from a saved field. */
const AddCropDialog = ({ open, suggestions, onCreate, onClose, busy, error }) => {
  const [farmId, setFarmId] = useState('');
  const [crop, setCrop] = useState('');
  const [totalHarvestedKg, setTotalHarvestedKg] = useState('');
  const [qualityGrade, setQualityGrade] = useState('');
  const [harvestStatus, setHarvestStatus] = useState('harvested');
  const [harvestDate, setHarvestDate] = useState(new Date().toISOString().slice(0, 10));
  const [storageType, setStorageType] = useState('open');

  const selected = suggestions.find((s) => String(s.farmId) === String(farmId));

  // Selecting a field fills in what that field already knows.
  useEffect(() => {
    if (selected?.crop) setCrop(selected.crop);
  }, [selected]);

  useEffect(() => {
    if (open && suggestions.length && !farmId) {
      const usable = suggestions.find((s) => s.hasCoordinates) || suggestions[0];
      setFarmId(String(usable.farmId));
    }
  }, [open, suggestions, farmId]);

  if (!open) return null;

  const inputClass =
    'w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-surface-container-high ' +
    'text-sm text-on-surface font-medium focus:outline-none focus:border-primary';
  const labelClass =
    'block text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5';

  const valid = crop && Number(totalHarvestedKg) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/40"
      role="dialog" aria-modal="true">
      <div className="bg-surface-container-lowest w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-xl flex flex-col max-h-[92vh]">
        <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-surface-container">
          <div>
            <h2 className="font-headline font-extrabold text-xl text-on-surface">
              What do you have to sell?
            </h2>
            <p className="text-xs text-on-surface-variant mt-1">
              We already know your fields. Just tell us the crop and how many kilograms.
            </p>
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

          {suggestions.length === 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10">
              <p className="text-xs text-amber-950">
                You have no saved fields yet. Add a field first so we can measure distances to buyers.
              </p>
            </div>
          )}

          {suggestions.length > 0 && (
            <div>
              <label className={labelClass}>
                Which field? <span className="ml-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">from your fields</span>
              </label>
              <select value={farmId} onChange={(e) => setFarmId(e.target.value)} className={inputClass}>
                {suggestions.map((s) => (
                  <option key={s.farmId} value={s.farmId} disabled={!s.hasCoordinates}>
                    {s.farmName}
                    {s.areaHectares ? ` — ${s.areaHectares.toFixed(2)} ha` : ''}
                    {s.crop ? ` — ${s.cropLabel}` : ''}
                    {!s.hasCoordinates ? ' (no location saved)' : ''}
                  </option>
                ))}
              </select>
              {selected && !selected.hasCoordinates && (
                <p className="text-[11px] text-error font-semibold mt-1.5">
                  This field has no location, so buyer distances cannot be worked out. Set its
                  boundary first.
                </p>
              )}
            </div>
          )}

          <div>
            <label className={labelClass}>
              Crop
              {selected?.crop && (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">from your field</span>
              )}
            </label>
            <input type="text" value={crop} onChange={(e) => setCrop(e.target.value)}
              placeholder="e.g. tomato" className={inputClass} />
            {selected && !selected.crop && (
              <p className="text-[11px] text-on-surface-variant mt-1.5">
                This field has no crop saved{selected.rawCropType ? ` (it says "${selected.rawCropType}")` : ''},
                so type the crop here.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                How many kg? <span className="ml-1 px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant text-[10px]">you enter</span>
              </label>
              <input type="number" min="1" inputMode="numeric" value={totalHarvestedKg}
                onChange={(e) => setTotalHarvestedKg(e.target.value)}
                placeholder="e.g. 500" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Quality grade (optional)</label>
              <input type="text" value={qualityGrade} onChange={(e) => setQualityGrade(e.target.value)}
                placeholder="A / B / C" className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Harvest status</label>
              <select value={harvestStatus} onChange={(e) => setHarvestStatus(e.target.value)} className={inputClass}>
                <option value="harvested">Harvested</option>
                <option value="stored">In storage</option>
                <option value="harvesting">Harvesting now</option>
                <option value="expected">Not harvested yet</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Harvest date</label>
              <input type="date" value={harvestDate} onChange={(e) => setHarvestDate(e.target.value)}
                className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>How is it stored?</label>
            <select value={storageType} onChange={(e) => setStorageType(e.target.value)} className={inputClass}>
              <option value="open">Open / no cover</option>
              <option value="packed">Packed in crates</option>
              <option value="warehouse">Warehouse / godown</option>
              <option value="cold">Cold storage</option>
            </select>
            <p className="text-[11px] text-on-surface-variant mt-1.5">
              Storage changes how much crop is expected to spoil on the way to a buyer.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 pt-4 border-t border-surface-container">
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-on-surface-variant hover:bg-surface-container">
            Cancel
          </button>
          <button type="button" disabled={!valid || busy}
            onClick={() => onCreate({
              farmId: farmId || undefined, crop, totalHarvestedKg: Number(totalHarvestedKg),
              availableKg: Number(totalHarvestedKg), qualityGrade: qualityGrade || undefined,
              harvestStatus, harvestDate, storageType
            })}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold ${
              valid && !busy ? 'bg-primary text-on-primary hover:opacity-90'
                : 'bg-surface-container text-on-surface-variant cursor-not-allowed'
            }`}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

const MyCropsForSale = () => {
  const navigate = useNavigate();
  const [user] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  const [listings, setListings] = useState([]);
  const [summary, setSummary] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState({ open: false, error: '' });

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/login');
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [listingResult, suggestionResult] = await Promise.all([
      mp.getMyAvailability({ includeInactive: 'true' }),
      mp.getAvailabilitySuggestions()
    ]);
    if (listingResult.ok) {
      setListings(listingResult.data);
      setSummary(listingResult.meta.summary);
    } else setError(listingResult.message);
    if (suggestionResult.ok) setSuggestions(suggestionResult.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (listing) => {
    setBusy(true);
    setDialog((d) => ({ ...d, error: '' }));
    const result = await mp.createAvailability(listing);
    setBusy(false);
    if (!result.ok) { setDialog((d) => ({ ...d, error: result.message })); return; }
    setDialog({ open: false, error: '' });
    load();
  };

  return (
    <div className="flex min-h-screen bg-surface-container-low font-body">
      <Sidebar onLogout={handleLogout} />

      <div className="ml-72 w-[calc(100%-18rem)]">
        <Header user={user} searchPlaceholder="Search crops..." />

        <main className="pt-24 px-8 pb-12">
          <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
            <div>
              <h1 className="font-headline font-extrabold text-3xl text-on-surface tracking-tight">
                My Crops for Sale
              </h1>
              <p className="text-base text-on-surface-variant mt-1.5">
                What you tell us here is what buyers can see and make offers on.
              </p>
            </div>
            <button type="button" onClick={() => setDialog({ open: true, error: '' })}
              className="px-6 py-3 rounded-full bg-primary text-on-primary text-sm font-bold shrink-0 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base">add</span>
              <span>Add crop</span>
            </button>
          </section>

          {error && (
            <div className="mb-4 flex items-center justify-between gap-3 p-4 rounded-2xl bg-error-container text-on-error-container">
              <span className="text-xs">{error}</span>
              <button type="button" onClick={() => setError('')} className="text-xs font-bold underline shrink-0">
                Dismiss
              </button>
            </div>
          )}

          {/* Totals across all listings */}
          {summary && summary.listings > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              {[
                ['To sell', summary.availableKg, 'sell', 'text-primary'],
                ['Promised', summary.reservedKg, 'lock', 'text-secondary'],
                ['Sold', summary.soldKg, 'check_circle', 'text-on-surface'],
                ['Crops listed', summary.crops, 'potted_plant', 'text-on-surface']
              ].map(([label, value, icon, colour]) => (
                <div key={label} className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm">
                  <span className="material-symbols-outlined text-xl text-on-surface-variant">{icon}</span>
                  <span className="text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider block mt-1">
                    {label}
                  </span>
                  <span className={`font-headline font-extrabold text-xl ${colour}`}>
                    {label === 'Crops listed' ? value : `${value} kg`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-16">
              <span className="material-symbols-outlined text-3xl text-primary animate-spin">progress_activity</span>
            </div>
          )}

          {!loading && listings.length === 0 && (
            <div className="bg-surface-container-lowest rounded-3xl p-10 shadow-sm flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-3xl bg-primary-container text-on-primary flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-3xl">inventory_2</span>
              </div>
              <h2 className="font-headline font-bold text-xl text-on-surface mb-1.5">
                Nothing listed for sale yet
              </h2>
              <p className="text-sm text-on-surface-variant max-w-md mb-6">
                Add a crop and quantity, and we will show you the buyers who want it.
              </p>
              <button type="button" onClick={() => setDialog({ open: true, error: '' })}
                className="px-6 py-3 rounded-xl bg-primary text-on-primary text-sm font-bold">
                Add my first crop
              </button>
            </div>
          )}

          {!loading && listings.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {listings.map((listing) => (
                <div key={listing.id} className="bg-surface-container-lowest rounded-3xl p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <span className="font-headline font-bold text-lg text-on-surface block">
                        {listing.cropLabel}
                        {listing.variety ? ` (${listing.variety})` : ''}
                      </span>
                      <span className="text-xs text-on-surface-variant block">
                        {listing.farmName || 'No field linked'}
                        {listing.qualityGrade ? ` • Grade ${listing.qualityGrade}` : ''}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      listing.isSellableNow ? 'bg-primary/10 text-primary' : 'bg-amber-500/15 text-amber-800'
                    }`}>
                      {listing.harvestStatusLabel}
                    </span>
                  </div>

                  {/* The four buckets, so a drop in "to sell" is explainable. */}
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {[
                      ['Harvested', listing.totalHarvestedKg, 'text-on-surface'],
                      ['To sell', listing.availableKg, 'text-primary'],
                      ['Promised', listing.reservedKg, 'text-secondary'],
                      ['Sold', listing.soldKg, 'text-on-surface-variant']
                    ].map(([label, value, colour]) => (
                      <div key={label} className="p-2 rounded-xl bg-surface-container-low text-center">
                        <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">
                          {label}
                        </span>
                        <span className={`font-headline font-bold text-sm ${colour}`}>{value}</span>
                        <span className="text-[9px] text-on-surface-variant block">kg</span>
                      </div>
                    ))}
                  </div>

                  {listing.reservedKg > 0 && (
                    <p className="text-[11px] text-on-surface-variant mb-3">
                      {listing.reservedKg} kg is promised to agreed deals, so it is no longer offered
                      to other buyers.
                    </p>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button"
                      onClick={() => navigate('/marketplace', { state: { availabilityId: listing.id } })}
                      disabled={listing.availableKg <= 0}
                      className="flex-1 min-w-[130px] px-4 py-2.5 rounded-full bg-primary text-on-primary text-xs font-bold disabled:opacity-40">
                      See buyers
                    </button>
                    <button type="button"
                      onClick={() => navigate('/marketplace/compare', { state: { availabilityId: listing.id } })}
                      className="flex-1 min-w-[130px] px-4 py-2.5 rounded-full bg-surface-container-high hover:bg-surface-container text-on-surface text-xs font-bold">
                      Compare with mandi
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      <AddCropDialog
        open={dialog.open}
        suggestions={suggestions}
        busy={busy}
        error={dialog.error}
        onCreate={handleCreate}
        onClose={() => setDialog({ open: false, error: '' })}
      />
    </div>
  );
};

export default MyCropsForSale;

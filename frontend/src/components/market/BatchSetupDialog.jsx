import React, { useState, useEffect, useMemo } from 'react';

/**
 * "What am I selling?" dialog.
 *
 * Two steps, in the order a farmer thinks:
 *
 *   1. WHICH FIELD — pick a saved field. Everything the field record already
 *      knows is filled in automatically: location, area, and the crop if the
 *      field has a usable one.
 *   2. WHAT IS IN IT — the farmer fills in only what the record cannot know:
 *      how many kilograms, when it was harvested, how it is being stored, and
 *      optionally what it cost to grow.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Market page previously navigated to the Saved Fields page when you pressed
 * "Change crop", which is where you are ending up. It also silently used the
 * FIRST field and invented a 500 kg / ₹16-per-kg batch, because the `farms` table
 * has no yield or input-cost columns. Those invented numbers drove every rupee on
 * the page.
 *
 * Auto-filled values are badged so it is always obvious which figures came from
 * the saved field and which the farmer typed.
 */

/** Storage options, mirroring spoilageService.STORAGE_TYPES. */
const STORAGE_OPTIONS = [
  { key: 'open', label: 'Open / no cover', hint: 'Shaded ground or open cart' },
  { key: 'packed', label: 'Packed in crates', hint: 'Crates or sacks, no cooling' },
  { key: 'warehouse', label: 'Warehouse / godown', hint: 'Indoors, not cooled' },
  { key: 'cold', label: 'Cold storage', hint: 'Refrigerated — much longer shelf life' }
];

/** Small badge marking where a value came from. */
const SourceBadge = ({ auto }) => (
  <span
    className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
      auto ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-on-surface-variant'
    }`}
  >
    {auto ? 'from field' : 'you enter'}
  </span>
);

const Label = ({ children, auto }) => (
  <label className="block text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
    {children}
    {auto !== undefined && <SourceBadge auto={auto} />}
  </label>
);

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-surface-container-high ' +
  'text-sm text-on-surface font-medium focus:outline-none focus:border-primary transition-colors';

/**
 * One selectable field card.
 */
const FieldCard = ({ farm, selected, onSelect }) => {
  const hasCoordinates = farm.latitude != null && farm.longitude != null;

  return (
    <button
      type="button"
      onClick={() => hasCoordinates && onSelect(farm)}
      disabled={!hasCoordinates}
      className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
        selected
          ? 'border-primary bg-primary/5'
          : hasCoordinates
            ? 'border-surface-container-high bg-surface-container-lowest hover:border-primary/40'
            : 'border-surface-container bg-surface-container-low opacity-60 cursor-not-allowed'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="font-headline font-bold text-sm text-on-surface block truncate">
            {farm.name}
          </span>
          <span className="text-xs text-on-surface-variant block mt-0.5">
            {farm.location || 'Location not named'}
            {farm.area ? ` • ${Number(farm.area).toFixed(2)} ha` : ''}
          </span>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {farm.cropType && farm.cropType !== 'Unknown' ? (
              <span className="px-2 py-0.5 rounded-full bg-secondary-fixed/50 text-[10px] font-bold text-secondary">
                {farm.cropType}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-[10px] font-bold text-on-surface-variant">
                No crop set
              </span>
            )}
            {farm.healthStatus && (
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                NDVI {farm.healthStatus}
              </span>
            )}
          </div>
          {!hasCoordinates && (
            <span className="text-[11px] text-error font-semibold block mt-2">
              No saved location — set the field boundary first
            </span>
          )}
        </div>
        {selected && (
          <span className="material-symbols-outlined text-primary text-xl shrink-0">
            check_circle
          </span>
        )}
      </div>
    </button>
  );
};

/**
 * Batch setup dialog.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {Array} props.farms - the farmer's saved fields
 * @param {Array} props.crops - crop profiles from GET /api/crops
 * @param {object} props.initialFarm - currently selected field, if any
 * @param {object} props.initialBatch - current batch values, if any
 * @param {Function} props.onApply - ({ farm, crop, quantityKg, harvestDate,
 *   productionCost, storageType }) => void
 * @param {Function} props.onClose
 */
const BatchSetupDialog = ({
  open,
  farms = [],
  crops = [],
  initialFarm = null,
  initialBatch = null,
  onApply,
  onClose
}) => {
  const [farm, setFarm] = useState(initialFarm);
  const [crop, setCrop] = useState(initialBatch?.cropKey || '');
  const [quantityKg, setQuantityKg] = useState(
    initialBatch?.quantityKg ? String(initialBatch.quantityKg) : ''
  );
  const [harvestDate, setHarvestDate] = useState(
    initialBatch?.harvestDate || new Date().toISOString().slice(0, 10)
  );
  const [productionCost, setProductionCost] = useState(
    initialBatch?.totalInputCost ? String(initialBatch.totalInputCost) : ''
  );
  const [storageType, setStorageType] = useState(initialBatch?.storageType || 'open');
  const [touched, setTouched] = useState(false);

  // Crops the platform can actually price today. A crop with no market data
  // would return NO_MARKET_DATA, so it is shown but flagged rather than hidden -
  // the farmer should be able to see that the crop exists but has no rates yet.
  const sellableCrops = useMemo(
    () => crops.filter((c) => c.hasMarketPriceData),
    [crops]
  );
  const unpricedCrops = useMemo(
    () => crops.filter((c) => !c.hasMarketPriceData),
    [crops]
  );

  /**
   * Resolves a field's free-text crop_type onto a crop key we can price.
   * Mirrors the backend's resolveCropKey for the common cases so the dialog can
   * pre-select without a round trip.
   */
  const resolveFieldCrop = (cropType) => {
    if (!cropType || typeof cropType !== 'string') return '';
    const normalised = cropType.trim().toLowerCase();
    if (normalised === 'unknown') return '';
    const direct = crops.find((c) => c.crop === normalised);
    if (direct) return direct.crop;
    const partial = crops.find((c) => normalised.includes(c.crop));
    if (partial) return partial.crop;
    if (normalised.includes('soya')) return 'soybean';
    if (normalised.includes('kanda')) return 'onion';
    if (normalised.includes('batata')) return 'potato';
    if (normalised.includes('tamatar')) return 'tomato';
    if (normalised.includes('palak')) return 'spinach';
    if (normalised.includes('mirch')) return 'chilli';
    return '';
  };

  // Selecting a field auto-fills whatever that field actually knows.
  useEffect(() => {
    if (!farm) return;
    const resolved = resolveFieldCrop(farm.cropType);
    // Only overwrite the crop when the field genuinely carries one, so a manual
    // choice is not silently replaced by an empty field record.
    if (resolved) setCrop(resolved);
  }, [farm]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) setTouched(false);
  }, [open]);

  if (!open) return null;

  const quantityNumber = Number(quantityKg);
  const quantityValid = Number.isFinite(quantityNumber) && quantityNumber > 0;

  /**
   * Cost per kg implied by what has been typed, or null when it cannot be known.
   *
   * Used only to catch the per-kg-instead-of-total mistake below; the breakeven
   * card computes its own figure from the saved batch.
   */
  const impliedCostPerKg = quantityValid && Number(productionCost) > 0
    ? Number(productionCost) / quantityNumber
    : null;
  const selectedCropProfile = crops.find((c) => c.crop === crop);
  const cropIsPriceable = Boolean(selectedCropProfile?.hasMarketPriceData);
  // Allow all crops to proceed - we'll show buyer offers if no mandi prices exist
  const canApply = Boolean(farm) && Boolean(crop) && quantityValid;

  const handleApply = () => {
    setTouched(true);
    if (!canApply) return;
    onApply({
      farm,
      crop,
      quantityKg: quantityNumber,
      harvestDate,
      productionCost: productionCost ? Number(productionCost) : null,
      storageType
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-setup-title"
    >
      <div className="bg-surface-container-lowest w-full sm:max-w-3xl max-h-[92vh] rounded-t-3xl sm:rounded-3xl shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-surface-container">
          <div>
            <h2
              id="batch-setup-title"
              className="font-headline font-extrabold text-xl text-on-surface"
            >
              What are you selling?
            </h2>
            <p className="text-xs text-on-surface-variant mt-1">
              Pick the field, then tell us what came off it. We fill in everything the
              field already knows.
            </p>
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
        <div className="overflow-y-auto p-6 space-y-7">
          {/* Step 1 — field */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-lg bg-primary text-on-primary flex items-center justify-center text-xs font-bold">
                1
              </span>
              <h3 className="font-headline font-bold text-sm text-on-surface">
                Which field is this harvest from?
              </h3>
            </div>

            {farms.length === 0 ? (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                <p className="text-xs text-amber-950 leading-relaxed">
                  You have no saved fields yet. Add a field with its boundary first — the
                  mandi distances are measured from the field's location.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {farms.map((f) => (
                  <FieldCard
                    key={f.id}
                    farm={f}
                    selected={farm?.id === f.id}
                    onSelect={setFarm}
                  />
                ))}
              </div>
            )}

            {touched && !farm && (
              <p className="text-xs text-error font-semibold mt-2">Select a field to continue.</p>
            )}
          </section>

          {/* Step 2 — batch details */}
          <section className={farm ? '' : 'opacity-50 pointer-events-none'}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-lg bg-primary text-on-primary flex items-center justify-center text-xs font-bold">
                2
              </span>
              <h3 className="font-headline font-bold text-sm text-on-surface">
                What came off it?
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Crop */}
              <div className="sm:col-span-2">
                <Label auto={Boolean(farm && resolveFieldCrop(farm.cropType))}>Crop</Label>
                <select
                  value={crop}
                  onChange={(e) => setCrop(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select a crop…</option>
                  {sellableCrops.length > 0 && (
                    <optgroup label="Mandi rates available">
                      {sellableCrops.map((c) => (
                        <option key={c.crop} value={c.crop}>
                          {c.label} — {c.perishability} perishability, ~{c.shelfLifeDays}d shelf life
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {unpricedCrops.length > 0 && (
                    <optgroup label="No mandi rates yet — cannot be compared">
                      {unpricedCrops.map((c) => (
                        <option key={c.crop} value={c.crop}>
                          {c.label} (no price data)
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>

                {farm && !resolveFieldCrop(farm.cropType) && (
                  <p className="text-[11px] text-on-surface-variant mt-1.5">
                    This field has no crop saved on it, so choose the crop here.
                  </p>
                )}
                {crop && !cropIsPriceable && (
                  <div className="mt-1.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-[11px] text-amber-900 font-semibold">
                      ⚠️ No government mandi prices available for {selectedCropProfile?.label || crop} yet.
                    </p>
                    <p className="text-[11px] text-amber-800 mt-1">
                      We'll show you direct buyer offers instead.
                    </p>
                  </div>
                )}
              </div>

              {/* Quantity */}
              <div>
                <Label auto={false}>Quantity (kg)</Label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={quantityKg}
                  onChange={(e) => setQuantityKg(e.target.value)}
                  placeholder="e.g. 500"
                  className={inputClass}
                />
                <p className="text-[11px] text-on-surface-variant mt-1.5">
                  {quantityValid
                    ? `${(quantityNumber / 100).toFixed(2)} quintal${quantityNumber === 100 ? '' : 's'}`
                    : farm?.area
                      ? `This field is ${Number(farm.area).toFixed(2)} ha — enter the actual weight harvested.`
                      : 'Enter the actual weight harvested.'}
                </p>
                {touched && !quantityValid && (
                  <p className="text-xs text-error font-semibold mt-1">
                    Enter a quantity greater than zero.
                  </p>
                )}
              </div>

              {/* Harvest date */}
              <div>
                <Label auto={false}>Harvest date</Label>
                <input
                  type="date"
                  value={harvestDate}
                  max={new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)}
                  onChange={(e) => setHarvestDate(e.target.value)}
                  className={inputClass}
                />
                <p className="text-[11px] text-on-surface-variant mt-1.5">
                  Older produce spoils faster in transit, which changes the best mandi.
                </p>
              </div>

              {/* Storage */}
              <div>
                <Label auto={false}>How is it stored now?</Label>
                <select
                  value={storageType}
                  onChange={(e) => setStorageType(e.target.value)}
                  className={inputClass}
                >
                  {STORAGE_OPTIONS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-on-surface-variant mt-1.5">
                  {STORAGE_OPTIONS.find((s) => s.key === storageType)?.hint}
                </p>
              </div>

              {/* Production cost */}
              <div>
                <Label auto={false}>Total production cost for this batch (₹, optional)</Label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  inputMode="numeric"
                  value={productionCost}
                  onChange={(e) => setProductionCost(e.target.value)}
                  placeholder="Whole batch: seed + fertiliser + labour"
                  className={inputClass}
                />
                {/* THE TOTAL, NOT A PER-KG RATE. This is the field's one real trap:
                    typing the per-kg cost gives a breakeven a hundredth of the true
                    one and a wildly flattering profit. The hint below names that
                    mistake and shows the conversion, the same way the marketplace
                    price validator names the per-quintal mistake. */}
                <p className="text-[11px] text-on-surface-variant mt-1.5">
                  {productionCost
                    ? `Break-even ₹${(Number(productionCost) / (quantityNumber || 1)).toFixed(2)}/kg`
                    : 'Leave blank and we will not show a profit figure — we will not guess it.'}
                </p>
                {impliedCostPerKg !== null && impliedCostPerKg < 1 && (
                  <p className="text-[11px] font-semibold text-error mt-1.5">
                    That is only ₹{impliedCostPerKg.toFixed(2)}/kg of cost, which would make
                    almost the whole sale look like profit. Enter the TOTAL you spent on this
                    batch — if you meant ₹{productionCost}/kg, type{' '}
                    {Math.round(Number(productionCost) * quantityNumber).toLocaleString('en-IN')}.
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 pt-4 border-t border-surface-container">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-on-surface-variant hover:bg-surface-container"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-colors ${
              canApply
                ? 'bg-primary text-on-primary hover:bg-primary/90'
                : 'bg-surface-container text-on-surface-variant cursor-not-allowed'
            }`}
          >
            Compare all options
          </button>
        </div>
      </div>
    </div>
  );
};

export default BatchSetupDialog;

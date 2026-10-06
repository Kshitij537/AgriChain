import React, { useState, useEffect } from 'react';
import { getCrops } from '../../services/marketService';

/**
 * Post or edit a buyer requirement.
 *
 * One dialog for both, because the fields are the same and the difference is
 * small and worth stating once: the backend's WRITABLE set in
 * requirementService.update does not include `crop`, so an existing requirement
 * shows its crop as a fact rather than a field. Changing the crop would turn it
 * into a different requirement, with offers already attached to the old one.
 *
 * THE CROP IS A LIST, NOT A TEXT BOX
 * ----------------------------------
 * The backend validates `crop` against a fixed catalogue and rejects anything
 * else ("notacrop is not a supported crop yet"). A free-text box invited that
 * rejection on a typo, so the crop comes from GET /api/crops. `hasMarketPriceData`
 * is surfaced because a crop without price data gives the buyer no market
 * reference to price against.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {object|null} [props.requirement] - present means edit, absent means create
 * @param {Function} props.onSubmit - (payload) => void; only changed fields when editing
 * @param {Array} [props.fields] - per-field validation errors from the API
 */

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-surface-container-high ' +
  'text-sm text-on-surface font-medium focus:outline-none focus:border-primary';
const labelClass =
  'block text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5';

const TOGGLES = [
  ['priceNegotiable', 'Price is negotiable'],
  ['partialFulfillmentAllowed', 'I will accept part of the quantity from one farmer'],
  ['pickupAvailable', 'I will collect from the farm (at my cost)'],
  ['deliveryRequired', 'Farmer delivers to me']
];

const GRADES = [
  ['', 'Any grade'],
  ['A+', 'A+'],
  ['A', 'A'],
  ['B', 'B'],
  ['C', 'C']
];

const dayOffset = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/** Blank form for a new requirement, or the current values when editing. */
const initialForm = (requirement) => {
  if (!requirement) {
    return {
      crop: '', quantityRequiredKg: '', offeredPricePerKg: '',
      requiredBy: dayOffset(7), expiresAt: dayOffset(14),
      deliveryLocation: '', variety: '', minimumQualityGrade: '',
      minimumAcceptableQuantityKg: '', description: '',
      priceNegotiable: true, partialFulfillmentAllowed: true,
      pickupAvailable: false, deliveryRequired: true
    };
  }
  return {
    crop: requirement.crop,
    quantityRequiredKg: String(requirement.quantityRequiredKg ?? ''),
    offeredPricePerKg: String(requirement.offeredPricePerKg ?? ''),
    requiredBy: requirement.requiredBy || dayOffset(7),
    expiresAt: requirement.expiresAt || dayOffset(14),
    deliveryLocation: requirement.deliveryLocation || '',
    variety: requirement.variety || '',
    minimumQualityGrade: requirement.minimumQualityGrade || '',
    minimumAcceptableQuantityKg: requirement.minimumAcceptableQuantityKg != null
      ? String(requirement.minimumAcceptableQuantityKg) : '',
    description: requirement.description || '',
    priceNegotiable: Boolean(requirement.priceNegotiable),
    partialFulfillmentAllowed: Boolean(requirement.partialFulfillmentAllowed),
    pickupAvailable: Boolean(requirement.pickupAvailable),
    deliveryRequired: Boolean(requirement.deliveryRequired)
  };
};

const RequirementDialog = ({
  open, requirement = null, onSubmit, onClose, busy, error, fields, saveLabel
}) => {
  const isEdit = Boolean(requirement);

  const [form, setForm] = useState(() => initialForm(requirement));
  const [crops, setCrops] = useState([]);

  // Reopening for a different requirement must not show the previous one's values.
  useEffect(() => {
    if (open) setForm(initialForm(requirement));
  }, [open, requirement]);

  useEffect(() => {
    if (!open || crops.length) return;
    let cancelled = false;
    getCrops().then((list) => { if (!cancelled) setCrops(list); });
    return () => { cancelled = true; };
  }, [open, crops.length]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const toggle = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.checked }));
  const fieldError = (name) => fields?.find((f) => f.field === name)?.message;

  if (!open) return null;

  const valid = form.crop && Number(form.quantityRequiredKg) > 0
    && Number(form.offeredPricePerKg) > 0 && form.deliveryLocation.trim();

  /**
   * Builds the payload.
   *
   * Editing sends only what actually changed, so a PATCH never rewrites a field
   * the buyer did not touch, and `crop` is never sent at all — the backend does
   * not accept it on an update.
   */
  const buildPayload = () => {
    const numeric = {
      quantityRequiredKg: Number(form.quantityRequiredKg),
      offeredPricePerKg: Number(form.offeredPricePerKg),
      minimumAcceptableQuantityKg: form.minimumAcceptableQuantityKg
        ? Number(form.minimumAcceptableQuantityKg)
        : null
    };

    const full = {
      ...form,
      ...numeric,
      variety: form.variety || null,
      minimumQualityGrade: form.minimumQualityGrade || null,
      description: form.description || null
    };

    if (!isEdit) {
      // Create rejects nulls where it wants absence, so empties are dropped.
      const payload = { ...full };
      for (const key of ['variety', 'minimumQualityGrade', 'description', 'minimumAcceptableQuantityKg']) {
        if (payload[key] === null) delete payload[key];
      }
      return payload;
    }

    const before = initialForm(requirement);
    const changes = {};
    for (const [key, value] of Object.entries(full)) {
      if (key === 'crop') continue;
      const previous = key in numeric
        ? (before[key] === '' ? null : Number(before[key]))
        : before[key];
      if (value !== previous) changes[key] = value;
    }
    return changes;
  };

  const cropProfile = crops.find((c) => c.crop === form.crop) || null;

  // Editing with nothing changed would send an empty PATCH, which the backend
  // correctly refuses with NO_UPDATABLE_FIELDS. Disabling the button is a
  // better answer than showing the buyer that error.
  const payload = buildPayload();
  const hasChanges = !isEdit || Object.keys(payload).length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/40"
      role="dialog" aria-modal="true"
    >
      <div className="bg-surface-container-lowest w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-xl flex flex-col max-h-[92vh]">
        <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-surface-container">
          <div>
            <h2 className="font-headline font-extrabold text-xl text-on-surface">
              {isEdit ? 'Edit requirement' : 'Post a requirement'}
            </h2>
            <p className="text-xs text-on-surface-variant mt-1">
              {isEdit
                ? 'Farmers see these terms. Offers you have already received keep the terms they were made under.'
                : 'Farmers with this crop will see it and can send you offers.'}
            </p>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            className="w-9 h-9 rounded-xl hover:bg-surface-container flex items-center justify-center shrink-0"
          >
            <span className="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-error-container text-on-error-container text-xs">{error}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Crop *</label>
              {isEdit ? (
                <>
                  <div className="px-3.5 py-2.5 rounded-xl bg-surface-container text-sm font-bold text-on-surface">
                    {requirement.cropLabel || requirement.crop}
                  </div>
                  <p className="text-[10px] text-on-surface-variant mt-1">
                    Cannot change — post a new requirement for a different crop.
                  </p>
                </>
              ) : (
                <>
                  <select value={form.crop} onChange={set('crop')} className={inputClass}>
                    <option value="">Choose a crop…</option>
                    {crops.map((c) => (
                      <option key={c.crop} value={c.crop}>{c.label}</option>
                    ))}
                  </select>
                  {fieldError('crop') && (
                    <p className="text-[11px] text-error font-semibold mt-1">{fieldError('crop')}</p>
                  )}
                  {cropProfile && !cropProfile.hasMarketPriceData && (
                    <p className="text-[10px] text-on-surface-variant mt-1">
                      No mandi price data for this crop yet, so there is no market reference.
                    </p>
                  )}
                </>
              )}
            </div>
            <div>
              <label className={labelClass}>Quantity needed (kg) *</label>
              <input
                type="number" min="1" value={form.quantityRequiredKg}
                onChange={set('quantityRequiredKg')} placeholder="1000" className={inputClass}
              />
              {fieldError('quantityRequiredKg') && (
                <p className="text-[11px] text-error font-semibold mt-1">{fieldError('quantityRequiredKg')}</p>
              )}
              {isEdit && requirement.quantityRemainingKg !== requirement.quantityRequiredKg && (
                <p className="text-[10px] text-on-surface-variant mt-1">
                  {requirement.quantityRequiredKg - requirement.quantityRemainingKg} kg already agreed;
                  cannot go below that.
                </p>
              )}
            </div>
            <div>
              <label className={labelClass}>Price per KG (₹) *</label>
              <input
                type="number" min="1" step="0.5" value={form.offeredPricePerKg}
                onChange={set('offeredPricePerKg')} placeholder="30" className={inputClass}
              />
              {fieldError('offeredPricePerKg') && (
                <p className="text-[11px] text-error font-semibold mt-1">{fieldError('offeredPricePerKg')}</p>
              )}
              {/* The most common data-entry error in this domain. */}
              <p className="text-[10px] text-on-surface-variant mt-1">Per kilogram, not per quintal.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Needed by *</label>
              <input type="date" value={form.requiredBy} onChange={set('requiredBy')} className={inputClass} />
              {fieldError('requiredBy') && (
                <p className="text-[11px] text-error font-semibold mt-1">{fieldError('requiredBy')}</p>
              )}
            </div>
            <div>
              <label className={labelClass}>Stop accepting offers on *</label>
              <input type="date" value={form.expiresAt} onChange={set('expiresAt')} className={inputClass} />
              {fieldError('expiresAt') && (
                <p className="text-[11px] text-error font-semibold mt-1">{fieldError('expiresAt')}</p>
              )}
            </div>
          </div>

          <div>
            <label className={labelClass}>Where should the crop go? *</label>
            <input
              type="text" value={form.deliveryLocation} onChange={set('deliveryLocation')}
              placeholder="e.g. Kalamna Market, Nagpur" className={inputClass}
            />
            {fieldError('deliveryLocation') && (
              <p className="text-[11px] text-error font-semibold mt-1">{fieldError('deliveryLocation')}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Variety (optional)</label>
              <input type="text" value={form.variety} onChange={set('variety')} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Minimum grade (optional)</label>
              <select
                value={form.minimumQualityGrade}
                onChange={set('minimumQualityGrade')}
                className={inputClass}
              >
                {GRADES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Smallest lot you accept (kg)</label>
              <input
                type="number" min="1" value={form.minimumAcceptableQuantityKg}
                onChange={set('minimumAcceptableQuantityKg')} className={inputClass}
              />
              {fieldError('minimumAcceptableQuantityKg') && (
                <p className="text-[11px] text-error font-semibold mt-1">
                  {fieldError('minimumAcceptableQuantityKg')}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2 p-3 rounded-xl bg-surface-container-low">
            {TOGGLES.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form[key]} onChange={toggle(key)} className="rounded" />
                <span className="text-xs text-on-surface">{label}</span>
              </label>
            ))}
            {fieldError('pickupAvailable') && (
              <p className="text-[11px] text-error font-semibold">{fieldError('pickupAvailable')}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>Anything else? (optional)</label>
            <textarea
              rows={2} value={form.description} onChange={set('description')}
              placeholder="Payment terms, packaging, quality notes…" className={inputClass}
            />
          </div>

          <div className="p-3 rounded-xl bg-amber-500/10">
            <p className="text-[11px] text-amber-950 leading-relaxed">
              Posting a requirement is not a purchase and does not guarantee a price. You agree terms
              with each farmer through an offer.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 pt-4 border-t border-surface-container">
          <button
            type="button" onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-on-surface-variant hover:bg-surface-container"
          >
            Cancel
          </button>
          <button
            type="button" disabled={!valid || busy || !hasChanges}
            onClick={() => onSubmit(payload)}
            title={isEdit && !hasChanges ? 'Nothing has changed yet' : undefined}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold ${
              valid && !busy && hasChanges
                ? 'bg-primary text-on-primary hover:opacity-90'
                : 'bg-surface-container text-on-surface-variant cursor-not-allowed'
            }`}
          >
            {busy
              ? (isEdit ? 'Saving…' : 'Posting…')
              : (saveLabel || (isEdit ? 'Save changes' : 'Post requirement'))}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RequirementDialog;

import React, { useState, useEffect } from 'react';

/**
 * Edit a registered buyer's business details.
 *
 * VERIFICATION IS NOT A FIELD HERE
 * --------------------------------
 * buyerService.updateOwnProfile's WRITABLE set excludes `verification_status`
 * and `is_suspended` on purpose: a buyer must not be able to mark their own
 * business verified. So this dialog shows the current status as read-only text
 * and offers the one legitimate action — submitting for review.
 *
 * LOCATION IS WHAT MAKES DISTANCES WORK
 * -------------------------------------
 * `latitude` and `longitude` are writable, and they are the reason Browse
 * Farmers can say how far each farm is: the backend measures from this location
 * and refuses to send farm coordinates to the browser. A buyer with no location
 * saved gets listings with no distances and a disabled distance filter, which is
 * why the fields say so rather than sitting unexplained.
 *
 * @param {object} props
 * @param {object} props.profile - from GET /api/buyers/me
 * @param {Function} props.onSubmit - (changedFieldsOnly) => void
 * @param {Function} [props.onSubmitVerification]
 */

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-surface-container-high ' +
  'text-sm text-on-surface font-medium focus:outline-none focus:border-primary';
const labelClass =
  'block text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5';

const BUYER_TYPES = [
  ['wholesaler', 'Wholesaler'],
  ['processor', 'Processor / food factory'],
  ['retailer', 'Retailer / shop'],
  ['restaurant', 'Restaurant / hotel'],
  ['exporter', 'Exporter'],
  ['cooperative_fpo', 'Cooperative / FPO'],
  ['other', 'Other']
];

/** Current values as form strings, so a diff can be taken on save. */
const initialForm = (profile) => ({
  businessName: profile.businessName || '',
  buyerType: profile.buyerType || 'wholesaler',
  contactPerson: profile.contactPerson || '',
  businessPhone: profile.businessPhone || '',
  businessEmail: profile.businessEmail || '',
  address: profile.address || '',
  villageCity: profile.villageCity || '',
  district: profile.district || '',
  state: profile.state || '',
  pinCode: profile.pinCode || '',
  latitude: profile.latitude != null ? String(profile.latitude) : '',
  longitude: profile.longitude != null ? String(profile.longitude) : '',
  cropsPurchased: Array.isArray(profile.cropsPurchased)
    ? profile.cropsPurchased.join(', ')
    : (profile.cropsPurchased || ''),
  typicalPurchaseQuantityKg: profile.typicalPurchaseQuantityKg != null
    ? String(profile.typicalPurchaseQuantityKg) : '',
  serviceAreaKm: profile.serviceAreaKm != null ? String(profile.serviceAreaKm) : ''
});

const NUMERIC_FIELDS = ['latitude', 'longitude', 'typicalPurchaseQuantityKg', 'serviceAreaKm'];

const BuyerProfileDialog = ({
  open, profile, busy, error, fields, onSubmit, onClose, onSubmitVerification
}) => {
  const [form, setForm] = useState(() => initialForm(profile || {}));

  useEffect(() => {
    if (open && profile) setForm(initialForm(profile));
  }, [open, profile]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const fieldError = (name) => fields?.find((f) => f.field === name)?.message;

  if (!open || !profile) return null;

  /**
   * Only what changed, so a PATCH never rewrites a field the buyer did not open.
   *
   * `cropsPurchased` is an array on the wire but a comma list in the box, so it
   * is compared after splitting rather than as text.
   */
  const buildChanges = () => {
    const before = initialForm(profile);
    const changes = {};

    for (const [key, raw] of Object.entries(form)) {
      if (raw === before[key]) continue;

      if (key === 'cropsPurchased') {
        changes[key] = raw.split(',').map((c) => c.trim()).filter(Boolean);
      } else if (NUMERIC_FIELDS.includes(key)) {
        changes[key] = raw === '' ? null : Number(raw);
      } else {
        changes[key] = raw;
      }
    }
    return changes;
  };

  const changes = buildChanges();
  const hasChanges = Object.keys(changes).length > 0;
  const valid = form.businessName.trim().length >= 2;

  const hasLocation = form.latitude !== '' && form.longitude !== '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/40"
      role="dialog" aria-modal="true"
    >
      <div className="bg-surface-container-lowest w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-xl flex flex-col max-h-[92vh]">
        <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-surface-container">
          <div>
            <h2 className="font-headline font-extrabold text-xl text-on-surface">Business profile</h2>
            <p className="text-xs text-on-surface-variant mt-1">
              Farmers see your business name, type and area. Your phone and email stay private.
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

          {/* Status is shown, never edited. */}
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-container-low">
            <div>
              <span className={labelClass}>Verification</span>
              <p className="text-sm font-bold text-on-surface">{profile.verificationLabel}</p>
            </div>
            {profile.verificationStatus === 'unverified' && onSubmitVerification && (
              <button
                type="button" onClick={onSubmitVerification} disabled={busy}
                className="px-4 py-2 rounded-full bg-primary text-on-primary text-xs font-bold disabled:opacity-50 shrink-0"
              >
                Submit for review
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Business name *</label>
              <input type="text" value={form.businessName} onChange={set('businessName')} className={inputClass} />
              {fieldError('businessName') && (
                <p className="text-[11px] text-error font-semibold mt-1">{fieldError('businessName')}</p>
              )}
            </div>
            <div>
              <label className={labelClass}>What kind of business?</label>
              <select value={form.buyerType} onChange={set('buyerType')} className={inputClass}>
                {BUYER_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Contact person</label>
              <input type="text" value={form.contactPerson} onChange={set('contactPerson')} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Business phone</label>
              <input type="tel" value={form.businessPhone} onChange={set('businessPhone')} className={inputClass} />
              {fieldError('businessPhone') && (
                <p className="text-[11px] text-error font-semibold mt-1">{fieldError('businessPhone')}</p>
              )}
            </div>
            <div>
              <label className={labelClass}>Business email</label>
              <input type="email" value={form.businessEmail} onChange={set('businessEmail')} className={inputClass} />
              {fieldError('businessEmail') && (
                <p className="text-[11px] text-error font-semibold mt-1">{fieldError('businessEmail')}</p>
              )}
            </div>
          </div>

          <div>
            <label className={labelClass}>Address</label>
            <input type="text" value={form.address} onChange={set('address')} className={inputClass} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className={labelClass}>Town / city</label>
              <input type="text" value={form.villageCity} onChange={set('villageCity')} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>District</label>
              <input type="text" value={form.district} onChange={set('district')} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>State</label>
              <input type="text" value={form.state} onChange={set('state')} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>PIN</label>
              <input type="text" value={form.pinCode} onChange={set('pinCode')} className={inputClass} />
              {fieldError('pinCode') && (
                <p className="text-[11px] text-error font-semibold mt-1">{fieldError('pinCode')}</p>
              )}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-surface-container-low space-y-3">
            <div>
              <span className={labelClass}>Where you take delivery</span>
              <p className="text-[11px] text-on-surface-variant">
                {hasLocation
                  ? 'Used to show how far each farm is when you browse. Farm coordinates are never sent to your browser — the distance is measured on the server.'
                  : 'Without this, Browse Farmers cannot show distances and the distance filter stays off.'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Latitude</label>
                <input
                  type="number" step="0.000001" min="-90" max="90"
                  value={form.latitude} onChange={set('latitude')}
                  placeholder="21.1458" className={inputClass}
                />
                {fieldError('latitude') && (
                  <p className="text-[11px] text-error font-semibold mt-1">{fieldError('latitude')}</p>
                )}
              </div>
              <div>
                <label className={labelClass}>Longitude</label>
                <input
                  type="number" step="0.000001" min="-180" max="180"
                  value={form.longitude} onChange={set('longitude')}
                  placeholder="79.0882" className={inputClass}
                />
                {fieldError('longitude') && (
                  <p className="text-[11px] text-error font-semibold mt-1">{fieldError('longitude')}</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Crops you buy</label>
              <input
                type="text" value={form.cropsPurchased} onChange={set('cropsPurchased')}
                placeholder="tomato, onion, potato" className={inputClass}
              />
              {fieldError('cropsPurchased') && (
                <p className="text-[11px] text-error font-semibold mt-1">{fieldError('cropsPurchased')}</p>
              )}
            </div>
            <div>
              <label className={labelClass}>Typical purchase (kg)</label>
              <input
                type="number" min="1" value={form.typicalPurchaseQuantityKg}
                onChange={set('typicalPurchaseQuantityKg')} className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>How far will you buy from? (km)</label>
              <input
                type="number" min="1" value={form.serviceAreaKm}
                onChange={set('serviceAreaKm')} className={inputClass}
              />
            </div>
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
            onClick={() => onSubmit(changes)}
            title={!hasChanges ? 'Nothing has changed yet' : undefined}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold ${
              valid && !busy && hasChanges
                ? 'bg-primary text-on-primary hover:opacity-90'
                : 'bg-surface-container text-on-surface-variant cursor-not-allowed'
            }`}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BuyerProfileDialog;

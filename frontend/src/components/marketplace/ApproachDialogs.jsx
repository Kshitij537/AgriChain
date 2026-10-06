import React, { useState, useEffect, useMemo } from 'react';
import mp from '../../services/marketplaceService';

/**
 * The two ways a buyer approaches a farmer: open a conversation, or send an offer.
 *
 * Shared by the two pages that can start one — Browse Farmers (any listing on the
 * market) and My Requirements (a farmer already matched to a requirement) — so
 * the rules below are stated once and behave identically in both.
 *
 * EVERY APPROACH IS ANCHORED TO A REQUIREMENT
 * -------------------------------------------
 * The backend refuses to let a buyer contact an arbitrary farmer, and refuses an
 * offer not tied to one of the buyer's own open requirements for the same crop
 * (conversationService.findOrCreate, offerService.resolveContext). That is what
 * stops the marketplace becoming a cold-contact list and means every thread a
 * farmer receives already says what it is about.
 *
 * So both dialogs take the `requirements` that may legitimately back the
 * approach. Pass one and it is stated; pass several and the buyer picks; pass
 * none and the dialog explains the rule and links to the form, rather than
 * letting the request fail at the API.
 *
 * THE `farmerCrop` SHAPE
 * ----------------------
 * Both callers already hold an object with the same essential fields, under the
 * same names, because both come from the backend's farmer-facing projections:
 * GET /api/marketplace/availability and the matches from
 * GET /api/buyer-requirements/:id/matching-farmers. Required here:
 *
 *   availabilityId, farmerUserId, farmerName, crop, cropLabel,
 *   availableKg, qualityGrade, farmLocation, straightLineKm
 *
 * Neither projection includes farm coordinates or a phone number, by design.
 */

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low border border-surface-container-high ' +
  'text-sm text-on-surface font-medium focus:outline-none focus:border-primary';
const labelClass =
  'block text-[11px] font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5';

/**
 * The buyer's requirements that can legitimately back an approach about a crop.
 *
 * Open, still short of quantity, and for the same crop — the three things the
 * backend checks. Exported so a page can decide what to show before opening a
 * dialog, and so the rule lives in one place.
 *
 * @param {Array} requirements - the buyer's own requirements
 * @param {object} farmerCrop - the listing or match being approached
 * @returns {Array}
 */
export const eligibleRequirements = (requirements, farmerCrop) => {
  if (!farmerCrop) return [];
  return (requirements || []).filter(
    (r) => r.crop === farmerCrop.crop && r.isOpen && Number(r.quantityRemainingKg) > 0
  );
};

/** Picks which of the buyer's requirements an approach is for. */
const RequirementPicker = ({ requirements, value, onChange }) => {
  if (!requirements.length) return null;

  // One eligible requirement is the common case; naming it beats a select with a
  // single option the buyer has to open to read.
  if (requirements.length === 1) {
    const only = requirements[0];
    return (
      <div className="bg-surface-container-low rounded-2xl p-3.5 mb-4">
        <span className={labelClass}>For your requirement</span>
        <p className="text-sm font-bold text-on-surface">
          {mp.formatQuantity(only.quantityRemainingKg)} {only.cropLabel || only.crop} still needed
          {' '}at ₹{only.offeredPricePerKg}/kg
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <label className={labelClass}>Which requirement is this for? *</label>
      <select
        value={value || ''}
        onChange={(e) => onChange(Number(e.target.value))}
        className={inputClass}
      >
        {requirements.map((r) => (
          <option key={r.id} value={r.id}>
            {mp.formatQuantity(r.quantityRemainingKg)} {r.cropLabel || r.crop} at ₹{r.offeredPricePerKg}/kg
            {r.requiredBy ? ` — by ${mp.formatShortDate(r.requiredBy)}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
};

/**
 * Explains why a buyer cannot act on a listing yet, and what to do about it.
 *
 * Stating the rule is more useful than greying out the button with no reason.
 */
const NoRequirementNotice = ({ farmerCrop, onPostRequirement }) => {
  const cropName = farmerCrop.cropLabel || farmerCrop.crop;
  return (
    <div className="text-center py-2">
      <span className="material-symbols-outlined text-5xl text-primary mb-3 block">post_add</span>
      <h4 className="font-headline font-bold text-base text-on-surface mb-2">
        Post a {cropName} requirement first
      </h4>
      <p className="text-sm text-on-surface-variant mb-5 max-w-sm mx-auto">
        Farmers only receive approaches that say what they are about. Post what you need —
        quantity, price and date — and you can then make offers on any {cropName} on this page.
      </p>
      <button
        onClick={onPostRequirement}
        className="px-6 py-3 rounded-full bg-primary text-on-primary text-sm font-bold hover:opacity-90"
      >
        Post a requirement
      </button>
    </div>
  );
};

/** A one-line description of the crop being approached, shown under both titles. */
const CropSubtitle = ({ farmerCrop }) => (
  <p className="text-xs text-on-surface-variant mt-0.5">
    {mp.formatQuantity(farmerCrop.availableKg)} {farmerCrop.cropLabel || farmerCrop.crop}
    {farmerCrop.qualityGrade ? ` · Grade ${farmerCrop.qualityGrade}` : ' · ungraded'}
    {farmerCrop.straightLineKm !== null && farmerCrop.straightLineKm !== undefined
      ? ` · ~${farmerCrop.straightLineKm} km`
      : ''}
    {farmerCrop.farmLocation ? ` · ${farmerCrop.farmLocation}` : ''}
  </p>
);

const DialogShell = ({ title, farmerCrop, onClose, wide = false, children }) => (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4 overflow-y-auto">
    <div className={`bg-surface-container-lowest rounded-3xl p-6 w-full shadow-xl my-8 ${
      wide ? 'max-w-lg' : 'max-w-md'
    }`}>
      <div className="flex items-start justify-between mb-5 gap-3">
        <div className="min-w-0">
          <h3 className="font-headline font-extrabold text-xl text-on-surface">{title}</h3>
          <CropSubtitle farmerCrop={farmerCrop} />
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-on-surface-variant hover:text-on-surface shrink-0"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      {children}
    </div>
  </div>
);

/**
 * Confirms which requirement a new conversation belongs to, then opens it.
 *
 * @param {object} props
 * @param {object} props.farmerCrop
 * @param {Array} props.requirements - already filtered with eligibleRequirements
 * @param {Function} props.onConfirm - (requirementId) => void
 */
export const ContactDialog = ({
  farmerCrop, requirements, busy, error, onClose, onConfirm, onPostRequirement
}) => {
  const [requirementId, setRequirementId] = useState(requirements[0]?.id || null);

  return (
    <DialogShell title={`Message ${farmerCrop.farmerName}`} farmerCrop={farmerCrop} onClose={onClose}>
      {requirements.length === 0 ? (
        <NoRequirementNotice farmerCrop={farmerCrop} onPostRequirement={onPostRequirement} />
      ) : (
        <>
          <RequirementPicker
            requirements={requirements}
            value={requirementId}
            onChange={setRequirementId}
          />
          <p className="text-xs text-on-surface-variant mb-5">
            This opens a thread with {farmerCrop.farmerName}. Nothing is agreed by messaging —
            send an offer when you want to propose terms.
          </p>
          {error && (
            <div className="bg-error-container text-on-error-container p-3 rounded-xl mb-4">
              <p className="text-xs font-semibold">{error}</p>
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-full bg-surface-container-high text-on-surface text-sm font-bold"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(requirementId)}
              disabled={busy || !requirementId}
              className="flex-1 px-4 py-3 rounded-full bg-primary text-on-primary text-sm font-bold hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Opening…' : 'Open conversation'}
            </button>
          </div>
        </>
      )}
    </DialogShell>
  );
};

/**
 * Proposes terms to one farmer.
 *
 * Defaults are the honest starting point rather than blank fields: the price the
 * buyer already advertised, and the largest quantity valid for both sides — the
 * farmer cannot sell more than they have, and the requirement cannot take more
 * than it still needs.
 *
 * @param {object} props
 * @param {Function} props.onSubmit - ({ requirementId, quantityKg, pricePerKg, deliveryTerms, message }) => void
 */
export const OfferDialog = ({
  farmerCrop, requirements, busy, error, onClose, onSubmit, onPostRequirement
}) => {
  const [requirementId, setRequirementId] = useState(requirements[0]?.id || null);

  const requirement = useMemo(
    () => requirements.find((r) => r.id === requirementId) || null,
    [requirements, requirementId]
  );

  // The farmer's own figure for this crop. Browse sends `availableKg`; a match
  // sends `matchedQuantityKg` as well, which is already capped to the
  // requirement — the smaller of what is present is the safe ceiling.
  const sellableKg = Math.min(
    ...[farmerCrop.availableKg, farmerCrop.matchedQuantityKg]
      .filter((v) => Number.isFinite(Number(v)))
      .map(Number)
  );

  const maxQuantity = requirement
    ? Math.min(sellableKg, requirement.quantityRemainingKg)
    : sellableKg;

  const [quantityKg, setQuantityKg] = useState(String(maxQuantity));
  const [pricePerKg, setPricePerKg] = useState(
    requirement ? String(requirement.offeredPricePerKg) : ''
  );
  const [message, setMessage] = useState('');
  const [deliveryTerms, setDeliveryTerms] = useState('');

  // Switching requirement changes what is valid, so the terms follow it.
  useEffect(() => {
    if (!requirement) return;
    setQuantityKg(String(Math.min(sellableKg, requirement.quantityRemainingKg)));
    setPricePerKg(String(requirement.offeredPricePerKg));
    setDeliveryTerms(requirement.pickupAvailable ? 'buyer_pickup' : 'farmer_delivers');
  }, [requirement, sellableKg]);

  // Only arrangements the requirement actually permits are offered; the backend
  // rejects the others, so showing them would invite a pointless failure.
  const deliveryOptions = useMemo(() => {
    if (!requirement) return [];
    const options = [];
    if (requirement.pickupAvailable) options.push(['buyer_pickup', 'I collect from the farm']);
    if (requirement.deliveryRequired || !requirement.pickupAvailable) {
      options.push(['farmer_delivers', 'Farmer delivers to me']);
    }
    return options;
  }, [requirement]);

  const quantityNum = Number(quantityKg);
  const priceNum = Number(pricePerKg);

  // Mirrors offerService.validateTerms so the buyer is told before sending
  // rather than after a rejection.
  const localProblem = (() => {
    if (!requirement) return 'Choose a requirement.';
    if (!Number.isFinite(quantityNum) || quantityNum <= 0) return 'Enter a quantity.';
    if (!Number.isFinite(priceNum) || priceNum <= 0) return 'Enter a price.';
    if (quantityNum > sellableKg) {
      return `This farmer has only ${mp.formatQuantity(sellableKg)} available.`;
    }
    if (quantityNum > requirement.quantityRemainingKg) {
      return `Your requirement needs only ${mp.formatQuantity(requirement.quantityRemainingKg)} more.`;
    }
    if (quantityNum < requirement.quantityRemainingKg && !requirement.partialFulfillmentAllowed) {
      return `That requirement needs the full ${mp.formatQuantity(requirement.quantityRemainingKg)} in one lot.`;
    }
    if (requirement.minimumAcceptableQuantityKg
        && quantityNum < requirement.minimumAcceptableQuantityKg) {
      return `That requirement accepts lots of at least ${mp.formatQuantity(requirement.minimumAcceptableQuantityKg)}.`;
    }
    return null;
  })();

  const total = Number.isFinite(quantityNum) && Number.isFinite(priceNum) ? quantityNum * priceNum : 0;

  return (
    <DialogShell title={`Offer to ${farmerCrop.farmerName}`} farmerCrop={farmerCrop} onClose={onClose} wide>
      {requirements.length === 0 ? (
        <NoRequirementNotice farmerCrop={farmerCrop} onPostRequirement={onPostRequirement} />
      ) : (
        <>
          <RequirementPicker
            requirements={requirements}
            value={requirementId}
            onChange={setRequirementId}
          />

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelClass}>Quantity (kg) *</label>
              <input
                type="number" min="1" max={maxQuantity}
                value={quantityKg}
                onChange={(e) => setQuantityKg(e.target.value)}
                className={inputClass}
              />
              <p className="text-[11px] text-on-surface-variant mt-1">
                Up to {mp.formatQuantity(maxQuantity)}
              </p>
            </div>
            <div>
              <label className={labelClass}>Price per kg (₹) *</label>
              <input
                type="number" min="0.01" step="0.01"
                value={pricePerKg}
                onChange={(e) => setPricePerKg(e.target.value)}
                className={inputClass}
              />
              {requirement && (
                <p className="text-[11px] text-on-surface-variant mt-1">
                  You advertised ₹{requirement.offeredPricePerKg}/kg
                </p>
              )}
            </div>
          </div>

          {deliveryOptions.length > 0 && (
            <div className="mb-4">
              <label className={labelClass}>Who moves the crop? *</label>
              <select
                value={deliveryTerms}
                onChange={(e) => setDeliveryTerms(e.target.value)}
                className={inputClass}
              >
                {deliveryOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="mb-4">
            <label className={labelClass}>Message (optional)</label>
            <textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Anything the farmer should know about collection or quality."
              className={inputClass}
            />
          </div>

          <div className="bg-surface-container-low rounded-2xl p-4 mb-4">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                Offer total
              </span>
              <span className="font-headline font-extrabold text-xl text-on-surface">
                {mp.formatRupees(total)}
              </span>
            </div>
            <p className="text-[11px] text-on-surface-variant mt-2">
              This is a proposal. Nothing is agreed until the farmer accepts.
            </p>
          </div>

          {(error || localProblem) && (
            <div className={`p-3 rounded-xl mb-4 ${
              error ? 'bg-error-container text-on-error-container' : 'bg-surface-container-high'
            }`}>
              <p className="text-xs font-semibold">{error || localProblem}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-full bg-surface-container-high text-on-surface text-sm font-bold"
            >
              Cancel
            </button>
            <button
              onClick={() => onSubmit({
                requirementId,
                quantityKg: quantityNum,
                pricePerKg: priceNum,
                deliveryTerms,
                message: message.trim() || null
              })}
              disabled={busy || Boolean(localProblem)}
              className="flex-1 px-4 py-3 rounded-full bg-primary text-on-primary text-sm font-bold hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send offer'}
            </button>
          </div>
        </>
      )}
    </DialogShell>
  );
};

export default { ContactDialog, OfferDialog, eligibleRequirements };

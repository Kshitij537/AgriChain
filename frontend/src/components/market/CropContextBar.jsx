import React from 'react';

/**
 * Single context tile inside the batch bar.
 */
const ContextItem = ({ icon, emoji, iconClass, label, value, sub, children }) => (
  <div className="flex items-center gap-3.5 pr-2 pt-2 sm:pt-0 sm:first:pl-0 sm:pl-4">
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${iconClass}`}>
      {emoji || <span className="material-symbols-outlined text-2xl">{icon}</span>}
    </div>
    <div className="min-w-0">
      <span className="block text-[11px] font-label font-semibold text-on-surface-variant uppercase tracking-wider">
        {label}
      </span>
      {children || (
        <span className="font-headline font-bold text-base text-on-surface truncate block">{value}</span>
      )}
      {sub && <span className="text-xs text-on-surface-variant font-medium block">{sub}</span>}
    </div>
  </div>
);

/**
 * The "what am I selling" bar: crop, quantity, origin and harvest status.
 *
 * @param {object} props
 * @param {object} props.batch - The harvest batch being sold
 * @param {Function} props.onChangeCrop
 * @param {Function} props.onEditQuantity
 */
const CropContextBar = ({ batch, onChangeCrop, onEditQuantity }) => {
  if (!batch) return null;

  return (
    <div className="bg-surface-container-lowest rounded-3xl p-5 shadow-sm">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-surface-container">
          <ContextItem
            emoji={batch.emoji}
            iconClass="bg-error/10 shadow-inner"
            label="Crop Batch"
            value={batch.variety ? `${batch.crop} (${batch.variety})` : batch.crop}
            sub={batch.grade}
          />
          <ContextItem
            icon="scale"
            iconClass="bg-secondary-fixed/50 text-secondary"
            label="Quantity"
            value={`${batch.quantityKg} kg (${batch.quintals} Qtl)`}
            sub={batch.crates ? `~${batch.crates} plastic crates` : null}
          />
          <ContextItem
            icon="home_pin"
            iconClass="bg-surface-container-high text-on-surface"
            label="Farm Origin"
            value={batch.origin?.name}
            sub={batch.origin?.district}
          />
          <ContextItem
            icon="eco"
            iconClass="bg-primary-fixed/40 text-primary-container"
            label="Harvest Status"
            sub={batch.pickedAt ? `Picked at ${batch.pickedAt}` : null}
          >
            <span className="inline-flex items-center gap-1.5 font-headline font-bold text-sm text-primary">
              <span className="w-2 h-2 rounded-full bg-primary-fixed-dim" />
              {batch.status}
            </span>
          </ContextItem>
        </div>

        <div className="flex items-center gap-2 pt-3 xl:pt-0 border-t xl:border-t-0 border-surface-container justify-end shrink-0">
          <button
            type="button"
            onClick={onChangeCrop}
            className="px-4 py-2.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold tracking-wide transition-all"
          >
            Change Crop
          </button>
          <button
            type="button"
            onClick={onEditQuantity}
            className="px-4 py-2.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold tracking-wide transition-all"
          >
            Edit Quantity
          </button>
        </div>
      </div>
    </div>
  );
};

export default CropContextBar;

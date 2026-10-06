import React from 'react';

/**
 * Confirms removal of whatever the farmer has ticked.
 *
 * Deliberately a blocking dialog rather than an undo toast. Removal here takes a
 * crop off the market or drops a saved harvest, and a mis-tap on a phone in a
 * field should not do either quietly.
 *
 * Shared by the Market and Buyers sections so "select, then remove" looks and
 * behaves identically in both. The caller owns the wording and the rules — which
 * rows may actually go, and what to warn about — because those differ per section;
 * this component owns only the shell, the list and the busy/error handling.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.title - the question, e.g. "Remove these 2 crops?"
 * @param {React.ReactNode} props.description - what removal will actually do
 * @param {Array} props.items - [{ key, primary, secondary, trailing }]
 * @param {React.ReactNode} [props.warning] - amber block, e.g. rows that cannot go
 * @param {string} [props.confirmLabel]
 * @param {string} [props.cancelLabel]
 * @param {boolean} [props.confirmDisabled] - nothing left that may be removed
 * @param {boolean} [props.busy]
 * @param {string} [props.error]
 * @param {Function} props.onConfirm
 * @param {Function} props.onClose
 */
const ConfirmRemoveDialog = ({
  open,
  title,
  description,
  items = [],
  warning = null,
  confirmLabel = 'Remove',
  cancelLabel = 'Cancel',
  confirmDisabled = false,
  busy = false,
  error = '',
  onConfirm,
  onClose
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/40"
      role="dialog" aria-modal="true">
      <div className="bg-surface-container-lowest w-full sm:max-w-md max-h-[92vh] rounded-t-3xl sm:rounded-3xl shadow-xl flex flex-col">
        <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-surface-container">
          <h2 className="font-headline font-extrabold text-lg text-on-surface">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-9 h-9 rounded-xl hover:bg-surface-container flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-error-container text-on-error-container text-xs">{error}</div>
          )}

          {description && <p className="text-sm text-on-surface-variant">{description}</p>}

          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.key}
                className="flex items-baseline justify-between gap-3 p-3 rounded-xl bg-surface-container-low">
                <span className="font-headline font-bold text-sm text-on-surface">
                  {item.primary}
                  {item.secondary && (
                    <span className="block text-[11px] font-body font-normal text-on-surface-variant">
                      {item.secondary}
                    </span>
                  )}
                </span>
                {item.trailing && (
                  <span className="text-xs text-on-surface-variant shrink-0">{item.trailing}</span>
                )}
              </li>
            ))}
          </ul>

          {warning && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10">
              <span className="material-symbols-outlined text-amber-700 text-base shrink-0">warning</span>
              <p className="text-[11px] text-amber-950 leading-relaxed">{warning}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 pt-4 border-t border-surface-container">
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-on-surface-variant hover:bg-surface-container">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy || confirmDisabled}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold ${
              busy || confirmDisabled
                ? 'bg-surface-container text-on-surface-variant cursor-not-allowed'
                : 'bg-error text-on-error hover:opacity-90'
            }`}>
            {busy ? 'Removing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmRemoveDialog;

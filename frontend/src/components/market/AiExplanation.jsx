import React, { useState } from 'react';

/**
 * The four data layers behind the recommendation. Kept as data so the copy
 * stays in one place.
 */
const DATA_LAYERS = [
  {
    title: '1. Live Mandi Influx',
    body: 'Direct integration with Agmarknet and APMC arrivals data across nearby district markets.'
  },
  {
    title: '2. Road & Fuel Models',
    body: 'Computes local diesel price, mini-truck payload tiers and empty return journey overheads.'
  },
  {
    title: '3. Heat Rot Physics',
    body: 'Calculates transit decay from hourly ambient temperature forecasts and crate ventilation.'
  },
  {
    title: '4. Commission & Fees',
    body: 'Audits statutory APMC weighing charges, loading labour and market committee user cess.'
  }
];

/**
 * Transparency accordion explaining how the recommendation is derived.
 *
 * Collapsed by default; the farmer opens it only if they want the reasoning.
 */
const AiExplanation = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-surface-container-low rounded-3xl p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-primary-container text-on-primary flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-2xl">smart_toy</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-headline font-bold text-lg text-on-surface">
              How does AgriChain calculate this recommendation?
            </h3>
            <button
              type="button"
              onClick={() => setIsOpen((open) => !open)}
              aria-expanded={isOpen}
              aria-controls="market-explanation-panel"
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 shrink-0"
            >
              <span>Why am I seeing this?</span>
              <span
                className={`material-symbols-outlined text-base transition-transform ${
                  isOpen ? 'rotate-180' : ''
                }`}
              >
                expand_more
              </span>
            </button>
          </div>
          <p className="text-xs sm:text-sm text-on-surface-variant mt-1.5 leading-relaxed">
            We synthesize four independent real-time data layers to protect your bottom line:
          </p>

          {isOpen && (
            <div
              id="market-explanation-panel"
              className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-5 pt-4 border-t border-surface-container-high"
            >
              {DATA_LAYERS.map((layer) => (
                <div key={layer.title} className="p-3 bg-surface-container-lowest rounded-xl">
                  <span className="font-bold text-xs text-on-surface block mb-1">{layer.title}</span>
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">{layer.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AiExplanation;

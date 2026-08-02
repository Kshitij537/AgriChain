import React from 'react';
import ConfidenceMeter from './ConfidenceMeter';

const PredictionCard = ({ predictionData }) => {
  if (!predictionData || !predictionData.prediction) return null;

  const {
    prediction,
    top_predictions,
    model_version,
    is_reliable,
    low_confidence_warning,
    limited_data_warning,
  } = predictionData;
  const { crop, disease, display_name, is_healthy, confidence } = prediction;

  const confPercent = (confidence <= 1.0 ? confidence * 100 : confidence).toFixed(2);
  const isUnreliable = is_reliable === false;

  return (
    <div className="rounded-[2rem] border border-outline-variant/10 bg-surface-container p-6 shadow-sm space-y-6">

      {/* ── OOD Warning Banner ─────────────────────────────────────────────── */}
      {isUnreliable && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-4 dark:bg-amber-900/20 dark:border-amber-500/40">
          <span
            className="material-symbols-outlined mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
            style={{ fontSize: '1.35rem' }}
          >
            warning
          </span>
          <div>
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
              Image Not Recognised as a Crop Leaf
            </p>
            <p className="mt-0.5 text-xs leading-5 text-amber-700 dark:text-amber-400">
              {low_confidence_warning ||
                'The model could not confidently identify a crop leaf in this image. Please upload a clear, close-up photo of a single crop leaf for accurate results.'}
            </p>
          </div>
        </div>
      )}

      {/* ── Limited Data Advisory Banner ───────────────────────────────────── */}
      {limited_data_warning && (
        <div className="flex items-start gap-3 rounded-2xl border border-blue-200/70 bg-blue-50 px-4 py-4 dark:bg-blue-900/20 dark:border-blue-500/40">
          <span
            className="material-symbols-outlined mt-0.5 shrink-0 text-blue-600 dark:text-blue-400"
            style={{ fontSize: '1.35rem' }}
          >
            info
          </span>
          <div>
            <p className="text-sm font-bold text-blue-800 dark:text-blue-300">
              Limited Training Data — Verify with Expert
            </p>
            <p className="mt-0.5 text-xs leading-5 text-blue-700 dark:text-blue-400">
              {limited_data_warning}
            </p>
          </div>
        </div>
      )}

      {/* ── Prediction Body (dimmed when unreliable) ───────────────────────── */}
      <div className={isUnreliable ? 'opacity-50 pointer-events-none select-none' : ''}>

        {/* Header Badge & Title */}
        <div className="flex justify-between items-start gap-4 mb-6">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full">
              {crop} Crop Analysis
            </span>
            <h3 className="mt-2 font-headline text-2xl font-bold text-primary">
              {display_name}
            </h3>
          </div>
          {isUnreliable ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border border-amber-300/60 bg-amber-100 text-amber-700">
              <span className="material-symbols-outlined text-base">help</span>
              Result Unreliable
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg ${
                is_healthy
                  ? 'border border-primary/15 bg-primary/10 text-primary'
                  : 'border border-error/15 bg-error/10 text-error'
              }`}
            >
              <span className="material-symbols-outlined text-base">
                {is_healthy ? 'check_circle' : 'warning'}
              </span>
              {is_healthy ? 'Healthy Leaf' : 'Disease Detected'}
            </span>
          )}
        </div>

        {/* Primary Metrics Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-outline-variant/10 bg-surface p-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Condition / Disease
            </p>
            <p className={`text-lg font-bold ${is_healthy ? 'text-primary' : 'text-error'}`}>
              {disease}
            </p>
          </div>
          <div className="rounded-2xl border border-outline-variant/10 bg-surface p-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Confidence
            </p>
            <p className="text-lg font-bold text-primary">
              {confPercent}%
            </p>
          </div>
        </div>

        {/* Visual Confidence Bar */}
        <div className="mt-4">
          <ConfidenceMeter confidence={confidence} isHealthy={is_healthy} />
        </div>

        {/* Top Alternative Predictions */}
        {top_predictions && top_predictions.length > 0 && (
          <div className="border-t border-outline-variant/10 pt-4 mt-4">
            <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-primary">
              <span className="material-symbols-outlined text-base text-primary">list</span>
              Top Model Predictions
            </h4>
            <div className="space-y-2">
              {top_predictions.map((top, idx) => {
                const topConf = (top.confidence <= 1.0 ? top.confidence * 100 : top.confidence).toFixed(2);
                return (
                  <div key={idx} className="flex items-center justify-between rounded-2xl border border-outline-variant/10 bg-surface px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-4 text-xs font-bold text-on-surface-variant">{idx + 1}.</span>
                      <span className="font-medium text-on-surface">{top.display_name}</span>
                    </div>
                    <span className="font-semibold text-primary">{topConf}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Model Metadata Footer & Disclaimer */}
      <div className="flex items-center justify-between border-t border-outline-variant/10 pt-3 text-xs text-on-surface-variant">
        <span>Model Version: {model_version || '1.0.0'}</span>
        <span className="italic">AI Decision Support Only</span>
      </div>
    </div>
  );
};

export default PredictionCard;

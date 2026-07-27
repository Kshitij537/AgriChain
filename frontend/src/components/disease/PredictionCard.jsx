import React from 'react';
import ConfidenceMeter from './ConfidenceMeter';

const PredictionCard = ({ predictionData }) => {
  if (!predictionData || !predictionData.prediction) return null;

  const { prediction, top_predictions, model_version } = predictionData;
  const { crop, disease, display_name, is_healthy, confidence } = prediction;

  const confPercent = (confidence <= 1.0 ? confidence * 100 : confidence).toFixed(2);

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-900/10 space-y-6">
      {/* Header Badge & Title */}
      <div className="flex justify-between items-start gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full">
            {crop} Crop Analysis
          </span>
          <h3 className="text-2xl font-bold text-slate-900 mt-2 font-headline">
            {display_name}
          </h3>
        </div>
        <span
          className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg ${
            is_healthy
              ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-700 border border-rose-500/20'
          }`}
        >
          <span className="material-symbols-outlined text-base">
            {is_healthy ? 'check_circle' : 'warning'}
          </span>
          {is_healthy ? 'Healthy Leaf' : 'Disease Detected'}
        </span>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Condition / Disease
          </p>
          <p className={`text-lg font-bold ${is_healthy ? 'text-emerald-700' : 'text-rose-600'}`}>
            {disease}
          </p>
        </div>
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Confidence
          </p>
          <p className="text-lg font-bold text-slate-900">
            {confPercent}%
          </p>
        </div>
      </div>

      {/* Visual Confidence Bar */}
      <ConfidenceMeter confidence={confidence} isHealthy={is_healthy} />

      {/* Top Alternative Predictions */}
      {top_predictions && top_predictions.length > 0 && (
        <div className="pt-4 border-t border-slate-100">
          <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-emerald-700">list</span>
            Top Model Predictions
          </h4>
          <div className="space-y-2">
            {top_predictions.map((top, idx) => {
              const topConf = (top.confidence <= 1.0 ? top.confidence * 100 : top.confidence).toFixed(2);
              return (
                <div key={idx} className="flex justify-between items-center text-sm p-2 rounded-lg hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 w-4">{idx + 1}.</span>
                    <span className="font-medium text-slate-700">{top.display_name}</span>
                  </div>
                  <span className="font-semibold text-slate-900">{topConf}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Model Metadata Footer & Disclaimer */}
      <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
        <span>Model Version: {model_version || '1.0.0'}</span>
        <span className="italic text-slate-400">AI Decision Support Only</span>
      </div>
    </div>
  );
};

export default PredictionCard;

import React, { useState } from 'react';

const DiseaseHistoryItem = ({ item }) => {
  const [expanded, setExpanded] = useState(false);

  const {
    disease_name,
    severity_level,
    confidence_score,
    created_at,
    details
  } = item;

  const confPercent = (confidence_score <= 1.0 ? confidence_score * 100 : confidence_score).toFixed(2);
  const isHealthy = severity_level === 'Healthy' || (disease_name && disease_name.toLowerCase().includes('healthy'));

  const formattedDate = new Date(created_at).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3 transition-all hover:border-emerald-500/30">
      {/* Card Header */}
      <div className="flex flex-wrap justify-between items-start gap-2">
        <div>
          <h4 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <span>{disease_name}</span>
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Detected: {formattedDate}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-md ${
              isHealthy
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}
          >
            {isHealthy ? 'Healthy Leaf' : severity_level || 'Disease Detected'}
          </span>
          <span className="bg-slate-100 text-slate-800 text-xs font-bold px-2.5 py-1 rounded-md">
            {confPercent}%
          </span>
        </div>
      </div>

      {/* Accordion Toggle */}
      {details && (
        <div className="pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">
              {expanded ? 'expand_less' : 'expand_more'}
            </span>
            {expanded ? 'Hide Advisory Details' : 'View Advisory Details'}
          </button>

          {/* Expandable Details Container */}
          {expanded && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-3 text-xs text-slate-700 bg-slate-50 p-3 rounded-lg">
              {details.description && (
                <div>
                  <p className="font-bold text-slate-900 mb-0.5">Overview:</p>
                  <p>{details.description}</p>
                </div>
              )}

              {details.symptoms && details.symptoms.length > 0 && (
                <div>
                  <p className="font-bold text-slate-900 mb-0.5">Symptoms:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {details.symptoms.map((sym, i) => (
                      <li key={i}>{sym}</li>
                    ))}
                  </ul>
                </div>
              )}

              {details.recommendations && details.recommendations.length > 0 && (
                <div>
                  <p className="font-bold text-emerald-900 mb-0.5">Recommended Actions:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-emerald-950">
                    {details.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              {details.advisory && (
                <p className="italic text-slate-500 pt-1 border-t border-slate-200">
                  {details.advisory}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const DiseaseHistory = ({ history, loading, error, onRetry, selectedFarmId }) => {
  if (!selectedFarmId) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-900/10 text-center text-slate-500 text-sm">
        <span className="material-symbols-outlined text-3xl text-slate-400 block mb-2">location_on</span>
        Select a farm above to view or log disease detection history.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-900/10 space-y-4">
      <div className="flex justify-between items-center pb-3 border-b border-slate-100">
        <h3 className="text-lg font-bold text-slate-900 font-headline flex items-center gap-2">
          <span className="material-symbols-outlined text-emerald-700">history</span>
          Farm Disease Detection History
        </h3>
        {history && history.length > 0 && (
          <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full">
            {history.length} {history.length === 1 ? 'Record' : 'Records'}
          </span>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="py-8 text-center text-slate-500 flex flex-col items-center space-y-2">
          <span className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></span>
          <p className="text-sm font-medium">Loading detection history...</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs flex justify-between items-center">
          <span>{error.message || 'Failed to load history.'}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="font-bold underline text-rose-800 hover:text-rose-950 ml-2"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && (!history || history.length === 0) && (
        <div className="py-8 text-center space-y-2">
          <span className="material-symbols-outlined text-4xl text-slate-300 block">inventory_2</span>
          <p className="text-sm font-medium text-slate-600">No disease detections recorded for this farm yet.</p>
          <p className="text-xs text-slate-400">Upload a leaf image above with this farm selected to start recording detections.</p>
        </div>
      )}

      {/* History Items List */}
      {!loading && !error && history && history.length > 0 && (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {history.map((item) => (
            <DiseaseHistoryItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};

export default DiseaseHistory;

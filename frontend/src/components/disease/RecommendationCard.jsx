import React from 'react';

const RecommendationCard = ({ details, isHealthy }) => {
  if (!details) return null;

  const {
    description,
    symptoms = [],
    causes = [],
    recommendations = [],
    prevention = [],
    severity_level,
    advisory,
    confidence_assessment,
    sources = []
  } = details;

  const confLevel = confidence_assessment?.level || 'high';
  const confMessage = confidence_assessment?.message;

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-900/10 space-y-6">
      
      {/* Confidence Level Caution / Warning Banner */}
      {confLevel !== 'high' && confMessage && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 text-sm ${
            confLevel === 'moderate'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span className="material-symbols-outlined text-lg shrink-0 mt-0.5">
            {confLevel === 'moderate' ? 'warning' : 'report_problem'}
          </span>
          <div>
            <h4 className="font-bold text-xs uppercase tracking-wider mb-1">
              {confLevel === 'moderate' ? 'Moderate Confidence Notice' : 'Low Confidence Caution'}
            </h4>
            <p>{confMessage}</p>
          </div>
        </div>
      )}

      {/* Disease / Crop Health Overview */}
      <div>
        <h3 className="text-lg font-bold text-slate-900 font-headline mb-2 flex items-center gap-2">
          <span className="material-symbols-outlined text-emerald-700">info</span>
          {isHealthy ? 'Crop Health Summary' : 'Disease Overview'}
        </h3>
        <p className="text-slate-700 text-sm leading-relaxed">{description}</p>
      </div>

      {/* Visible Symptoms (Diseased only) */}
      {!isHealthy && symptoms.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-rose-600">visibility</span>
            Common Visible Symptoms
          </h4>
          <ul className="list-disc list-inside space-y-1 text-sm text-slate-700">
            {symptoms.map((symptom, idx) => (
              <li key={idx} className="leading-relaxed">{symptom}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Causes & Spread (Diseased only) */}
      {!isHealthy && causes.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-amber-600">biotech</span>
            Causes & Environmental Drivers
          </h4>
          <ul className="list-disc list-inside space-y-1 text-sm text-slate-700">
            {causes.map((cause, idx) => (
              <li key={idx} className="leading-relaxed">{cause}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommended Management Actions */}
      {recommendations.length > 0 && (
        <div className={`p-4 rounded-xl border ${isHealthy ? 'bg-emerald-50/50 border-emerald-200' : 'bg-emerald-50/80 border-emerald-200'}`}>
          <h4 className="text-sm font-bold text-emerald-950 mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-emerald-700">task_alt</span>
            {isHealthy ? 'Routine Maintenance Guidance' : 'Recommended Management Actions'}
          </h4>
          <ul className="space-y-2 text-sm text-emerald-900">
            {recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-2 leading-relaxed">
                <span className="text-emerald-700 font-bold">•</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Preventive Guidance */}
      {prevention.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-blue-600">shield</span>
            Preventive & Cultural Practices
          </h4>
          <ul className="list-disc list-inside space-y-1 text-sm text-slate-700">
            {prevention.map((prev, idx) => (
              <li key={idx} className="leading-relaxed">{prev}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Official Advisory / Disclaimer */}
      {advisory && (
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
          <span className="material-symbols-outlined text-sm text-slate-400 shrink-0 mt-0.5">verified_user</span>
          <p className="leading-relaxed">{advisory}</p>
        </div>
      )}

      {/* Agricultural Extension Reference Sources */}
      {sources.length > 0 && (
        <div className="pt-3 border-t border-slate-100 text-xs text-slate-500">
          <p className="font-semibold text-slate-600 mb-1">References & Extension Sources:</p>
          <ul className="space-y-0.5 text-slate-500">
            {sources.map((src, idx) => (
              <li key={idx}>
                • <span className="font-medium text-slate-700">{src.name}</span>: {src.reference}
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
};

export default RecommendationCard;

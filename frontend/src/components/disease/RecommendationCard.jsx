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
    <div className="rounded-[2rem] border border-outline-variant/10 bg-surface-container p-6 shadow-sm space-y-6">
      
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
            <h4 className="mb-1 text-xs font-bold uppercase tracking-wider">
              {confLevel === 'moderate' ? 'Moderate Confidence Notice' : 'Low Confidence Caution'}
            </h4>
            <p>{confMessage}</p>
          </div>
        </div>
      )}

      {/* Disease / Crop Health Overview */}
      <div>
        <h3 className="mb-2 flex items-center gap-2 font-headline text-lg font-bold text-primary">
          <span className="material-symbols-outlined text-primary">info</span>
          {isHealthy ? 'Crop Health Summary' : 'Disease Overview'}
        </h3>
        <p className="text-sm leading-relaxed text-on-surface">{description}</p>
      </div>

      {/* Visible Symptoms (Diseased only) */}
      {!isHealthy && symptoms.length > 0 && (
        <div>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-primary">
            <span className="material-symbols-outlined text-base text-error">visibility</span>
            Common Visible Symptoms
          </h4>
          <ul className="list-disc list-inside space-y-1 text-sm text-on-surface">
            {symptoms.map((symptom, idx) => (
              <li key={idx} className="leading-relaxed">{symptom}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Causes & Spread (Diseased only) */}
      {!isHealthy && causes.length > 0 && (
        <div>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-primary">
            <span className="material-symbols-outlined text-base text-secondary">biotech</span>
            Causes & Environmental Drivers
          </h4>
          <ul className="list-disc list-inside space-y-1 text-sm text-on-surface">
            {causes.map((cause, idx) => (
              <li key={idx} className="leading-relaxed">{cause}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommended Management Actions */}
      {recommendations.length > 0 && (
        <div className="rounded-2xl border border-primary/15 bg-primary/10 p-4">
          <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-primary">
            <span className="material-symbols-outlined text-base text-primary">task_alt</span>
            {isHealthy ? 'Routine Maintenance Guidance' : 'Recommended Management Actions'}
          </h4>
          <ul className="space-y-2 text-sm text-on-surface">
            {recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-2 leading-relaxed">
                <span className="font-bold text-primary">•</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Preventive Guidance */}
      {prevention.length > 0 && (
        <div>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-primary">
            <span className="material-symbols-outlined text-base text-primary">shield</span>
            Preventive & Cultural Practices
          </h4>
          <ul className="list-disc list-inside space-y-1 text-sm text-on-surface">
            {prevention.map((prev, idx) => (
              <li key={idx} className="leading-relaxed">{prev}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Official Advisory / Disclaimer */}
      {advisory && (
        <div className="flex items-start gap-2 rounded-2xl border border-outline-variant/10 bg-surface px-4 py-3 text-xs text-on-surface-variant">
          <span className="material-symbols-outlined mt-0.5 shrink-0 text-sm text-on-surface-variant">verified_user</span>
          <p className="leading-relaxed">{advisory}</p>
        </div>
      )}

      {/* Agricultural Extension Reference Sources */}
      {sources.length > 0 && (
        <div className="border-t border-outline-variant/10 pt-3 text-xs text-on-surface-variant">
          <p className="mb-1 font-semibold text-primary">References & Extension Sources:</p>
          <ul className="space-y-0.5">
            {sources.map((src, idx) => (
              <li key={idx}>
                • <span className="font-medium text-on-surface">{src.name}</span>: {src.reference}
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
};

export default RecommendationCard;

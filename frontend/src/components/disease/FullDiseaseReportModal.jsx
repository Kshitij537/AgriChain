import React from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const FullDiseaseReportModal = ({ report, onClose }) => {
  if (!report) return null;

  const {
    disease_name,
    severity_level,
    confidence_score,
    image_url,
    created_at,
    details = {}
  } = report;

  const confPercent = typeof confidence_score === 'number'
    ? (confidence_score <= 1.0 ? confidence_score * 100 : confidence_score).toFixed(1)
    : '--';

  const isHealthy = severity_level === 'Healthy' || (disease_name && disease_name.toLowerCase().includes('healthy'));

  const formattedDate = created_at
    ? new Date(created_at).toLocaleString('en-IN', {
        dateStyle: 'full',
        timeStyle: 'short'
      })
    : 'Recently Scanned';

  // Construct full image URL if relative path provided
  const fullImageUrl = image_url
    ? image_url.startsWith('http') || image_url.startsWith('data:')
      ? image_url
      : `${API_BASE_URL}${image_url}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-[2.5rem] border border-outline-variant/20 bg-surface p-6 sm:p-8 shadow-2xl space-y-6">
        
        {/* Header Bar */}
        <div className="flex items-start justify-between border-b border-outline-variant/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-2xl">biotech</span>
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant/70">
                Full Disease Detection Report
              </span>
              <h2 className="font-headline text-2xl font-extrabold text-primary">
                {disease_name || 'Crop Leaf Analysis'}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Hero Section: Leaf Image + Quick Metrics */}
        <div className="grid gap-6 md:grid-cols-[1fr_1.2fr] items-center bg-surface-container rounded-3xl p-5 border border-outline-variant/10">
          {/* Leaf Image View */}
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-outline-variant/10 bg-black/5 flex items-center justify-center">
            {fullImageUrl ? (
              <img
                src={fullImageUrl}
                alt={disease_name}
                className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              className="flex-col items-center justify-center gap-2 p-6 text-center text-on-surface-variant/50"
              style={{ display: fullImageUrl ? 'none' : 'flex' }}
            >
              <span className="material-symbols-outlined text-5xl">nature</span>
              <span className="text-xs font-medium">Scanned Leaf Image Saved</span>
            </div>
          </div>

          {/* Quick Metrics & Diagnosis Overview */}
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold ${
                  isHealthy
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-rose-100 text-rose-800 border border-rose-300'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${isHealthy ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                {isHealthy ? 'Healthy Leaf' : severity_level || 'Disease Detected'}
              </span>

              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-xs font-extrabold">
                <span className="material-symbols-outlined text-sm">verified</span>
                Confidence: {confPercent}%
              </span>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/60">Scan Timestamp</p>
              <p className="text-sm font-semibold text-on-surface mt-0.5">{formattedDate}</p>
            </div>

            {details.description && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/60">AI Overview</p>
                <p className="text-xs text-on-surface-variant leading-relaxed mt-1">{details.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Detailed Analysis Breakdown Grid */}
        <div className="grid gap-5 md:grid-cols-2">
          
          {/* Symptoms List */}
          {details.symptoms && details.symptoms.length > 0 && (
            <div className="rounded-3xl border border-outline-variant/10 bg-surface-container p-5 space-y-3">
              <h3 className="flex items-center gap-2 font-headline text-base font-bold text-primary">
                <span className="material-symbols-outlined text-amber-600">error</span>
                Observed Symptoms
              </h3>
              <ul className="space-y-2 text-xs text-on-surface-variant">
                {details.symptoms.map((symptom, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                    <span>{symptom}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Causes List */}
          {details.causes && details.causes.length > 0 && (
            <div className="rounded-3xl border border-outline-variant/10 bg-surface-container p-5 space-y-3">
              <h3 className="flex items-center gap-2 font-headline text-base font-bold text-primary">
                <span className="material-symbols-outlined text-rose-600">coronavirus</span>
                Root Causes & Pathogen
              </h3>
              <ul className="space-y-2 text-xs text-on-surface-variant">
                {details.causes.map((cause, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500 mt-1.5 flex-shrink-0" />
                    <span>{cause}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommended Treatments */}
          {details.recommendations && details.recommendations.length > 0 && (
            <div className="rounded-3xl border border-outline-variant/10 bg-surface-container p-5 space-y-3 md:col-span-2">
              <h3 className="flex items-center gap-2 font-headline text-base font-bold text-primary">
                <span className="material-symbols-outlined text-emerald-600">health_and_safety</span>
                Recommended Treatment Actions
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {details.recommendations.map((rec, idx) => (
                  <div key={idx} className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-950 flex items-start gap-2.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[10px] font-bold flex-shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="leading-relaxed font-medium">{rec}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prevention Guidelines */}
          {details.prevention && details.prevention.length > 0 && (
            <div className="rounded-3xl border border-outline-variant/10 bg-surface-container p-5 space-y-3 md:col-span-2">
              <h3 className="flex items-center gap-2 font-headline text-base font-bold text-primary">
                <span className="material-symbols-outlined text-blue-600">shield</span>
                Prevention Strategies
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2 text-xs text-on-surface-variant">
                {details.prevention.map((prev, idx) => (
                  <li key={idx} className="flex items-start gap-2 rounded-xl bg-surface p-3 border border-outline-variant/10">
                    <span className="material-symbols-outlined text-blue-500 text-base flex-shrink-0">check_circle</span>
                    <span className="leading-relaxed">{prev}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-outline-variant/10 pt-4">
          <p className="text-[11px] text-on-surface-variant/60 italic">
            AgriChain AI Disease Intelligence Report
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-2xl border border-outline-variant/10 bg-surface-container-high px-4 py-2.5 text-xs font-bold text-primary transition hover:bg-surface-container-highest"
            >
              <span className="material-symbols-outlined text-base">print</span>
              Print Report
            </button>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-primary-container transition"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default FullDiseaseReportModal;

import React, { useState } from 'react';
import FullDiseaseReportModal from './FullDiseaseReportModal';
import { t } from '../../utils/translations';


const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const DiseaseHistoryItem = ({ item, onViewReport }) => {
  const [expanded, setExpanded] = useState(false);

  const {
    disease_name,
    severity_level,
    confidence_score,
    image_url,
    created_at,
    details
  } = item;

  const confPercent = (confidence_score <= 1.0 ? confidence_score * 100 : confidence_score).toFixed(1);
  const isHealthy = severity_level === 'Healthy' || (disease_name && disease_name.toLowerCase().includes('healthy'));

  const formattedDate = created_at
    ? new Date(created_at).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    : 'Recently';

  const fullImageUrl = image_url
    ? image_url.startsWith('http') || image_url.startsWith('data:')
      ? image_url
      : `${API_BASE_URL}${image_url}`
    : null;

  return (
    <div className="rounded-3xl border border-outline-variant/10 bg-surface p-4 shadow-sm space-y-3 transition-all hover:border-primary/20">
      {/* Card Header with Leaf Image Thumbnail */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Leaf Thumbnail */}
          <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl border border-outline-variant/10 bg-surface-container-high flex items-center justify-center">
            {fullImageUrl ? (
              <img
                src={fullImageUrl}
                alt={disease_name}
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              className="flex items-center justify-center text-primary/40"
              style={{ display: fullImageUrl ? 'none' : 'flex' }}
            >
              <span className="material-symbols-outlined text-xl">eco</span>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
              <span>{disease_name}</span>
            </h4>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              Detected: {formattedDate}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-md ${
              isHealthy
                ? 'border border-primary/15 bg-primary/10 text-primary'
                : 'border border-error/15 bg-error/10 text-error'
            }`}
          >
            {isHealthy ? 'Healthy Leaf' : severity_level || 'Disease Detected'}
          </span>
          <span className="rounded-xl bg-surface-container-high px-2.5 py-1 text-xs font-bold text-primary">
            {confPercent}%
          </span>
        </div>
      </div>

      {/* Action Buttons Bar */}
      <div className="flex items-center justify-between border-t border-outline-variant/10 pt-2.5">
        <button
          type="button"
          onClick={() => onViewReport(item)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-extrabold text-primary hover:bg-primary/20 transition-colors"
        >
          <span className="material-symbols-outlined text-base">description</span>
          View Full Report
        </button>

        {details && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs font-bold text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-sm">
              {expanded ? 'expand_less' : 'expand_more'}
            </span>
            {expanded ? 'Quick Summary' : 'Quick Summary'}
          </button>
        )}
      </div>

      {/* Expandable Quick Details */}
      {expanded && details && (
        <div className="mt-3 space-y-3 rounded-2xl border border-outline-variant/10 bg-surface-container p-4 text-xs text-on-surface-variant animate-fade-in">
          {details.description && (
            <div>
              <p className="mb-0.5 font-bold text-primary">Overview:</p>
              <p className="leading-relaxed">{details.description}</p>
            </div>
          )}

          {details.recommendations && details.recommendations.length > 0 && (
            <div>
              <p className="mb-0.5 font-bold text-primary">Key Treatment Action:</p>
              <p className="text-on-surface leading-relaxed">{details.recommendations[0]}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const DiseaseHistory = ({ history, loading, error, onRetry, selectedFarmId, lang = 'en' }) => {
  const [selectedReport, setSelectedReport] = useState(null);

  return (
    <>
      <div className="rounded-[2rem] border border-outline-variant/10 bg-surface-container p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-outline-variant/10 pb-3">
          <h3 className="flex items-center gap-2 font-headline text-lg font-bold text-primary">
            <span className="material-symbols-outlined text-primary">history</span>
            {t('diseaseDetection', 'diseaseHistory', lang)}
          </h3>
          {history && history.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
              {history.length} {history.length === 1 ? 'Record' : 'Records'}
            </span>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center space-y-2 py-8 text-center text-on-surface-variant">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></span>
            <p className="text-sm font-medium">Loading detection history...</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="flex items-center justify-between rounded-2xl border border-error/20 bg-error/10 p-4 text-xs text-error">
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
          <div className="space-y-2 py-8 text-center">
            <span className="material-symbols-outlined block text-4xl text-on-surface-variant/30">inventory_2</span>
            <p className="text-sm font-bold text-primary">No disease detections recorded for this farm yet.</p>
            <p className="mx-auto max-w-xs text-xs text-on-surface-variant">
              Upload a leaf image above to start recording disease reports with full AI diagnostics.
            </p>
          </div>
        )}

        {/* History Items List */}
        {!loading && !error && history && history.length > 0 && (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {history.map((item) => (
              <DiseaseHistoryItem
                key={item.id}
                item={item}
                onViewReport={(rep) => setSelectedReport(rep)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Full Report Modal */}
      {selectedReport && (
        <FullDiseaseReportModal
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
        />
      )}
    </>
  );
};

export default DiseaseHistory;

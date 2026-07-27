import React from 'react';

const ErrorMessage = ({ error, onRetry }) => {
  if (!error) return null;

  return (
    <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 text-rose-900 shadow-sm">
      <span className="material-symbols-outlined text-rose-600 text-2xl shrink-0 mt-0.5">
        error
      </span>
      <div className="flex-1">
        <h4 className="font-bold text-sm text-rose-950 mb-1">
          {error.code === 'ML_SERVICE_UNAVAILABLE' || error.status === 503
            ? 'Service Offline'
            : error.code === 'ML_SERVICE_TIMEOUT' || error.status === 504
              ? 'Request Timeout'
              : 'Detection Error'}
        </h4>
        <p className="text-sm text-rose-800">{error.message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 text-xs font-bold text-rose-700 hover:text-rose-900 underline inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-xs">refresh</span>
            Try Again
          </button>
        )}
      </div>
    </div>
  );
};

export default ErrorMessage;

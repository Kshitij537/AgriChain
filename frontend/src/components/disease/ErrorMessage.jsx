import React from 'react';

const ErrorMessage = ({ error, onRetry }) => {
  if (!error) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-error/20 bg-error/10 p-4 text-error shadow-sm">
      <span className="material-symbols-outlined mt-0.5 shrink-0 text-2xl text-error">
        error
      </span>
      <div className="flex-1">
        <h4 className="mb-1 text-sm font-bold text-error">
          {error.code === 'ML_SERVICE_UNAVAILABLE' || error.status === 503
            ? 'Service Offline'
            : error.code === 'ML_SERVICE_TIMEOUT' || error.status === 504
              ? 'Request Timeout'
              : 'Detection Error'}
        </h4>
        <p className="text-sm">{error.message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1 text-xs font-bold underline"
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

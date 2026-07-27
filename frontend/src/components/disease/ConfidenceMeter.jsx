import React from 'react';

const ConfidenceMeter = ({ confidence, isHealthy }) => {
  const percent = typeof confidence === 'number'
    ? (confidence <= 1.0 ? confidence * 100 : confidence).toFixed(2)
    : 0;

  const barColor = isHealthy
    ? 'bg-emerald-500'
    : percent > 80
      ? 'bg-rose-500'
      : 'bg-amber-500';

  return (
    <div>
      <div className="flex justify-between items-center mb-1 text-sm">
        <span className="text-slate-600 font-semibold">Confidence Score</span>
        <span className="font-bold text-slate-900">{percent}%</span>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all duration-500 rounded-full`}
          style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
        />
      </div>
    </div>
  );
};

export default ConfidenceMeter;

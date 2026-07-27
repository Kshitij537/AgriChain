import React from 'react';

const LoadingOverlay = ({ message = 'Analyzing crop leaf image...' }) => {
  return (
    <div className="bg-white/90 backdrop-blur-sm rounded-xl p-8 border border-emerald-900/10 text-center flex flex-col items-center justify-center space-y-4">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-emerald-200 animate-ping opacity-25"></div>
        <div className="w-16 h-16 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
      <div>
        <p className="font-bold text-slate-900 text-lg">{message}</p>
        <p className="text-xs text-slate-500 mt-1">Running EfficientNetB0 inference model</p>
      </div>
    </div>
  );
};

export default LoadingOverlay;

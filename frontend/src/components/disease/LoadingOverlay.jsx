import React from 'react';

const LoadingOverlay = ({ message = 'Analyzing crop leaf image...' }) => {
  return (
    <div className="flex flex-col items-center justify-center space-y-4 rounded-[2rem] border border-outline-variant/10 bg-surface-container p-8 text-center">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 animate-ping rounded-full border-4 border-primary/20 opacity-25"></div>
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
      <div>
        <p className="text-lg font-bold text-primary">{message}</p>
        <p className="mt-1 text-xs text-on-surface-variant">Running EfficientNetB0 inference model</p>
      </div>
    </div>
  );
};

export default LoadingOverlay;

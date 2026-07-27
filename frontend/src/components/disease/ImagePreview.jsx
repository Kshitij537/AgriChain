import React from 'react';

const ImagePreview = ({ file, previewUrl, onClear, disabled }) => {
  if (!previewUrl) return null;

  const fileSizeMB = file ? (file.size / (1024 * 1024)).toFixed(2) : null;

  return (
    <div className="relative rounded-xl overflow-hidden border border-emerald-900/10 bg-slate-900 shadow-sm group">
      <img
        src={previewUrl}
        alt="Selected crop leaf preview"
        className="w-full h-64 object-cover transition-transform group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-4 flex flex-col justify-between">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="bg-black/60 hover:bg-rose-600 text-white p-2 rounded-full backdrop-blur-sm transition-colors disabled:opacity-50"
            title="Remove image"
          >
            <span className="material-symbols-outlined text-sm block">close</span>
          </button>
        </div>
        <div className="text-white">
          <p className="font-semibold text-sm truncate">{file?.name || 'Selected Image'}</p>
          {fileSizeMB && (
            <p className="text-xs text-slate-300">{fileSizeMB} MB • {file?.type}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImagePreview;

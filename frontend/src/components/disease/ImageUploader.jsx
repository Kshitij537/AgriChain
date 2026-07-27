import React, { useRef } from 'react';

const ImageUploader = ({ onFileSelect, disabled }) => {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => !disabled && fileInputRef.current?.click()}
      className={`border-2 border-dashed border-emerald-900/20 hover:border-emerald-600 rounded-xl p-8 text-center transition-all cursor-pointer bg-emerald-50/30 hover:bg-emerald-50/60 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        id="disease-image-input"
      />
      <span className="material-symbols-outlined text-5xl text-emerald-700 block mb-3">
        add_a_photo
      </span>
      <p className="text-emerald-950 font-bold text-lg mb-1">
        Click to upload or drag and drop
      </p>
      <p className="text-sm text-slate-600 mb-3">
        Supports JPEG, PNG, or WebP crop leaf images (up to 10 MB)
      </p>
      <span className="inline-block bg-emerald-800 text-white text-xs px-4 py-2 rounded-lg font-semibold shadow-sm">
        Select Leaf Image
      </span>
    </div>
  );
};

export default ImageUploader;

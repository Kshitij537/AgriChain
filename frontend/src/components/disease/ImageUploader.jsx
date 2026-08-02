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
      className={`cursor-pointer rounded-[2rem] border-2 border-dashed border-primary/20 bg-gradient-to-br from-surface via-surface-container to-primary/5 p-8 text-center transition-all hover:border-primary hover:bg-primary/5 ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        id="disease-image-input"
      />
      <span className="material-symbols-outlined mb-3 block text-5xl text-primary">
        add_a_photo
      </span>
      <p className="mb-1 text-lg font-bold text-primary">
        Click to upload or drag and drop
      </p>
      <p className="mb-3 text-sm text-on-surface-variant">
        Supports JPEG, PNG, or WebP crop leaf images (up to 10 MB)
      </p>
      <span className="inline-block rounded-xl bg-gradient-to-r from-primary to-secondary px-4 py-2 text-xs font-semibold text-white shadow-sm">
        Select Leaf Image
      </span>
    </div>
  );
};

export default ImageUploader;

import React from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ImageUploader from '../components/disease/ImageUploader';
import ImagePreview from '../components/disease/ImagePreview';
import PredictionCard from '../components/disease/PredictionCard';
import RecommendationCard from '../components/disease/RecommendationCard';
import ErrorMessage from '../components/disease/ErrorMessage';
import LoadingOverlay from '../components/disease/LoadingOverlay';
import useDiseaseDetection from '../hooks/useDiseaseDetection';

const DiseaseDetection = () => {
  const {
    file,
    previewUrl,
    loading,
    prediction,
    error,
    selectFile,
    clearSelection,
    detect
  } = useDiseaseDetection();

  const handleAnalyze = () => {
    detect();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Header Section */}
          <div className="text-center sm:text-left">
            <span className="inline-block bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-2">
              AgriChain ML & Decision Support
            </span>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 font-headline tracking-tight">
              AI Crop Disease Detection & Management
            </h1>
            <p className="text-slate-600 mt-2 text-base sm:text-lg max-w-2xl">
              Upload a clear leaf image of Cotton, Soybean, or Orange crops for instant real-time AI diagnosis and evidence-based agricultural recommendations.
            </p>
          </div>

          {/* Main Grid: Upload & Controls on Left, Results & Guidance on Right */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            
            {/* Left Column: Image Selection & Controls */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-900/10 space-y-6">
              <h2 className="text-xl font-bold text-slate-900 font-headline flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-700">upload_file</span>
                Crop Leaf Image Selection
              </h2>

              {!previewUrl ? (
                <ImageUploader onFileSelect={selectFile} disabled={loading} />
              ) : (
                <ImagePreview
                  file={file}
                  previewUrl={previewUrl}
                  onClear={clearSelection}
                  disabled={loading}
                />
              )}

              {/* Error Banner */}
              {error && (
                <ErrorMessage error={error} onRetry={file ? handleAnalyze : null} />
              )}

              {/* Action Buttons */}
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={!file || loading}
                  className="flex-1 gradient-primary text-white py-3.5 px-6 rounded-xl font-bold text-base shadow-sm hover:opacity-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-lg">search</span>
                      <span>Analyze Crop Leaf</span>
                    </>
                  )}
                </button>

                {previewUrl && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    disabled={loading}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-3.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Right Column: Prediction Results & Enriched Recommendations */}
            <div className="space-y-6">
              {loading ? (
                <LoadingOverlay message="Analyzing crop leaf image and fetching recommendations..." />
              ) : prediction ? (
                <>
                  <PredictionCard predictionData={prediction} />
                  {prediction.details && (
                    <RecommendationCard
                      details={prediction.details}
                      isHealthy={prediction.prediction?.is_healthy}
                    />
                  )}
                </>
              ) : (
                <div className="bg-white rounded-2xl p-10 shadow-sm border border-emerald-900/10 text-center space-y-4">
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-3xl">psychology</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Awaiting Image Upload</h3>
                  <p className="text-slate-500 text-sm max-w-md mx-auto">
                    Select or drag-and-drop a crop leaf image on the left and click "Analyze Crop Leaf" to view disease prediction and actionable agronomic guidance.
                  </p>
                  <div className="pt-4 border-t border-slate-100 flex justify-center gap-6 text-xs text-slate-500 font-medium">
                    <span>🌱 Cotton</span>
                    <span>🌿 Soybean</span>
                    <span>🍊 Orange</span>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default DiseaseDetection;

import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ImageUploader from '../components/disease/ImageUploader';
import ImagePreview from '../components/disease/ImagePreview';
import PredictionCard from '../components/disease/PredictionCard';
import RecommendationCard from '../components/disease/RecommendationCard';
import DiseaseHistory from '../components/disease/DiseaseHistory';
import ErrorMessage from '../components/disease/ErrorMessage';
import LoadingOverlay from '../components/disease/LoadingOverlay';
import useDiseaseDetection from '../hooks/useDiseaseDetection';
import { getUserFarms } from '../services/farmService';

const DiseaseDetection = () => {
  const {
    file,
    previewUrl,
    loading,
    prediction,
    error,
    selectedFarmId,
    setSelectedFarmId,
    history,
    historyLoading,
    historyError,
    selectFile,
    clearSelection,
    detect,
    loadHistory
  } = useDiseaseDetection();

  const [farms, setFarms] = useState([]);
  const [farmInputId, setFarmInputId] = useState('');

  // Load user farms on mount
  useEffect(() => {
    const fetchFarms = async () => {
      const userFarms = await getUserFarms(1);
      setFarms(userFarms);
      if (userFarms.length > 0) {
        setSelectedFarmId(userFarms[0].id);
        setFarmInputId(String(userFarms[0].id));
      }
    };
    fetchFarms();
  }, [setSelectedFarmId]);

  const handleFarmSelectChange = (e) => {
    const val = e.target.value;
    setFarmInputId(val);
    setSelectedFarmId(val ? parseInt(val, 10) : null);
  };

  const handleManualFarmIdBlur = () => {
    const parsed = parseInt(farmInputId, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setSelectedFarmId(parsed);
    } else {
      setSelectedFarmId(null);
    }
  };

  const handleAnalyze = () => {
    detect(selectedFarmId);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar />

      {/* Main Container - pt-32 ensures content starts cleanly below the fixed floating Navbar */}
      <main className="flex-1 pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto space-y-8">
          
          {/* Header & Farm Context Selection Bar */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-slate-200/80 pb-6">
            <div>
              <span className="inline-flex items-center gap-1.5 bg-emerald-100/90 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-2">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                AgriChain Farm Intelligence
              </span>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 font-headline tracking-tight">
                Crop Disease Detection & History
              </h1>
              <p className="text-slate-600 mt-1.5 text-sm sm:text-base max-w-xl">
                Real-time AI diagnosis and persistent historical tracking for your farms.
              </p>
            </div>

            {/* Farm Context Selector Card */}
            <div className="bg-white p-3.5 px-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3 shrink-0 self-stretch md:self-auto">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-100">
                <span className="material-symbols-outlined text-xl">location_on</span>
              </div>
              <div className="flex-1">
                <label htmlFor="farm-select" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Active Farm Context
                </label>
                {farms.length > 0 ? (
                  <select
                    id="farm-select"
                    value={farmInputId}
                    onChange={handleFarmSelectChange}
                    className="text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none cursor-pointer w-full"
                  >
                    <option value="">No Farm Selected (Standalone)</option>
                    {farms.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} (ID: {f.id})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Enter Farm ID"
                      value={farmInputId}
                      onChange={(e) => setFarmInputId(e.target.value)}
                      onBlur={handleManualFarmIdBlur}
                      className="text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 w-32 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                    <span className="text-[11px] text-slate-400 font-medium">e.g. 1</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Main Grid: Upload & Controls on Left, Results & History on Right */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            
            {/* Left Column: Image Selection, Upload & History */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-6">
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
                <div className="flex gap-4 pt-1">
                  <button
                    type="button"
                    onClick={handleAnalyze}
                    disabled={!file || loading}
                    className="flex-1 bg-gradient-to-r from-emerald-800 to-emerald-950 text-white py-3.5 px-6 rounded-xl font-bold text-base shadow-sm hover:opacity-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

              {/* Disease Detection History Component */}
              <DiseaseHistory
                history={history}
                loading={historyLoading}
                error={historyError}
                onRetry={() => selectedFarmId && loadHistory(selectedFarmId)}
                selectedFarmId={selectedFarmId}
              />
            </div>

            {/* Right Column: Prediction Results & Enriched Recommendations */}
            <div className="space-y-6">
              {loading ? (
                <LoadingOverlay message="Analyzing crop leaf image and logging detection record..." />
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
                <div className="bg-white rounded-2xl p-10 shadow-sm border border-slate-200 text-center space-y-4">
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-700 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
                    <span className="material-symbols-outlined text-3xl">psychology</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 font-headline">Awaiting Image Upload</h3>
                  <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed">
                    Select or drag-and-drop a crop leaf image on the left and click "Analyze Crop Leaf" to view disease prediction and record detection history.
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

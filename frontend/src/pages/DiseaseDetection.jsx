import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import ImageUploader from '../components/disease/ImageUploader';
import ImagePreview from '../components/disease/ImagePreview';
import PredictionCard from '../components/disease/PredictionCard';
import RecommendationCard from '../components/disease/RecommendationCard';
import DiseaseHistory from '../components/disease/DiseaseHistory';
import ErrorMessage from '../components/disease/ErrorMessage';
import LoadingOverlay from '../components/disease/LoadingOverlay';
import CombinedAdvisoryCard from '../components/disease/CombinedAdvisoryCard';
import useDiseaseDetection from '../hooks/useDiseaseDetection';
import { getUserFarms } from '../services/farmService';
import { getCurrentWeather } from '../services/weatherService';
import { fetchCombinedAdvisory } from '../services/diseaseApi';
import { t, getCurrentLanguage } from '../utils/translations';

const DiseaseDetection = () => {
  const navigate = useNavigate();
  const [user] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [lang, setLang] = useState(getCurrentLanguage());
  const [farms, setFarms] = useState([]);
  const [farmInputId, setFarmInputId] = useState('');
  const [weatherData, setWeatherData] = useState(null);
  const [advisory, setAdvisory] = useState(null);
  const [advisoryLoading, setAdvisoryLoading] = useState(false);

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
    loadHistory,
  } = useDiseaseDetection();

  // Listen to global language change event
  useEffect(() => {
    const handleLanguageChange = () => setLang(getCurrentLanguage());
    window.addEventListener('languageChange', handleLanguageChange);
    return () => window.removeEventListener('languageChange', handleLanguageChange);
  }, []);

  // Selected farm object
  const activeFarm = useMemo(() => {
    if (!farms || farms.length === 0) return null;
    return farms.find((f) => String(f.id) === String(selectedFarmId)) || farms[0];
  }, [farms, selectedFarmId]);

  // Load user farms on mount
  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const fetchFarms = async () => {
      const userFarms = await getUserFarms(user?.id || 1);
      setFarms(userFarms);
      if (userFarms.length > 0) {
        setSelectedFarmId(userFarms[0].id);
        setFarmInputId(String(userFarms[0].id));
      }
    };

    fetchFarms();
  }, [navigate, setSelectedFarmId, user]);

  // Fetch weather data for selected active farm
  useEffect(() => {
    const loadWeather = async () => {
      if (!activeFarm) return;
      const lat = activeFarm.latitude || 19.8762;
      const lon = activeFarm.longitude || 75.3433;
      try {
        const data = await getCurrentWeather(lat, lon);
        setWeatherData(data);
      } catch (e) {
        console.warn('[DiseaseDetection] Weather load warning:', e.message);
      }
    };
    loadWeather();
  }, [activeFarm]);

  // Load / update multi-source combined advisory
  const generateAdvisory = useCallback(async (predData, farmObj, weatherObj, currentLang) => {
    if (!farmObj) return;
    setAdvisoryLoading(true);
    try {
      const result = await fetchCombinedAdvisory({
        diseaseData: predData || { disease_name: 'Field Scouting / Pre-Scan', severity_level: 'Normal', confidence_score: 0.90 },
        farmData: farmObj,
        ndviData: {
          ndvi_value: farmObj?.ndvi_value || 0.68,
          health_status: farmObj?.health_status || 'Good Health'
        },
        weatherData: weatherObj ? {
          temp: weatherObj.current?.temperature || weatherObj.temperature || 28,
          humidity: weatherObj.current?.humidity || weatherObj.humidity || 65,
          condition: weatherObj.current?.condition || weatherObj.description || 'Clear'
        } : null,
        language: currentLang
      });
      if (result) setAdvisory(result);
    } catch (e) {
      console.warn('[DiseaseDetection] Advisory fetch failed:', e.message);
    } finally {
      setAdvisoryLoading(false);
    }
  }, []);

  // Re-generate advisory whenever active farm, weather, prediction, or language changes
  useEffect(() => {
    if (activeFarm) {
      generateAdvisory(prediction, activeFarm, weatherData, lang);
    }
  }, [prediction, activeFarm, weatherData, lang, generateAdvisory]);


  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleFarmSelectChange = (e) => {
    const val = e.target.value;
    setFarmInputId(val);
    setSelectedFarmId(val ? parseInt(val, 10) : null);
    setAdvisory(null); // Reset previous advisory until new scan
  };

  const handleAnalyze = () => {
    detect(selectedFarmId);
  };

  const predictionSummary = useMemo(() => {
    const topPrediction = prediction?.prediction;
    if (!topPrediction) {
      return {
        crop: '--',
        confidence: '--',
        status: t('diseaseDetection', 'awaitingScanTitle', lang),
      };
    }

    const confidence = typeof topPrediction.confidence === 'number'
      ? `${((topPrediction.confidence <= 1 ? topPrediction.confidence * 100 : topPrediction.confidence)).toFixed(1)}%`
      : '--';

    return {
      crop: topPrediction.crop || activeFarm?.crop_type || '--',
      confidence,
      status: topPrediction.is_healthy ? 'Healthy Leaf' : 'Disease Detected',
    };
  }, [prediction, activeFarm, lang]);

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar onLogout={handleLogout} />

      <div className="ml-72 min-h-screen">
        <Header user={user} searchPlaceholder="Search detections, fields, or crop risks..." />

        <main className="pt-24 px-6 pb-10 lg:px-8">
          <div className="mx-auto max-w-7xl space-y-6">
            {/* Header Banner */}
            <section className="overflow-hidden rounded-[2rem] border border-outline-variant/10 bg-gradient-to-br from-primary via-primary to-secondary text-white shadow-xl">
              <div className="grid gap-6 px-6 py-7 lg:grid-cols-[1.6fr_1fr] lg:px-8">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.24em]">
                    <span className="material-symbols-outlined text-sm">biotech</span>
                    {t('diseaseDetection', 'badgeTitle', lang)}
                  </div>
                  <div className="space-y-2">
                    <h1 className="font-headline text-3xl font-extrabold tracking-tight lg:text-4xl">
                      {t('diseaseDetection', 'pageTitle', lang)}
                    </h1>
                    <p className="max-w-2xl text-sm text-white/80 lg:text-base">
                      {t('diseaseDetection', 'pageSubtitle', lang)}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/65">
                      {t('diseaseDetection', 'activeFarmContext', lang)}
                    </p>
                    <p className="mt-2 font-headline text-xl font-bold truncate">
                      {activeFarm?.name || selectedFarmId || t('diseaseDetection', 'noFarmSelected', lang)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/65">
                      {t('diseaseDetection', 'diagnosedCondition', lang)}
                    </p>
                    <p className="mt-2 font-headline text-xl font-bold">{predictionSummary.status}</p>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/65">
                      {t('diseaseDetection', 'confidence', lang)}
                    </p>
                    <p className="mt-2 font-headline text-xl font-bold">{predictionSummary.confidence}</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Farm Selection Header Card */}
            <section className="rounded-[2rem] border border-outline-variant/10 bg-surface-container p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                    {t('diseaseDetection', 'selectFarmLabel', lang)}
                  </span>
                  <p className="text-xs text-on-surface-variant">
                    {t('diseaseDetection', 'uploadInstructions', lang)}
                  </p>
                </div>

                {/* Farm Dropdown */}
                <div className="min-w-[320px]">
                  <select
                    id="farm-select"
                    value={farmInputId}
                    onChange={handleFarmSelectChange}
                    className="w-full rounded-2xl border border-primary/30 bg-surface px-4 py-3 text-base font-bold text-primary outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 shadow-xs"
                  >
                    {farms.length === 0 && (
                      <option value="">{t('diseaseDetection', 'noFarmSelected', lang)}</option>
                    )}
                    {farms.map((farm) => (
                      <option key={farm.id} value={farm.id}>
                        🚜 {farm.name} ({farm.crop_type || 'Crop'}) - ID: {farm.id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Selected Farm Detail Chips */}
              {activeFarm && (
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-outline-variant/10 pt-4 text-xs font-semibold text-on-surface">
                  <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3.5 py-1.5 text-emerald-700 dark:text-emerald-300">
                    <span className="material-symbols-outlined text-sm">eco</span>
                    <span>{t('diseaseDetection', 'cropType', lang)}: <strong>{activeFarm.crop_type || 'General'}</strong></span>
                  </div>

                  {activeFarm.area_hectares && (
                    <div className="flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3.5 py-1.5 text-blue-700 dark:text-blue-300">
                      <span className="material-symbols-outlined text-sm">square_foot</span>
                      <span>{t('diseaseDetection', 'area', lang)}: <strong>{activeFarm.area_hectares} {t('diseaseDetection', 'hectares', lang)}</strong></span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 rounded-full bg-purple-500/10 px-3.5 py-1.5 text-purple-700 dark:text-purple-300">
                    <span className="material-symbols-outlined text-sm">satellite_alt</span>
                    <span>{t('diseaseDetection', 'ndviHealth', lang)}: <strong>{activeFarm.ndvi_value != null ? Number(activeFarm.ndvi_value).toFixed(2) : '0.68'} ({activeFarm.health_status || 'Good'})</strong></span>
                  </div>

                  {weatherData && (
                    <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3.5 py-1.5 text-amber-700 dark:text-amber-300">
                      <span className="material-symbols-outlined text-sm">thermostat</span>
                      <span>{t('diseaseDetection', 'weather', lang)}: <strong>{weatherData.current?.temperature || 28}°C ({weatherData.current?.condition || 'Clear'})</strong></span>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Main Content Grid */}
            <section className="grid gap-6 xl:grid-cols-[1.05fr_1.15fr]">
              {/* Left Column: Image Uploader & History */}
              <div className="space-y-6">
                <div className="rounded-[2rem] border border-outline-variant/10 bg-surface-container p-6 shadow-sm">
                  <div className="mb-5 border-b border-outline-variant/10 pb-4">
                    <h2 className="font-headline text-xl font-bold text-primary">
                      {t('diseaseDetection', 'uploadTitle', lang)}
                    </h2>
                  </div>

                  <div className="space-y-5">
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

                    {error && (
                      <ErrorMessage error={error} onRetry={file ? handleAnalyze : null} />
                    )}

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={handleAnalyze}
                        disabled={!file || loading}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-secondary px-5 py-3.5 font-headline text-sm font-bold text-white shadow-lg transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {loading ? (
                          <>
                            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            <span>{t('diseaseDetection', 'analyzing', lang)}</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-lg">search</span>
                            <span>{t('diseaseDetection', 'analyzeBtn', lang)}</span>
                          </>
                        )}
                      </button>

                      {previewUrl && (
                        <button
                          type="button"
                          onClick={clearSelection}
                          disabled={loading}
                          className="inline-flex items-center justify-center rounded-2xl border border-outline-variant/10 bg-surface-container-high px-5 py-3.5 text-sm font-semibold text-on-surface-variant transition hover:bg-surface-container-highest disabled:opacity-50"
                        >
                          {t('diseaseDetection', 'clearImage', lang)}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Disease History Component */}
                <DiseaseHistory
                  history={history}
                  loading={historyLoading}
                  error={historyError}
                  onRetry={() => selectedFarmId && loadHistory(selectedFarmId)}
                  selectedFarmId={selectedFarmId}
                  lang={lang}
                />
              </div>

              {/* Right Column: Disease Prediction & Combined Smart Advisory */}
              <div className="space-y-6">
                {/* 3 Summary Stats Cards */}
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-3xl border border-outline-variant/10 bg-surface-container p-5 shadow-sm">
                    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <span className="material-symbols-outlined">grass</span>
                    </div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-on-surface-variant/70">
                      {t('diseaseDetection', 'cropType', lang)}
                    </p>
                    <p className="mt-2 font-headline text-xl font-extrabold text-primary">{predictionSummary.crop}</p>
                  </div>

                  <div className="rounded-3xl border border-outline-variant/10 bg-surface-container p-5 shadow-sm">
                    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary/15 text-secondary">
                      <span className="material-symbols-outlined">verified</span>
                    </div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-on-surface-variant/70">
                      {t('diseaseDetection', 'confidence', lang)}
                    </p>
                    <p className="mt-2 font-headline text-xl font-extrabold text-primary">{predictionSummary.confidence}</p>
                  </div>

                  <div className="rounded-3xl border border-outline-variant/10 bg-surface-container p-5 shadow-sm">
                    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-error/10 text-error">
                      <span className="material-symbols-outlined">monitoring</span>
                    </div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-on-surface-variant/70">
                      {t('diseaseDetection', 'diagnosedCondition', lang)}
                    </p>
                    <p className="mt-2 font-headline text-xl font-extrabold text-primary">{predictionSummary.status}</p>
                  </div>
                </div>

                {loading ? (
                  <LoadingOverlay message="Analyzing crop leaf image and synthesizing field satellite & weather recommendations..." />
                ) : (
                  <>
                    {/* Prediction Card (when leaf is scanned) */}
                    {prediction && <PredictionCard predictionData={prediction} />}

                    {/* Combined Smart Advisory Card */}
                    {advisory && (
                      <CombinedAdvisoryCard
                        advisory={advisory}
                        farm={activeFarm}
                        weather={weatherData?.current || weatherData}
                        ndvi={{
                          ndvi_value: activeFarm?.ndvi_value || 0.68,
                          health_status: activeFarm?.health_status || 'Good'
                        }}
                        disease={prediction}
                        lang={lang}
                      />
                    )}

                    {/* Placeholder when awaiting first scan and no advisory yet */}
                    {!prediction && !advisory && !advisoryLoading && (
                      <div className="rounded-[2rem] border border-dashed border-outline-variant/20 bg-surface-container p-10 text-center shadow-sm">
                        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.5rem] bg-primary/10 text-primary">
                          <span className="material-symbols-outlined text-4xl">psychology</span>
                        </div>
                        <h3 className="mt-5 font-headline text-2xl font-extrabold text-primary">
                          {t('diseaseDetection', 'awaitingScanTitle', lang)}
                        </h3>
                        <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-on-surface-variant">
                          {t('diseaseDetection', 'awaitingScanSub', lang)}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>

          </div>
        </main>
      </div>
    </div>
  );
};

export default DiseaseDetection;


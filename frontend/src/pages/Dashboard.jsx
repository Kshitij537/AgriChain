import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import { t, tt, getCurrentLanguage } from '../utils/translations';

const REFRESH_INTERVAL_MS = 60 * 1000;
const HECTARE_TO_ACRE = 2.47105;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatArea = (value) => {
  const amount = toNumber(value);
  if (amount === null) return '0 ac';
  return `${(amount * HECTARE_TO_ACRE).toFixed(2)} ac`;
};

const formatNdvi = (value) => {
  const amount = toNumber(value);
  if (amount === null) return 'N/A';
  return amount.toFixed(2);
};

const formatDateTime = (value, lang) => {
  if (!value) return t('dashboard', 'notUpdatedYet', lang);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t('dashboard', 'notUpdatedYet', lang);
  const locale = lang === 'hi' ? 'hi-IN' : lang === 'mr' ? 'mr-IN' : 'en-IN';
  return date.toLocaleString(locale);
};

const formatRelativeDate = (value, lang) => {
  if (!value) return t('dashboard', 'noCaptureYet', lang);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t('dashboard', 'noCaptureYet', lang);

  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));

  if (diffHours <= 1) return t('dashboard', 'updatedLastHour', lang);
  if (diffHours < 24) return tt('dashboard', 'updatedHoursAgo', lang, { count: diffHours });

  const diffDays = Math.round(diffHours / 24);
  return tt('dashboard', 'updatedDaysAgo', lang, { count: diffDays });
};

const getHealthMeta = (healthStatus, lang) => {
  if (healthStatus === 'Good') {
    return {
      label: t('dashboard', 'healthy', lang),
      dot: 'bg-green-500',
      dotRing: 'ring-green-200',
      message: t('dashboard', 'healthGoodMessage', lang),
      chip: 'bg-green-100 text-green-700',
      bar: 'bg-green-600',
      accent: 'text-green-700',
      solidBg: 'bg-green-600',
      progress: 90,
    };
  }

  if (healthStatus === 'Moderate') {
    return {
      label: t('dashboard', 'needsAttention', lang),
      dot: 'bg-yellow-400',
      dotRing: 'ring-yellow-200',
      message: t('dashboard', 'healthModerateMessage', lang),
      chip: 'bg-yellow-100 text-yellow-700',
      bar: 'bg-yellow-500',
      accent: 'text-yellow-700',
      solidBg: 'bg-yellow-500',
      progress: 60,
    };
  }

  if (healthStatus === 'Poor') {
    return {
      label: t('dashboard', 'needsAttention', lang),
      dot: 'bg-red-500',
      dotRing: 'ring-red-200',
      message: t('dashboard', 'healthPoorMessage', lang),
      chip: 'bg-red-100 text-red-700',
      bar: 'bg-error',
      accent: 'text-red-700',
      solidBg: 'bg-error',
      progress: 30,
    };
  }

  return {
    label: t('dashboard', 'awaitingScan', lang),
    dot: 'bg-slate-400',
    dotRing: 'ring-slate-200',
    message: t('dashboard', 'healthAwaitingMessage', lang),
    chip: 'bg-slate-100 text-slate-700',
    bar: 'bg-slate-400',
    accent: 'text-slate-700',
    solidBg: 'bg-slate-400',
    progress: 12,
  };
};

// Reads a short status message aloud using the browser's built-in speech
// synthesis. This helps farmers who are more comfortable listening than
// reading, and needs no extra libraries or backend work.
const speak = (text) => {
  if (!text || typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
};

const buildRecommendations = (farms, lang) => {
  const poorFields = farms.filter((farm) => farm.healthStatus === 'Poor');
  const moderateFields = farms.filter((farm) => farm.healthStatus === 'Moderate');
  const missingFields = farms.filter((farm) => !farm.ndviValue);
  const largestField = [...farms].sort((a, b) => (toNumber(b.area) || 0) - (toNumber(a.area) || 0))[0];

  const items = [];

  if (poorFields.length > 0) {
    items.push({
      icon: 'warning',
      label: t('dashboard', 'recommendationUrgent', lang),
      title: tt('dashboard', 'recVisitField', lang, { name: poorFields[0].name }),
      desc: tt('dashboard', 'recPoorFieldsDesc', lang, { count: poorFields.length, suffix: poorFields.length === 1 ? '' : 's' }),
      color: 'border-error',
    });
  }

  if (moderateFields.length > 0) {
    items.push({
      icon: 'monitoring',
      label: t('dashboard', 'recommendationWatch', lang),
      title: t('dashboard', 'recCheckFairFields', lang),
      desc: tt('dashboard', 'recModerateDesc', lang, { count: moderateFields.length, suffix: moderateFields.length === 1 ? '' : 's' }),
      color: 'border-secondary',
    });
  }

  if (missingFields.length > 0) {
    items.push({
      icon: 'satellite_alt',
      label: t('dashboard', 'recommendationNoData', lang),
      title: t('dashboard', 'recRefreshNoScan', lang),
      desc: tt('dashboard', 'recMissingScanDesc', lang, { count: missingFields.length, suffix: missingFields.length === 1 ? '' : 's' }),
      color: 'border-slate-400',
    });
  }

  if (largestField) {
    items.push({
      icon: 'landscape',
      label: t('dashboard', 'recommendationBiggest', lang),
      title: tt('dashboard', 'recLargestWatch', lang, { name: largestField.name }),
      desc: tt('dashboard', 'recLargestDesc', lang, { area: formatArea(largestField.area) }),
      color: 'border-primary',
    });
  }

  if (items.length === 0) {
    items.push({
      icon: 'info',
      label: t('dashboard', 'recommendationGettingStarted', lang),
      title: t('dashboard', 'recSaveFieldTitle', lang),
      desc: t('dashboard', 'recSaveFieldDesc', lang),
      color: 'border-primary',
    });
  }

  return items.slice(0, 4);
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [user] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [farms, setFarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [lang, setLang] = useState(getCurrentLanguage());

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    const handleLanguageChange = () => setLang(getCurrentLanguage());
    window.addEventListener('languageChange', handleLanguageChange);
    return () => window.removeEventListener('languageChange', handleLanguageChange);
  }, []);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  useEffect(() => {
    if (!user) return undefined;

    let active = true;

    const fetchDashboardData = async ({ silent = false } = {}) => {
      try {
        if (silent) setRefreshing(true);
        else setLoading(true);
        setError('');

        const userId = user?.id;
        const url = userId
          ? `${API_BASE_URL}/api/farms/user?userId=${userId}`
          : `${API_BASE_URL}/api/farms/user`;

        const token = localStorage.getItem('token');
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to load dashboard data: ${response.status}`);
        }

        const data = await response.json();
        if (!active) return;

        setFarms(Array.isArray(data.farms) ? data.farms : []);
        setLastSyncedAt(new Date().toISOString());
      } catch (err) {
        if (!active) return;
        console.error('Dashboard fetch error:', err);
        setError(err.message || 'Failed to load dashboard data');
      } finally {
        if (!active) return;
        setLoading(false);
        setRefreshing(false);
      }
    };

    fetchDashboardData();

    const intervalId = window.setInterval(() => {
      fetchDashboardData({ silent: true });
    }, REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [API_BASE_URL, user]);

  const dashboardData = useMemo(() => {
    const activeFields = farms.length;
    const totalArea = farms.reduce((sum, farm) => sum + (toNumber(farm.area) || 0), 0);

    const farmsWithNdvi = farms.filter((farm) => toNumber(farm.ndviValue) !== null);
    const averageNdvi =
      farmsWithNdvi.length > 0
        ? farmsWithNdvi.reduce((sum, farm) => sum + Number(farm.ndviValue), 0) / farmsWithNdvi.length
        : null;

    const poorCount = farms.filter((farm) => farm.healthStatus === 'Poor').length;
    const moderateCount = farms.filter((farm) => farm.healthStatus === 'Moderate').length;
    const goodCount = farms.filter((farm) => farm.healthStatus === 'Good').length;

    const monitoredCoverage =
      activeFields > 0 ? Math.round((farmsWithNdvi.length / activeFields) * 100) : 0;

    const featuredField =
      [...farms]
        .filter((farm) => farm.ndviCapturedDate)
        .sort((a, b) => new Date(b.ndviCapturedDate) - new Date(a.ndviCapturedDate))[0] ||
      farmsWithNdvi[0] ||
      farms[0] ||
      null;

    const fieldStatusList = [...farms]
      .sort((a, b) => {
        const rank = { Poor: 0, Moderate: 1, Good: 2 };
        const left = rank[a.healthStatus] ?? 3;
        const right = rank[b.healthStatus] ?? 3;
        if (left !== right) return left - right;
        return (toNumber(b.ndviValue) || -1) - (toNumber(a.ndviValue) || -1);
      })
      .slice(0, 5);

    return {
      activeFields,
      totalArea,
      averageNdvi,
      farmsWithNdvi,
      poorCount,
      moderateCount,
      goodCount,
      monitoredCoverage,
      featuredField,
      fieldStatusList,
      recommendations: buildRecommendations(farms, lang),
    };
  }, [farms, lang]);

  if (!user) {
    return null;
  }

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const featuredMeta = getHealthMeta(dashboardData.featuredField?.healthStatus, lang);
  const featuredField = dashboardData.featuredField;

  return (
    <div className="flex min-h-screen bg-surface font-body">
      <Sidebar onLogout={handleLogout} />

      <div className="ml-72 w-[calc(100%-18rem)]">
        <Header user={user} />

        <main className="pt-24 px-8 pb-12">
          <section className="flex items-start justify-between gap-6 mb-10">
            <div>
              <h1 className="text-4xl font-headline font-extrabold text-primary tracking-tight">{t('dashboard', 'title', lang)}</h1>
              <p className="text-sm text-on-surface-variant mt-2">
                {t('dashboard', 'subtitle', lang)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-on-surface-variant font-bold">{t('dashboard', 'lastSync', lang)}</p>
              <p className="text-sm font-semibold text-primary">
                {lastSyncedAt ? formatDateTime(lastSyncedAt, lang) : t('dashboard', 'waitingForFirstSync', lang)}
              </p>
              {refreshing && <p className="text-xs text-secondary mt-1">{t('dashboard', 'refreshingLiveData', lang)}</p>}
            </div>
          </section>

          {error && (
            <div className="mb-8 rounded-2xl border border-error/20 bg-error-container/30 px-5 py-4">
              <p className="text-sm font-semibold text-error">{t('dashboard', 'dashboardLoadError', lang)}</p>
              <p className="text-xs text-on-surface-variant mt-1">{error}</p>
            </div>
          )}

          <section className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-10">
            <StatCard
              icon="landscape"
              label={t('dashboard', 'totalArea', lang)}
              value={loading ? t('dashboard', 'loadingShort', lang) : formatArea(dashboardData.totalArea)}
              variant={`${dashboardData.activeFields} ${t('dashboard', 'trackedFields', lang)}`}
            />
            <StatCard
              icon="agriculture"
              label={t('dashboard', 'activeFields', lang)}
              value={loading ? t('dashboard', 'loadingShort', lang) : String(dashboardData.activeFields)}
              variant={`${dashboardData.monitoredCoverage}% ${t('dashboard', 'monitored', lang)}`}
            />
            <StatCard
              icon="health_metrics"
              label={t('dashboard', 'avgCropHealth', lang)}
              value={loading ? t('dashboard', 'loadingShort', lang) : formatNdvi(dashboardData.averageNdvi)}
              variant={`${dashboardData.farmsWithNdvi.length} ${t('dashboard', 'fieldsScannedCount', lang)}`}
            />
            <StatCard
              icon="warning"
              label={t('dashboard', 'attentionNeeded', lang)}
              value={loading ? t('dashboard', 'loadingShort', lang) : String(dashboardData.poorCount + dashboardData.moderateCount)}
              variant={`${dashboardData.poorCount} ${t('dashboard', 'criticalCount', lang)}`}
            />
          </section>

          <div className="grid grid-cols-12 gap-8 mb-10">
            {/* Featured Field Card */}
            <section className="col-span-12 lg:col-span-8 bg-surface-container-lowest rounded-2xl overflow-hidden shadow-md border border-outline-variant/10 flex flex-col">

              {/* Image — fixed 160px, never grows */}
              <div className="relative h-40 w-full shrink-0">
                <img
                  src={featuredField?.imageUrl || 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&q=80&auto=format&fit=crop'}
                  alt={featuredField?.name || t('fieldAnalytics', 'field', lang)}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

                <div className="absolute bottom-0 left-0 right-0 px-5 pb-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-0.5">{t('dashboard', 'liveCropMonitoring', lang)}</p>
                    <h3 className="text-white font-headline font-bold text-xl leading-tight drop-shadow">
                      {featuredField?.name || t('dashboard', 'noFieldYet', lang)}
                    </h3>
                    <p className="text-white/70 text-xs mt-0.5">
                      {featuredField
                        ? `${featuredField.cropType || t('dashboard', 'unknownCrop', lang)} · ${formatArea(featuredField.area)}${featuredField.ndviCapturedDate ? ` · ${formatRelativeDate(featuredField.ndviCapturedDate, lang)}` : ''}`
                        : t('dashboard', 'saveFieldToStartMonitoring', lang)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {featuredField && (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold backdrop-blur-sm ${
                        featuredField.healthStatus === 'Good' ? 'bg-green-500/90 text-white'
                        : featuredField.healthStatus === 'Moderate' ? 'bg-yellow-500/90 text-white'
                        : featuredField.healthStatus === 'Poor' ? 'bg-red-500/90 text-white'
                        : 'bg-white/20 text-white'
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-white/90 shrink-0" />
                        {featuredMeta.label}
                      </span>
                    )}
                    {featuredField && (
                      <button
                        type="button"
                        onClick={() => speak(`${featuredField.name}. ${featuredMeta.label}. ${featuredMeta.message}`)}
                        aria-label={t('dashboard', 'listenToFieldStatus', lang)}
                        className="w-7 h-7 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">volume_up</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom strip */}
              <div className="px-5 py-3 border-t border-outline-variant/10 flex flex-col gap-2.5 shrink-0">
                <div>
                  <div className="flex justify-between text-[10px] font-bold text-on-surface-variant mb-1">
                    <span>{t('dashboard', 'healthScore', lang)}</span>
                    <span className={featuredMeta.accent}>{featuredField ? formatNdvi(featuredField.ndviValue) : '—'}</span>
                  </div>
                  <div className="w-full bg-surface-container-highest rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${featuredMeta.bar}`} style={{ width: `${featuredField ? featuredMeta.progress : 0}%` }} />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-on-surface-variant"><span className="w-2 h-2 rounded-full bg-green-500 ring-1 ring-green-200 shrink-0" />{dashboardData.goodCount} {t('dashboard', 'healthy', lang)}</span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-on-surface-variant"><span className="w-2 h-2 rounded-full bg-yellow-400 ring-1 ring-yellow-200 shrink-0" />{dashboardData.moderateCount} {t('dashboard', 'fair', lang)}</span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-on-surface-variant"><span className="w-2 h-2 rounded-full bg-red-500 ring-1 ring-red-200 shrink-0" />{dashboardData.poorCount} {t('dashboard', 'poor', lang)}</span>
                    <span className="text-[10px] font-bold text-primary">{dashboardData.monitoredCoverage}% {t('dashboard', 'scanned', lang)}</span>
                  </div>
                  <div className="flex gap-2">
                    {featuredField ? (
                      <button onClick={() => navigate(`/field-analytics/${featuredField.id}`)} className="px-4 py-1.5 rounded-lg bg-gradient-to-br from-primary to-secondary text-white text-xs font-headline font-bold shadow hover:opacity-95 transition-all whitespace-nowrap">{t('dashboard', 'checkThisField', lang)}</button>
                    ) : (
                      <button onClick={() => navigate('/farm-boundary-setup')} className="px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-headline font-bold hover:opacity-90 whitespace-nowrap">{t('dashboard', 'addFirstField', lang)}</button>
                    )}
                    <button onClick={() => navigate('/saved-fields')} className="px-4 py-1.5 rounded-lg bg-surface-container text-primary text-xs font-headline font-bold hover:bg-surface-container-high transition-colors whitespace-nowrap">{t('dashboard', 'viewAllFields', lang)}</button>
                  </div>
                </div>
              </div>
            </section>

            {/* Field Status — capped height, scrollable list */}
            <section className="col-span-12 lg:col-span-4 bg-surface-container-low rounded-xl p-5 shadow-md border border-outline-variant/10 flex flex-col" style={{ maxHeight: '320px' }}>
              <div className="flex justify-between items-center mb-4 shrink-0">
                <h3 className="font-headline font-bold text-base text-primary">{t('dashboard', 'fieldStatus', lang)}</h3>
                <button onClick={() => navigate('/saved-fields')} className="text-secondary text-xs font-semibold hover:underline">{t('dashboard', 'viewAll', lang)}</button>
              </div>
              <div className="overflow-y-auto flex-1 space-y-3 pr-1">
                {loading ? (
                  <p className="text-sm text-on-surface-variant">{t('dashboard', 'loadingShort', lang)}</p>
                ) : dashboardData.fieldStatusList.length > 0 ? (
                  dashboardData.fieldStatusList.map((farm) => (
                    <FarmItem
                      key={farm.id}
                      lang={lang}
                      name={farm.name}
                      crop={`${farm.cropType || t('savedFields', 'unknown', lang)} • ${formatArea(farm.area)}`}
                      status={farm.healthStatus}
                      percentage={getHealthMeta(farm.healthStatus, lang).progress}
                      onClick={() => navigate(`/field-analytics/${farm.id}`)}
                    />
                  ))
                ) : (
                  <EmptyCard title={t('dashboard', 'noLiveFieldData', lang)} description={t('dashboard', 'saveFirstFieldForHealth', lang)} />
                )}
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-10">
            <section className="bg-surface-container-lowest rounded-lg p-8 shadow-md border border-outline-variant/10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-primary-fixed/20 rounded-2xl flex items-center justify-center text-primary font-body">
                  <span className="material-symbols-outlined">monitoring</span>
                </div>
                <div>
                  <h3 className="font-headline font-bold text-xl text-primary">{t('dashboard', 'healthDistribution', lang)}</h3>
                  <p className="text-sm text-on-surface-variant font-body">{t('dashboard', 'healthDistributionSubtitleDashboard', lang)}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <MetricPanel label={t('dashboard', 'healthy', lang)} value={dashboardData.goodCount} tone="good" />
                <MetricPanel label={t('dashboard', 'moderate', lang)} value={dashboardData.moderateCount} tone="moderate" />
                <MetricPanel label={t('dashboard', 'poor', lang)} value={dashboardData.poorCount} tone="poor" />
              </div>

              <div className="mt-8 space-y-4">
                <ProgressRow
                  label={t('dashboard', 'healthyFields', lang)}
                  value={dashboardData.goodCount}
                  total={dashboardData.activeFields}
                  barClass="bg-green-600"
                />
                <ProgressRow
                  label={`${t('dashboard', 'moderate', lang)} ${t('navigation', 'fields', lang).toLowerCase()}`}
                  value={dashboardData.moderateCount}
                  total={dashboardData.activeFields}
                  barClass="bg-yellow-500"
                />
                <ProgressRow
                  label={`${t('dashboard', 'poor', lang)} ${t('navigation', 'fields', lang).toLowerCase()}`}
                  value={dashboardData.poorCount}
                  total={dashboardData.activeFields}
                  barClass="bg-error"
                />
              </div>
            </section>

            <section className="bg-surface-container-lowest rounded-lg p-8 shadow-md border border-outline-variant/10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-secondary-fixed/20 rounded-2xl flex items-center justify-center text-secondary font-body">
                  <span className="material-symbols-outlined">notifications_active</span>
                </div>
                <div>
                  <h3 className="font-headline font-bold text-xl text-primary">{t('dashboard', 'monitoringAlerts', lang)}</h3>
                  <p className="text-sm text-on-surface-variant font-body">{t('dashboard', 'monitoringAlertsSubtitleDashboard', lang)}</p>
                </div>
              </div>

              <div className="space-y-4">
                <AlertRow
                  title={t('dashboard', 'fieldsInPoorCondition', lang)}
                  value={dashboardData.poorCount}
                  description={
                    dashboardData.poorCount > 0
                      ? t('dashboard', 'poorConditionDescription', lang)
                      : t('dashboard', 'noPoorCondition', lang)
                  }
                  tone="poor"
                />
                <AlertRow
                  title={t('dashboard', 'fieldsToWatch', lang)}
                  value={dashboardData.moderateCount}
                  description={
                    dashboardData.moderateCount > 0
                      ? t('dashboard', 'moderateDescription', lang)
                      : t('dashboard', 'noAttentionMoment', lang)
                  }
                  tone="moderate"
                />
                <AlertRow
                  title={t('dashboard', 'lastSatelliteScan', lang)}
                  value={featuredField?.ndviCapturedDate ? t('dashboard', 'done', lang) : t('dashboard', 'pending', lang)}
                  description={formatRelativeDate(featuredField?.ndviCapturedDate, lang)}
                  tone="good"
                />
              </div>
            </section>
          </div>

          <div className="grid grid-cols-12 gap-8">
            <section className="col-span-12 lg:col-span-7 bg-surface-container-lowest rounded-lg p-6 shadow-md border border-outline-variant/10">
              <div className="flex justify-between items-center mb-5">
                <div>
                  <h3 className="font-headline font-bold text-lg text-primary">{t('dashboard', 'liveFieldFeed', lang)}</h3>
                  <p className="text-xs text-on-surface-variant font-body">{t('dashboard', 'fieldStatusSubtitle', lang)}</p>
                </div>
                <button
                  onClick={() => navigate('/saved-fields')}
                  className="px-4 py-1.5 rounded-full bg-surface-container font-headline text-xs font-bold text-primary hover:bg-surface-container-high transition-colors"
                >
                  {t('dashboard', 'manageFields', lang)}
                </button>
              </div>

              {dashboardData.fieldStatusList.length > 0 ? (
                <div className="space-y-2">
                  {dashboardData.fieldStatusList.map((farm) => (
                    <LiveFieldRow
                      key={farm.id}
                      farm={farm}
                      lang={lang}
                      onOpen={() => navigate(`/field-analytics/${farm.id}`)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyCard
                  title={t('dashboard', 'noFieldsAvailable', lang)}
                  description={t('dashboard', 'addBoundaryToTrack', lang)}
                />
              )}
            </section>

            <section className="col-span-12 lg:col-span-5 bg-surface-container-low rounded-lg p-8 border border-outline-variant/10">
              <h3 className="font-headline font-bold text-xl text-primary mb-6">{t('dashboard', 'smartSuggestions', lang)}</h3>
              <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                {dashboardData.recommendations.map((item) => (
                  <RecommendationCard
                    key={`${item.label}-${item.title}`}
                    icon={item.icon}
                    label={item.label}
                    title={item.title}
                    desc={item.desc}
                    color={item.color}
                  />
                ))}
              </div>
              <button
                onClick={() => navigate('/saved-fields')}
                className="w-full mt-6 flex items-center justify-center gap-2 text-primary font-headline font-bold text-sm hover:opacity-70 transition-opacity"
              >
                {t('dashboard', 'openSavedFields', lang)} <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </button>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
};

const StatCard = ({ icon, label, value, variant }) => (
  <div className="bg-surface-container-lowest p-6 rounded-lg shadow-md border border-outline-variant/10 flex flex-col justify-between h-40 group hover:translate-y-[-4px] transition-all font-body">
    <div className="flex justify-between items-start">
      <span className="material-symbols-outlined text-primary bg-primary-fixed/30 p-3 rounded-2xl">{icon}</span>
      <span className="text-xs font-headline font-bold text-on-primary-container bg-primary-fixed/20 px-2 py-1 rounded-full">{variant}</span>
    </div>
    <div>
      <p className="text-on-surface-variant text-xs font-headline font-medium uppercase tracking-tight">{label}</p>
      <p className="text-2xl font-headline font-extrabold text-primary">{value}</p>
    </div>
  </div>
);

const FarmItem = ({ name, crop, status, percentage, onClick, lang }) => {
  const health = getHealthMeta(status, lang);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-surface-container-lowest p-4 rounded-xl border border-transparent hover:border-primary/20 transition-all font-body"
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-start gap-3">
          <span
            className={`mt-1 w-3 h-3 rounded-full shrink-0 ring-2 ${health.dot} ${health.dotRing}`}
            aria-hidden="true"
          />
          <div>
            <h4 className="font-headline font-bold text-primary">{name}</h4>
            <p className="text-xs text-on-surface-variant">{crop}</p>
          </div>
        </div>
        <span className={`text-xs font-headline font-bold px-2 py-1 rounded-full uppercase ${health.chip}`}>
          {health.label}
        </span>
      </div>
      <div className="flex items-center justify-between mt-4">
        <div className="w-full bg-surface-container-highest h-1.5 rounded-full mr-4">
          <div className={`h-1.5 rounded-full ${health.bar}`} style={{ width: `${percentage}%` }}></div>
        </div>
        <span className="text-xs font-headline font-bold text-primary">{percentage}%</span>
      </div>
    </button>
  );
};

const RecommendationCard = ({ icon, label, title, desc, color }) => (
  <div className={`bg-surface-container-lowest p-5 rounded-2xl shadow-sm border-l-4 ${color}`}>
    <div className="flex items-center gap-3 mb-2">
      <span className="material-symbols-outlined text-primary text-sm">{icon}</span>
      <span className="text-xs font-headline font-bold uppercase text-on-surface-variant">{label}</span>
    </div>
    <p className="text-sm font-headline font-semibold text-primary">{title}</p>
    <p className="text-xs text-on-surface-variant mt-1 font-body">{desc}</p>
  </div>
);

const MetricPanel = ({ label, value, tone }) => {
  const tones = {
    good: 'bg-green-50 text-green-700',
    moderate: 'bg-yellow-50 text-yellow-700',
    poor: 'bg-red-50 text-red-700',
  };

  return (
    <div className={`rounded-2xl p-5 ${tones[tone] || 'bg-surface-container text-primary'}`}>
      <p className="text-xs font-bold uppercase mb-2">{label}</p>
      <p className="text-4xl font-headline font-extrabold">{value}</p>
    </div>
  );
};

const ProgressRow = ({ label, value, total, barClass }) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-primary">{label}</span>
        <span className="text-xs font-bold text-on-surface-variant">{pct}%</span>
      </div>
      <div className="w-full bg-surface-container-highest rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }}></div>
      </div>
    </div>
  );
};

const AlertRow = ({ title, value, description, tone }) => {
  const tones = {
    good: 'border-green-600',
    moderate: 'border-yellow-500',
    poor: 'border-error',
  };

  return (
    <div className={`rounded-2xl bg-surface-container-low p-5 border-l-4 ${tones[tone] || 'border-primary'}`}>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-headline font-bold text-primary">{title}</p>
        <span className="text-sm font-headline font-extrabold text-primary">{value}</span>
      </div>
      <p className="text-xs text-on-surface-variant mt-2">{description}</p>
    </div>
  );
};

const LiveFieldRow = ({ farm, onOpen, lang }) => {
  const health = getHealthMeta(farm.healthStatus, lang);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left flex items-center gap-4 px-4 py-3 rounded-xl bg-surface-container hover:bg-surface-container-high border border-transparent hover:border-primary/10 transition-all group"
    >
      {/* Status dot */}
      <span
        className={`w-2.5 h-2.5 rounded-full shrink-0 ring-2 ${health.dot} ${health.dotRing}`}
        aria-hidden="true"
      />

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p className="font-headline font-bold text-sm text-primary truncate leading-tight">{farm.name}</p>
        <p className="text-[11px] text-on-surface-variant truncate mt-0.5">
          {farm.cropType || t('savedFields', 'unknown', lang)} · {formatArea(farm.area)} · {formatRelativeDate(farm.ndviCapturedDate, lang)}
        </p>
      </div>

      {/* Score */}
      <div className="shrink-0 text-right">
        <p className={`text-sm font-headline font-extrabold ${health.accent}`}>{formatNdvi(farm.ndviValue)}</p>
        <p className="text-[10px] text-on-surface-variant">{t('dashboard', 'scoreLower', lang)}</p>
      </div>

      {/* Health chip */}
      <span className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${health.chip}`}>
        {health.label}
      </span>

      {/* Arrow */}
      <span className="material-symbols-outlined text-base text-on-surface-variant/30 group-hover:text-primary/40 transition-colors shrink-0">
        chevron_right
      </span>
    </button>
  );
};

const EmptyCard = ({ title, description }) => (
  <div className="rounded-2xl bg-surface-container-low p-6">
    <p className="text-base font-headline font-bold text-primary">{title}</p>
    <p className="text-sm text-on-surface-variant mt-2">{description}</p>
  </div>
);

export default Dashboard;

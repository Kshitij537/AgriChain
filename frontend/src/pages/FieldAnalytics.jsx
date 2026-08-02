import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import NDVIHeatmapCard from '../components/NDVIHeatmapCard';
import { t, tt, getCurrentLanguage } from '../utils/translations';

const RANGE_OPTIONS = [
  { key: '30', label: '1M', days: 30 },
  { key: '180', label: '6M', days: 180 },
  { key: '365', label: '1Y', days: 365 },
];

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatPct = (value) => {
  const num = toNumber(value);
  if (num === null) return '—';
  return `${num >= 0 ? '+' : ''}${num.toFixed(1)}%`;
};

const formatDateLabel = (value, lang = 'en', mode = 'short') => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const locale = lang === 'hi' ? 'hi-IN' : lang === 'mr' ? 'mr-IN' : 'en-US';
  if (mode === 'month') {
    return date.toLocaleDateString(locale, { month: 'short' }).toUpperCase();
  }
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
};

const formatImageDatePretty = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const summarizeTrend = (trend, lang) => {
  if (!trend || toNumber(trend.changePct) === null) {
    return {
      text: t('fieldAnalytics', 'notEnoughTrend', lang),
      tone: 'text-on-surface-variant',
      icon: 'trending_flat',
    };
  }

  if (trend.changePct > 1) {
    return {
      text: t('fieldAnalytics', 'cropsGrowingWell', lang),
      tone: 'text-green-700',
      icon: 'trending_up',
    };
  }

  if (trend.changePct < -1) {
    return {
      text: t('fieldAnalytics', 'cropHealthDeclining', lang),
      tone: 'text-red-700',
      icon: 'trending_down',
    };
  }

  return {
    text: t('fieldAnalytics', 'cropHealthSteady', lang),
    tone: 'text-yellow-700',
    icon: 'trending_flat',
  };
};

const buildBarHeights = (series, count = 8) => {
  if (!Array.isArray(series) || series.length === 0) return [];
  const points = series.slice(-count);
  const values = points.map((point) => Math.max(0, Math.min(1, toNumber(point.ndvi) ?? toNumber(point.ndvi_value) ?? 0)));
  const max = Math.max(...values, 0.05);
  return points.map((point, index) => {
    const value = values[index];
    return {
      key: point.date || point.captured_date || index,
      height: Math.max(14, Math.round((value / max) * 48)),
      value,
    };
  });
};

const buildLinePath = (series, width = 1000, height = 300) => {
  if (!Array.isArray(series) || series.length === 0) return '';

  const values = series.map((point) => Math.max(0, Math.min(1, toNumber(point.ndvi) ?? toNumber(point.ndvi_value) ?? 0)));
  const denominator = Math.max(series.length - 1, 1);

  return series
    .map((point, index) => {
      const x = (index / denominator) * width;
      const y = height - values[index] * (height - 40) - 20;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
};

const buildAreaPath = (series, width = 1000, height = 300) => {
  const linePath = buildLinePath(series, width, height);
  if (!linePath) return '';
  return `${linePath} L ${width} ${height - 20} L 0 ${height - 20} Z`;
};

const buildChartPoints = (series, width = 1000, height = 300) => {
  if (!Array.isArray(series) || series.length === 0) return [];
  const denominator = Math.max(series.length - 1, 1);

  return series.map((point, index) => {
    const value = Math.max(0, Math.min(1, toNumber(point.ndvi) ?? toNumber(point.ndvi_value) ?? 0));
    return {
      ...point,
      value,
      x: (index / denominator) * width,
      y: height - value * (height - 40) - 20,
    };
  });
};

const normalizeSeriesPoint = (point) => {
  if (!point) return null;
  const date = point.date || point.captured_date || point.image_date;
  const ndvi = toNumber(point.ndvi) ?? toNumber(point.ndvi_value);
  if (!date || ndvi === null) return null;

  return {
    date,
    ndvi: Math.max(0, Math.min(1, ndvi)),
    healthStatus: point.healthStatus || point.health_status || null,
    cloudCoverage: toNumber(point.cloudCoverage) ?? toNumber(point.cloud_coverage),
    source: point.source || point.datasource || 'unknown',
  };
};

const computeTrendFromSeriesClient = (series) => {
  if (!Array.isArray(series) || series.length < 2) return null;
  const start = series[0];
  const end = series[series.length - 1];
  const startValue = toNumber(start.ndvi);
  const endValue = toNumber(end.ndvi);
  if (startValue === null || endValue === null) return null;

  const changeAbs = endValue - startValue;
  const changePct = startValue > 0 ? (changeAbs / startValue) * 100 : null;
  return {
    start: { date: start.date, ndvi: startValue },
    end: { date: end.date, ndvi: endValue },
    changeAbs,
    changePct,
  };
};

const mergeHistorySeries = (...seriesLists) => {
  const merged = new Map();

  for (const series of seriesLists) {
    if (!Array.isArray(series)) continue;
    for (const rawPoint of series) {
      const point = normalizeSeriesPoint(rawPoint);
      if (!point) continue;
      const existing = merged.get(point.date);
      if (!existing) {
        merged.set(point.date, point);
        continue;
      }

      const existingPriority = existing.source === 'history' ? 3 : existing.source === 'current-scan' ? 2 : 1;
      const nextPriority = point.source === 'history' ? 3 : point.source === 'current-scan' ? 2 : 1;
      if (nextPriority >= existingPriority) {
        merged.set(point.date, {
          ...existing,
          ...point,
        });
      }
    }
  }

  return Array.from(merged.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
};

const getHealthBand = (value) => {
  if (value >= 0.7) {
    return {
      label: 'Strong',
      tone: 'text-emerald-700',
      fill: '#d1fae5',
      stroke: '#34d399',
    };
  }

  if (value >= 0.45) {
    return {
      label: 'Stable',
      tone: 'text-amber-700',
      fill: '#fef3c7',
      stroke: '#f59e0b',
    };
  }

  return {
    label: 'Needs attention',
    tone: 'text-rose-700',
    fill: '#ffe4e6',
    stroke: '#fb7185',
  };
};

const FieldAnalytics = () => {
  const { fieldId } = useParams();
  const navigate = useNavigate();
  const [field, setField] = useState(null);
  const [ndviData, setNdviData] = useState(null);
  const [timeSeries, setTimeSeries] = useState(null);
  const [user] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [loading, setLoading] = useState(true);
  const [ndviLoading, setNdviLoading] = useState(false);
  const [selectedRange, setSelectedRange] = useState('180');
  const [lang, setLang] = useState(getCurrentLanguage());
  const [aiAdvice, setAiAdvice] = useState(null);
  const [aiAdviceLoading, setAiAdviceLoading] = useState(false);
  const [aiAdviceError, setAiAdviceError] = useState('');

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    const handleLanguageChange = () => setLang(getCurrentLanguage());
    window.addEventListener('languageChange', handleLanguageChange);
    return () => window.removeEventListener('languageChange', handleLanguageChange);
  }, []);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const fetchFieldData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE_URL}/api/farms/${fieldId}`);
        if (!response.ok) throw new Error('Failed to fetch field data');
        const data = await response.json();
        if (data.success) {
          setField(data.farm);
          // Use the fetched farm object directly so cropType/lat/lon are available
          // immediately for the first advice request.
          if (data.farm.boundaryCoordinates) {
            await fetchNDVIData(data.farm.boundaryCoordinates, fieldId, data.farm);
          }
        }
      } catch (error) {
        console.error('Error fetching field:', error);
      } finally {
        setLoading(false);
      }
    };

    if (fieldId) {
      fetchFieldData();
    }
  }, [fieldId, API_BASE_URL, user, navigate]);

  const fetchNDVIData = async (coordinates, fId, farmContext = null) => {
    try {
      setNdviLoading(true);
      setAiAdviceError('');
      console.log('Fetching NDVI data for coordinates:', coordinates);
      const resolvedFarm = farmContext || field || null;
      let nextNdviResult = null;
      let nextTimeSeriesResult = null;
      let nextHistoryResult = null;

      // Fetch current NDVI value (fast - without pixel grid initially)
      const ndviResponse = await fetch(`${API_BASE_URL}/api/ndvi/calculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          coordinates: coordinates,
          farmId: fId,
          includePixelGrid: false, // Start with fast calculation
        }),
      });

      if (ndviResponse.ok) {
        const ndviResult = await ndviResponse.json();
        console.log('NDVI Result:', ndviResult);
        console.log('📊 NDVI DEBUG INFO:');
        console.log('  - NDVI (displayed):', ndviResult.ndvi);
        console.log('  - NDVI Raw:', ndviResult.ndviRaw);
        console.log('  - Image Date:', ndviResult.imageDate);
        console.log('  - Cloud Coverage:', ndviResult.cloudCoverage);
        console.log('  - Data Source:', ndviResult.datasource);
        console.log('  - Health Status:', ndviResult.health);
        if (ndviResult.diagnostics) {
          console.log('  - Diagnostics:', ndviResult.diagnostics);
        }
        nextNdviResult = ndviResult;
        setNdviData(ndviResult);
        setField((prev) =>
          prev
            ? {
                ...prev,
                ndviValue: ndviResult.ndvi,
                healthStatus: ndviResult.health,
                ndviCapturedDate: ndviResult.imageDate || ndviResult.capturedDate || prev.ndviCapturedDate,
              }
            : prev
        );
      }

      // Fetch time series data for the last 365 days so the UI can switch ranges locally
      const timeSeriesResponse = await fetch(`${API_BASE_URL}/api/ndvi/timeseries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          coordinates: coordinates,
          days: 365,
        }),
      });

      if (timeSeriesResponse.ok) {
        const timeSeriesResult = await timeSeriesResponse.json();
        console.log('Time Series Result:', timeSeriesResult);
        nextTimeSeriesResult = timeSeriesResult;
      }

      if (nextNdviResult?.fieldId) {
        const historyResponse = await fetch(
          `${API_BASE_URL}/api/ndvi/history?fieldId=${encodeURIComponent(nextNdviResult.fieldId)}&days=365`
        );
        if (historyResponse.ok) {
          nextHistoryResult = await historyResponse.json();
          console.log('Stored History Result:', nextHistoryResult);
        }
      }

      const mergedSeries = mergeHistorySeries(
        nextTimeSeriesResult?.data?.map((point) => ({ ...point, source: 'timeseries' })),
        nextHistoryResult?.data?.map((point) => ({ ...point, source: 'history' })),
        nextNdviResult
          ? [
              {
                date: nextNdviResult.imageDate || nextNdviResult.capturedDate,
                ndvi: nextNdviResult.ndvi,
                healthStatus: nextNdviResult.health,
                cloudCoverage: nextNdviResult.cloudCoverage,
                source: 'current-scan',
              },
            ]
          : []
      );

      setTimeSeries({
        success: true,
        data: mergedSeries,
        count: mergedSeries.length,
        trend: computeTrendFromSeriesClient(mergedSeries),
        sources: {
          historyCount: nextHistoryResult?.count || 0,
          liveCount: nextTimeSeriesResult?.count || 0,
        },
      });

      if (mergedSeries.length === 0 && nextTimeSeriesResult) {
        setTimeSeries(nextTimeSeriesResult);
      }

      if (nextNdviResult) {
        setAiAdviceLoading(true);
        try {
          const trend7d = nextTimeSeriesResult?.data?.length
            ? (() => {
                const slice = nextTimeSeriesResult.data.slice(-7);
                if (slice.length < 2) return null;
                const start = toNumber(slice[0].ndvi) ?? toNumber(slice[0].ndvi_value);
                const end = toNumber(slice[slice.length - 1].ndvi) ?? toNumber(slice[slice.length - 1].ndvi_value);
                if (start == null || end == null || start <= 0) return null;
                return Number((((end - start) / start) * 100).toFixed(1));
              })()
            : null;
          const trend7dAbs = nextTimeSeriesResult?.data?.length
            ? (() => {
                const slice = nextTimeSeriesResult.data.slice(-7);
                if (slice.length < 2) return null;
                const start = toNumber(slice[0].ndvi) ?? toNumber(slice[0].ndvi_value);
                const end = toNumber(slice[slice.length - 1].ndvi) ?? toNumber(slice[slice.length - 1].ndvi_value);
                if (start == null || end == null) return null;
                return Number((end - start).toFixed(2));
              })()
            : null;
          const trend30d = nextTimeSeriesResult?.trend?.changePct != null
            ? Number(nextTimeSeriesResult.trend.changePct.toFixed(1))
            : null;
          const trend30dAbs = nextTimeSeriesResult?.trend?.changeAbs != null
            ? Number(nextTimeSeriesResult.trend.changeAbs.toFixed(2))
            : null;

          const adviceResponse = await fetch(`${API_BASE_URL}/api/ndvi/advice`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              cropType: resolvedFarm?.cropType || 'Unknown',
              ndvi: nextNdviResult.ndvi,
              health: nextNdviResult.health,
              status: nextNdviResult.status,
              cloudCoverage: nextNdviResult.cloudCoverage,
              imageDate: nextNdviResult.imageDate,
              trend7d,
              trend7dAbs,
              trend30d,
              trend30dAbs,
              latitude: resolvedFarm?.latitude,
              longitude: resolvedFarm?.longitude,
              language: lang,
            }),
          });

          const adviceJson = await adviceResponse.json();
          if (!adviceResponse.ok || !adviceJson.success) {
            throw new Error(adviceJson.error || 'AI advice request failed');
          }

          setAiAdvice(adviceJson.advice);
        } catch (adviceError) {
          console.error('AI advice error:', adviceError);
          setAiAdvice(null);
          setAiAdviceError(adviceError.message || 'AI advice unavailable');
        } finally {
          setAiAdviceLoading(false);
        }
      } else {
        setAiAdvice(null);
      }
    } catch (error) {
      console.error('Error fetching NDVI data:', error);
    } finally {
      setNdviLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-surface font-body">
        <Sidebar onLogout={handleLogout} />
        <div className="ml-72 w-[calc(100%-18rem)]">
          <Header user={user} />
          <main className="pt-24 px-8 pb-12 flex items-center justify-center h-screen">
            <div className="flex flex-col items-center">
              <div className="animate-spin mb-4">
                <span className="material-symbols-outlined text-6xl text-primary">cloud_download</span>
              </div>
              <h3 className="text-xl font-headline font-bold text-on-surface">{t('fieldAnalytics', 'loadingFieldData', lang)}</h3>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!field) {
    return (
      <div className="flex min-h-screen bg-surface font-body">
        <Sidebar onLogout={handleLogout} />
        <div className="ml-72 w-[calc(100%-18rem)]">
          <Header user={user} />
          <main className="pt-24 px-8 pb-12">
            <div className="flex flex-col items-center justify-center py-24">
              <span className="material-symbols-outlined text-6xl text-error mb-4">error_outline</span>
              <h3 className="text-xl font-headline font-bold text-on-surface mb-2">{t('fieldAnalytics', 'fieldNotFound', lang)}</h3>
              <button
                onClick={() => navigate('/saved-fields')}
                className="px-6 py-2 bg-primary text-white rounded-full font-semibold hover:shadow-lg transition-shadow"
              >
                {t('fieldAnalytics', 'backToFields', lang)}
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const ndviValue = ndviData?.ndvi ? ndviData.ndvi.toFixed(2) : field?.ndviValue ? Number(field.ndviValue).toFixed(2) : '—';
  const healthStatus = ndviData?.health || field?.healthStatus || 'Unknown';
  const allSeries = Array.isArray(timeSeries?.data) ? timeSeries.data : [];
  const selectedRangeDays = RANGE_OPTIONS.find((option) => option.key === selectedRange)?.days || 180;
  const filteredSeries = allSeries.slice(-selectedRangeDays);
  const chartTrend = timeSeries?.trend || null;
  const selectedTrend = (() => {
    if (!Array.isArray(filteredSeries) || filteredSeries.length < 2) return null;
    const start = filteredSeries[0];
    const end = filteredSeries[filteredSeries.length - 1];
    const startValue = toNumber(start.ndvi) ?? toNumber(start.ndvi_value);
    const endValue = toNumber(end.ndvi) ?? toNumber(end.ndvi_value);
    if (startValue === null || endValue === null) return null;

    const changeAbs = endValue - startValue;
    const changePct = startValue > 0 ? (changeAbs / startValue) * 100 : null;
    return {
      start: { date: start.date || start.captured_date, ndvi: startValue },
      end: { date: end.date || end.captured_date, ndvi: endValue },
      changeAbs,
      changePct,
    };
  })();
  const trendSummary = summarizeTrend(selectedTrend || chartTrend, lang);
  const sparklineBars = buildBarHeights(filteredSeries);
  const chartPath = buildLinePath(filteredSeries);
  const chartAreaPath = buildAreaPath(filteredSeries);
  const chartPoints = buildChartPoints(filteredSeries);
  const chartLabels = (() => {
    if (filteredSeries.length === 0) return [];
    const desired = 6;
    const step = Math.max(1, Math.floor((filteredSeries.length - 1) / Math.max(desired - 1, 1)));
    const labels = [];
    for (let i = 0; i < filteredSeries.length; i += step) {
      labels.push(filteredSeries[i]);
      if (labels.length === desired) break;
    }
    const last = filteredSeries[filteredSeries.length - 1];
    if (labels[labels.length - 1] !== last) labels[labels.length - 1] = last;
    return labels;
  })();

  const dynamicSummaryText = ndviData?.error
    ? t('fieldAnalytics', 'satelliteServiceError', lang)
    : ndviData?.success === false
    ? t('fieldAnalytics', 'satelliteScanUnavailable', lang)
    : selectedTrend
    ? tt('fieldAnalytics', 'trendSummaryTemplate', lang, { summary: trendSummary.text, days: selectedRangeDays })
    : t('fieldAnalytics', 'collectScanHistory', lang);

  const growthHeadline = selectedTrend
    ? tt('fieldAnalytics', 'growthHeadlineTemplate', lang, { change: formatPct(selectedTrend.changePct), days: selectedRangeDays })
    : t('fieldAnalytics', 'moreScansNeeded', lang);

  const growthBody = selectedTrend
    ? tt('fieldAnalytics', 'growthBodyTemplate', lang, {
        startValue: selectedTrend.start.ndvi.toFixed(2),
        startDate: formatDateLabel(selectedTrend.start.date, lang),
        endValue: selectedTrend.end.ndvi.toFixed(2),
        endDate: formatDateLabel(selectedTrend.end.date, lang),
      })
    : t('fieldAnalytics', 'refreshRegularly', lang);

  const expectedYield = selectedTrend?.changePct != null ? formatPct(selectedTrend.changePct) : '—';
  const harvestDate = selectedTrend?.end?.date ? formatDateLabel(selectedTrend.end.date, lang) : '—';
  const cloudCoverage = ndviData?.cloudCoverage != null ? `${Number(ndviData.cloudCoverage).toFixed(1)}%` : t('fieldAnalytics', 'unavailable', lang);
  const latestChartPoint = chartPoints.length > 0 ? chartPoints[chartPoints.length - 1] : null;
  const highestChartPoint = chartPoints.length > 0
    ? chartPoints.reduce((best, point) => (point.value > best.value ? point : best), chartPoints[0])
    : null;
  const lowestChartPoint = chartPoints.length > 0
    ? chartPoints.reduce((best, point) => (point.value < best.value ? point : best), chartPoints[0])
    : null;
  const averageNdvi = chartPoints.length > 0
    ? (chartPoints.reduce((sum, point) => sum + point.value, 0) / chartPoints.length).toFixed(2)
    : '—';
  const latestBand = latestChartPoint ? getHealthBand(latestChartPoint.value) : null;
  const translatedHealthStatus =
    healthStatus === 'Good'
      ? t('savedFields', 'good', lang)
      : healthStatus === 'Moderate'
      ? t('savedFields', 'moderate', lang)
      : healthStatus === 'Poor'
      ? t('savedFields', 'poor', lang)
      : healthStatus === 'Excellent'
      ? t('savedFields', 'excellent', lang)
      : healthStatus === 'Unknown'
      ? t('savedFields', 'unknown', lang)
      : healthStatus;
  const nitrogenLevel = translatedHealthStatus || t('savedFields', 'unknown', lang);
  const temperature = field?.temperature || t('fieldAnalytics', 'unavailable', lang);
  const humidity = field?.humidity || t('fieldAnalytics', 'unavailable', lang);

  return (
    <div className="flex min-h-screen bg-surface font-body">
      <Sidebar onLogout={handleLogout} />

      <div className="ml-72 w-[calc(100%-18rem)] overflow-y-auto">
        <Header user={user} />

        <main className="pt-24 px-8 pb-12">
          {/* Field Header Section */}
          <section className="mb-10">
            <nav className="flex items-center gap-2 text-xs font-semibold text-primary/60 uppercase tracking-widest mb-2">
              <span>{t('fieldAnalytics', 'sectors', lang)}</span>
              <span className="material-symbols-outlined text-[10px]">chevron_right</span>
              <span className="text-primary">{field?.name || t('fieldAnalytics', 'field', lang)}</span>
            </nav>
            <h1 className="text-5xl font-extrabold text-primary tracking-tight mb-2 font-headline">
              {field?.name || t('fieldAnalytics', 'fieldReport', lang)}
            </h1>
            <div className="flex items-center gap-4 flex-wrap">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary-fixed text-on-primary-fixed rounded-full text-sm font-bold">
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                  grass
                </span>
                {field?.cropType || 'Wheat (Triticum aestivum)'}
              </span>
              {field?.latitude && field?.longitude && (
                <span className="text-on-surface-variant font-medium flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">location_on</span>
                  {field.latitude.toFixed(3)}°N, {field.longitude.toFixed(3)}°W
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-6">
              <button className="px-6 py-3 bg-white text-primary border border-outline-variant/20 rounded-full font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-2">
                <span className="material-symbols-outlined">file_download</span>
                {t('fieldAnalytics', 'exportReport', lang)}
              </button>
              <button
                onClick={() => field?.boundaryCoordinates && fetchNDVIData(field.boundaryCoordinates, fieldId)}
                disabled={ndviLoading || !field?.boundaryCoordinates}
                className="px-6 py-3 bg-white text-primary border border-outline-variant/20 rounded-full font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined">refresh</span>
                {ndviLoading ? t('fieldAnalytics', 'refreshing', lang) : t('fieldAnalytics', 'refreshData', lang)}
              </button>
              <button className="px-6 py-3 bg-gradient-to-br from-[#004a31] to-[#2b5bb5] text-white rounded-full font-bold shadow-lg hover:opacity-90 transition-all flex items-center gap-2">
                <span className="material-symbols-outlined">rocket_launch</span>
                {t('fieldAnalytics', 'dispatchDrone', lang)}
              </button>
            </div>
          </section>

          {/* Main Bento Grid */}
          <div className="grid grid-cols-12 gap-6">
            {/* Health Overview Card */}
            <div className="col-span-12 lg:col-span-4 bg-surface-container-lowest rounded-xl p-8 shadow-[0px_24px_48px_rgba(26,28,25,0.06)] flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -mr-8 -mt-8"></div>
              <div>
                <div className="flex justify-between items-start mb-6">
                  <h3 className="text-sm font-bold text-on-surface-variant/60 uppercase tracking-wider">
                    {t('fieldAnalytics', 'cropHealth', lang)}
                  </h3>
                  {ndviLoading ? (
                    <div className="animate-pulse">
                      <span className="flex items-center gap-1.5 px-3 py-1 bg-surface-container-high rounded-full text-xs font-black">
                        <span className="w-2 h-2 rounded-full bg-outline-variant animate-pulse"></span>
                        {t('fieldAnalytics', 'fetching', lang)}
                      </span>
                    </div>
                  ) : (
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-primary-fixed-dim text-on-primary-fixed rounded-full text-xs font-black">
                      <span className="w-2 h-2 rounded-full bg-on-primary-fixed animate-pulse"></span>
                      {translatedHealthStatus}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  {ndviLoading ? (
                    <div className="animate-pulse flex items-baseline gap-2">
                      <span className="text-6xl font-black text-on-surface-variant/30">–</span>
                      <span className="text-lg font-bold text-on-surface-variant/30">NDVI</span>
                    </div>
                  ) : (
                    <>
                      <span className="text-6xl font-black text-primary tracking-tighter">{ndviValue}</span>
                      <span className="text-lg font-bold text-on-primary-container">{t('fieldAnalytics', 'score', lang)}</span>
                    </>
                  )}
                </div>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  {dynamicSummaryText}
                </p>
              </div>
              <div className="mt-8 pt-6 border-t border-outline-variant/10">
                <div className="flex justify-between items-end">
                  <div>
                    <span className="text-xs font-bold text-on-surface-variant/50">{tt('fieldAnalytics', 'dayChange', lang, { days: selectedRangeDays })}</span>
                    <div className={`flex items-center gap-1 font-bold ${trendSummary.tone}`}>
                      <span className="material-symbols-outlined text-sm">{trendSummary.icon}</span>
                      {selectedTrend ? formatPct(selectedTrend.changePct) : '—'}
                    </div>
                  </div>
                  <div className="flex items-end gap-1 h-12">
                    {sparklineBars.length > 0 ? (
                      sparklineBars.map((bar, index) => (
                        <div
                          key={bar.key}
                          className={`w-1 rounded-full ${index === sparklineBars.length - 1 ? 'bg-primary' : 'bg-primary/30'}`}
                          style={{ height: `${bar.height}px` }}
                        ></div>
                      ))
                    ) : (
                      <span className="text-xs text-on-surface-variant/50">{t('fieldAnalytics', 'noTrendData', lang)}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* AI Growth Prediction Card */}
            <div className="col-span-12 lg:col-span-8 bg-gradient-to-br from-[#004a31] to-[#2b5bb5] rounded-xl p-8 text-white relative overflow-hidden flex items-center">
              <div className="absolute inset-0 opacity-20 pointer-events-none">
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                  <path
                    d="M0 50 Q 25 30 50 50 T 100 50"
                    fill="transparent"
                    stroke="white"
                    strokeWidth="0.5"
                  ></path>
                  <path
                    d="M0 60 Q 25 40 50 60 T 100 60"
                    fill="transparent"
                    stroke="white"
                    strokeWidth="0.5"
                  ></path>
                </svg>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 w-full gap-12 relative z-10">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold uppercase tracking-wider">
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                      auto_awesome
                    </span>
                    {t('fieldAnalytics', 'cropHealthSummary', lang)}
                  </div>
                  <h2 className="text-4xl font-bold leading-tight font-headline">
                    {growthHeadline}
                  </h2>
                  <p className="text-white/80 text-sm max-w-sm leading-relaxed">
                    {growthBody}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10">
                    <span className="text-white/60 text-xs font-bold uppercase block mb-1">{t('fieldAnalytics', 'healthChange', lang)}</span>
                    <span className="text-3xl font-black">{expectedYield}</span>
                    <p className="text-[10px] text-white/50 mt-1">{t('fieldAnalytics', 'overSelectedPeriod', lang)}</p>
                  </div>
                  <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10">
                    <span className="text-white/60 text-xs font-bold uppercase block mb-1">{t('fieldAnalytics', 'lastScanDate', lang)}</span>
                    <span className="text-3xl font-black">{harvestDate}</span>
                    <p className="text-[10px] text-white/50 mt-1">{t('fieldAnalytics', 'mostRecentSatellitePhoto', lang)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Satellite Intelligence & Cloud Resilience Card */}
            <div className="col-span-12 bg-surface-container-lowest rounded-xl p-8 shadow-[0px_24px_48px_rgba(26,28,25,0.06)] border border-outline-variant/10">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-outline-variant/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined font-bold">satellite_alt</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-primary font-headline">Satellite Intelligence</h3>
                    <p className="text-xs text-on-surface-variant font-medium">
                      {ndviData?.datasource || 'Sentinel-2 SR & Sentinel-1 SAR Cloud-Resilient Workflow'}
                    </p>
                  </div>
                </div>
                
                {/* Confidence Badge */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Confidence:</span>
                  {ndviData?.confidence === 'High' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-black border border-emerald-300">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      🟢 High
                    </span>
                  ) : ndviData?.confidence === 'Medium' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-black border border-amber-300">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                      🟡 Medium
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-100 text-rose-800 rounded-full text-xs font-black border border-rose-300">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                      🔴 Low
                    </span>
                  )}
                </div>
              </div>

              {/* Low Confidence Warning Banner */}
              {ndviData?.confidence === 'Low' && (
                <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3 text-amber-900">
                  <span className="material-symbols-outlined text-amber-600 font-bold text-xl">warning</span>
                  <div>
                    <p className="font-bold text-sm">⚠ Heavy cloud cover detected.</p>
                    <p className="text-xs text-amber-800 mt-0.5">Using latest reliable satellite imagery.</p>
                  </div>
                </div>
              )}

              {/* Key Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="bg-surface-container/50 rounded-xl p-4 border border-outline-variant/10">
                  <span className="text-xs font-bold text-on-surface-variant/60 block uppercase">NDVI</span>
                  <span className="text-2xl font-extrabold text-primary">{ndviData?.averageNDVI ?? ndviData?.ndvi ?? '0.73'}</span>
                  <span className="text-[10px] text-on-surface-variant block mt-0.5">Average Index</span>
                </div>

                <div className="bg-surface-container/50 rounded-xl p-4 border border-outline-variant/10">
                  <span className="text-xs font-bold text-on-surface-variant/60 block uppercase">Image Date</span>
                  <span className="text-base font-bold text-on-surface">{formatImageDatePretty(ndviData?.imageDate)}</span>
                  <span className="text-[10px] text-on-surface-variant block mt-0.5">
                    {ndviData?.datasource?.includes('SAR') ? 'Sentinel-1 Radar' : 'Sentinel-2 SR Scene'}
                  </span>
                </div>

                <div className="bg-surface-container/50 rounded-xl p-4 border border-outline-variant/10">
                  <span className="text-xs font-bold text-on-surface-variant/60 block uppercase">Cloud Cover</span>
                  <span className="text-2xl font-extrabold text-primary">{ndviData?.cloudCover ?? ndviData?.cloudCoverage ?? 0}%</span>
                  <span className="text-[10px] text-on-surface-variant block mt-0.5">Filtered &lt; 20%</span>
                </div>

                <div className="bg-surface-container/50 rounded-xl p-4 border border-outline-variant/10">
                  <span className="text-xs font-bold text-on-surface-variant/60 block uppercase">Images Used</span>
                  <span className="text-2xl font-extrabold text-primary">{ndviData?.imagesUsed ?? 1}</span>
                  <span className="text-[10px] text-on-surface-variant block mt-0.5">Median Composite</span>
                </div>

                <div className="bg-surface-container/50 rounded-xl p-4 border border-outline-variant/10">
                  <span className="text-xs font-bold text-on-surface-variant/60 block uppercase">Confidence</span>
                  <span className="text-base font-extrabold text-primary">{ndviData?.confidence ?? 'High'}</span>
                  <span className="text-[10px] text-on-surface-variant block mt-0.5">Automated Gate</span>
                </div>

                <div className="bg-surface-container/50 rounded-xl p-4 border border-outline-variant/10">
                  <span className="text-xs font-bold text-on-surface-variant/60 block uppercase">Time Window</span>
                  <span className="text-base font-bold text-on-surface">{ndviData?.timeWindow ?? '15 Days'}</span>
                  <span className="text-[10px] text-on-surface-variant block mt-0.5">Adaptive Search</span>
                </div>
              </div>

              {/* Additional Statistics Breakdown (Min/Max + Healthy/Moderate/Poor Area %) */}
              {ndviData?.healthyArea != null && (
                <div className="mt-6 pt-6 border-t border-outline-variant/10 grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                    <span className="text-xs font-bold text-emerald-800">Healthy Area</span>
                    <span className="text-sm font-black text-emerald-900">{ndviData.healthyArea}%</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-100">
                    <span className="text-xs font-bold text-amber-800">Moderate Area</span>
                    <span className="text-sm font-black text-amber-900">{ndviData.moderateArea}%</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-rose-50 rounded-lg border border-rose-100">
                    <span className="text-xs font-bold text-rose-800">Poor Area</span>
                    <span className="text-sm font-black text-rose-900">{ndviData.poorArea}%</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-surface-container rounded-lg border border-outline-variant/10">
                    <span className="text-xs font-bold text-on-surface-variant">Min / Max Range</span>
                    <span className="text-xs font-bold text-primary">{ndviData.minimumNDVI} – {ndviData.maximumNDVI}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Large NDVI Chart */}
            <div className="col-span-12 lg:col-span-9 bg-surface-container-lowest rounded-xl p-8 shadow-[0px_24px_48px_rgba(26,28,25,0.06)]">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-xl font-bold text-primary font-headline">{t('fieldAnalytics', 'cropHealthHistory', lang)}</h3>
                  <p className="text-sm text-on-surface-variant">
                    {filteredSeries.length > 0
                      ? `${filteredSeries.length} ${t('fieldAnalytics', filteredSeries.length === 1 ? 'scanCountSingular' : 'scanCountPlural', lang)}`
                      : t('fieldAnalytics', 'scansAppearLater', lang)}
                  </p>
                </div>
                <div className="flex gap-2 bg-surface-container-low p-1 rounded-full">
                  {RANGE_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      onClick={() => setSelectedRange(option.key)}
                      className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all ${
                        selectedRange === option.key ? 'bg-white shadow-sm' : 'hover:bg-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-6 grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700/80">Latest NDVI</p>
                  <p className="mt-2 text-2xl font-black text-emerald-900">
                    {latestChartPoint ? latestChartPoint.value.toFixed(2) : '—'}
                  </p>
                  <p className="mt-1 text-xs text-emerald-800/80">
                    {latestChartPoint ? formatDateLabel(latestChartPoint.date, lang) : 'Waiting for first scan'}
                  </p>
                </div>
                <div className="rounded-2xl border border-sky-200/70 bg-sky-50 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-700/80">Period Change</p>
                  <p className="mt-2 text-2xl font-black text-sky-900">{formatPct(selectedTrend?.changePct)}</p>
                  <p className="mt-1 text-xs text-sky-800/80">
                    {selectedTrend ? `${selectedTrend.changeAbs >= 0 ? '+' : ''}${selectedTrend.changeAbs.toFixed(2)} NDVI` : 'Need at least 2 scans'}
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-200/70 bg-amber-50 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700/80">Average Health</p>
                  <p className="mt-2 text-2xl font-black text-amber-900">{averageNdvi}</p>
                  <p className="mt-1 text-xs text-amber-800/80">
                    {chartPoints.length > 0 ? `${chartPoints.length} scans in view` : 'No scan history yet'}
                  </p>
                </div>
                <div className="rounded-2xl border border-violet-200/70 bg-violet-50 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700/80">Current Status</p>
                  <p className={`mt-2 text-xl font-black ${latestBand?.tone || 'text-violet-900'}`}>
                    {latestBand?.label || translatedHealthStatus}
                  </p>
                  <p className="mt-1 text-xs text-violet-800/80">
                    {trendSummary.text}
                  </p>
                </div>
              </div>

              <div className="relative mt-10 overflow-hidden rounded-[28px] border border-outline-variant/10 bg-[linear-gradient(180deg,rgba(237,247,241,0.8),rgba(255,255,255,0.96))] px-6 py-6">
                {filteredSeries.length > 1 ? (
                  <>
                    <div className="mb-4 flex flex-wrap items-center gap-3 text-xs font-semibold text-on-surface-variant">
                      <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 shadow-sm">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
                        Strong growth
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 shadow-sm">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-400"></span>
                        Stable / watch
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 shadow-sm">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-400"></span>
                        Weak crop signal
                      </span>
                    </div>

                    <div className="relative h-[320px] w-full">
                      <svg className="h-full w-full overflow-visible" viewBox="0 0 1000 300" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="ndviAreaFill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#0f7b53" stopOpacity="0.30" />
                            <stop offset="100%" stopColor="#0f7b53" stopOpacity="0.02" />
                          </linearGradient>
                        </defs>

                        <rect x="0" y="20" width="1000" height="78" fill="#d1fae5" opacity="0.38"></rect>
                        <rect x="0" y="98" width="1000" height="91" fill="#fef3c7" opacity="0.35"></rect>
                        <rect x="0" y="189" width="1000" height="91" fill="#ffe4e6" opacity="0.45"></rect>

                        <line stroke="#9dd9bf" strokeDasharray="5 7" x1="0" x2="1000" y1="98" y2="98"></line>
                        <line stroke="#f4c95d" strokeDasharray="5 7" x1="0" x2="1000" y1="189" y2="189"></line>
                        <line stroke="#d7ddd8" strokeDasharray="4 8" x1="0" x2="1000" y1="40" y2="40"></line>
                        <line stroke="#d7ddd8" strokeDasharray="4 8" x1="0" x2="1000" y1="150" y2="150"></line>
                        <line stroke="#d7ddd8" strokeDasharray="4 8" x1="0" x2="1000" y1="260" y2="260"></line>

                        <path d={chartAreaPath} fill="url(#ndviAreaFill)"></path>
                      <path
                        d={chartPath}
                        fill="none"
                        stroke="#004a31"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="4"
                      ></path>

                        {chartPoints.map((point, index) => {
                          const isLatest = index === chartPoints.length - 1;
                          const pointBand = getHealthBand(point.value);
                          const pointRadius = isLatest ? 7 : 4.5;

                          return (
                            <g key={`${point.date || point.captured_date}-${index}`}>
                              {isLatest ? (
                                <circle
                                  cx={point.x}
                                  cy={point.y}
                                  r="14"
                                  fill={pointBand.stroke}
                                  opacity="0.16"
                                ></circle>
                              ) : null}
                              <circle
                                cx={point.x}
                                cy={point.y}
                                r={pointRadius}
                                fill={isLatest ? '#2b5bb5' : pointBand.stroke}
                                stroke="white"
                                strokeWidth="2.5"
                              ></circle>
                            </g>
                          );
                        })}

                        {highestChartPoint ? (
                          <g transform={`translate(${highestChartPoint.x}, ${highestChartPoint.y - 18})`}>
                            <rect x="-46" y="-24" width="92" height="20" rx="10" fill="white" opacity="0.96"></rect>
                            <text x="0" y="-10" textAnchor="middle" fontSize="11" fontWeight="700" fill="#166534">
                              Peak {highestChartPoint.value.toFixed(2)}
                            </text>
                          </g>
                        ) : null}

                        {lowestChartPoint ? (
                          <g transform={`translate(${lowestChartPoint.x}, ${lowestChartPoint.y + 26})`}>
                            <rect x="-54" y="-10" width="108" height="20" rx="10" fill="white" opacity="0.96"></rect>
                            <text x="0" y="4" textAnchor="middle" fontSize="11" fontWeight="700" fill="#be123c">
                              Low {lowestChartPoint.value.toFixed(2)}
                            </text>
                          </g>
                        ) : null}
                      </svg>

                      <div className="absolute left-0 top-0 flex h-full -translate-x-2 flex-col justify-between py-2 text-[10px] font-bold text-on-surface-variant/55">
                        <span>1.0</span>
                        <span>0.7</span>
                        <span>0.45</span>
                        <span>0.0</span>
                      </div>

                      <div className="absolute right-4 top-4 max-w-[220px] rounded-2xl border border-white/70 bg-white/90 p-4 shadow-lg backdrop-blur">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-on-surface-variant/70">Latest reading</p>
                        <p className="mt-2 text-2xl font-black text-primary">
                          {latestChartPoint ? latestChartPoint.value.toFixed(2) : '—'}
                        </p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {latestChartPoint ? formatDateLabel(latestChartPoint.date, lang) : 'No scan date available'}
                        </p>
                        <div className="mt-3 flex items-center gap-2 text-xs">
                          <span
                            className="inline-flex h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: latestBand?.stroke || '#64748b' }}
                          ></span>
                          <span className={latestBand?.tone || 'text-on-surface'}>
                            {latestBand?.label || 'No status available'}
                          </span>
                        </div>
                      </div>

                      <div className="absolute bottom-3 left-0 right-0 flex justify-between px-4 text-xs font-bold text-on-surface-variant/55">
                        {chartLabels.length > 0 ? (
                          chartLabels.map((label, index) => (
                            <span key={`${label.date || label.captured_date || index}-${index}`}>
                              {formatDateLabel(label.date || label.captured_date, lang)}
                            </span>
                          ))
                        ) : (
                          <span>{t('fieldAnalytics', 'noLabelsAvailable', lang)}</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-outline-variant/10 bg-white/80 px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-on-surface-variant/70">Peak reading</p>
                        <p className="mt-2 text-lg font-black text-primary">
                          {highestChartPoint ? highestChartPoint.value.toFixed(2) : '—'}
                        </p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {highestChartPoint ? formatDateLabel(highestChartPoint.date, lang) : 'No peak recorded'}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-outline-variant/10 bg-white/80 px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-on-surface-variant/70">Lowest reading</p>
                        <p className="mt-2 text-lg font-black text-primary">
                          {lowestChartPoint ? lowestChartPoint.value.toFixed(2) : '—'}
                        </p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {lowestChartPoint ? formatDateLabel(lowestChartPoint.date, lang) : 'No low point recorded'}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-outline-variant/10 bg-white/80 px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-on-surface-variant/70">Reading guide</p>
                        <p className="mt-2 text-sm font-bold text-primary">
                          0.70+ strong, 0.45-0.69 stable, below 0.45 needs attention
                        </p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          Use this with field scouting, not as a standalone diagnosis.
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex h-[320px] items-center justify-center rounded-[28px] border border-dashed border-outline-variant/20 bg-white/70 text-sm text-on-surface-variant">
                    {t('fieldAnalytics', 'notEnoughScanHistory', lang)}
                  </div>
                )}
              </div>
            </div>

            {/* Mini Map Card */}
            <NDVIHeatmapCard field={field} ndviData={ndviData} />

            {/* Metrics Row */}
            <div className="col-span-12 grid grid-cols-2 md:grid-cols-4 gap-6">
              {/* Cloud Coverage */}
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_24px_48px_rgba(26,28,25,0.06)] flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    cloud
                  </span>
                </div>
                <div>
                  <span className="text-xs font-bold text-on-surface-variant opacity-60">{t('fieldAnalytics', 'cloudCoverage', lang)}</span>
                  <div className="text-2xl font-black text-primary">{cloudCoverage}</div>
                </div>
              </div>

              {/* Nitrogen */}
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_24px_48px_rgba(26,28,25,0.06)] flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary-fixed flex items-center justify-center text-on-primary-fixed">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    science
                  </span>
                </div>
                <div>
                  <span className="text-xs font-bold text-on-surface-variant opacity-60">{t('fieldAnalytics', 'cropStatus', lang)}</span>
                  <div className="text-2xl font-black text-primary">{nitrogenLevel}</div>
                </div>
              </div>

              {/* Temperature */}
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_24px_48px_rgba(26,28,25,0.06)] flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    thermostat
                  </span>
                </div>
                <div>
                  <span className="text-xs font-bold text-on-surface-variant opacity-60">{t('fieldAnalytics', 'temperature', lang)}</span>
                  <div className="text-2xl font-black text-primary">{temperature}</div>
                </div>
              </div>

              {/* Humidity */}
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_24px_48px_rgba(26,28,25,0.06)] flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    cloudy_snowing
                  </span>
                </div>
                <div>
                  <span className="text-xs font-bold text-on-surface-variant opacity-60">{t('fieldAnalytics', 'humidity', lang)}</span>
                  <div className="text-2xl font-black text-primary">{humidity}</div>
                </div>
              </div>
            </div>

            <div className="col-span-12 bg-surface-container-lowest rounded-xl p-8 shadow-[0px_24px_48px_rgba(26,28,25,0.06)]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-primary-fixed/20 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined">auto_awesome</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-primary font-headline">{t('fieldAnalytics', 'aiCropTips', lang)}</h3>
                  <p className="text-sm text-on-surface-variant">{t('fieldAnalytics', 'aiAdviceSubtitle', lang)}</p>
                </div>
              </div>

              {aiAdviceLoading ? (
                <p className="text-sm text-on-surface-variant">{t('fieldAnalytics', 'loadingAiAdvice', lang)}</p>
              ) : aiAdvice ? (
                <div className="space-y-5">
                  <p className="text-sm text-on-surface leading-relaxed">{aiAdvice.summary}</p>

                  {aiAdvice.crop_analysis && (
                    <div className="bg-surface-container-low rounded-2xl p-4">
                      <h4 className="text-sm font-bold text-primary mb-2">{t('fieldAnalytics', 'cropAnalysis', lang)}</h4>
                      <p className="text-sm text-on-surface-variant leading-relaxed">{aiAdvice.crop_analysis}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {aiAdvice.ndvi_analysis && (
                      <div className="bg-primary-fixed/10 rounded-2xl p-4">
                        <h4 className="text-sm font-bold text-primary mb-2">{t('fieldAnalytics', 'ndviAnalysis', lang)}</h4>
                        <p className="text-sm text-on-surface-variant leading-relaxed">{aiAdvice.ndvi_analysis}</p>
                      </div>
                    )}

                    {aiAdvice.weather_analysis && (
                      <div className="bg-secondary-container/40 rounded-2xl p-4">
                        <h4 className="text-sm font-bold text-primary mb-2">{t('fieldAnalytics', 'weatherImpact', lang)}</h4>
                        <p className="text-sm text-on-surface-variant leading-relaxed">{aiAdvice.weather_analysis}</p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {aiAdvice.irrigation_guidance && (
                      <div className="bg-sky-50 rounded-2xl p-4 border border-sky-100">
                        <h4 className="text-sm font-bold text-primary mb-2">{t('fieldAnalytics', 'irrigationGuidance', lang)}</h4>
                        <p className="text-sm text-on-surface-variant leading-relaxed">{aiAdvice.irrigation_guidance}</p>
                      </div>
                    )}

                    {aiAdvice.nutrition_guidance && (
                      <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                        <h4 className="text-sm font-bold text-primary mb-2">{t('fieldAnalytics', 'nutritionGuidance', lang)}</h4>
                        <p className="text-sm text-on-surface-variant leading-relaxed">{aiAdvice.nutrition_guidance}</p>
                      </div>
                    )}
                  </div>

                  {(aiAdvice.recommendations || aiAdvice.tips)?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-primary mb-2">{t('fieldAnalytics', 'keyTips', lang)}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {(aiAdvice.recommendations || aiAdvice.tips).map((tip, index) => (
                          <div key={`tip-${index}`} className="bg-surface-container-low rounded-2xl p-4 text-sm text-on-surface-variant">
                            {tip}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {aiAdvice.watchouts?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-primary mb-2">{t('fieldAnalytics', 'watchouts', lang)}</h4>
                      <div className="space-y-2">
                        {aiAdvice.watchouts.map((item, index) => (
                          <div key={`watch-${index}`} className="bg-error-container/20 rounded-2xl p-4 text-sm text-on-surface-variant">
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(aiAdvice.priority_actions || aiAdvice.actions)?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-primary mb-2">{t('fieldAnalytics', 'priorityActions', lang)}</h4>
                      <div className="space-y-2">
                        {(aiAdvice.priority_actions || aiAdvice.actions).map((action, index) => (
                          <div key={`action-${index}`} className="bg-primary-fixed/10 rounded-2xl p-4 text-sm text-on-surface-variant">
                            {action}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant">{aiAdviceError || t('fieldAnalytics', 'aiAdviceUnavailable', lang)}</p>
              )}
            </div>

            {/* Actionable Insights */}
            <div className="col-span-12">
              <div className="flex items-center gap-4 mb-6">
                <h2 className="text-2xl font-bold text-primary font-headline">{t('fieldAnalytics', 'smartFarmingTips', lang)}</h2>
                <div className="h-[1px] flex-1 bg-outline-variant/30"></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Insight 1 */}
                <div className="bg-surface-container-low p-6 rounded-xl flex items-start gap-4 border border-transparent hover:border-primary/20 transition-all cursor-pointer">
                  <div className="bg-white p-3 rounded-2xl shadow-sm text-secondary">
                    <span className="material-symbols-outlined">calendar_clock</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-bold text-primary">{t('fieldAnalytics', 'scheduleIrrigation', lang)}</h4>
                      <span className="text-[10px] font-black px-2 py-0.5 bg-secondary/10 text-secondary rounded-full">
                        {t('fieldAnalytics', 'priority', lang)}
                      </span>
                    </div>
                    <p className="text-sm text-on-surface-variant leading-relaxed">
                      {t('fieldAnalytics', 'irrigationInsight', lang)}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-outline/30 ml-auto self-center">
                    chevron_right
                  </span>
                </div>

                {/* Insight 2 */}
                <div className="bg-surface-container-low p-6 rounded-xl flex items-start gap-4 border border-transparent hover:border-error/20 transition-all cursor-pointer">
                  <div className="bg-white p-3 rounded-2xl shadow-sm text-error">
                    <span className="material-symbols-outlined">scan_delete</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-bold text-primary">{t('fieldAnalytics', 'monitorEarlyRust', lang)}</h4>
                      <span className="text-[10px] font-black px-2 py-0.5 bg-error/10 text-error rounded-full">
                        {t('fieldAnalytics', 'alert', lang)}
                      </span>
                    </div>
                    <p className="text-sm text-on-surface-variant leading-relaxed">
                      {t('fieldAnalytics', 'rustInsight', lang)}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-outline/30 ml-auto self-center">
                    chevron_right
                  </span>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default FieldAnalytics;

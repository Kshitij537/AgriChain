import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import { t, getCurrentLanguage } from '../utils/translations';

// Add custom CSS for alert animations
const styles = `
  @keyframes pulse-slow {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.95; }
  }
  .animate-pulse-slow {
    animation: pulse-slow 3s ease-in-out infinite;
  }
`;

const Weather = () => {
  const [lang, setLang] = useState(getCurrentLanguage());
  const navigate = useNavigate();
  const [user] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const [fields, setFields] = useState([]);
  const [selectedField, setSelectedField] = useState(null);
  const [location, setLocation] = useState({
    name: 'Default Location',
    lat: 19.076,
    lon: 72.877
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  // Listen for language changes
  useEffect(() => {
    const handleLanguageChange = () => {
      setLang(getCurrentLanguage());
    };

    window.addEventListener('languageChange', handleLanguageChange);
    return () => window.removeEventListener('languageChange', handleLanguageChange);
  }, []);

  const [weatherData, setWeatherData] = useState({
    current: {
      temp: 28,
      feelsLike: 30,
      humidity: 65,
      windSpeed: 12,
      windDirection: 'NE',
      pressure: 1013,
      uvIndex: 7,
      visibility: 10,
      condition: 'Partly Cloudy',
      icon: 'partly_cloudy_day',
      precipitation: 0,
      dewPoint: 20,
    },
    forecast: [
      { day: 'Mon', high: 30, low: 22, condition: 'Sunny', icon: 'sunny', rainChance: 10 },
      { day: 'Tue', high: 29, low: 21, condition: 'Partly Cloudy', icon: 'partly_cloudy_day', rainChance: 20 },
      { day: 'Wed', high: 27, low: 20, condition: 'Rainy', icon: 'rainy', rainChance: 80 },
      { day: 'Thu', high: 26, low: 19, condition: 'Rainy', icon: 'rainy', rainChance: 70 },
      { day: 'Fri', high: 28, low: 20, condition: 'Partly Cloudy', icon: 'partly_cloudy_day', rainChance: 30 },
      { day: 'Sat', high: 30, low: 22, condition: 'Sunny', icon: 'sunny', rainChance: 5 },
      { day: 'Sun', high: 31, low: 23, condition: 'Sunny', icon: 'sunny', rainChance: 5 },
    ],
    hourly: [
      { time: '12 AM', temp: 23, icon: 'clear_night', rainChance: 0 },
      { time: '3 AM', temp: 22, icon: 'clear_night', rainChance: 0 },
      { time: '6 AM', temp: 21, icon: 'partly_cloudy_day', rainChance: 10 },
      { time: '9 AM', temp: 25, icon: 'partly_cloudy_day', rainChance: 10 },
      { time: '12 PM', temp: 28, icon: 'partly_cloudy_day', rainChance: 20 },
      { time: '3 PM', temp: 30, icon: 'partly_cloudy_day', rainChance: 15 },
      { time: '6 PM', temp: 27, icon: 'partly_cloudy_night', rainChance: 10 },
      { time: '9 PM', temp: 24, icon: 'clear_night', rainChance: 5 },
    ],
    alerts: [
      {
        type: 'warning',
        title: 'Heavy Rain Expected',
        message: 'Heavy rainfall expected on Wednesday. Consider postponing irrigation.',
        icon: 'rainy_heavy',
        severity: 'moderate',
      },
      {
        type: 'info',
        title: 'High UV Index',
        message: 'UV index will be very high today. Protect yourself if working outdoors.',
        icon: 'wb_sunny',
        severity: 'low',
      },
    ],
    diseaseRisk: {
      overall: 'Moderate',
      factors: [
        { name: 'Fungal Disease', risk: 'High', score: 75, reason: 'High humidity + warm temp' },
        { name: 'Pest Activity', risk: 'Moderate', score: 55, reason: 'Favorable conditions' },
        { name: 'Drought Stress', risk: 'Low', score: 20, reason: 'Adequate moisture' },
      ],
    },
    recommendations: [
      {
        activity: 'Irrigation',
        time: 'Today Evening (6-8 PM)',
        reason: 'Low evaporation, no rain expected',
        icon: 'water_drop',
        status: 'good'
      },
      {
        activity: 'Pesticide Spraying',
        time: 'Thursday Morning (7-9 AM)',
        reason: 'Dry conditions, low wind',
        icon: 'pest_control',
        status: 'good'
      },
      {
        activity: 'Fertilizer Application',
        time: 'Postpone till Friday',
        reason: 'Heavy rain expected Wed-Thu',
        icon: 'eco',
        status: 'warning'
      },
      {
        activity: 'Harvesting',
        time: 'Weekend (Sat-Sun)',
        reason: 'Clear skies, low humidity',
        icon: 'agriculture',
        status: 'good'
      }
    ]
  });

  // Fetch user's fields on component mount
  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const fetchFields = async () => {
      try {
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
          throw new Error('Failed to load fields');
        }

        const data = await response.json();
        console.log('[Weather] Farms data received:', data);
        
        const farmsList = Array.isArray(data.farms) ? data.farms : [];
        console.log('[Weather] Farms list:', farmsList);
        
        setFields(farmsList);

        // Auto-select first field or use default location
        if (farmsList.length > 0) {
          const firstField = farmsList[0];
          console.log('[Weather] First field:', firstField);
          
          // Try both 'coordinates', 'boundaryCoordinates', and 'boundary_coordinates' fields
          const coordsField = firstField.coordinates || firstField.boundaryCoordinates || firstField.boundary_coordinates;
          
          if (coordsField) {
            try {
              const coords = typeof coordsField === 'string' ? JSON.parse(coordsField) : coordsField;
              console.log('[Weather] Parsed coordinates:', coords);
              
              if (coords && Array.isArray(coords) && coords.length > 0) {
                // Calculate center of field
                const lats = coords.map(c => c[1]);
                const lons = coords.map(c => c[0]);
                const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
                const centerLon = lons.reduce((a, b) => a + b, 0) / lons.length;

                console.log('[Weather] Center calculated:', centerLat, centerLon);

                setSelectedField(firstField);
                setLocation({
                  name: firstField.name,
                  lat: centerLat,
                  lon: centerLon
                });
              } else {
                console.log('[Weather] No valid coordinates in field, using default');
              }
            } catch (parseErr) {
              console.error('[Weather] Error parsing coordinates:', parseErr);
            }
          } else {
            console.log('[Weather] Field has no coordinates, using default location');
          }
        } else {
          console.log('[Weather] No fields found, using default location');
        }
      } catch (err) {
        console.error('[Weather] Error fetching fields:', err);
        setError('Could not load your fields');
      }
    };

    fetchFields();
  }, [user, navigate, API_BASE_URL]);

  // Fetch weather data when location changes
  useEffect(() => {
    const fetchWeatherData = async () => {
      if (!location.lat || !location.lon) {
        console.log('[Weather] No location set, skipping fetch');
        return;
      }

      try {
        setLoading(true);
        setError('');

        console.log(`[Weather] Fetching weather for: ${location.name} (${location.lat}, ${location.lon})`);

        const url = `${API_BASE_URL}/api/weather/complete?lat=${location.lat}&lon=${location.lon}`;
        console.log('[Weather] Calling URL:', url);

        const response = await fetch(url);

        console.log('[Weather] Response status:', response.status);

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('[Weather] Data received:', data);

        if (data.success) {
          console.log('[Weather] Setting weather data...');
          setWeatherData({
            current: data.current,
            forecast: data.forecast,
            hourly: data.hourly,
            alerts: data.alerts || [],
            diseaseRisk: data.diseaseRisk,
            recommendations: data.recommendations || []
          });
          setLastUpdated(new Date());
          console.log('[Weather] Weather data set successfully!');
        } else {
          throw new Error(data.error || 'Weather data unavailable');
        }
      } catch (err) {
        console.error('[Weather] Error fetching weather:', err);
        setError(`Failed to load weather data: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchWeatherData();

    // Auto-refresh weather data every 10 minutes
    const refreshInterval = setInterval(() => {
      console.log('[Weather] Auto-refreshing weather data...');
      fetchWeatherData();
    }, 10 * 60 * 1000); // 10 minutes

    return () => clearInterval(refreshInterval);
  }, [location.lat, location.lon, API_BASE_URL]);

  // Manual refresh function
  const handleRefresh = async () => {
    if (!location.lat || !location.lon) return;

    try {
      setLoading(true);
      setError('');

      const url = `${API_BASE_URL}/api/weather/complete?lat=${location.lat}&lon=${location.lon}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setWeatherData({
          current: data.current,
          forecast: data.forecast,
          hourly: data.hourly,
          alerts: data.alerts || [],
          diseaseRisk: data.diseaseRisk,
          recommendations: data.recommendations || []
        });
        setLastUpdated(new Date());
      } else {
        throw new Error(data.error || 'Weather data unavailable');
      }
    } catch (err) {
      console.error('[Weather] Error refreshing:', err);
      setError(`Failed to refresh: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (fieldId) => {
    const field = fields.find(f => f.id === parseInt(fieldId));
    console.log('[Weather] Field change requested:', fieldId, 'Found field:', field);
    
    if (field) {
      // Try 'coordinates', 'boundaryCoordinates', and 'boundary_coordinates' fields
      const coordsField = field.coordinates || field.boundaryCoordinates || field.boundary_coordinates;
      
      if (coordsField) {
        try {
          const coords = typeof coordsField === 'string' ? JSON.parse(coordsField) : coordsField;
          console.log('[Weather] Parsed coordinates for field change:', coords);
          
          if (coords && Array.isArray(coords) && coords.length > 0) {
            // Calculate center of field
            const lats = coords.map(c => c[1]);
            const lons = coords.map(c => c[0]);
            const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
            const centerLon = lons.reduce((a, b) => a + b, 0) / lons.length;

            console.log('[Weather] New center:', centerLat, centerLon);

            setSelectedField(field);
            setLocation({
              name: field.name,
              lat: centerLat,
              lon: centerLon
            });
          } else {
            console.error('[Weather] Invalid coordinates array');
            setError('Field coordinates are invalid');
          }
        } catch (err) {
          console.error('[Weather] Error parsing field coordinates:', err);
          setError('Could not load field coordinates');
        }
      } else {
        console.error('[Weather] Field has no coordinates');
        setError('Selected field has no location data');
      }
    } else {
      console.error('[Weather] Field not found');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  if (!user) {
    return null;
  }

  const getAlertColor = (severity) => {
    switch (severity) {
      case 'high':
        return 'bg-red-50 border-red-300 text-red-700';
      case 'moderate':
        return 'bg-yellow-50 border-yellow-300 text-yellow-700';
      case 'low':
        return 'bg-blue-50 border-blue-300 text-blue-700';
      default:
        return 'bg-slate-50 border-slate-300 text-slate-700';
    }
  };

  const getRiskColor = (risk) => {
    switch (risk) {
      case 'High':
        return { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500', ring: 'ring-red-300' };
      case 'Moderate':
        return { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-400', ring: 'ring-yellow-300' };
      case 'Low':
        return { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500', ring: 'ring-green-300' };
      default:
        return { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-500', ring: 'ring-slate-300' };
    }
  };

  return (
    <div className="flex min-h-screen bg-surface-container-low font-body">
      {/* Add custom styles */}
      <style>{styles}</style>
      
      <Sidebar onLogout={handleLogout} />

      <div className="ml-72 w-[calc(100%-18rem)]">
        <Header user={user} />

        <main className="pt-24 px-8 pb-12">
          {/* Page Header */}
          <section className="flex items-start justify-between gap-6 mb-10">
            <div className="flex-1">
              <h1 className="text-4xl font-headline font-extrabold text-primary tracking-tight">
                {t('weather', 'title', lang)}
              </h1>
              <p className="text-sm text-on-surface-variant mt-2">
                {t('weather', 'subtitle', lang)}
              </p>
              {lastUpdated && (
                <p className="text-xs text-on-surface-variant mt-1">
                  {t('weather', 'lastUpdated', lang)}: {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </p>
              )}
            </div>
            
            <div className="flex items-end gap-3">
              {/* Field Selector */}
              {fields.length > 0 && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs uppercase tracking-wider text-on-surface-variant font-bold">
                    {t('weather', 'selectField', lang)}
                  </label>
                  <select
                    value={selectedField?.id || ''}
                    onChange={(e) => handleFieldChange(e.target.value)}
                    className="px-4 py-2.5 rounded-lg border border-outline-variant bg-surface-container-lowest text-sm font-semibold text-primary focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                  >
                    {fields.map((field) => (
                      <option key={field.id} value={field.id}>
                        {field.name} {field.cropType ? `(${field.cropType})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              {/* Location Info */}
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-on-surface-variant font-bold">{t('weather', 'location', lang)}</p>
                <p className="text-sm font-semibold text-primary">{location.name}</p>
                <p className="text-xs text-on-surface-variant">{location.lat.toFixed(3)}°, {location.lon.toFixed(3)}°</p>
              </div>
              
              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md hover:shadow-lg"
                title={t('weather', 'refresh', lang)}
              >
                <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
                <span className="whitespace-nowrap">{loading ? t('weather', 'updating', lang) : t('weather', 'refresh', lang)}</span>
              </button>
            </div>
          </section>

          {/* Warning if field has no coordinates */}
          {selectedField && !selectedField.coordinates && !selectedField.boundaryCoordinates && !selectedField.boundary_coordinates && (
            <div className="mb-8 rounded-2xl border-2 border-yellow-300 bg-yellow-50 px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-yellow-600 text-xl">warning</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-yellow-700">⚠️ Selected field has no location data</p>
                  <p className="text-xs text-yellow-600 mt-1">
                    The field "{selectedField.name}" doesn't have coordinates saved.
                  </p>
                  <p className="text-xs text-yellow-600 mt-2">
                    <strong>To fix:</strong> Go to "Fields" → Edit this field → Draw boundary on map → Save.
                  </p>
                  <button
                    onClick={() => setLocation({ name: 'Mumbai (Default)', lat: 19.076, lon: 72.877 })}
                    className="mt-3 px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary-light transition-colors"
                  >
                    Use Default Location (Mumbai)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="mb-8 rounded-2xl border border-primary/20 bg-primary-container/30 px-5 py-4">
              <p className="text-sm font-semibold text-primary">Loading weather data...</p>
              <p className="text-xs text-on-surface-variant mt-1">Fetching data for {location.name}</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="mb-8 rounded-2xl border border-red-300 bg-red-50 px-5 py-4">
              <p className="text-sm font-semibold text-red-700">❌ {error}</p>
              <p className="text-xs text-red-600 mt-1">Using default location (Mumbai) as fallback.</p>
            </div>
          )}

          {/* Current Weather Card */}
          <section className="grid grid-cols-12 gap-8 mb-10">
            {/* Main Weather Card */}
            <div className="col-span-12 lg:col-span-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl overflow-hidden shadow-lg">
              <div className="p-8 text-white">
                <div className="flex items-start justify-between mb-8">
                  <div>
                    <p className="text-sm opacity-80 mb-1">{t('weather', 'currentWeather', lang)}</p>
                    <h2 className="text-6xl font-headline font-bold">{weatherData.current.temp}°C</h2>
                    <p className="text-lg opacity-90 mt-2">{weatherData.current.condition}</p>
                    <p className="text-sm opacity-70 mt-1">{t('weather', 'feelsLike', lang)} {weatherData.current.feelsLike}°C</p>
                  </div>
                  <div className="text-right">
                    <span className="material-symbols-outlined text-7xl opacity-90">
                      {weatherData.current.icon}
                    </span>
                  </div>
                </div>

                {/* Current Weather Details Grid */}
                <div className="grid grid-cols-4 gap-4">
                  <WeatherDetailCard icon="humidity_percentage" label={t('weather', 'humidity', lang)} value={`${weatherData.current.humidity}%`} />
                  <WeatherDetailCard icon="air" label={t('weather', 'wind', lang)} value={`${weatherData.current.windSpeed} km/h ${weatherData.current.windDirection}`} />
                  <WeatherDetailCard icon="speed" label={t('weather', 'pressure', lang)} value={`${weatherData.current.pressure} mb`} />
                  <WeatherDetailCard icon="wb_sunny" label={t('weather', 'uvIndex', lang)} value={weatherData.current.uvIndex} />
                </div>

                <div className="grid grid-cols-3 gap-4 mt-4">
                  <WeatherDetailCard icon="visibility" label={t('weather', 'visibility', lang)} value={`${weatherData.current.visibility} km`} />
                  <WeatherDetailCard icon="water_drop" label={t('weather', 'dewPoint', lang)} value={`${weatherData.current.dewPoint}°C`} />
                  <WeatherDetailCard icon="rainy" label={t('weather', 'precipitation', lang)} value={`${weatherData.current.precipitation} mm`} />
                </div>
              </div>
            </div>

            {/* Weather Alerts - Dynamic */}
            <div className="col-span-12 lg:col-span-4 space-y-4">
              <div className="bg-surface-container-lowest rounded-xl p-6 shadow-md border border-outline-variant/10">
                <h3 className="font-headline font-bold text-lg text-primary mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined">notifications_active</span>
                  {t('weather', 'weatherAlerts', lang)}
                </h3>
                
                {/* Show loading state */}
                {loading && (
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined animate-spin text-blue-600">refresh</span>
                      <p className="text-sm text-blue-700">{t('weather', 'loadingAlerts', lang)}</p>
                    </div>
                  </div>
                )}
                
                {/* Show alerts if available */}
                {!loading && weatherData.alerts && weatherData.alerts.length > 0 ? (
                  <div className="space-y-3">
                    {weatherData.alerts.map((alert, index) => (
                      <div
                        key={index}
                        className={`p-4 rounded-lg border-2 ${getAlertColor(alert.severity)} animate-pulse-slow`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="material-symbols-outlined text-xl">{alert.icon}</span>
                          <div className="flex-1">
                            <div className="flex items-start justify-between">
                              <p className="font-bold text-sm mb-1">{alert.title}</p>
                              {alert.severity && (
                                <span className="text-xs font-bold uppercase px-2 py-0.5 rounded-full bg-white/50">
                                  {t('weather', alert.severity.toLowerCase(), lang)}
                                </span>
                              )}
                            </div>
                            <p className="text-xs opacity-80">{alert.message}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : !loading && (
                  /* No alerts - Show positive message */
                  <div className="p-5 bg-green-50 rounded-lg border-2 border-green-200 text-center">
                    <span className="material-symbols-outlined text-4xl text-green-600 mb-2 block">check_circle</span>
                    <p className="text-sm font-bold text-green-700 mb-1">✅ {t('weather', 'noAlerts', lang)}</p>
                    <p className="text-xs text-green-600">{t('weather', 'favorableConditions', lang)}</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* 7-Day Forecast - Simple & Farmer-Friendly */}
          <section className="mb-10">
            <div className="bg-gradient-to-br from-blue-50 to-green-50 rounded-2xl p-8 shadow-md border-2 border-primary/20">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-headline font-bold text-2xl text-primary flex items-center gap-3">
                    <span className="material-symbols-outlined text-3xl">calendar_month</span>
                    {t('weather', 'forecast7Day', lang)}
                  </h3>
                  <p className="text-sm text-on-surface-variant mt-2">
                    {t('weather', 'forecastHint', lang)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-on-surface-variant font-bold">{t('weather', 'liveWeatherData', lang)}</span>
                </div>
              </div>
              
              <div className="grid grid-cols-7 gap-4">
                {weatherData.forecast.map((day, index) => (
                  <ForecastCard key={index} forecast={day} lang={lang} />
                ))}
              </div>
            </div>
          </section>

          {/* Hourly Forecast - Simple & Farmer-Friendly */}
          <section className="mb-10">
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-8 shadow-md border-2 border-purple-200">
              <div className="mb-6">
                <h3 className="font-headline font-bold text-2xl text-primary flex items-center gap-3 mb-2">
                  <span className="material-symbols-outlined text-3xl">schedule</span>
                  {t('weather', 'hourlyWeather', lang)}
                </h3>
                <p className="text-sm text-on-surface-variant">
                  {t('weather', 'hourlyHint', lang)}
                </p>
              </div>
              
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
                {weatherData.hourly.map((hour, index) => (
                  <HourlyCard key={index} hour={hour} lang={lang} />
                ))}
              </div>
              
              {/* Helpful tips */}
              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="bg-green-100 rounded-lg p-3 text-center">
                  <span className="material-symbols-outlined text-green-600 mb-1">sunny</span>
                  <p className="text-xs font-bold text-green-700">{t('weather', 'clearGoodWork', lang)}</p>
                </div>
                <div className="bg-yellow-100 rounded-lg p-3 text-center">
                  <span className="material-symbols-outlined text-yellow-600 mb-1">cloud</span>
                  <p className="text-xs font-bold text-yellow-700">{t('weather', 'cloudyComfortable', lang)}</p>
                </div>
                <div className="bg-blue-100 rounded-lg p-3 text-center">
                  <span className="material-symbols-outlined text-blue-600 mb-1">rainy</span>
                  <p className="text-xs font-bold text-blue-700">{t('weather', 'rainStayIndoors', lang)}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Disease Risk and Charts */}
          <section className="grid grid-cols-12 gap-8 mb-10">
            {/* Disease Risk Assessment */}
            <div className="col-span-12 lg:col-span-5 bg-surface-container-lowest rounded-xl p-6 shadow-md border border-outline-variant/10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-red-600">bug_report</span>
                </div>
                <div>
                  <h3 className="font-headline font-bold text-xl text-primary">Disease Risk</h3>
                  <p className="text-sm text-on-surface-variant">Based on weather conditions</p>
                </div>
              </div>

              <div className="space-y-4">
                {weatherData.diseaseRisk.factors.map((factor, index) => (
                  <DiseaseRiskCard key={index} factor={factor} />
                ))}
              </div>

              <div className="mt-6 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                <p className="text-xs font-bold text-blue-700 mb-2">💡 {t('weather', 'recommendation', lang)}</p>
                <p className="text-xs text-blue-700">
                  {weatherData.diseaseRisk?.recommendation || 'Monitor crops closely for fungal or pest activity based on live weather forecasts.'}
                </p>
              </div>
            </div>

            {/* Temperature & Humidity Chart */}
            <div className="col-span-12 lg:col-span-7 bg-surface-container-lowest rounded-xl p-6 shadow-md border border-outline-variant/10">
              <h3 className="font-headline font-bold text-xl text-primary mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined">analytics</span>
                Temperature & Humidity Trends
              </h3>

              <div className="space-y-6">
                {/* Temperature Chart */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-bold text-on-surface flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm text-red-500">device_thermostat</span>
                      Temperature (°C)
                    </p>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        High
                      </span>
                      <span className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        Low
                      </span>
                    </div>
                  </div>
                  <div className="h-40 bg-gradient-to-b from-red-50 to-blue-50 rounded-lg p-4 relative">
                    <svg viewBox="0 0 700 120" className="w-full h-full">
                      <path
                        d="M 0,30 L 100,25 L 200,35 L 300,50 L 400,60 L 500,40 L 600,30 L 700,25"
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="3"
                      />
                      <path
                        d="M 0,70 L 100,68 L 200,72 L 300,85 L 400,90 L 500,75 L 600,70 L 700,68"
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="3"
                      />
                    </svg>
                    <div className="absolute left-2 top-2 text-xs font-bold text-on-surface-variant">35°</div>
                    <div className="absolute left-2 bottom-2 text-xs font-bold text-on-surface-variant">15°</div>
                  </div>
                  <div className="flex justify-between text-xs text-on-surface-variant mt-2">
                    {weatherData.forecast.map((day) => (
                      <span key={day.day}>{day.day}</span>
                    ))}
                  </div>
                </div>

                {/* Humidity Chart */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-bold text-on-surface flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm text-blue-500">humidity_percentage</span>
                      Humidity (%)
                    </p>
                  </div>
                  <div className="h-32 bg-gradient-to-b from-blue-50 to-blue-100 rounded-lg p-4 relative">
                    <svg viewBox="0 0 700 100" className="w-full h-full">
                      <path
                        d="M 0,60 L 100,55 L 200,50 L 300,30 L 400,25 L 500,35 L 600,45 L 700,50"
                        fill="url(#humidityGradient)"
                        stroke="#3b82f6"
                        strokeWidth="2"
                      />
                      <defs>
                        <linearGradient id="humidityGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute left-2 top-2 text-xs font-bold text-on-surface-variant">100%</div>
                    <div className="absolute left-2 bottom-2 text-xs font-bold text-on-surface-variant">0%</div>
                  </div>
                  <div className="flex justify-between text-xs text-on-surface-variant mt-2">
                    {weatherData.forecast.map((day) => (
                      <span key={day.day}>{day.day}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Farming Recommendations */}
          <section className="grid grid-cols-12 gap-8">
            <div className="col-span-12 lg:col-span-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 shadow-md border-2 border-green-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-green-500 rounded-2xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-white">agriculture</span>
                </div>
                <div>
                  <h3 className="font-headline font-bold text-xl text-green-800">
                    {t('weather', 'bestTimeActivities', lang)}
                  </h3>
                  <p className="text-sm text-green-700">
                    {t('weather', 'basedOnForecast', lang)}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {weatherData.recommendations && weatherData.recommendations.length > 0 ? (
                  weatherData.recommendations.map((rec, index) => (
                    <ActivityCard
                      key={index}
                      activity={rec.activity}
                      time={rec.time}
                      reason={rec.reason}
                      icon={rec.icon || 'agriculture'}
                      status={rec.status || 'good'}
                      lang={lang}
                    />
                  ))
                ) : (
                  <p className="text-sm text-green-700">Loading dynamic weather recommendations...</p>
                )}
              </div>
            </div>

            <div className="col-span-12 lg:col-span-6 bg-surface-container-lowest rounded-xl p-6 shadow-md border border-outline-variant/10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-blue-600">water_drop</span>
                </div>
                <div>
                  <h3 className="font-headline font-bold text-xl text-primary">Rainfall Analysis</h3>
                  <p className="text-sm text-on-surface-variant">Precipitation forecast</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                  <div>
                    <p className="text-sm font-bold text-blue-800">Expected Rainfall</p>
                    <p className="text-xs text-blue-600 mt-1">Next 7 days</p>
                  </div>
                  <p className="text-3xl font-headline font-bold text-blue-700">45mm</p>
                </div>

                <div className="space-y-2">
                  {weatherData.forecast.map((day, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-surface-container-low rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-on-surface-variant w-10">{day.day}</span>
                        <span className="material-symbols-outlined text-sm text-blue-500">rainy</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-32 h-2 bg-surface-container rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500"
                            style={{ width: `${day.rainChance}%` }}
                          ></div>
                        </div>
                        <span className="text-xs font-bold text-blue-600 w-10 text-right">{day.rainChance}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

// Component: Weather Detail Card (for current weather)
const WeatherDetailCard = ({ icon, label, value }) => (
  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 text-center">
    <span className="material-symbols-outlined text-xl opacity-80 mb-1">{icon}</span>
    <p className="text-xs opacity-70 mb-1">{label}</p>
    <p className="text-sm font-bold">{value}</p>
  </div>
);

// Component: 7-Day Forecast Card (Farmer-Friendly)
const ForecastCard = ({ forecast, lang = 'en' }) => {
  // Determine if it will rain (simple yes/no based on chance)
  const willRain = forecast.rainChance >= 50;
  const rainStatus = willRain ? t('weather', 'rainExpected', lang) : forecast.rainChance >= 30 ? t('weather', 'mayRain', lang) : t('weather', 'noRain', lang);
  const rainColor = willRain ? 'text-blue-700' : forecast.rainChance >= 30 ? 'text-yellow-700' : 'text-green-700';
  const rainBg = willRain ? 'bg-blue-50' : forecast.rainChance >= 30 ? 'bg-yellow-50' : 'bg-green-50';
  
  // Simple weather description
  const getSimpleCondition = (condition) => {
    const lower = condition.toLowerCase();
    if (lower.includes('rain') || lower.includes('storm')) return t('weather', 'rainy', lang);
    if (lower.includes('cloud')) return t('weather', 'cloudy', lang);
    if (lower.includes('clear') || lower.includes('sunny')) return t('weather', 'sunny', lang);
    return condition;
  };

  return (
    <div className="bg-white hover:shadow-lg rounded-2xl p-5 text-center transition-all border-2 border-outline-variant/20 hover:border-primary/30">
      {/* Day */}
      <p className="text-sm font-bold text-on-surface mb-3">{forecast.day}</p>
      
      {/* Weather Icon */}
      <span className="material-symbols-outlined text-5xl text-primary mb-3 block">{forecast.icon}</span>
      
      {/* Weather Condition */}
      <p className="text-xs font-bold text-primary mb-3">{getSimpleCondition(forecast.condition)}</p>
      
      {/* Temperature */}
      <div className="mb-3">
        <div className="flex items-center justify-center gap-2">
          <span className="text-2xl font-bold text-red-600">{forecast.high}°</span>
          <span className="text-sm text-on-surface-variant">/</span>
          <span className="text-lg font-semibold text-blue-600">{forecast.low}°</span>
        </div>
        <p className="text-xs text-on-surface-variant mt-1">{t('weather', 'highLow', lang)}</p>
      </div>
      
      {/* Rain Status - Clear and Simple */}
      <div className={`${rainBg} rounded-lg py-2 px-3`}>
        <div className="flex items-center justify-center gap-1 mb-1">
          <span className={`material-symbols-outlined text-sm ${rainColor}`}>
            {willRain ? 'rainy' : forecast.rainChance >= 30 ? 'cloud' : 'sunny'}
          </span>
          <span className={`text-xs font-bold ${rainColor}`}>{rainStatus}</span>
        </div>
        <p className="text-xs text-on-surface-variant">{forecast.rainChance}% {t('weather', 'chance', lang)}</p>
      </div>
    </div>
  );
};

// Component: Hourly Weather Card (Farmer-Friendly)
const HourlyCard = ({ hour, lang = 'en' }) => {
  // Determine if it will rain this hour
  const willRain = hour.rainChance >= 50;
  const mayRain = hour.rainChance >= 30;
  
  // Simple status
  const rainStatus = willRain ? t('weather', 'rain', lang) : mayRain ? t('weather', 'mayRain', lang) : '';
  const statusColor = willRain ? 'bg-blue-100 text-blue-700' : mayRain ? 'bg-yellow-100 text-yellow-700' : 'bg-green-50 text-green-700';
  
  return (
    <div className="flex-shrink-0 bg-white rounded-xl p-4 text-center min-w-[100px] border-2 border-outline-variant/20 hover:border-primary/40 hover:shadow-lg transition-all">
      {/* Time */}
      <p className="text-sm font-bold text-primary mb-3">{hour.time}</p>
      
      {/* Weather Icon */}
      <span className="material-symbols-outlined text-4xl text-primary mb-3 block">{hour.icon}</span>
      
      {/* Temperature */}
      <p className="text-2xl font-bold text-on-surface mb-3">{hour.temp}°C</p>
      
      {/* Rain Status */}
      {hour.rainChance >= 20 ? (
        <div className={`${statusColor} rounded-lg py-1.5 px-2 text-xs font-bold`}>
          {willRain ? (
            <>
              <span className="material-symbols-outlined text-xs align-middle">rainy</span>
              <span className="ml-1">{t('weather', 'rain', lang)} {hour.rainChance}%</span>
            </>
          ) : mayRain ? (
            <>
              <span className="material-symbols-outlined text-xs align-middle">cloud</span>
              <span className="ml-1">{hour.rainChance}%</span>
            </>
          ) : (
            <span>{hour.rainChance}%</span>
          )}
        </div>
      ) : (
        <div className="bg-green-50 text-green-700 rounded-lg py-1.5 px-2 text-xs font-bold">
          <span className="material-symbols-outlined text-xs align-middle">sunny</span>
          <span className="ml-1">{t('weather', 'clear', lang)}</span>
        </div>
      )}
    </div>
  );
};

// Component: Disease Risk Card
const DiseaseRiskCard = ({ factor }) => {
  const colors = {
    High: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500', ring: 'ring-red-300', bar: 'bg-red-500' },
    Moderate: { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-400', ring: 'ring-yellow-300', bar: 'bg-yellow-500' },
    Low: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500', ring: 'ring-green-300', bar: 'bg-green-500' },
  };

  const color = colors[factor.risk] || colors.Low;

  return (
    <div className="p-4 bg-surface-container-low rounded-lg border border-outline-variant/10">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${color.dot} ring-2 ${color.ring}`}></div>
          <div>
            <p className="text-sm font-bold text-on-surface">{factor.name}</p>
            <p className="text-xs text-on-surface-variant mt-1">{factor.reason}</p>
          </div>
        </div>
        <span className={`px-2 py-1 ${color.bg} ${color.text} rounded-full text-xs font-bold`}>
          {factor.risk}
        </span>
      </div>
      <div className="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
        <div className={`h-full ${color.bar} transition-all`} style={{ width: `${factor.score}%` }}></div>
      </div>
    </div>
  );
};

// Component: Farming Activity Card
const ActivityCard = ({ activity, time, reason, icon, status, lang = 'en' }) => {
  const statusColors = {
    good: { bg: 'bg-green-50', border: 'border-green-200', icon: 'text-green-600', text: 'text-green-700' },
    warning: { bg: 'bg-yellow-50', border: 'border-yellow-200', icon: 'text-yellow-600', text: 'text-yellow-700' },
    bad: { bg: 'bg-red-50', border: 'border-red-200', icon: 'text-red-600', text: 'text-red-700' },
  };

  const activityTranslationKeyMap = {
    'Irrigation': 'irrigation',
    'Pesticide Spraying': 'pesticideSpraying',
    'Fertilizer Application': 'fertilizerApplication',
    'Harvesting': 'harvesting'
  };

  const translationKey = activityTranslationKeyMap[activity];
  const translatedTitle = translationKey ? t('weather', translationKey, lang) : activity;

  const color = statusColors[status] || statusColors.good;

  return (
    <div className={`p-4 rounded-lg border-2 ${color.bg} ${color.border}`}>
      <div className="flex items-start gap-3">
        <span className={`material-symbols-outlined ${color.icon}`}>{icon}</span>
        <div className="flex-1">
          <p className="text-sm font-bold text-on-surface mb-1">{translatedTitle}</p>
          <p className={`text-xs font-bold ${color.text} mb-1`}>{time}</p>
          <p className="text-xs text-on-surface-variant">{reason}</p>
        </div>
      </div>
    </div>
  );
};


export default Weather;

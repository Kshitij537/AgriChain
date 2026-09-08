import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';

/**
 * Spoilage Risk - post-harvest decision support for the farmer.
 *
 * The page answers one question in plain language: how long can this harvest
 * wait, and what should I do about it right now.
 */

const RISK_THEME = {
  low: {
    ring: 'text-green-500',
    badge: 'bg-green-100 text-green-800 border-green-300',
    panel: 'from-green-50 to-emerald-50 border-green-300',
    dot: 'bg-green-500',
    emoji: '🟢'
  },
  moderate: {
    ring: 'text-amber-500',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    panel: 'from-amber-50 to-yellow-50 border-amber-300',
    dot: 'bg-amber-500',
    emoji: '🟡'
  },
  high: {
    ring: 'text-red-500',
    badge: 'bg-red-100 text-red-800 border-red-300',
    panel: 'from-red-50 to-orange-50 border-red-300',
    dot: 'bg-red-500',
    emoji: '🔴'
  }
};

const SEVERITY_STYLE = {
  high: 'bg-red-50 border-red-200 text-red-900',
  moderate: 'bg-amber-50 border-amber-200 text-amber-900',
  low: 'bg-slate-50 border-slate-200 text-slate-700'
};

const EFFECTIVENESS_LABEL = {
  very_high: 'Very High',
  high: 'High',
  medium: 'Medium',
  low: 'Low'
};

const EFFECTIVENESS_STYLE = {
  very_high: 'bg-green-100 text-green-800',
  high: 'bg-green-100 text-green-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-slate-100 text-slate-700'
};

/**
 * Big circular risk dial. Deliberately one number, one colour, one word.
 */
const RiskDial = ({ score, level, label }) => {
  const theme = RISK_THEME[level] || RISK_THEME.moderate;
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(score, 100) / 100) * circumference;

  return (
    <div className="relative flex h-48 w-48 items-center justify-center">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={radius} fill="none" strokeWidth="14" className="stroke-slate-200" />
        <circle
          cx="80" cy="80" r={radius} fill="none" strokeWidth="14" strokeLinecap="round"
          className={`${theme.ring} transition-all duration-1000 ease-out`}
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-5xl font-extrabold text-primary">{score}%</span>
        <span className="mt-1 text-2xl">{theme.emoji}</span>
        <span className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">{label}</span>
      </div>
    </div>
  );
};

const SpoilageRisk = () => {
  const navigate = useNavigate();
  const [user] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const [fields, setFields] = useState([]);
  const [options, setOptions] = useState({ crops: [], storageTypes: [], transportModes: [] });
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingDetails, setEditingDetails] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    farmId: '',
    cropType: 'tomato',
    quantityKg: 500,
    storageType: 'open',
    temperatureC: '',
    humidity: '',
    harvestDate: today,
    destination: '',
    distanceKm: 35,
    transportMode: 'road'
  });

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/login');
  };

  // Load the farmer's fields so temperature/humidity can be auto-filled
  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const fetchFields = async () => {
      try {
        const token = localStorage.getItem('token');
        const url = user?.id
          ? `${API_BASE_URL}/api/farms/user?userId=${user.id}`
          : `${API_BASE_URL}/api/farms/user`;
        const response = await fetch(url, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        });
        if (!response.ok) return;
        const data = await response.json();
        const farmsList = Array.isArray(data.farms) ? data.farms : [];
        setFields(farmsList);
        if (farmsList.length > 0) {
          setForm((prev) => ({
            ...prev,
            farmId: farmsList[0].id,
            cropType: farmsList[0].cropType || prev.cropType
          }));
        }
      } catch (err) {
        console.warn('[SpoilageRisk] Could not load fields:', err.message);
      }
    };

    fetchFields();
  }, [user, navigate, API_BASE_URL]);

  // Load crop / storage / transport options for the form
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/spoilage/options`);
        if (!response.ok) return;
        const data = await response.json();
        if (data.success) setOptions(data.data);
      } catch (err) {
        console.warn('[SpoilageRisk] Could not load options:', err.message);
      }
    };
    fetchOptions();
  }, [API_BASE_URL]);

  const runAssessment = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = {
        ...form,
        quantityKg: Number(form.quantityKg) || 0,
        distanceKm: Number(form.distanceKm) || 0,
        // Blank inputs are omitted so the backend fills them from weather
        temperatureC: form.temperatureC === '' ? undefined : Number(form.temperatureC),
        humidity: form.humidity === '' ? undefined : Number(form.humidity),
        farmId: form.farmId || undefined
      };

      const response = await fetch(`${API_BASE_URL}/api/spoilage/assess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data?.error?.message || 'Could not assess spoilage risk');
      }
      setAssessment(data.data);
    } catch (err) {
      console.error('[SpoilageRisk] Assessment failed:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [form, API_BASE_URL]);

  // Run once on load so the page is never empty
  useEffect(() => {
    runAssessment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const theme = assessment ? (RISK_THEME[assessment.risk.level] || RISK_THEME.moderate) : RISK_THEME.low;

  return (
    <div className="flex min-h-screen bg-surface-container-low font-body">
      <Sidebar onLogout={handleLogout} />

      <div className="ml-72 w-[calc(100%-18rem)]">
        <Header user={user} />

        <main className="pt-24 px-8 pb-12">
          {/* Page Header */}
          <section className="flex items-start justify-between gap-6 mb-8">
            <div className="flex-1">
              <h1 className="text-4xl font-headline font-extrabold text-primary tracking-tight">
                Spoilage Risk
              </h1>
              <p className="text-sm text-on-surface-variant mt-2">
                How long your harvest can safely wait before you sell it
              </p>
            </div>
            <button
              onClick={runAssessment}
              disabled={loading}
              className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary-light transition-colors disabled:opacity-50 flex items-center gap-2 shadow-md hover:shadow-lg"
            >
              <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
              <span className="whitespace-nowrap">{loading ? 'Checking...' : 'Check Again'}</span>
            </button>
          </section>

          {error && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-300 bg-red-50 p-4">
              <span className="material-symbols-outlined text-red-600">error</span>
              <p className="text-sm font-semibold text-red-800">{error}</p>
            </div>
          )}

          {!assessment && loading && (
            <div className="flex flex-col items-center justify-center py-24">
              <span className="material-symbols-outlined animate-spin text-5xl text-primary">refresh</span>
              <p className="mt-4 text-sm font-semibold text-on-surface-variant">Checking your harvest...</p>
            </div>
          )}

          {assessment && (
            <div className="grid grid-cols-12 gap-6">

              {/* A. Risk Overview — the single most important answer */}
              <section className={`col-span-12 rounded-2xl border-2 bg-gradient-to-br ${theme.panel} p-8 shadow-md`}>
                <div className="flex flex-col items-center gap-8 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-col items-center md:items-start">
                    <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                      Post-Harvest Risk
                    </p>
                    <div className={`mt-3 inline-flex items-center gap-2 rounded-full border-2 px-5 py-2 ${theme.badge}`}>
                      <span className="text-2xl">{theme.emoji}</span>
                      <span className="text-xl font-extrabold uppercase">{assessment.risk.label}</span>
                    </div>
                    <p className="mt-4 max-w-md text-center text-lg font-semibold text-slate-800 md:text-left">
                      {assessment.risk.headline}
                    </p>
                    <p className="mt-2 text-sm text-on-surface-variant">
                      Expected spoilage: <strong>{assessment.risk.expectedSpoilage}</strong>
                    </p>
                  </div>

                  <RiskDial
                    score={assessment.risk.score}
                    level={assessment.risk.level}
                    label={assessment.risk.label}
                  />
                </div>
              </section>

              {/* B + C. Crop details and storage conditions */}
              <section className="col-span-12 lg:col-span-5 rounded-2xl bg-surface-container-lowest p-6 shadow-md border border-outline-variant/10">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-primary">
                    <span className="material-symbols-outlined">{assessment.crop.icon}</span>
                    Your Harvest
                  </h2>
                  <button
                    onClick={() => setEditingDetails((v) => !v)}
                    className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-primary hover:bg-surface-container"
                  >
                    <span className="material-symbols-outlined text-base">{editingDetails ? 'close' : 'edit'}</span>
                    {editingDetails ? 'Done' : 'Change'}
                  </button>
                </div>

                {!editingDetails ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-xl bg-surface-container-low p-4">
                      <span className="text-sm font-semibold text-on-surface-variant">Crop</span>
                      <span className="text-xl font-extrabold text-primary">{assessment.crop.label}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-surface-container-low p-4">
                      <span className="text-sm font-semibold text-on-surface-variant">Quantity</span>
                      <span className="text-xl font-extrabold text-primary">{assessment.crop.quantityKg} kg</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-surface-container-low p-4">
                      <span className="text-sm font-semibold text-on-surface-variant">Harvested</span>
                      <span className="text-base font-bold text-primary">
                        {assessment.crop.daysSinceHarvest < 1
                          ? 'Today'
                          : `${Math.round(assessment.crop.daysSinceHarvest)} days ago`}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4 text-center">
                        <span className="material-symbols-outlined text-red-500">device_thermostat</span>
                        <p className="mt-1 text-2xl font-extrabold text-primary">{assessment.storage.temperatureC}°C</p>
                        <p className="text-xs font-semibold text-on-surface-variant">Temperature</p>
                      </div>
                      <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4 text-center">
                        <span className="material-symbols-outlined text-blue-500">humidity_percentage</span>
                        <p className="mt-1 text-2xl font-extrabold text-primary">{assessment.storage.humidity}%</p>
                        <p className="text-xs font-semibold text-on-surface-variant">Humidity</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-xl bg-surface-container-low p-4">
                      <span className="material-symbols-outlined text-primary">{assessment.storage.icon}</span>
                      <div>
                        <p className="text-base font-bold text-primary">{assessment.storage.label}</p>
                        <p className="text-xs text-on-surface-variant">
                          {assessment.storage.conditionsSource === 'weather-api'
                            ? 'Conditions from live weather'
                            : assessment.storage.conditionsSource === 'default'
                              ? 'Using typical conditions'
                              : 'Conditions you entered'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {fields.length > 0 && (
                      <label className="block">
                        <span className="text-xs font-bold uppercase text-on-surface-variant">Field</span>
                        <select
                          value={form.farmId}
                          onChange={(e) => updateForm('farmId', e.target.value)}
                          className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm font-semibold text-primary outline-none focus:border-primary"
                        >
                          {fields.map((f) => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                          ))}
                        </select>
                      </label>
                    )}

                    <label className="block">
                      <span className="text-xs font-bold uppercase text-on-surface-variant">Crop</span>
                      <select
                        value={form.cropType}
                        onChange={(e) => updateForm('cropType', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm font-semibold text-primary outline-none focus:border-primary"
                      >
                        {options.crops.map((c) => (
                          <option key={c.key} value={c.key}>{c.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-xs font-bold uppercase text-on-surface-variant">Quantity (kg)</span>
                      <input
                        type="number" min="0"
                        value={form.quantityKg}
                        onChange={(e) => updateForm('quantityKg', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm font-semibold text-primary outline-none focus:border-primary"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-bold uppercase text-on-surface-variant">Harvest Date</span>
                      <input
                        type="date"
                        value={form.harvestDate}
                        onChange={(e) => updateForm('harvestDate', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm font-semibold text-primary outline-none focus:border-primary"
                      />
                    </label>

                    <div>
                      <span className="text-xs font-bold uppercase text-on-surface-variant">Storage</span>
                      <div className="mt-1 grid grid-cols-2 gap-2">
                        {options.storageTypes.map((s) => (
                          <button
                            key={s.key}
                            onClick={() => updateForm('storageType', s.key)}
                            className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-left text-xs font-bold transition-all ${
                              form.storageType === s.key
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-outline-variant/30 text-on-surface-variant hover:border-primary/40'
                            }`}
                          >
                            <span className="material-symbols-outlined text-lg">{s.icon}</span>
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="text-xs font-bold uppercase text-on-surface-variant">Temp (°C)</span>
                        <input
                          type="number" placeholder="Auto"
                          value={form.temperatureC}
                          onChange={(e) => updateForm('temperatureC', e.target.value)}
                          className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm font-semibold text-primary outline-none focus:border-primary"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-bold uppercase text-on-surface-variant">Humidity (%)</span>
                        <input
                          type="number" placeholder="Auto"
                          value={form.humidity}
                          onChange={(e) => updateForm('humidity', e.target.value)}
                          className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm font-semibold text-primary outline-none focus:border-primary"
                        />
                      </label>
                    </div>

                    <button
                      onClick={() => { setEditingDetails(false); runAssessment(); }}
                      className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-white shadow-md transition-colors hover:bg-primary-light"
                    >
                      Update Risk
                    </button>
                  </div>
                )}
              </section>

              {/* F. Why is the risk what it is — explainability */}
              <section className="col-span-12 lg:col-span-7 rounded-2xl bg-surface-container-lowest p-6 shadow-md border border-outline-variant/10">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-primary">
                  <span className="material-symbols-outlined">help</span>
                  Why is the risk {assessment.risk.level}?
                </h2>

                {assessment.factors.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl bg-green-50 py-10 text-center">
                    <span className="material-symbols-outlined mb-2 text-4xl text-green-600">check_circle</span>
                    <p className="text-sm font-semibold text-green-800">
                      No major risk factors. Conditions are good for storing this crop.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {assessment.factors.map((factor, index) => (
                      <div
                        key={index}
                        className={`flex items-start gap-3 rounded-xl border p-4 ${SEVERITY_STYLE[factor.severity] || SEVERITY_STYLE.low}`}
                      >
                        <span className="text-2xl leading-none">{factor.emoji}</span>
                        <div className="flex-1">
                          <p className="text-base font-bold">{factor.label}</p>
                          <p className="mt-0.5 text-sm opacity-80">{factor.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* D. Transportation */}
                <div className="mt-6 rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-on-surface-variant">
                    <span className="material-symbols-outlined text-base">local_shipping</span>
                    Transportation
                  </h3>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-xs font-semibold text-on-surface-variant">Destination</p>
                      <p className="text-sm font-bold text-primary">
                        {assessment.transport.destination || 'Not set'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-on-surface-variant">Distance</p>
                      <p className="text-sm font-bold text-primary">{assessment.transport.distanceKm} km</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-on-surface-variant">Travel Time</p>
                      <p className="text-sm font-bold text-primary">{assessment.transport.travelHours} hours</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs font-bold uppercase text-on-surface-variant">Market</span>
                      <input
                        type="text" placeholder="e.g. Nagpur Mandi"
                        value={form.destination}
                        onChange={(e) => updateForm('destination', e.target.value)}
                        onBlur={runAssessment}
                        className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm font-semibold text-primary outline-none focus:border-primary"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-bold uppercase text-on-surface-variant">Distance (km)</span>
                      <input
                        type="number" min="0"
                        value={form.distanceKm}
                        onChange={(e) => updateForm('distanceKm', e.target.value)}
                        onBlur={runAssessment}
                        className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm font-semibold text-primary outline-none focus:border-primary"
                      />
                    </label>
                  </div>
                </div>
              </section>

              {/* H. Spoilage timeline */}
              <section className="col-span-12 lg:col-span-7 rounded-2xl bg-surface-container-lowest p-6 shadow-md border border-outline-variant/10">
                <h2 className="mb-5 flex items-center gap-2 text-lg font-bold text-primary">
                  <span className="material-symbols-outlined">timeline</span>
                  What happens over the next few days
                </h2>
                <div className="space-y-1">
                  {assessment.timeline.map((point, index) => {
                    const pointTheme = RISK_THEME[point.riskLevel] || RISK_THEME.moderate;
                    return (
                      <div key={point.day} className="flex items-stretch gap-4">
                        {/* Connector rail */}
                        <div className="flex w-6 flex-col items-center">
                          <div className={`h-4 w-4 flex-shrink-0 rounded-full ${pointTheme.dot} ring-4 ring-white`} />
                          {index < assessment.timeline.length - 1 && (
                            <div className="w-0.5 flex-1 bg-outline-variant/30" />
                          )}
                        </div>
                        <div className="flex flex-1 items-center justify-between pb-5">
                          <div>
                            <p className="text-sm font-extrabold text-primary">{point.label}</p>
                            <p className="text-xs text-on-surface-variant">{point.status}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="hidden h-2 w-32 overflow-hidden rounded-full bg-slate-200 sm:block">
                              <div
                                className={`h-full ${pointTheme.dot} transition-all duration-700`}
                                style={{ width: `${point.riskScore}%` }}
                              />
                            </div>
                            <span className="text-lg">{point.emoji}</span>
                            <span className="w-12 text-right text-sm font-bold text-on-surface-variant">
                              {point.riskScore}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Shelf life + expected loss summary */}
              <section className="col-span-12 lg:col-span-5 rounded-2xl bg-surface-container-lowest p-6 shadow-md border border-outline-variant/10">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-primary">
                  <span className="material-symbols-outlined">inventory</span>
                  If you wait
                </h2>
                <div className="space-y-3">
                  <div className="rounded-xl bg-surface-container-low p-4 text-center">
                    <p className="text-xs font-bold uppercase text-on-surface-variant">Safe selling window</p>
                    <p className="mt-1 text-4xl font-extrabold text-primary">
                      {assessment.shelfLife.safeDays}
                    </p>
                    <p className="text-xs font-semibold text-on-surface-variant">
                      {assessment.shelfLife.safeDays === 1 ? 'day' : 'days'} left
                    </p>
                  </div>

                  {assessment.crop.quantityKg > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-xs font-bold uppercase text-amber-900">Possible loss if you do nothing</p>
                      <p className="mt-1 text-3xl font-extrabold text-amber-900">
                        {assessment.loss.estimatedLossKg} kg
                      </p>
                      <p className="text-xs font-semibold text-amber-800">
                        about {assessment.loss.estimatedLossPercent}% of your {assessment.crop.quantityKg} kg
                      </p>
                    </div>
                  )}

                  <div className="rounded-xl bg-surface-container-low p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-on-surface-variant">In ideal storage</span>
                      <span className="font-bold text-primary">{assessment.shelfLife.baseDays} days</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="font-semibold text-on-surface-variant">In your conditions</span>
                      <span className="font-bold text-primary">{assessment.shelfLife.effectiveDays} days</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* G. Preservation actions ranked by cost and effectiveness */}
              <section className="col-span-12 lg:col-span-7 rounded-2xl bg-surface-container-lowest p-6 shadow-md border border-outline-variant/10">
                <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-primary">
                  <span className="material-symbols-outlined">lightbulb</span>
                  How can you reduce spoilage?
                </h2>
                <p className="mb-4 text-xs text-on-surface-variant">
                  Cheapest and most effective actions first
                </p>
                <div className="space-y-3">
                  {assessment.recommendations.map((action) => (
                    <div
                      key={action.rank}
                      className="flex items-start gap-4 rounded-xl border border-outline-variant/20 bg-surface-container-low p-4 transition-all hover:border-primary/30"
                    >
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-extrabold text-primary">
                        {action.rank}
                      </div>
                      <div className="flex-1">
                        <p className="text-base font-bold text-primary">{action.title}</p>
                        <p className="mt-0.5 text-sm text-on-surface-variant">{action.detail}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                            Cost: {action.costLabel}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${EFFECTIVENESS_STYLE[action.effectiveness]}`}>
                            {EFFECTIVENESS_LABEL[action.effectiveness]} effect
                          </span>
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-primary/40">{action.icon}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* I. AI advice */}
              <section className="col-span-12 lg:col-span-5 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-emerald-50 p-6 shadow-md">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-primary">
                    <span className="material-symbols-outlined">smart_toy</span>
                    AI Advice
                  </h2>
                  {assessment.aiAdvice?.source === 'heuristic' && (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                      Offline
                    </span>
                  )}
                </div>
                <p className="text-base leading-relaxed text-slate-800">
                  {assessment.aiAdvice?.advice || 'Advice is not available right now.'}
                </p>
                <p className="mt-4 text-xs italic text-on-surface-variant">
                  This is an estimate based on your storage and weather conditions, not a guarantee.
                </p>
              </section>

            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default SpoilageRisk;

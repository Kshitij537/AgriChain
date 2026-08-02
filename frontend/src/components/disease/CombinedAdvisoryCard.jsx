import React from 'react';
import { t } from '../../utils/translations';

const CombinedAdvisoryCard = ({ advisory, farm, weather, ndvi, disease, lang = 'en' }) => {
  if (!advisory) return null;

  const farmName = farm?.name || 'Selected Field';
  const cropType = farm?.crop_type || 'Crop';
  const ndviValue = ndvi?.ndvi_value != null ? Number(ndvi?.ndvi_value).toFixed(2) : '0.68';
  const ndviHealth = ndvi?.health_status || 'Good Health';
  const temp = weather?.temp != null ? `${Math.round(weather.temp)}°C` : '28°C';
  const humidity = weather?.humidity != null ? `${weather.humidity}%` : '65%';
  const diseaseName = disease?.prediction?.display_name || disease?.disease || 'Leaf Condition';

  return (
    <div className="rounded-[2rem] border border-outline-variant/15 bg-surface-container p-6 shadow-md transition-all">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 border-b border-outline-variant/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-primary">
            <span className="material-symbols-outlined text-sm">psychology_alt</span>
            {t('diseaseDetection', 'badgeTitle', lang)}
          </div>
          <h3 className="mt-2 font-headline text-2xl font-extrabold text-primary">
            {t('diseaseDetection', 'advisoryTitle', lang)}
          </h3>
          <p className="mt-1 text-xs font-medium text-on-surface-variant">
            {t('diseaseDetection', 'advisorySubtitle', lang)}
          </p>
        </div>

        <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary/70">
            {t('diseaseDetection', 'activeFarmContext', lang)}
          </p>
          <p className="font-headline text-sm font-extrabold text-primary">{farmName}</p>
        </div>
      </div>

      {/* 4 Multi-Source Indicators */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Farm & Crop Badge */}
        <div className="flex items-center gap-3 rounded-2xl border border-outline-variant/10 bg-surface p-3.5 shadow-2xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <span className="material-symbols-outlined">eco</span>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70">
              {t('diseaseDetection', 'cropType', lang)}
            </p>
            <p className="truncate text-sm font-bold text-on-surface">{cropType}</p>
          </div>
        </div>

        {/* Satellite NDVI Badge */}
        <div className="flex items-center gap-3 rounded-2xl border border-outline-variant/10 bg-surface p-3.5 shadow-2xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <span className="material-symbols-outlined">satellite_alt</span>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70">
              {t('diseaseDetection', 'ndviHealth', lang)}
            </p>
            <p className="truncate text-sm font-bold text-on-surface">{ndviValue} ({ndviHealth})</p>
          </div>
        </div>

        {/* Live Weather Badge */}
        <div className="flex items-center gap-3 rounded-2xl border border-outline-variant/10 bg-surface p-3.5 shadow-2xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <span className="material-symbols-outlined">thermostat</span>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70">
              {t('diseaseDetection', 'weather', lang)}
            </p>
            <p className="truncate text-sm font-bold text-on-surface">{temp} | {humidity}</p>
          </div>
        </div>

        {/* Scanned Disease Badge */}
        <div className="flex items-center gap-3 rounded-2xl border border-outline-variant/10 bg-surface p-3.5 shadow-2xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <span className="material-symbols-outlined">coronavirus</span>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70">
              {t('diseaseDetection', 'diagnosedCondition', lang)}
            </p>
            <p className="truncate text-sm font-bold text-on-surface">{diseaseName}</p>
          </div>
        </div>
      </div>

      {/* Advisory Content Grid */}
      <div className="space-y-5">
        {/* Summary Card */}
        {advisory.summary && (
          <div className="rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-secondary/10 p-4 border border-primary/15">
            <p className="text-sm font-semibold leading-relaxed text-on-surface">
              {advisory.summary}
            </p>
          </div>
        )}

        {/* Problem Analysis & Root Cause */}
        {advisory.problem_analysis && (
          <div className="rounded-2xl border border-outline-variant/10 bg-surface p-4">
            <div className="mb-2 flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <span className="material-symbols-outlined text-lg">travel_explore</span>
              <h4 className="font-headline text-base font-bold">
                {t('diseaseDetection', 'problemAnalysis', lang)}
              </h4>
            </div>
            <p className="text-sm leading-relaxed text-on-surface-variant">
              {advisory.problem_analysis}
            </p>
          </div>
        )}

        {/* Immediate Priority Actions */}
        {advisory.immediate_actions?.length > 0 && (
          <div className="rounded-2xl border border-outline-variant/10 bg-surface p-4">
            <div className="mb-3 flex items-center gap-2 text-primary">
              <span className="material-symbols-outlined text-lg">check_circle</span>
              <h4 className="font-headline text-base font-bold">
                {t('diseaseDetection', 'immediateActions', lang)}
              </h4>
            </div>
            <ul className="space-y-2">
              {advisory.immediate_actions.map((act, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-on-surface">
                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <span>{act}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 2-Column Grid: Weather Guidance & Satellite Recovery */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Weather & Irrigation */}
          {advisory.weather_irrigation_guidance && (
            <div className="rounded-2xl border border-outline-variant/10 bg-surface p-4">
              <div className="mb-2 flex items-center gap-2 text-sky-700 dark:text-sky-400">
                <span className="material-symbols-outlined text-lg">water_drop</span>
                <h4 className="font-headline text-sm font-bold">
                  {t('diseaseDetection', 'weatherIrrigation', lang)}
                </h4>
              </div>
              <p className="text-xs leading-relaxed text-on-surface-variant">
                {advisory.weather_irrigation_guidance}
              </p>
            </div>
          )}

          {/* NDVI Recovery */}
          {advisory.ndvi_recovery_plan && (
            <div className="rounded-2xl border border-outline-variant/10 bg-surface p-4">
              <div className="mb-2 flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <span className="material-symbols-outlined text-lg">spa</span>
                <h4 className="font-headline text-sm font-bold">
                  {t('diseaseDetection', 'ndviRecovery', lang)}
                </h4>
              </div>
              <p className="text-xs leading-relaxed text-on-surface-variant">
                {advisory.ndvi_recovery_plan}
              </p>
            </div>
          )}
        </div>

        {/* Prevention */}
        {advisory.prevention?.length > 0 && (
          <div className="rounded-2xl border border-outline-variant/10 bg-surface p-4">
            <div className="mb-2 flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
              <span className="material-symbols-outlined text-lg">shield</span>
              <h4 className="font-headline text-sm font-bold">
                {t('diseaseDetection', 'prevention', lang)}
              </h4>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {advisory.prevention.map((item, idx) => (
                <li key={idx} className="flex items-center gap-2 text-xs text-on-surface-variant">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default CombinedAdvisoryCard;

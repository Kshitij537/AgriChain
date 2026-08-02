const { query } = require('../config/db');
const ndviService = require('../services/ndviService');
const ndviStorage = require('../services/ndviStorageService');
const { computeFieldId, normalizeBoundaryCoordinates } = require('../utils/fieldUtils');

const DEFAULT_HOUR = 6;
const DEFAULT_MINUTE = 0;
const POLL_INTERVAL_MS = 60 * 1000;

let lastRunDate = null;
let isRunning = false;
let timer = null;

const parseIntSafe = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
};

const getScheduleConfig = () => ({
  enabled: process.env.NDVI_DAILY_REFRESH_ENABLED !== 'false',
  runOnStartup: process.env.NDVI_DAILY_REFRESH_RUN_ON_STARTUP !== 'false',
  hour: Math.max(0, Math.min(23, parseIntSafe(process.env.NDVI_DAILY_REFRESH_HOUR, DEFAULT_HOUR))),
  minute: Math.max(0, Math.min(59, parseIntSafe(process.env.NDVI_DAILY_REFRESH_MINUTE, DEFAULT_MINUTE))),
});

const getTodayKey = (date = new Date()) => date.toISOString().slice(0, 10);

const getAllTrackedFarms = async () => {
  const result = await query(
    `SELECT id, name, boundary_coordinates
     FROM farms
     WHERE boundary_coordinates IS NOT NULL`
  );

  return result.rows;
};

const refreshFarmNdvi = async (farm) => {
  const coordinates = normalizeBoundaryCoordinates(farm.boundary_coordinates);
  if (!coordinates) {
    return {
      farmId: farm.id,
      farmName: farm.name,
      status: 'skipped',
      reason: 'Invalid or missing boundary coordinates',
    };
  }

  const fieldId = computeFieldId(coordinates);
  const result = await ndviService.calculateNDVI(coordinates);
  const capturedDate = result.imageDate || getTodayKey();

  await ndviStorage.upsertMeasurement({
    fieldId,
    capturedDate,
    ndviValue: result.ndvi,
    healthStatus: result.health,
    imageDate: result.imageDate,
    cloudCoverage: result.cloudCoverage,
    source: 'daily-refresh-job',
  });

  await ndviStorage.saveFarmNdviSnapshot({
    farmId: farm.id,
    ndviValue: result.ndvi,
    healthStatus: result.health,
    imageDate: result.imageDate || new Date().toISOString(),
    imageUrl: null,
    satelliteSource: 'daily-refresh-job',
  });

  return {
    farmId: farm.id,
    farmName: farm.name,
    status: 'success',
    fieldId,
    ndvi: result.ndvi,
    health: result.health,
    imageDate: result.imageDate || null,
  };
};

const runDailyNdviRefresh = async (reason = 'scheduled') => {
  if (isRunning) {
    console.log('[NDVI Daily Job] Run skipped because a previous refresh is still in progress');
    return { started: false, reason: 'already_running' };
  }

  isRunning = true;
  const startedAt = new Date().toISOString();
  console.log(`[NDVI Daily Job] Starting refresh (${reason}) at ${startedAt}`);

  try {
    const farms = await getAllTrackedFarms();
    const results = [];

    for (const farm of farms) {
      try {
        const farmResult = await refreshFarmNdvi(farm);
        results.push(farmResult);
      } catch (error) {
        console.error(`[NDVI Daily Job] Farm ${farm.id} failed:`, error.message);
        results.push({
          farmId: farm.id,
          farmName: farm.name,
          status: 'failed',
          reason: error.message,
        });
      }
    }

    lastRunDate = getTodayKey();

    const summary = {
      started: true,
      reason,
      startedAt,
      completedAt: new Date().toISOString(),
      processed: results.length,
      succeeded: results.filter((r) => r.status === 'success').length,
      failed: results.filter((r) => r.status === 'failed').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      results,
    };

    console.log('[NDVI Daily Job] Refresh completed:', {
      processed: summary.processed,
      succeeded: summary.succeeded,
      failed: summary.failed,
      skipped: summary.skipped,
    });

    return summary;
  } finally {
    isRunning = false;
  }
};

const shouldRunNow = (config, now = new Date()) => {
  if (!config.enabled) return false;

  const todayKey = getTodayKey(now);
  if (lastRunDate === todayKey) return false;

  return now.getHours() === config.hour && now.getMinutes() === config.minute;
};

const startNdviRefreshScheduler = () => {
  const config = getScheduleConfig();
  if (!config.enabled) {
    console.log('[NDVI Daily Job] Scheduler disabled via NDVI_DAILY_REFRESH_ENABLED=false');
    return () => {};
  }

  console.log(
    `[NDVI Daily Job] Scheduler enabled. Daily refresh set for ${String(config.hour).padStart(2, '0')}:${String(
      config.minute
    ).padStart(2, '0')} server time`
  );

  if (config.runOnStartup) {
    runDailyNdviRefresh('startup').catch((error) => {
      console.error('[NDVI Daily Job] Startup refresh failed:', error.message);
    });
  }

  timer = setInterval(() => {
    if (!shouldRunNow(config)) return;

    runDailyNdviRefresh('scheduled').catch((error) => {
      console.error('[NDVI Daily Job] Scheduled refresh failed:', error.message);
    });
  }, POLL_INTERVAL_MS);

  return () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };
};

module.exports = {
  runDailyNdviRefresh,
  startNdviRefreshScheduler,
};

const computeTrendFromSeries = (series) => {
  if (!Array.isArray(series) || series.length < 2) return null;
  const start = series[0];
  const end = series[series.length - 1];

  const startValue = typeof start.ndvi === 'number' ? start.ndvi : start.ndvi_value;
  const endValue = typeof end.ndvi === 'number' ? end.ndvi : end.ndvi_value;

  if (typeof startValue !== 'number' || typeof endValue !== 'number') return null;

  const changeAbs = endValue - startValue;
  const changePct = startValue > 0 ? (changeAbs / startValue) * 100 : null;

  return {
    start: { date: start.date || start.captured_date, ndvi: startValue },
    end: { date: end.date || end.captured_date, ndvi: endValue },
    changeAbs,
    changePct,
  };
};

const buildDropAlert = ({ previous, current, thresholdAbs }) => {
  if (!previous || typeof previous !== 'number' || typeof current !== 'number') {
    return { triggered: false };
  }

  const changeAbs = current - previous;
  const dropAbs = previous - current;

  if (dropAbs >= thresholdAbs) {
    const changePct = previous > 0 ? (changeAbs / previous) * 100 : null;
    return {
      triggered: true,
      type: 'NDVI_DROP',
      message: 'NDVI dropped suddenly. Vegetation stress risk increased.',
      previousNdvi: previous,
      currentNdvi: current,
      changeAbs,
      changePct,
    };
  }

  return { triggered: false, previousNdvi: previous, currentNdvi: current, changeAbs };
};

module.exports = {
  computeTrendFromSeries,
  buildDropAlert,
};

const crypto = require('crypto');

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

// Accepts flat/ring/GeoJSON/stringified boundary data and returns [[lon, lat], ...].
const normalizeBoundaryCoordinates = (raw) => {
  if (!raw) return null;

  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (Array.isArray(value.coordinates)) {
      value = value.coordinates;
    } else {
      return null;
    }
  }

  if (!Array.isArray(value) || value.length === 0) return null;

  if (Array.isArray(value[0]) && Array.isArray(value[0][0])) {
    value = value[0];
  }

  if (!Array.isArray(value) || value.length < 3) return null;

  const pairs = value
    .filter((p) => Array.isArray(p) && p.length >= 2)
    .map((p) => [Number(p[0]), Number(p[1])])
    .filter(([a, b]) => isFiniteNumber(a) && isFiniteNumber(b));

  if (pairs.length < 3) return null;

  let lonLatScore = 0;
  let latLonScore = 0;
  for (const [a, b] of pairs) {
    const lonLatValid = Math.abs(a) <= 180 && Math.abs(b) <= 90;
    const latLonValid = Math.abs(a) <= 90 && Math.abs(b) <= 180;
    if (lonLatValid) lonLatScore++;
    if (latLonValid) latLonScore++;
  }

  if (latLonScore > lonLatScore) {
    return pairs.map(([a, b]) => [b, a]);
  }

  return pairs;
};

const computeFieldId = (coordinates) => {
  const normalized = normalizeBoundaryCoordinates(coordinates) || coordinates;
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .slice(0, 16);

  return `field_${hash}`;
};

module.exports = {
  computeFieldId,
  normalizeBoundaryCoordinates,
};

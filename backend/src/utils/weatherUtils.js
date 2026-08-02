/**
 * Weather Utilities
 * Helper functions for weather data processing and calculations
 */

/**
 * Convert temperature units
 */
const convertKelvinToCelsius = (kelvin) => {
  return Math.round((kelvin - 273.15) * 10) / 10;
};

const convertCelsiusToFahrenheit = (celsius) => {
  return Math.round((celsius * 9/5 + 32) * 10) / 10;
};

const convertFahrenheitToCelsius = (fahrenheit) => {
  return Math.round(((fahrenheit - 32) * 5/9) * 10) / 10;
};

/**
 * Convert wind speed units
 */
const convertMpsToKmh = (mps) => {
  return Math.round(mps * 3.6 * 10) / 10;
};

const convertKmhToMph = (kmh) => {
  return Math.round(kmh * 0.621371 * 10) / 10;
};

/**
 * Convert pressure units
 */
const convertHpaToInHg = (hpa) => {
  return Math.round(hpa * 0.02953 * 100) / 100;
};

/**
 * Calculate dew point (Magnus formula approximation)
 * @param {Number} temp - Temperature in Celsius
 * @param {Number} humidity - Relative humidity percentage
 * @returns {Number} - Dew point in Celsius
 */
const calculateDewPoint = (temp, humidity) => {
  const a = 17.27;
  const b = 237.7;
  const alpha = ((a * temp) / (b + temp)) + Math.log(humidity / 100);
  return Math.round((b * alpha) / (a - alpha) * 10) / 10;
};

/**
 * Calculate heat index (feels like temperature)
 * @param {Number} temp - Temperature in Celsius
 * @param {Number} humidity - Relative humidity percentage
 * @returns {Number} - Heat index in Celsius
 */
const calculateHeatIndex = (temp, humidity) => {
  // Convert to Fahrenheit for calculation
  const tempF = temp * 9/5 + 32;
  const rh = humidity;

  // Simple heat index formula
  if (tempF < 80) {
    return temp; // Heat index not applicable
  }

  const hi = -42.379 + 
    2.04901523 * tempF + 
    10.14333127 * rh - 
    0.22475541 * tempF * rh - 
    0.00683783 * tempF * tempF - 
    0.05481717 * rh * rh + 
    0.00122874 * tempF * tempF * rh + 
    0.00085282 * tempF * rh * rh - 
    0.00000199 * tempF * tempF * rh * rh;

  // Convert back to Celsius
  return Math.round(((hi - 32) * 5/9) * 10) / 10;
};

/**
 * Calculate disease risk score based on weather conditions
 * @param {Object} conditions - Weather conditions
 * @returns {Object} - Risk assessment
 */
const calculateDiseaseRiskScore = (conditions) => {
  const { temp, humidity, rainfall, windSpeed } = conditions;

  let fungalRisk = 0;
  let pestRisk = 0;
  let droughtRisk = 0;

  // Fungal disease risk (high humidity + moderate temp + rainfall)
  if (humidity > 70 && temp >= 15 && temp <= 30) {
    fungalRisk = Math.min(
      ((humidity - 70) * 2) + 
      ((rainfall || 0) * 3) + 
      (temp > 20 ? 20 : 0),
      100
    );
  }

  // Pest activity risk (warm temp + moderate humidity)
  if (temp > 20 && temp < 35 && humidity > 40) {
    pestRisk = Math.min(
      ((temp - 20) * 3) + 
      ((humidity - 40) * 0.5),
      100
    );
  }

  // Drought stress risk (high temp + low humidity + no rain)
  if (temp > 28 && humidity < 50 && (rainfall || 0) < 2) {
    droughtRisk = Math.min(
      ((temp - 28) * 4) + 
      ((50 - humidity) * 1.5),
      100
    );
  }

  return {
    fungal: Math.round(fungalRisk),
    pest: Math.round(pestRisk),
    drought: Math.round(droughtRisk),
    overall: Math.round((fungalRisk + pestRisk + droughtRisk) / 3)
  };
};

/**
 * Get farming activity recommendation based on weather
 * @param {String} activity - Activity type (irrigation, spraying, etc.)
 * @param {Object} weather - Current and forecast weather
 * @returns {Object} - Recommendation
 */
const getActivityRecommendation = (activity, weather) => {
  const { current, forecast } = weather;

  switch (activity.toLowerCase()) {
    case 'irrigation':
      return getIrrigationRecommendation(current, forecast);
    
    case 'spraying':
    case 'pesticide':
      return getSprayingRecommendation(current, forecast);
    
    case 'fertilizer':
      return getFertilizerRecommendation(current, forecast);
    
    case 'harvesting':
      return getHarvestingRecommendation(current, forecast);
    
    default:
      return {
        recommended: false,
        reason: 'Activity not recognized',
        timing: null
      };
  }
};

/**
 * Irrigation recommendation
 */
const getIrrigationRecommendation = (current, forecast) => {
  const upcomingRain = forecast.reduce((sum, day) => sum + (day.rainfall || 0), 0);
  
  if (upcomingRain > 10) {
    return {
      recommended: false,
      reason: `${Math.round(upcomingRain)}mm rain expected in next few days`,
      timing: 'Postpone irrigation',
      status: 'warning'
    };
  }

  if (current.humidity < 60 && current.temp > 25) {
    return {
      recommended: true,
      reason: 'Low humidity and warm temperature',
      timing: 'Evening or early morning (low evaporation)',
      status: 'good'
    };
  }

  return {
    recommended: true,
    reason: 'Normal conditions',
    timing: 'Proceed as per schedule',
    status: 'good'
  };
};

/**
 * Pesticide spraying recommendation
 */
const getSprayingRecommendation = (current, forecast) => {
  const nearTermRain = forecast.slice(0, 2).some(day => day.rainChance > 60);
  
  if (nearTermRain) {
    return {
      recommended: false,
      reason: 'Rain expected within 24-48 hours (will wash off pesticide)',
      timing: 'Wait for dry weather',
      status: 'bad'
    };
  }

  if (current.windSpeed > 15) {
    return {
      recommended: false,
      reason: 'Wind speed too high (spray drift risk)',
      timing: 'Wait for calmer conditions',
      status: 'warning'
    };
  }

  if (current.temp > 32) {
    return {
      recommended: false,
      reason: 'Temperature too high (reduces effectiveness)',
      timing: 'Spray early morning or late evening',
      status: 'warning'
    };
  }

  return {
    recommended: true,
    reason: 'Good conditions for spraying',
    timing: 'Early morning (7-9 AM) or evening (5-7 PM)',
    status: 'good'
  };
};

/**
 * Fertilizer application recommendation
 */
const getFertilizerRecommendation = (current, forecast) => {
  const heavyRain = forecast.slice(0, 2).some(day => day.rainfall > 15);
  
  if (heavyRain) {
    return {
      recommended: false,
      reason: 'Heavy rain expected (will wash away nutrients)',
      timing: 'Wait until after rain stops',
      status: 'warning'
    };
  }

  const lightRain = forecast.slice(0, 2).some(day => day.rainfall > 0 && day.rainfall < 10);
  
  if (lightRain) {
    return {
      recommended: true,
      reason: 'Light rain expected (helps nutrient absorption)',
      timing: 'Apply before expected rain',
      status: 'good'
    };
  }

  return {
    recommended: true,
    reason: 'Suitable conditions',
    timing: 'Proceed as planned, water after application',
    status: 'good'
  };
};

/**
 * Harvesting recommendation
 */
const getHarvestingRecommendation = (current, forecast) => {
  const nearTermRain = forecast.slice(0, 3).some(day => day.rainChance > 50);
  
  if (nearTermRain) {
    return {
      recommended: false,
      reason: 'Rain expected (crops will be wet)',
      timing: 'Wait for dry weather',
      status: 'warning'
    };
  }

  if (current.humidity > 80) {
    return {
      recommended: false,
      reason: 'Very high humidity (crops may be damp)',
      timing: 'Wait for lower humidity',
      status: 'warning'
    };
  }

  if (current.humidity < 65 && forecast.every(day => day.rainChance < 30)) {
    return {
      recommended: true,
      reason: 'Excellent conditions - dry weather expected',
      timing: 'Next 2-3 days are ideal',
      status: 'good'
    };
  }

  return {
    recommended: true,
    reason: 'Acceptable conditions',
    timing: 'Midday when crops are driest',
    status: 'good'
  };
};

/**
 * Format weather data for API response
 * @param {Object} rawData - Raw API data
 * @returns {Object} - Formatted data
 */
const formatWeatherResponse = (rawData) => {
  return {
    temp: Math.round(rawData.main?.temp || 0),
    humidity: rawData.main?.humidity || 0,
    pressure: rawData.main?.pressure || 0,
    windSpeed: Math.round((rawData.wind?.speed || 0) * 3.6),
    description: rawData.weather?.[0]?.description || 'Unknown',
    icon: rawData.weather?.[0]?.icon || '01d',
    timestamp: new Date().toISOString()
  };
};

/**
 * Validate weather data structure
 * @param {Object} data - Weather data to validate
 * @returns {Boolean}
 */
const isValidWeatherData = (data) => {
  if (!data || typeof data !== 'object') return false;
  
  const hasTemp = typeof data.temp === 'number';
  const hasHumidity = typeof data.humidity === 'number';
  
  return hasTemp && hasHumidity;
};

/**
 * Get weather severity color coding
 * @param {String} condition - Weather condition
 * @returns {String} - Color code
 */
const getWeatherSeverityColor = (condition) => {
  const severe = ['thunderstorm', 'tornado', 'hurricane'];
  const moderate = ['rain', 'snow', 'fog'];
  
  const lower = condition.toLowerCase();
  
  if (severe.some(s => lower.includes(s))) return 'red';
  if (moderate.some(m => lower.includes(m))) return 'yellow';
  return 'green';
};

module.exports = {
  // Temperature conversions
  convertKelvinToCelsius,
  convertCelsiusToFahrenheit,
  convertFahrenheitToCelsius,
  
  // Wind conversions
  convertMpsToKmh,
  convertKmhToMph,
  
  // Pressure conversions
  convertHpaToInHg,
  
  // Calculations
  calculateDewPoint,
  calculateHeatIndex,
  calculateDiseaseRiskScore,
  
  // Recommendations
  getActivityRecommendation,
  getIrrigationRecommendation,
  getSprayingRecommendation,
  getFertilizerRecommendation,
  getHarvestingRecommendation,
  
  // Formatting
  formatWeatherResponse,
  isValidWeatherData,
  getWeatherSeverityColor
};

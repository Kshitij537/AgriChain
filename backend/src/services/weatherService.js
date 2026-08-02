const axios = require('axios');

/**
 * Weather Service - Integrates with Open-Meteo API
 * Open-Meteo is a free, open-source weather API with no API key required
 * Provides current weather, forecasts, alerts, and farming recommendations
 */

const WEATHER_API_URL = process.env.WEATHER_API_URL || 'https://api.open-meteo.com/v1';

// Cache to reduce API calls (simple in-memory cache)
const cache = new Map();
const CACHE_DURATION = parseInt(process.env.WEATHER_CACHE_DURATION || '10', 10) * 60 * 1000; // 10 minutes default

/**
 * Get data from cache or fetch new
 * @param {String} key - Cache key
 * @param {Function} fetchFn - Function to fetch data if not cached
 * @returns {Promise<Object>}
 */
const getCachedOrFetch = async (key, fetchFn) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`[Weather Service] Cache hit: ${key}`);
    return cached.data;
  }

  console.log(`[Weather Service] Cache miss: ${key}, fetching...`);
  const data = await fetchFn();
  cache.set(key, { data, timestamp: Date.now() });
  return data;
};

/**
 * Validate coordinates
 * @param {Number} lat - Latitude
 * @param {Number} lon - Longitude
 */
const validateCoordinates = (lat, lon) => {
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lon);

  if (isNaN(latitude) || isNaN(longitude)) {
    throw new Error('Invalid coordinates: latitude and longitude must be numbers');
  }

  if (latitude < -90 || latitude > 90) {
    throw new Error(`Invalid latitude: ${latitude}. Must be between -90 and 90`);
  }

  if (longitude < -180 || longitude > 180) {
    throw new Error(`Invalid longitude: ${longitude}. Must be between -180 and 180`);
  }

  return { lat: latitude, lon: longitude };
};

/**
 * Get current weather for location
 * @param {Number} lat - Latitude
 * @param {Number} lon - Longitude
 * @returns {Promise<Object>}
 */
const getCurrentWeather = async (lat, lon) => {
  try {
    const coords = validateCoordinates(lat, lon);
    const cacheKey = `current_${coords.lat}_${coords.lon}`;

    return await getCachedOrFetch(cacheKey, async () => {
      const url = `${WEATHER_API_URL}/forecast`;
      const params = {
        latitude: coords.lat,
        longitude: coords.lon,
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m',
        timezone: 'auto'
      };

      console.log(`[Weather Service] Calling: ${url} with params:`, params);

      const response = await axios.get(url, {
        params,
        timeout: 10000
      });

      const data = response.data.current;

      return {
        temp: Math.round(data.temperature_2m),
        feelsLike: Math.round(data.apparent_temperature),
        humidity: data.relative_humidity_2m,
        pressure: Math.round(data.pressure_msl || data.surface_pressure),
        windSpeed: Math.round(data.wind_speed_10m * 3.6), // m/s to km/h
        windDirection: getWindDirection(data.wind_direction_10m),
        condition: getWeatherCondition(data.weather_code),
        description: getWeatherDescription(data.weather_code),
        icon: getWeatherIcon(data.weather_code, data.time),
        visibility: 10, // Open-Meteo doesn't provide visibility
        cloudCoverage: data.cloud_cover,
        precipitation: data.precipitation || 0,
        timestamp: new Date(data.time).toISOString(),
      };
    });
  } catch (error) {
    console.error('[Weather Service] Error fetching current weather:', error.message);
    if (error.response) {
      console.error('[Weather Service] Response status:', error.response.status);
      console.error('[Weather Service] Response data:', error.response.data);
    }
    handleWeatherError(error);
  }
};

/**
 * Get enhanced current weather with additional calculations
 * @param {Number} lat - Latitude
 * @param {Number} lon - Longitude
 * @returns {Promise<Object>}
 */
const getEnhancedCurrentWeather = async (lat, lon) => {
  try {
    const coords = validateCoordinates(lat, lon);
    const cacheKey = `enhanced_${coords.lat}_${coords.lon}`;

    return await getCachedOrFetch(cacheKey, async () => {
      const response = await axios.get(`${WEATHER_API_URL}/forecast`, {
        params: {
          latitude: coords.lat,
          longitude: coords.lon,
          current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,uv_index,dew_point_2m',
          timezone: 'auto'
        },
        timeout: 10000
      });

      const data = response.data.current;

      return {
        temp: Math.round(data.temperature_2m),
        feelsLike: Math.round(data.apparent_temperature),
        humidity: data.relative_humidity_2m,
        pressure: Math.round(data.pressure_msl || data.surface_pressure),
        windSpeed: Math.round(data.wind_speed_10m * 3.6),
        windDirection: getWindDirection(data.wind_direction_10m),
        condition: getWeatherCondition(data.weather_code),
        description: getWeatherDescription(data.weather_code),
        icon: getWeatherIcon(data.weather_code, data.time),
        visibility: 10,
        cloudCoverage: data.cloud_cover,
        uvIndex: Math.round(data.uv_index || 5),
        dewPoint: Math.round(data.dew_point_2m),
        precipitation: data.precipitation || 0,
        timestamp: new Date(data.time).toISOString(),
      };
    });
  } catch (error) {
    console.error('[Weather Service] Error fetching enhanced weather:', error.message);
    handleWeatherError(error);
  }
};

/**
 * Get 7-day weather forecast
 * @param {Number} lat - Latitude
 * @param {Number} lon - Longitude
 * @param {Number} days - Number of days (default 7)
 * @returns {Promise<Array>}
 */
const getWeatherForecast = async (lat, lon, days = 7) => {
  try {
    const coords = validateCoordinates(lat, lon);
    const safeDays = Math.min(Math.max(1, parseInt(days, 10)), 16); // Open-Meteo supports up to 16 days

    const cacheKey = `forecast_${coords.lat}_${coords.lon}_${safeDays}`;

    return await getCachedOrFetch(cacheKey, async () => {
      const response = await axios.get(`${WEATHER_API_URL}/forecast`, {
        params: {
          latitude: coords.lat,
          longitude: coords.lon,
          daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,relative_humidity_2m_mean',
          timezone: 'auto',
          forecast_days: safeDays
        },
        timeout: 10000
      });

      const daily = response.data.daily;

      const forecast = daily.time.map((date, index) => {
        const dayDate = new Date(date);
        const dayName = dayDate.toLocaleDateString('en-US', { weekday: 'short' });

        return {
          date,
          day: dayName,
          high: Math.round(daily.temperature_2m_max[index]),
          low: Math.round(daily.temperature_2m_min[index]),
          condition: getWeatherCondition(daily.weather_code[index]),
          icon: getWeatherIcon(daily.weather_code[index], date),
          rainChance: Math.round(daily.precipitation_probability_max[index] || 0),
          humidity: Math.round(daily.relative_humidity_2m_mean[index]),
          rainfall: Math.round(daily.precipitation_sum[index] * 10) / 10
        };
      });

      return forecast;
    });
  } catch (error) {
    console.error('[Weather Service] Error fetching forecast:', error.message);
    handleWeatherError(error);
  }
};

/**
 * Get hourly weather forecast (24 hours)
 * @param {Number} lat - Latitude
 * @param {Number} lon - Longitude
 * @param {Number} hours - Number of hours (default 24)
 * @returns {Promise<Array>}
 */
const getHourlyForecast = async (lat, lon, hours = 24) => {
  try {
    const coords = validateCoordinates(lat, lon);
    const safeHours = Math.min(Math.max(1, parseInt(hours, 10)), 168); // Max 7 days

    const cacheKey = `hourly_${coords.lat}_${coords.lon}_${safeHours}`;

    return await getCachedOrFetch(cacheKey, async () => {
      const response = await axios.get(`${WEATHER_API_URL}/forecast`, {
        params: {
          latitude: coords.lat,
          longitude: coords.lon,
          hourly: 'temperature_2m,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m',
          timezone: 'auto',
          forecast_days: Math.ceil(safeHours / 24)
        },
        timeout: 10000
      });

      const hourlyData = response.data.hourly;
      const currentHour = new Date().getHours();

      // Get next N hours
      const hourly = hourlyData.time.slice(0, safeHours).map((time, index) => {
        const date = new Date(time);
        const hour = date.getHours();
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;

        return {
          time: `${hour12} ${ampm}`,
          timestamp: date.toISOString(),
          temp: Math.round(hourlyData.temperature_2m[index]),
          condition: getWeatherCondition(hourlyData.weather_code[index]),
          icon: getWeatherIcon(hourlyData.weather_code[index], time),
          rainChance: Math.round(hourlyData.precipitation_probability[index] || 0),
          windSpeed: Math.round(hourlyData.wind_speed_10m[index] * 3.6),
          humidity: Math.round(hourlyData.relative_humidity_2m[index])
        };
      });

      return hourly;
    });
  } catch (error) {
    console.error('[Weather Service] Error fetching hourly forecast:', error.message);
    handleWeatherError(error);
  }
};

/**
 * Get weather alerts for location
 * @param {Number} lat - Latitude
 * @param {Number} lon - Longitude
 * @returns {Promise<Array>}
 */
const getWeatherAlerts = async (lat, lon) => {
  try {
    const coords = validateCoordinates(lat, lon);
    const cacheKey = `alerts_${coords.lat}_${coords.lon}`;

    return await getCachedOrFetch(cacheKey, async () => {
      // Open-Meteo doesn't have dedicated alerts API
      // Generate alerts based on forecast data
      const current = await getCurrentWeather(coords.lat, coords.lon);
      const forecast = await getWeatherForecast(coords.lat, coords.lon, 3);
      
      return generateSyntheticAlerts(current, forecast);
    });
  } catch (error) {
    console.error('[Weather Service] Error fetching alerts:', error.message);
    return []; // Return empty array on error for alerts
  }
};

/**
 * Calculate disease risk based on weather conditions
 * @param {Number} lat - Latitude
 * @param {Number} lon - Longitude
 * @returns {Promise<Object>}
 */
const calculateDiseaseRisk = async (lat, lon) => {
  try {
    const coords = validateCoordinates(lat, lon);
    const cacheKey = `disease_risk_${coords.lat}_${coords.lon}`;

    return await getCachedOrFetch(cacheKey, async () => {
      const current = await getCurrentWeather(coords.lat, coords.lon);
      const forecast = await getWeatherForecast(coords.lat, coords.lon, 3);

      // Calculate risk factors
      const factors = [];

      // Fungal Disease Risk (high humidity + warm temp)
      const avgHumidity = (current.humidity + forecast[0]?.humidity + forecast[1]?.humidity) / 3;
      const avgTemp = (current.temp + forecast[0]?.high + forecast[1]?.high) / 3;
      
      let fungalScore = 0;
      if (avgHumidity > 70 && avgTemp > 20 && avgTemp < 30) {
        fungalScore = Math.min(Math.round((avgHumidity - 70) * 2 + (avgTemp - 20) * 2), 100);
      } else if (avgHumidity > 60) {
        fungalScore = Math.round((avgHumidity - 60) * 1.5);
      }

      factors.push({
        name: 'Fungal Disease',
        risk: fungalScore > 60 ? 'High' : fungalScore > 35 ? 'Moderate' : 'Low',
        score: fungalScore,
        reason: avgHumidity > 70 
          ? 'High humidity + warm temp' 
          : avgHumidity > 60 
          ? 'Elevated humidity levels' 
          : 'Low moisture conditions'
      });

      // Pest Activity Risk (warm temp + moderate humidity)
      let pestScore = 0;
      if (avgTemp > 25 && avgTemp < 35 && avgHumidity > 50) {
        pestScore = Math.min(Math.round((avgTemp - 25) * 3 + (avgHumidity - 50) * 0.8), 100);
      }

      factors.push({
        name: 'Pest Activity',
        risk: pestScore > 60 ? 'High' : pestScore > 35 ? 'Moderate' : 'Low',
        score: pestScore,
        reason: pestScore > 60 
          ? 'Favorable conditions for pests' 
          : pestScore > 35 
          ? 'Moderate pest activity expected' 
          : 'Unfavorable for pest activity'
      });

      // Drought Stress Risk (low humidity + high temp + no rain)
      const totalRainfall = forecast.slice(0, 3).reduce((sum, day) => sum + (day.rainfall || 0), 0);
      let droughtScore = 0;
      if (avgTemp > 30 && avgHumidity < 50 && totalRainfall < 5) {
        droughtScore = Math.min(Math.round((avgTemp - 30) * 5 + (50 - avgHumidity) * 2), 100);
      }

      factors.push({
        name: 'Drought Stress',
        risk: droughtScore > 60 ? 'High' : droughtScore > 35 ? 'Moderate' : 'Low',
        score: droughtScore,
        reason: droughtScore > 60 
          ? 'High temp, low moisture' 
          : droughtScore > 35 
          ? 'Mild water stress possible' 
          : 'Adequate moisture'
      });

      // Overall risk & dynamic recommendation text
      const avgScore = (fungalScore + pestScore + droughtScore) / 3;
      const overall = avgScore > 60 ? 'High' : avgScore > 35 ? 'Moderate' : 'Low';

      let recommendation = 'Weather conditions are stable with minimal crop disease threats. Maintain regular scouting.';
      if (fungalScore >= pestScore && fungalScore >= droughtScore && fungalScore > 35) {
        recommendation = `Elevated fungal disease risk (${fungalScore}%). Monitor crop leaves for spots or blight and avoid late-evening overhead watering.`;
      } else if (pestScore >= fungalScore && pestScore >= droughtScore && pestScore > 35) {
        recommendation = `Increased pest activity risk (${pestScore}%). Scout field foliage for aphids, thrips, or caterpillars under warm conditions.`;
      } else if (droughtScore > 35) {
        recommendation = `Drought stress risk detected (${droughtScore}%). Ensure adequate root-zone irrigation and soil mulch to conserve moisture.`;
      }

      return {
        overall,
        overallScore: Math.round(avgScore),
        factors,
        recommendation,
        timestamp: new Date().toISOString()
      };
    });
  } catch (error) {
    console.error('[Weather Service] Error calculating disease risk:', error.message);
    handleWeatherError(error);
  }
};

/**
 * Get farming activity recommendations
 * @param {Number} lat - Latitude
 * @param {Number} lon - Longitude
 * @returns {Promise<Array>}
 */
const getFarmingRecommendations = async (lat, lon) => {
  try {
    const coords = validateCoordinates(lat, lon);
    const cacheKey = `recommendations_${coords.lat}_${coords.lon}`;

    return await getCachedOrFetch(cacheKey, async () => {
      const current = await getCurrentWeather(coords.lat, coords.lon);
      const forecast = await getWeatherForecast(coords.lat, coords.lon, 7);
      const hourly = await getHourlyForecast(coords.lat, coords.lon, 24);

      const recommendations = [];

      // 1. Irrigation Recommendation
      const upcoming3DayRain = forecast.slice(0, 3).reduce((sum, day) => sum + (day.rainfall || 0), 0);
      const currentTemp = current.temp || 25;
      const currentHumidity = current.humidity || 60;

      if (upcoming3DayRain > 10) {
        recommendations.push({
          activity: 'Irrigation',
          time: 'Postpone for 2-3 days',
          reason: `${Math.round(upcoming3DayRain)}mm rain expected in coming days`,
          icon: 'water_drop',
          status: 'warning'
        });
      } else if (currentTemp > 32 && currentHumidity < 50) {
        recommendations.push({
          activity: 'Irrigation',
          time: 'Early Morning (5-7 AM) or Late Evening (6-8 PM)',
          reason: `High temp (${Math.round(currentTemp)}°C) & low humidity (${currentHumidity}%) cause rapid evaporation`,
          icon: 'water_drop',
          status: 'good'
        });
      } else if (upcoming3DayRain < 5) {
        recommendations.push({
          activity: 'Irrigation',
          time: 'Today Evening (6-8 PM)',
          reason: 'Low evaporation, dry weather expected',
          icon: 'water_drop',
          status: 'good'
        });
      } else {
        recommendations.push({
          activity: 'Irrigation',
          time: 'Moderate watering as needed',
          reason: 'Moderate soil moisture retention conditions',
          icon: 'water_drop',
          status: 'good'
        });
      }

      // 2. Pesticide Spraying
      const currentWind = current.windSpeed || 10;
      const highWindDays = forecast.filter(day => (day.windSpeed || 0) > 20);
      const rainyDays = forecast.filter(day => (day.rainChance || 0) > 40);

      if (currentWind > 18) {
        recommendations.push({
          activity: 'Pesticide Spraying',
          time: 'Postpone spraying',
          reason: `High wind speed (${Math.round(currentWind)} km/h) causes chemical spray drift`,
          icon: 'pest_control',
          status: 'bad'
        });
      } else if (forecast.length > 0 && forecast[0].rainChance > 50) {
        recommendations.push({
          activity: 'Pesticide Spraying',
          time: 'Wait for rain to clear',
          reason: 'Rain will wash off pesticide applications',
          icon: 'pest_control',
          status: 'warning'
        });
      } else {
        const optimalDay = forecast.find(day => (day.rainChance || 0) < 25 && (day.windSpeed || 0) < 15) || forecast[0];
        const dayLabel = forecast.indexOf(optimalDay) === 0 ? 'Today' : forecast.indexOf(optimalDay) === 1 ? 'Tomorrow' : optimalDay.day;
        recommendations.push({
          activity: 'Pesticide Spraying',
          time: `${dayLabel} Morning (7-9 AM)`,
          reason: 'Calm winds and low rain probability',
          icon: 'pest_control',
          status: 'good'
        });
      }

      // 3. Fertilizer Application
      const heavyRain = forecast.filter(day => (day.rainfall || 0) > 8);
      if (heavyRain.length > 0) {
        recommendations.push({
          activity: 'Fertilizer Application',
          time: 'Postpone until rain subsides',
          reason: 'Heavy rain will wash away topsoil nutrients',
          icon: 'eco',
          status: 'warning'
        });
      } else {
        const lightRainDay = forecast.find(day => (day.rainfall || 0) > 0.5 && (day.rainfall || 0) <= 5);
        if (lightRainDay) {
          recommendations.push({
            activity: 'Fertilizer Application',
            time: `${lightRainDay.day} Morning`,
            reason: 'Light rain will assist nutrient absorption into root zone',
            icon: 'eco',
            status: 'good'
          });
        } else {
          recommendations.push({
            activity: 'Fertilizer Application',
            time: 'Apply with light evening watering',
            reason: 'Dry forecast; water lightly after application',
            icon: 'eco',
            status: 'good'
          });
        }
      }

      // 4. Harvesting
      const wetDays = forecast.filter(day => (day.rainChance || 0) > 30 || (day.humidity || 0) > 75);
      if (wetDays.length >= 3) {
        recommendations.push({
          activity: 'Harvesting',
          time: 'Delay harvest',
          reason: 'High humidity and damp foliage increase spoilage risk',
          icon: 'agriculture',
          status: 'warning'
        });
      } else {
        const dryDay = forecast.find(day => (day.rainChance || 0) < 20 && (day.humidity || 0) < 65) || forecast[0];
        const harvestTimeLabel = forecast.indexOf(dryDay) === 0 ? 'Today / Tomorrow' : `${dryDay.day} onwards`;
        recommendations.push({
          activity: 'Harvesting',
          time: harvestTimeLabel,
          reason: 'Low humidity and clear conditions ideal for crop drying',
          icon: 'agriculture',
          status: 'good'
        });
      }

      return recommendations;
    });
  } catch (error) {
    console.error('[Weather Service] Error generating recommendations:', error.message);
    handleWeatherError(error);
  }
};

/**
 * Get complete weather data (all-in-one endpoint)
 * @param {Number} lat - Latitude
 * @param {Number} lon - Longitude
 * @returns {Promise<Object>}
 */
const getCompleteWeatherData = async (lat, lon) => {
  try {
    const coords = validateCoordinates(lat, lon);

    console.log(`[Weather Service] Fetching complete weather data for ${coords.lat}, ${coords.lon}`);

    // Fetch all data in parallel
    const [current, forecast, hourly, alerts, diseaseRisk, recommendations] = await Promise.all([
      getEnhancedCurrentWeather(coords.lat, coords.lon),
      getWeatherForecast(coords.lat, coords.lon, 7),
      getHourlyForecast(coords.lat, coords.lon, 24),
      getWeatherAlerts(coords.lat, coords.lon),
      calculateDiseaseRisk(coords.lat, coords.lon),
      getFarmingRecommendations(coords.lat, coords.lon)
    ]);

    return {
      success: true,
      location: {
        lat: coords.lat,
        lon: coords.lon
      },
      current,
      forecast,
      hourly,
      alerts,
      diseaseRisk,
      recommendations,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[Weather Service] Error fetching complete weather data:', error.message);
    handleWeatherError(error);
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Map Open-Meteo WMO weather codes to Material Symbols icons
 * @param {Number} code - WMO Weather interpretation code
 * @param {String} time - ISO timestamp to determine day/night
 * @returns {String} - Material Symbols icon name
 */
const getWeatherIcon = (code, time) => {
  const hour = new Date(time).getHours();
  const isNight = hour < 6 || hour >= 20;

  // WMO Weather interpretation codes
  // 0: Clear sky
  if (code === 0) return isNight ? 'clear_night' : 'sunny';
  
  // 1, 2, 3: Mainly clear, partly cloudy, and overcast
  if (code === 1 || code === 2) return isNight ? 'partly_cloudy_night' : 'partly_cloudy_day';
  if (code === 3) return 'cloudy';
  
  // 45, 48: Fog
  if (code === 45 || code === 48) return 'mist';
  
  // 51, 53, 55: Drizzle
  if (code >= 51 && code <= 55) return 'rainy_light';
  
  // 56, 57: Freezing Drizzle
  if (code === 56 || code === 57) return 'weather_mix';
  
  // 61, 63, 65: Rain
  if (code === 61) return 'rainy';
  if (code === 63 || code === 65) return 'rainy_heavy';
  
  // 66, 67: Freezing Rain
  if (code === 66 || code === 67) return 'weather_mix';
  
  // 71, 73, 75: Snow fall
  if (code >= 71 && code <= 75) return 'weather_snowy';
  
  // 77: Snow grains
  if (code === 77) return 'weather_snowy';
  
  // 80, 81, 82: Rain showers
  if (code === 80 || code === 81) return 'rainy';
  if (code === 82) return 'rainy_heavy';
  
  // 85, 86: Snow showers
  if (code === 85 || code === 86) return 'weather_snowy';
  
  // 95: Thunderstorm
  if (code === 95) return 'thunderstorm';
  
  // 96, 99: Thunderstorm with hail
  if (code === 96 || code === 99) return 'thunderstorm';

  return isNight ? 'clear_night' : 'sunny';
};

/**
 * Get weather condition name from WMO code
 * @param {Number} code - WMO Weather interpretation code
 * @returns {String} - Weather condition name
 */
const getWeatherCondition = (code) => {
  if (code === 0) return 'Clear';
  if (code === 1 || code === 2) return 'Partly Cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Foggy';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain Showers';
  if (code >= 85 && code <= 86) return 'Snow Showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Unknown';
};

/**
 * Get detailed weather description from WMO code
 * @param {Number} code - WMO Weather interpretation code
 * @returns {String} - Detailed description
 */
const getWeatherDescription = (code) => {
  const descriptions = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    56: 'Light freezing drizzle',
    57: 'Dense freezing drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    66: 'Light freezing rain',
    67: 'Heavy freezing rain',
    71: 'Slight snow fall',
    73: 'Moderate snow fall',
    75: 'Heavy snow fall',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail'
  };
  return descriptions[code] || 'Unknown';
};

/**
 * Convert wind degree to direction
 * @param {Number} deg - Wind direction in degrees
 * @returns {String} - Cardinal direction
 */
const getWindDirection = (deg) => {
  if (deg >= 337.5 || deg < 22.5) return 'N';
  if (deg >= 22.5 && deg < 67.5) return 'NE';
  if (deg >= 67.5 && deg < 112.5) return 'E';
  if (deg >= 112.5 && deg < 157.5) return 'SE';
  if (deg >= 157.5 && deg < 202.5) return 'S';
  if (deg >= 202.5 && deg < 247.5) return 'SW';
  if (deg >= 247.5 && deg < 292.5) return 'W';
  if (deg >= 292.5 && deg < 337.5) return 'NW';
  return 'N';
};

/**
 * Determine alert severity
 * @param {String} eventName - Alert event name
 * @returns {String} - Severity level
 */
const determineSeverity = (eventName) => {
  const lower = eventName.toLowerCase();
  if (lower.includes('extreme') || lower.includes('severe') || lower.includes('warning')) {
    return 'high';
  }
  if (lower.includes('watch') || lower.includes('advisory')) {
    return 'moderate';
  }
  return 'low';
};

/**
 * Get icon for alert type
 * @param {String} eventName - Alert event name
 * @returns {String} - Material Symbols icon
 */
const getAlertIcon = (eventName) => {
  const lower = eventName.toLowerCase();
  if (lower.includes('rain') || lower.includes('flood')) return 'rainy_heavy';
  if (lower.includes('wind') || lower.includes('storm')) return 'air';
  if (lower.includes('heat') || lower.includes('temperature')) return 'wb_sunny';
  if (lower.includes('cold') || lower.includes('freeze')) return 'ac_unit';
  if (lower.includes('fog')) return 'mist';
  return 'warning';
};

/**
 * Generate synthetic alerts based on forecast
 * @param {Object} current - Current weather
 * @param {Array} forecast - Forecast data
 * @returns {Array} - Synthetic alerts
 */
const generateSyntheticAlerts = (current, forecast) => {
  const alerts = [];

  // Heavy rain alert
  const heavyRainDays = forecast.filter(day => day.rainfall > 15);
  if (heavyRainDays.length > 0) {
    alerts.push({
      type: 'warning',
      title: 'Heavy Rain Expected',
      message: `Heavy rainfall expected on ${heavyRainDays[0].day}. Consider postponing irrigation and outdoor activities.`,
      icon: 'rainy_heavy',
      severity: 'moderate'
    });
  }

  // High UV alert
  if (current.temp > 30 && current.cloudCoverage < 30) {
    alerts.push({
      type: 'info',
      title: 'High UV Index',
      message: 'UV index will be very high today. Protect yourself if working outdoors.',
      icon: 'wb_sunny',
      severity: 'low'
    });
  }

  // High wind alert
  if (current.windSpeed > 30) {
    alerts.push({
      type: 'warning',
      title: 'High Wind Advisory',
      message: 'Strong winds expected. Avoid pesticide spraying and secure loose equipment.',
      icon: 'air',
      severity: 'moderate'
    });
  }

  // Extreme heat alert
  const hotDays = forecast.filter(day => day.high > 38);
  if (hotDays.length > 0) {
    alerts.push({
      type: 'warning',
      title: 'Extreme Heat Warning',
      message: 'Very high temperatures expected. Ensure adequate irrigation and avoid midday field work.',
      icon: 'wb_sunny',
      severity: 'high'
    });
  }

  return alerts;
};

/**
 * Handle weather API errors
 * @param {Error} error - Error object
 */
const handleWeatherError = (error) => {
  if (error.code === 'ECONNREFUSED') {
    throw new Error('Weather service unavailable. Please check your internet connection');
  }

  if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
    throw new Error('Weather service request timed out. Please try again');
  }

  if (error.response) {
    const status = error.response.status;
    if (status === 400) {
      throw new Error('Invalid coordinates provided');
    }
    if (status === 404) {
      throw new Error('Weather data not available for this location');
    }
    if (status === 429) {
      throw new Error('Too many requests. Please try again later');
    }
    throw new Error(`Weather service error: ${status}`);
  }

  throw error;
};

module.exports = {
  getCurrentWeather,
  getEnhancedCurrentWeather,
  getWeatherForecast,
  getHourlyForecast,
  getWeatherAlerts,
  calculateDiseaseRisk,
  getFarmingRecommendations,
  getCompleteWeatherData,
  validateCoordinates
};

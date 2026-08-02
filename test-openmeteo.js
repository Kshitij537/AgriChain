#!/usr/bin/env node

/**
 * Standalone Test Script for Open-Meteo Weather API
 * Usage: node test-openmeteo.js [latitude] [longitude]
 * Example: node test-openmeteo.js 20.6437 74.2654
 */

const https = require('https');

// Test coordinates (default to Nashik, India - your field location)
const testLat = process.argv[2] || '20.6437';
const testLon = process.argv[3] || '74.2654';

console.log('='.repeat(80));
console.log('🌦️  Open-Meteo Weather API Test');
console.log('='.repeat(80));
console.log(`📍 Location: ${testLat}°N, ${testLon}°E`);
console.log('⏰ Testing at:', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
console.log('='.repeat(80));
console.log();

/**
 * Make HTTPS GET request
 */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Test 1: Current Weather
 */
async function testCurrentWeather() {
  console.log('📊 TEST 1: Current Weather');
  console.log('-'.repeat(80));
  
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${testLat}&longitude=${testLon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m&timezone=auto`;
  
  try {
    const data = await httpsGet(url);
    const current = data.current;
    
    console.log('✅ Success! Response received');
    console.log();
    console.log('Current Weather Data:');
    console.log(`  🌡️  Temperature: ${current.temperature_2m}°C`);
    console.log(`  🌡️  Feels Like: ${current.apparent_temperature}°C`);
    console.log(`  💧 Humidity: ${current.relative_humidity_2m}%`);
    console.log(`  🌧️  Precipitation: ${current.precipitation} mm`);
    console.log(`  ☁️  Cloud Cover: ${current.cloud_cover}%`);
    console.log(`  🎈 Pressure: ${current.pressure_msl} hPa`);
    console.log(`  💨 Wind Speed: ${current.wind_speed_10m} m/s (${Math.round(current.wind_speed_10m * 3.6)} km/h)`);
    console.log(`  🧭 Wind Direction: ${current.wind_direction_10m}°`);
    console.log(`  📅 Time: ${current.time}`);
    console.log(`  🔢 Weather Code: ${current.weather_code} (${getWeatherDescription(current.weather_code)})`);
    console.log();
    
    return current;
  } catch (error) {
    console.log('❌ Error:', error.message);
    console.log();
    throw error;
  }
}

/**
 * Test 2: 7-Day Forecast
 */
async function testForecast() {
  console.log('📊 TEST 2: 7-Day Forecast');
  console.log('-'.repeat(80));
  
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${testLat}&longitude=${testLon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,relative_humidity_2m_mean&timezone=auto&forecast_days=7`;
  
  try {
    const data = await httpsGet(url);
    const daily = data.daily;
    
    console.log('✅ Success! Response received');
    console.log();
    console.log('7-Day Forecast:');
    console.log();
    
    for (let i = 0; i < daily.time.length; i++) {
      const date = new Date(daily.time[i]);
      const dayName = date.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
      
      console.log(`  ${dayName}:`);
      console.log(`    🌡️  High: ${daily.temperature_2m_max[i]}°C | Low: ${daily.temperature_2m_min[i]}°C`);
      console.log(`    🌧️  Rain: ${daily.precipitation_sum[i]} mm (${daily.precipitation_probability_max[i]}% chance)`);
      console.log(`    💧 Humidity: ${daily.relative_humidity_2m_mean[i]}%`);
      console.log(`    ☁️  ${getWeatherDescription(daily.weather_code[i])}`);
      console.log();
    }
    
    return daily;
  } catch (error) {
    console.log('❌ Error:', error.message);
    console.log();
    throw error;
  }
}

/**
 * Test 3: Hourly Forecast (next 24 hours)
 */
async function testHourlyForecast() {
  console.log('📊 TEST 3: Hourly Forecast (Next 24 Hours)');
  console.log('-'.repeat(80));
  
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${testLat}&longitude=${testLon}&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m&timezone=auto&forecast_days=2`;
  
  try {
    const data = await httpsGet(url);
    const hourly = data.hourly;
    
    console.log('✅ Success! Response received');
    console.log();
    console.log('Next 12 Hours (sample):');
    console.log();
    
    for (let i = 0; i < Math.min(12, hourly.time.length); i++) {
      const time = new Date(hourly.time[i]);
      const timeStr = time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      
      console.log(`  ${timeStr}:`);
      console.log(`    🌡️  ${hourly.temperature_2m[i]}°C`);
      console.log(`    💧 ${hourly.relative_humidity_2m[i]}%`);
      console.log(`    🌧️  ${hourly.precipitation_probability[i]}% rain chance`);
      console.log(`    💨 ${Math.round(hourly.wind_speed_10m[i] * 3.6)} km/h wind`);
      console.log();
    }
    
    return hourly;
  } catch (error) {
    console.log('❌ Error:', error.message);
    console.log();
    throw error;
  }
}

/**
 * Test 4: Multiple Locations (India-specific)
 */
async function testMultipleLocations() {
  console.log('📊 TEST 4: Multiple Indian Cities');
  console.log('-'.repeat(80));
  
  const cities = [
    { name: 'Mumbai', lat: 19.076, lon: 72.877 },
    { name: 'Delhi', lat: 28.613, lon: 77.209 },
    { name: 'Nashik', lat: 20.644, lon: 74.265 },
    { name: 'Pune', lat: 18.520, lon: 73.857 },
    { name: 'Bangalore', lat: 12.972, lon: 77.594 }
  ];
  
  console.log('Testing weather data for major Indian cities:');
  console.log();
  
  for (const city of cities) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,weather_code&timezone=auto`;
    
    try {
      const data = await httpsGet(url);
      const current = data.current;
      
      console.log(`  ✅ ${city.name.padEnd(12)}: ${current.temperature_2m}°C - ${getWeatherDescription(current.weather_code)}`);
    } catch (error) {
      console.log(`  ❌ ${city.name.padEnd(12)}: Error - ${error.message}`);
    }
  }
  
  console.log();
}

/**
 * Get weather description from WMO code
 */
function getWeatherDescription(code) {
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
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
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
}

/**
 * Run all tests
 */
async function runAllTests() {
  try {
    await testCurrentWeather();
    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between requests
    
    await testForecast();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await testHourlyForecast();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await testMultipleLocations();
    
    console.log('='.repeat(80));
    console.log('✅ All tests completed successfully!');
    console.log('='.repeat(80));
    console.log();
    console.log('📝 Notes:');
    console.log('  • Open-Meteo is completely FREE with no API key required');
    console.log('  • Unlimited API calls for personal/commercial use');
    console.log('  • Works great for India and worldwide');
    console.log('  • Weather codes: https://open-meteo.com/en/docs');
    console.log('  • Your current backend already uses this API!');
    console.log();
    
  } catch (error) {
    console.log('='.repeat(80));
    console.log('❌ Tests failed');
    console.log('='.repeat(80));
    console.log();
    process.exit(1);
  }
}

// Run the tests
runAllTests();

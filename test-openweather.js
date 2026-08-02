#!/usr/bin/env node

/**
 * Standalone Test Script for OpenWeatherMap API
 * 
 * SETUP:
 * 1. Sign up for FREE API key at: https://openweathermap.org/api
 * 2. Go to: https://home.openweathermap.org/users/sign_up
 * 3. After signup, get your API key from: https://home.openweathermap.org/api_keys
 * 4. Run: node test-openweather.js YOUR_API_KEY [latitude] [longitude]
 * 
 * Usage: node test-openweather.js <API_KEY> [latitude] [longitude]
 * Example: node test-openweather.js abc123xyz456 20.6437 74.2654
 */

const https = require('https');

// Check if API key is provided
if (process.argv.length < 3) {
  console.log('❌ ERROR: API Key required!');
  console.log();
  console.log('📝 How to get OpenWeatherMap API Key:');
  console.log('  1. Visit: https://openweathermap.org/api');
  console.log('  2. Click "Sign Up" (it\'s FREE)');
  console.log('  3. After signup, go to: https://home.openweathermap.org/api_keys');
  console.log('  4. Copy your API key');
  console.log();
  console.log('Usage:');
  console.log('  node test-openweather.js YOUR_API_KEY [latitude] [longitude]');
  console.log();
  console.log('Example:');
  console.log('  node test-openweather.js abc123xyz456 20.6437 74.2654');
  console.log();
  process.exit(1);
}

const API_KEY = process.argv[2];
const testLat = process.argv[3] || '20.6437';  // Nashik, India
const testLon = process.argv[4] || '74.2654';

console.log('='.repeat(80));
console.log('☀️  OpenWeatherMap API Test');
console.log('='.repeat(80));
console.log(`🔑 API Key: ${API_KEY.substring(0, 8)}...${API_KEY.substring(API_KEY.length - 4)}`);
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
        try {
          const parsed = JSON.parse(data);
          
          if (res.statusCode === 200) {
            resolve(parsed);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${parsed.message || data}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Test 1: Current Weather (One Call API 3.0)
 */
async function testCurrentWeather() {
  console.log('📊 TEST 1: Current Weather (One Call API 3.0)');
  console.log('-'.repeat(80));
  
  const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${testLat}&lon=${testLon}&appid=${API_KEY}&units=metric`;
  
  try {
    const data = await httpsGet(url);
    const current = data.current;
    
    console.log('✅ Success! Response received');
    console.log();
    console.log('Current Weather Data:');
    console.log(`  🌡️  Temperature: ${current.temp}°C`);
    console.log(`  🌡️  Feels Like: ${current.feels_like}°C`);
    console.log(`  💧 Humidity: ${current.humidity}%`);
    console.log(`  🌧️  Precipitation: ${current.rain ? current.rain['1h'] : 0} mm`);
    console.log(`  ☁️  Cloud Cover: ${current.clouds}%`);
    console.log(`  🎈 Pressure: ${current.pressure} hPa`);
    console.log(`  💨 Wind Speed: ${current.wind_speed} m/s (${Math.round(current.wind_speed * 3.6)} km/h)`);
    console.log(`  🧭 Wind Direction: ${current.wind_deg}°`);
    console.log(`  👁️  Visibility: ${current.visibility / 1000} km`);
    console.log(`  ☀️  UV Index: ${current.uvi}`);
    console.log(`  🌅 Weather: ${current.weather[0].main} - ${current.weather[0].description}`);
    console.log(`  📅 Time: ${new Date(current.dt * 1000).toLocaleString('en-IN')}`);
    console.log();
    
    return current;
  } catch (error) {
    console.log('❌ Error:', error.message);
    console.log();
    
    if (error.message.includes('401')) {
      console.log('🔴 AUTHENTICATION ERROR:');
      console.log('  • Your API key may be invalid');
      console.log('  • If you just created the key, wait 10-15 minutes for activation');
      console.log('  • Verify your key at: https://home.openweathermap.org/api_keys');
      console.log();
    } else if (error.message.includes('404')) {
      console.log('🔴 API NOT AVAILABLE:');
      console.log('  • One Call API 3.0 requires a paid subscription');
      console.log('  • Free tier only includes Current Weather API 2.5');
      console.log('  • See pricing: https://openweathermap.org/price');
      console.log();
    }
    
    throw error;
  }
}

/**
 * Test 2: Current Weather (Free API 2.5)
 */
async function testCurrentWeatherFree() {
  console.log('📊 TEST 2: Current Weather (Free API 2.5)');
  console.log('-'.repeat(80));
  
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${testLat}&lon=${testLon}&appid=${API_KEY}&units=metric`;
  
  try {
    const data = await httpsGet(url);
    
    console.log('✅ Success! Response received');
    console.log();
    console.log('Current Weather Data:');
    console.log(`  🌡️  Temperature: ${data.main.temp}°C`);
    console.log(`  🌡️  Feels Like: ${data.main.feels_like}°C`);
    console.log(`  💧 Humidity: ${data.main.humidity}%`);
    console.log(`  🎈 Pressure: ${data.main.pressure} hPa`);
    console.log(`  💨 Wind Speed: ${data.wind.speed} m/s (${Math.round(data.wind.speed * 3.6)} km/h)`);
    console.log(`  🧭 Wind Direction: ${data.wind.deg}°`);
    console.log(`  👁️  Visibility: ${data.visibility / 1000} km`);
    console.log(`  ☁️  Cloud Cover: ${data.clouds.all}%`);
    console.log(`  🌅 Weather: ${data.weather[0].main} - ${data.weather[0].description}`);
    console.log(`  🏙️  Location: ${data.name}, ${data.sys.country}`);
    console.log(`  📅 Time: ${new Date(data.dt * 1000).toLocaleString('en-IN')}`);
    console.log();
    
    return data;
  } catch (error) {
    console.log('❌ Error:', error.message);
    console.log();
    
    if (error.message.includes('401')) {
      console.log('🔴 AUTHENTICATION ERROR:');
      console.log('  • Your API key is invalid or not activated yet');
      console.log('  • New keys take 10-15 minutes to activate');
      console.log('  • Check your key at: https://home.openweathermap.org/api_keys');
      console.log();
    }
    
    throw error;
  }
}

/**
 * Test 3: 5-Day Forecast (Free API 2.5)
 */
async function testForecast() {
  console.log('📊 TEST 3: 5-Day Forecast (Free API 2.5)');
  console.log('-'.repeat(80));
  
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${testLat}&lon=${testLon}&appid=${API_KEY}&units=metric`;
  
  try {
    const data = await httpsGet(url);
    
    console.log('✅ Success! Response received');
    console.log();
    console.log(`Total forecast points: ${data.cnt} (3-hour intervals for 5 days)`);
    console.log();
    console.log('Next 5 Forecasts (3-hour intervals):');
    console.log();
    
    for (let i = 0; i < Math.min(5, data.list.length); i++) {
      const forecast = data.list[i];
      const time = new Date(forecast.dt * 1000);
      const timeStr = time.toLocaleString('en-IN', { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      console.log(`  ${timeStr}:`);
      console.log(`    🌡️  ${forecast.main.temp}°C (feels like ${forecast.main.feels_like}°C)`);
      console.log(`    💧 ${forecast.main.humidity}%`);
      console.log(`    🌅 ${forecast.weather[0].description}`);
      console.log(`    💨 ${Math.round(forecast.wind.speed * 3.6)} km/h wind`);
      if (forecast.rain) {
        console.log(`    🌧️  ${forecast.rain['3h']} mm rain`);
      }
      console.log();
    }
    
    return data;
  } catch (error) {
    console.log('❌ Error:', error.message);
    console.log();
    throw error;
  }
}

/**
 * Test 4: Air Pollution (Free API)
 */
async function testAirPollution() {
  console.log('📊 TEST 4: Air Pollution Data (Free API)');
  console.log('-'.repeat(80));
  
  const url = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${testLat}&lon=${testLon}&appid=${API_KEY}`;
  
  try {
    const data = await httpsGet(url);
    const aqi = data.list[0];
    
    console.log('✅ Success! Response received');
    console.log();
    console.log('Air Quality Data:');
    
    const aqiLevels = ['Good', 'Fair', 'Moderate', 'Poor', 'Very Poor'];
    console.log(`  🌫️  Air Quality Index: ${aqi.main.aqi} (${aqiLevels[aqi.main.aqi - 1]})`);
    console.log(`  Components (μg/m³):`);
    console.log(`    • CO (Carbon monoxide): ${aqi.components.co}`);
    console.log(`    • NO (Nitrogen monoxide): ${aqi.components.no}`);
    console.log(`    • NO₂ (Nitrogen dioxide): ${aqi.components.no2}`);
    console.log(`    • O₃ (Ozone): ${aqi.components.o3}`);
    console.log(`    • SO₂ (Sulphur dioxide): ${aqi.components.so2}`);
    console.log(`    • PM2.5: ${aqi.components.pm2_5}`);
    console.log(`    • PM10: ${aqi.components.pm10}`);
    console.log(`    • NH₃ (Ammonia): ${aqi.components.nh3}`);
    console.log();
    
    return aqi;
  } catch (error) {
    console.log('❌ Error:', error.message);
    console.log();
    throw error;
  }
}

/**
 * Test 5: Multiple Indian Cities
 */
async function testMultipleLocations() {
  console.log('📊 TEST 5: Multiple Indian Cities');
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
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${city.lat}&lon=${city.lon}&appid=${API_KEY}&units=metric`;
    
    try {
      const data = await httpsGet(url);
      console.log(`  ✅ ${city.name.padEnd(12)}: ${data.main.temp}°C - ${data.weather[0].description}`);
      await new Promise(resolve => setTimeout(resolve, 200)); // Rate limit delay
    } catch (error) {
      console.log(`  ❌ ${city.name.padEnd(12)}: Error - ${error.message}`);
    }
  }
  
  console.log();
}

/**
 * Run all tests
 */
async function runAllTests() {
  try {
    // Try One Call API 3.0 first (paid)
    try {
      await testCurrentWeather();
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      if (error.message.includes('401') || error.message.includes('404')) {
        console.log('ℹ️  One Call API 3.0 not available (requires paid plan)');
        console.log('   Continuing with free APIs...');
        console.log();
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        throw error;
      }
    }
    
    // Free APIs
    await testCurrentWeatherFree();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await testForecast();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await testAirPollution();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await testMultipleLocations();
    
    console.log('='.repeat(80));
    console.log('✅ Tests completed!');
    console.log('='.repeat(80));
    console.log();
    console.log('📝 OpenWeatherMap API Notes:');
    console.log();
    console.log('FREE TIER INCLUDES:');
    console.log('  ✅ Current weather data');
    console.log('  ✅ 5-day forecast (3-hour intervals)');
    console.log('  ✅ Air pollution data');
    console.log('  ✅ 60 calls/minute, 1,000,000 calls/month');
    console.log();
    console.log('PAID TIERS INCLUDE:');
    console.log('  💰 One Call API 3.0 (hourly forecast, 8-day daily, alerts)');
    console.log('  💰 16-day daily forecast');
    console.log('  💰 Historical weather data');
    console.log('  💰 Weather maps and satellite imagery');
    console.log();
    console.log('PRICING:');
    console.log('  • Free: $0/month');
    console.log('  • Startup: $40/month (100,000 calls/day)');
    console.log('  • Developer: $170/month (1,000,000 calls/day)');
    console.log();
    console.log('🔗 More info: https://openweathermap.org/price');
    console.log();
    
  } catch (error) {
    console.log('='.repeat(80));
    console.log('❌ Tests failed');
    console.log('='.repeat(80));
    console.log();
    
    if (error.message.includes('401')) {
      console.log('TROUBLESHOOTING:');
      console.log('  1. Verify your API key at: https://home.openweathermap.org/api_keys');
      console.log('  2. Wait 10-15 minutes after creating a new key');
      console.log('  3. Make sure you copied the entire key');
      console.log('  4. Check if your account is active');
      console.log();
    }
    
    process.exit(1);
  }
}

// Run the tests
runAllTests();

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import NDVIHeatmapCard from '../components/NDVIHeatmapCard';

const FieldAnalytics = () => {
  const { fieldId } = useParams();
  const navigate = useNavigate();
  const [field, setField] = useState(null);
  const [ndviData, setNdviData] = useState(null);
  const [timeSeries, setTimeSeries] = useState(null);
  const [user] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [loading, setLoading] = useState(true);
  const [ndviLoading, setNdviLoading] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const fetchFieldData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE_URL}/api/farms/${fieldId}`);
        if (!response.ok) throw new Error('Failed to fetch field data');
        const data = await response.json();
        if (data.success) {
          setField(data.farm);
          // Fetch real-time NDVI data if we have boundary coordinates
          if (data.farm.boundaryCoordinates) {
            await fetchNDVIData(data.farm.boundaryCoordinates, fieldId);
          }
        }
      } catch (error) {
        console.error('Error fetching field:', error);
      } finally {
        setLoading(false);
      }
    };

    if (fieldId) {
      fetchFieldData();
    }
  }, [fieldId, API_BASE_URL, user, navigate]);

  const fetchNDVIData = async (coordinates, fId) => {
    try {
      setNdviLoading(true);
      console.log('Fetching NDVI data for coordinates:', coordinates);

      // Fetch current NDVI value
      const ndviResponse = await fetch(`${API_BASE_URL}/api/ndvi/calculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          coordinates: coordinates,
          fieldId: fId,
        }),
      });

      if (ndviResponse.ok) {
        const ndviResult = await ndviResponse.json();
        console.log('NDVI Result:', ndviResult);
        setNdviData(ndviResult);
      }

      // Fetch time series data for the last 180 days
      const timeSeriesResponse = await fetch(`${API_BASE_URL}/api/ndvi/timeseries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          coordinates: coordinates,
          days: 180,
          fieldId: fId,
        }),
      });

      if (timeSeriesResponse.ok) {
        const timeSeriesResult = await timeSeriesResponse.json();
        console.log('Time Series Result:', timeSeriesResult);
        setTimeSeries(timeSeriesResult);
      }
    } catch (error) {
      console.error('Error fetching NDVI data:', error);
    } finally {
      setNdviLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-surface font-body">
        <Sidebar onLogout={handleLogout} />
        <div className="ml-72 w-[calc(100%-18rem)]">
          <Header user={user} />
          <main className="pt-24 px-8 pb-12 flex items-center justify-center h-screen">
            <div className="flex flex-col items-center">
              <div className="animate-spin mb-4">
                <span className="material-symbols-outlined text-6xl text-primary">cloud_download</span>
              </div>
              <h3 className="text-xl font-headline font-bold text-on-surface">Loading field data...</h3>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!field) {
    return (
      <div className="flex min-h-screen bg-surface font-body">
        <Sidebar onLogout={handleLogout} />
        <div className="ml-72 w-[calc(100%-18rem)]">
          <Header user={user} />
          <main className="pt-24 px-8 pb-12">
            <div className="flex flex-col items-center justify-center py-24">
              <span className="material-symbols-outlined text-6xl text-error mb-4">error_outline</span>
              <h3 className="text-xl font-headline font-bold text-on-surface mb-2">Field not found</h3>
              <button
                onClick={() => navigate('/saved-fields')}
                className="px-6 py-2 bg-primary text-white rounded-full font-semibold hover:shadow-lg transition-shadow"
              >
                Back to Fields
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const ndviValue = ndviData?.ndvi ? ndviData.ndvi.toFixed(2) : field?.ndviValue ? field.ndviValue.toFixed(2) : '0.84';
  const healthStatus = ndviData?.health || field?.healthStatus || 'Excellent';
  const harvestDate = field?.harvestDate || 'Jun 15';
  const expectedYield = field?.expectedYield || '+12%';
  const soilMoisture = field?.soilMoisture || '42%';
  const nitrogenLevel = field?.nitrogenLevel || 'High';
  const temperature = field?.temperature || '24°C';
  const humidity = field?.humidity || '65%';
  const coverage = field?.coverage || '142.5';

  return (
    <div className="flex min-h-screen bg-surface font-body">
      <Sidebar onLogout={handleLogout} />

      <div className="ml-72 w-[calc(100%-18rem)] overflow-y-auto">
        <Header user={user} />

        <main className="pt-24 px-8 pb-12">
          {/* Field Header Section */}
          <section className="mb-10">
            <nav className="flex items-center gap-2 text-xs font-semibold text-primary/60 uppercase tracking-widest mb-2">
              <span>Sectors</span>
              <span className="material-symbols-outlined text-[10px]">chevron_right</span>
              <span className="text-primary">{field?.name || 'Field'}</span>
            </nav>
            <h1 className="text-5xl font-extrabold text-primary tracking-tight mb-2 font-headline">
              {field?.name || 'Field Analytics'}
            </h1>
            <div className="flex items-center gap-4 flex-wrap">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary-fixed text-on-primary-fixed rounded-full text-sm font-bold">
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                  grass
                </span>
                {field?.cropType || 'Wheat (Triticum aestivum)'}
              </span>
              {field?.latitude && field?.longitude && (
                <span className="text-on-surface-variant font-medium flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">location_on</span>
                  {field.latitude.toFixed(3)}°N, {field.longitude.toFixed(3)}°W
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-6">
              <button className="px-6 py-3 bg-white text-primary border border-outline-variant/20 rounded-full font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-2">
                <span className="material-symbols-outlined">file_download</span>
                Export Report
              </button>
              <button
                onClick={() => field?.boundaryCoordinates && fetchNDVIData(field.boundaryCoordinates, fieldId)}
                disabled={ndviLoading || !field?.boundaryCoordinates}
                className="px-6 py-3 bg-white text-primary border border-outline-variant/20 rounded-full font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined">refresh</span>
                {ndviLoading ? 'Refreshing...' : 'Refresh Data'}
              </button>
              <button className="px-6 py-3 bg-gradient-to-br from-[#004a31] to-[#2b5bb5] text-white rounded-full font-bold shadow-lg hover:opacity-90 transition-all flex items-center gap-2">
                <span className="material-symbols-outlined">rocket_launch</span>
                Dispatch Drone
              </button>
            </div>
          </section>

          {/* Main Bento Grid */}
          <div className="grid grid-cols-12 gap-6">
            {/* Health Overview Card */}
            <div className="col-span-12 lg:col-span-4 bg-surface-container-lowest rounded-xl p-8 shadow-[0px_24px_48px_rgba(26,28,25,0.06)] flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -mr-8 -mt-8"></div>
              <div>
                <div className="flex justify-between items-start mb-6">
                  <h3 className="text-sm font-bold text-on-surface-variant/60 uppercase tracking-wider">
                    Health Overview
                  </h3>
                  {ndviLoading ? (
                    <div className="animate-pulse">
                      <span className="flex items-center gap-1.5 px-3 py-1 bg-surface-container-high rounded-full text-xs font-black">
                        <span className="w-2 h-2 rounded-full bg-outline-variant animate-pulse"></span>
                        Fetching...
                      </span>
                    </div>
                  ) : (
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-primary-fixed-dim text-on-primary-fixed rounded-full text-xs font-black">
                      <span className="w-2 h-2 rounded-full bg-on-primary-fixed animate-pulse"></span>
                      {healthStatus}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  {ndviLoading ? (
                    <div className="animate-pulse flex items-baseline gap-2">
                      <span className="text-6xl font-black text-on-surface-variant/30">–</span>
                      <span className="text-lg font-bold text-on-surface-variant/30">NDVI</span>
                    </div>
                  ) : (
                    <>
                      <span className="text-6xl font-black text-primary tracking-tighter">{ndviValue}</span>
                      <span className="text-lg font-bold text-on-primary-container">NDVI</span>
                    </>
                  )}
                </div>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  {ndviData?.error
                    ? 'Unable to fetch real-time NDVI data. Please ensure satellite service is running.'
                    : ndviData?.success === false
                    ? 'Real-time NDVI data not available yet.'
                    : `Top 5% of regional ${field?.cropType || 'wheat'} fields. Vegetation density is optimal for the current growth stage.`}
                </p>
              </div>
              <div className="mt-8 pt-6 border-t border-outline-variant/10">
                <div className="flex justify-between items-end">
                  <div>
                    <span className="text-xs font-bold text-on-surface-variant/50">30-Day Trend</span>
                    <div className="flex items-center gap-1 text-primary-container font-bold">
                      <span className="material-symbols-outlined text-sm">trending_up</span>
                      +4.2%
                    </div>
                  </div>
                  {/* Mock Sparkline */}
                  <div className="flex items-end gap-1 h-12">
                    <div className="w-1 bg-primary/10 rounded-full h-4"></div>
                    <div className="w-1 bg-primary/10 rounded-full h-6"></div>
                    <div className="w-1 bg-primary/20 rounded-full h-5"></div>
                    <div className="w-1 bg-primary/30 rounded-full h-8"></div>
                    <div className="w-1 bg-primary/40 rounded-full h-10"></div>
                    <div className="w-1 bg-primary/60 rounded-full h-9"></div>
                    <div className="w-1 bg-primary/80 rounded-full h-11"></div>
                    <div className="w-1 bg-primary rounded-full h-12"></div>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Growth Prediction Card */}
            <div className="col-span-12 lg:col-span-8 bg-gradient-to-br from-[#004a31] to-[#2b5bb5] rounded-xl p-8 text-white relative overflow-hidden flex items-center">
              <div className="absolute inset-0 opacity-20 pointer-events-none">
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                  <path
                    d="M0 50 Q 25 30 50 50 T 100 50"
                    fill="transparent"
                    stroke="white"
                    strokeWidth="0.5"
                  ></path>
                  <path
                    d="M0 60 Q 25 40 50 60 T 100 60"
                    fill="transparent"
                    stroke="white"
                    strokeWidth="0.5"
                  ></path>
                </svg>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 w-full gap-12 relative z-10">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold uppercase tracking-wider">
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                      auto_awesome
                    </span>
                    AI Growth Prediction
                  </div>
                  <h2 className="text-4xl font-bold leading-tight font-headline">
                    Harvest projected in 42 days.
                  </h2>
                  <p className="text-white/80 text-sm max-w-sm leading-relaxed">
                    Based on satellite telemetry and soil moisture models, we anticipate a high-density yield
                    exceeding regional averages.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10">
                    <span className="text-white/60 text-xs font-bold uppercase block mb-1">Expected Yield</span>
                    <span className="text-3xl font-black">{expectedYield}</span>
                    <p className="text-[10px] text-white/50 mt-1">vs Last Season</p>
                  </div>
                  <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/10">
                    <span className="text-white/60 text-xs font-bold uppercase block mb-1">Harvest Date</span>
                    <span className="text-3xl font-black">{harvestDate}</span>
                    <p className="text-[10px] text-white/50 mt-1">Confidence: High</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Large NDVI Chart */}
            <div className="col-span-12 lg:col-span-9 bg-surface-container-lowest rounded-xl p-8 shadow-[0px_24px_48px_rgba(26,28,25,0.06)]">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-xl font-bold text-primary font-headline">6-Month NDVI Analytics</h3>
                  <p className="text-sm text-on-surface-variant">Long-term spectral reflectance monitoring</p>
                </div>
                <div className="flex gap-2 bg-surface-container-low p-1 rounded-full">
                  <button className="px-4 py-1.5 text-xs font-bold rounded-full hover:bg-white transition-all">
                    1M
                  </button>
                  <button className="px-4 py-1.5 text-xs font-bold rounded-full bg-white shadow-sm">6M</button>
                  <button className="px-4 py-1.5 text-xs font-bold rounded-full hover:bg-white transition-all">
                    1Y
                  </button>
                </div>
              </div>

              {/* Mock Chart Visualization */}
              <div className="relative h-[300px] w-full mt-10">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 1000 300">
                  {/* Grid lines */}
                  <line stroke="#e8e8e3" strokeDasharray="4" x1="0" x2="1000" y1="50" y2="50"></line>
                  <line stroke="#e8e8e3" strokeDasharray="4" x1="0" x2="1000" y1="150" y2="150"></line>
                  <line stroke="#e8e8e3" strokeDasharray="4" x1="0" x2="1000" y1="250" y2="250"></line>
                  {/* Main Path */}
                  <path
                    d="M 0 250 Q 150 200 250 220 T 450 120 T 700 80 T 1000 60"
                    fill="none"
                    stroke="#004a31"
                    strokeLinecap="round"
                    strokeWidth="4"
                  ></path>
                  {/* Annotation 1 */}
                  <g transform="translate(450, 120)">
                    <circle fill="#2b5bb5" r="6" stroke="white" strokeWidth="2"></circle>
                    <foreignObject height="50" width="100" x="-50" y="-60">
                      <div className="bg-secondary text-white text-[10px] p-2 rounded-lg text-center shadow-lg font-bold">
                        Irrigation Cycle
                      </div>
                    </foreignObject>
                    <line opacity="0.5" stroke="#2b5bb5" strokeDasharray="2" x1="0" x2="0" y1="0" y2="130"></line>
                  </g>
                  {/* Annotation 2 */}
                  <g transform="translate(700, 80)">
                    <circle fill="#004a31" r="6" stroke="white" strokeWidth="2"></circle>
                    <foreignObject height="50" width="120" x="-60" y="-60">
                      <div className="bg-primary text-white text-[10px] p-2 rounded-lg text-center shadow-lg font-bold">
                        Organic Nitrogen
                      </div>
                    </foreignObject>
                    <line opacity="0.5" stroke="#004a31" strokeDasharray="2" x1="0" x2="0" y1="0" y2="170"></line>
                  </g>
                </svg>
                {/* Y-Axis Labels */}
                <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[10px] font-bold text-on-surface-variant/40 py-2 -ml-8">
                  <span>1.0</span>
                  <span>0.5</span>
                  <span>0.0</span>
                </div>
              </div>

              {/* X-Axis Labels */}
              <div className="flex justify-between text-xs font-bold text-on-surface-variant/40 mt-6 px-4">
                <span>JAN</span>
                <span>FEB</span>
                <span>MAR</span>
                <span>APR</span>
                <span>MAY</span>
                <span>JUN</span>
              </div>
            </div>

            {/* Mini Map Card */}
            <NDVIHeatmapCard field={field} ndviData={ndviData} />

            {/* Metrics Row */}
            <div className="col-span-12 grid grid-cols-2 md:grid-cols-4 gap-6">
              {/* Moisture */}
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_24px_48px_rgba(26,28,25,0.06)] flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-secondary-fixed flex items-center justify-center text-on-secondary-fixed">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    water_drop
                  </span>
                </div>
                <div>
                  <span className="text-xs font-bold text-on-surface-variant opacity-60">Soil Moisture</span>
                  <div className="text-2xl font-black text-primary">{soilMoisture}</div>
                </div>
              </div>

              {/* Nitrogen */}
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_24px_48px_rgba(26,28,25,0.06)] flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary-fixed flex items-center justify-center text-on-primary-fixed">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    science
                  </span>
                </div>
                <div>
                  <span className="text-xs font-bold text-on-surface-variant opacity-60">Nitrogen Level</span>
                  <div className="text-2xl font-black text-primary">{nitrogenLevel}</div>
                </div>
              </div>

              {/* Temperature */}
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_24px_48px_rgba(26,28,25,0.06)] flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    thermostat
                  </span>
                </div>
                <div>
                  <span className="text-xs font-bold text-on-surface-variant opacity-60">Temperature</span>
                  <div className="text-2xl font-black text-primary">{temperature}</div>
                </div>
              </div>

              {/* Humidity */}
              <div className="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_24px_48px_rgba(26,28,25,0.06)] flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    cloudy_snowing
                  </span>
                </div>
                <div>
                  <span className="text-xs font-bold text-on-surface-variant opacity-60">Humidity</span>
                  <div className="text-2xl font-black text-primary">{humidity}</div>
                </div>
              </div>
            </div>

            {/* Actionable Insights */}
            <div className="col-span-12">
              <div className="flex items-center gap-4 mb-6">
                <h2 className="text-2xl font-bold text-primary font-headline">AI Actionable Insights</h2>
                <div className="h-[1px] flex-1 bg-outline-variant/30"></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Insight 1 */}
                <div className="bg-surface-container-low p-6 rounded-xl flex items-start gap-4 border border-transparent hover:border-primary/20 transition-all cursor-pointer">
                  <div className="bg-white p-3 rounded-2xl shadow-sm text-secondary">
                    <span className="material-symbols-outlined">calendar_clock</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-bold text-primary">Schedule irrigation for Tuesday</h4>
                      <span className="text-[10px] font-black px-2 py-0.5 bg-secondary/10 text-secondary rounded-full">
                        PRIORITY
                      </span>
                    </div>
                    <p className="text-sm text-on-surface-variant leading-relaxed">
                      Soil moisture in the deeper root zones is trending below 38%. A 4-hour cycle is recommended
                      before the Wednesday heat spike.
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-outline/30 ml-auto self-center">
                    chevron_right
                  </span>
                </div>

                {/* Insight 2 */}
                <div className="bg-surface-container-low p-6 rounded-xl flex items-start gap-4 border border-transparent hover:border-error/20 transition-all cursor-pointer">
                  <div className="bg-white p-3 rounded-2xl shadow-sm text-error">
                    <span className="material-symbols-outlined">scan_delete</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-bold text-primary">Monitor for Early Rust</h4>
                      <span className="text-[10px] font-black px-2 py-0.5 bg-error/10 text-error rounded-full">
                        ALERT
                      </span>
                    </div>
                    <p className="text-sm text-on-surface-variant leading-relaxed">
                      Spectral anomalies detected in Sector 3. Discoloration matches signatures of early-stage wheat
                      rust. Drone scan recommended.
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-outline/30 ml-auto self-center">
                    chevron_right
                  </span>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default FieldAnalytics;

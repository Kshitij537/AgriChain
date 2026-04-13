import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';

const Dashboard = () => {
  const navigate = useNavigate();
  const [user] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  if (!user) {
    navigate('/login');
    return null;
  }

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-surface font-body">
      {/* Sidebar */}
      <Sidebar onLogout={handleLogout} />

      {/* Main Content */}
      <div className="ml-72 w-[calc(100%-18rem)]">
        {/* Top Header */}
        <Header user={user} />

        {/* Main Content Area */}
        <main className="pt-24 px-8 pb-12">
          
          {/* Stats Overview */}
          <section className="grid grid-cols-4 gap-6 mb-10">
            <StatCard icon="landscape" label="Total Area" value="12,450 Acres" variant="+2.4%" />
            <StatCard icon="agriculture" label="Active Farms" value="8 Districts" variant="All Sync" />
            <StatCard icon="health_metrics" label="Average Health" value="92% Index" variant="AI Pulse" />
            <StatCard icon="sunny" label="Weather" value="Sunny, 28°C" variant="No Rain" />
          </section>

          {/* Satellite & Farm Status */}
          <div className="grid grid-cols-12 gap-8 mb-10">
            {/* NDVI Section */}
            <section className="col-span-8 bg-surface-container-lowest rounded-lg overflow-hidden shadow-md border border-outline-variant/10 relative">
              <div className="absolute top-6 left-6 z-10 bg-white/90 backdrop-blur p-4 rounded-2xl shadow-lg border border-outline-variant/10">
                <h3 className="font-headline font-bold text-lg text-primary">NDVI Satellite Monitoring</h3>
                <p className="text-xs text-on-surface-variant font-body">North Sector 4 - Maize Plantation</p>
                <div className="mt-4 flex items-center gap-4">
                  <div className="flex flex-col">
                    <span className="text-xs uppercase font-bold text-on-surface-variant/60 font-body">Current NDVI</span>
                    <span className="text-xl font-headline font-extrabold text-primary">0.84</span>
                  </div>
                  <div className="h-8 w-px bg-outline-variant/30"></div>
                  <div className="flex flex-col">
                    <span className="text-xs uppercase font-bold text-on-surface-variant/60 font-body">30D Trend</span>
                    <span className="text-xl font-headline font-extrabold text-on-primary-container">+12%</span>
                  </div>
                </div>
              </div>

              <div className="absolute top-6 right-6 z-10 bg-error-container text-on-error-container px-4 py-2 rounded-full flex items-center gap-2 text-sm font-headline font-bold shadow-xl border border-error/20">
                <span className="material-symbols-outlined text-lg">warning</span>
                Anomaly Detected in Zone B
              </div>

              <div className="h-96 w-full bg-gradient-to-b from-gray-200 to-gray-300 relative">
                <img 
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuCOqeKSWytnrHhUn_E7Xx1QNFADN8XWGbSdILOgb6Ov8Pm-34-1zdBPu0jFcOOmtQC32HAFWGCOqW2rvfYgaSClupVCXxlWHWwC1QnHlGy0oKM7Oi5PecTF2zHZmGUcbw6TgzX7Rosw5aWEXemCD_8zDv5EmTj5s46ZMBsC2m8e4p8nHkmaEt4pinOtOZi0wk13qCGfZdvBNYAOh7WbJ6M3AtIXptcFTAsvRfUjQ0LQc5cET9wR7gFQbLm1PNXLZPQy2EI0uLcEJaA"
                  alt="Satellite farm view"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>
              </div>

              {/* Footer Stats */}
              <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end gap-4 px-6">
                <div className="flex gap-2">
                  <button className="bg-white/90 backdrop-blur px-4 py-2 rounded-full text-xs font-headline font-bold text-primary shadow-lg hover:shadow-xl transition-shadow">Visible Light</button>
                  <button className="bg-gradient-to-br from-primary to-secondary px-4 py-2 rounded-full text-xs font-headline font-bold text-white shadow-lg hover:shadow-xl transition-shadow">NDVI Index</button>
                  <button className="bg-white/90 backdrop-blur px-4 py-2 rounded-full text-xs font-headline font-bold text-primary shadow-lg hover:shadow-xl transition-shadow">Soil Moisture</button>
                </div>
                <div className="bg-white/90 backdrop-blur p-4 rounded-2xl shadow-lg border border-outline-variant/10 w-64">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-headline font-bold uppercase text-on-surface-variant">30-Day Health Index</span>
                    <span className="text-xs text-primary font-headline font-bold">Stable</span>
                  </div>
                  <div className="flex items-end gap-1 h-12">
                    {[40, 50, 45, 60, 80, 90, 85, 95].map((height, i) => (
                      <div key={i} className={`flex-1 rounded-t-sm ${i < 4 ? 'bg-primary-container' : 'bg-primary'} h-[${height}%]`} style={{height: `${height}%`}}></div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Farm Status List */}
            <section className="col-span-4 bg-surface-container-low rounded-lg p-6 shadow-md border border-outline-variant/10">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-headline font-bold text-lg text-primary">Farm Status</h3>
                <button className="text-secondary text-sm font-body font-semibold hover:underline">View All</button>
              </div>
              <div className="space-y-4">
                <FarmItem name="Oak Ridge North" crop="Soybean • 1,200 ac" status="Optimal" percentage={94} />
                <FarmItem name="River Valley Basin" crop="Wheat • 850 ac" status="Warning" percentage={68} />
                <FarmItem name="Crescent Plains" crop="Corn • 2,400 ac" status="Critical" percentage={42} />
                <FarmItem name="Green Hills East" crop="Barley • 1,100 ac" status="Optimal" percentage={88} />
              </div>
            </section>
          </div>

          {/* Disease & Spoilage Section */}
          <div className="grid grid-cols-2 gap-8 mb-10">
            <section className="bg-surface-container-lowest rounded-lg p-8 shadow-md border border-outline-variant/10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-primary-fixed/20 rounded-2xl flex items-center justify-center text-primary font-body">
                  <span className="material-symbols-outlined">magnification_small</span>
                </div>
                <div>
                  <h3 className="font-headline font-bold text-xl text-primary">Disease Diagnosis</h3>
                  <p className="text-sm text-on-surface-variant font-body">AI-Powered Leaf Pathology</p>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-4">
                <div className="col-span-2 border-2 border-dashed border-outline-variant/40 rounded-2xl h-44 flex flex-col items-center justify-center bg-surface-container hover:bg-surface-container-high transition-colors cursor-pointer font-body">
                  <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 hover:text-primary transition-colors">add_a_photo</span>
                  <p className="text-xs font-headline font-bold uppercase mt-2 text-on-surface-variant/60">Upload Leaf</p>
                </div>
                <div className="col-span-3 bg-surface-container-low p-4 rounded-2xl border border-primary/10">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="bg-error text-white text-xs font-headline font-bold px-2 py-1 rounded-full uppercase">Last Analysis</span>
                    <span className="text-xs text-on-surface-variant font-body">2h ago</span>
                  </div>
                  <p className="text-sm font-headline font-bold text-primary mb-1">Powdery Mildew Detected</p>
                  <p className="text-xs text-on-surface-variant font-body leading-relaxed">Affected: Sector 3, Zone D. Recommend immediate fungicide application within 48h to prevent 15% yield loss.</p>
                  <button className="mt-4 text-xs font-headline font-bold text-secondary flex items-center gap-1 hover:gap-2 transition-all">
                    View Action Plan <span className="material-symbols-outlined text-xs">arrow_forward</span>
                  </button>
                </div>
              </div>
            </section>

            <section className="bg-surface-container-lowest rounded-lg p-8 shadow-md border border-outline-variant/10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-secondary-fixed/20 rounded-2xl flex items-center justify-center text-secondary font-body">
                  <span className="material-symbols-outlined">warning</span>
                </div>
                <div>
                  <h3 className="font-headline font-bold text-xl text-primary">Spoilage Risk</h3>
                  <p className="text-sm text-on-surface-variant font-body">Post-Harvest Longevity Forecast</p>
                </div>
              </div>
              <div className="flex gap-8 items-center">
                <div className="relative w-32 h-32 flex items-center justify-center flex-shrink-0">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle className="text-surface-container-highest" cx="64" cy="64" fill="transparent" r="56" stroke="currentColor" strokeWidth="8"></circle>
                    <circle className="text-on-primary-container" cx="64" cy="64" fill="transparent" r="56" stroke="currentColor" strokeDasharray="351.8" strokeDashoffset="280" strokeWidth="8"></circle>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-headline font-extrabold text-primary">Low</span>
                    <span className="text-xs font-headline font-bold uppercase text-on-surface-variant">Risk</span>
                  </div>
                </div>
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-on-primary-container">calendar_month</span>
                    <div className="font-body">
                      <p className="text-xs uppercase font-bold text-on-surface-variant/60">Maturity Forecast</p>
                      <p className="text-sm font-headline font-bold text-primary">Harvest in 12 days</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-on-primary-container">thermostat</span>
                    <div className="font-body">
                      <p className="text-xs uppercase font-bold text-on-surface-variant/60">Storage Env.</p>
                      <p className="text-sm font-headline font-bold text-primary">Optimal (14°C - 60% RH)</p>
                    </div>
                  </div>
                  <button className="w-full bg-surface-container-high py-2 rounded-xl text-xs font-headline font-bold text-primary hover:bg-surface-container-highest transition-colors">Generate Forecast PDF</button>
                </div>
              </div>
            </section>
          </div>

          {/* Market & Recommendations */}
          <div className="grid grid-cols-12 gap-8">
            <section className="col-span-7 bg-surface-container-lowest rounded-lg p-8 shadow-md border border-outline-variant/10">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="font-headline font-bold text-xl text-primary">Market Intelligence</h3>
                  <p className="text-sm text-on-surface-variant font-body">Real-time commodity price index</p>
                </div>
                <div className="flex bg-surface-container rounded-full p-1 font-body">
                  <button className="px-4 py-1.5 rounded-full text-xs font-headline font-bold bg-white shadow-sm text-primary">Wheat</button>
                  <button className="px-4 py-1.5 rounded-full text-xs font-headline font-bold text-on-surface-variant">Corn</button>
                  <button className="px-4 py-1.5 rounded-full text-xs font-headline font-bold text-on-surface-variant">Soy</button>
                </div>
              </div>
              <div className="h-48 flex items-end gap-3 mb-6">
                {[60, 65, 75, 70, 85, 95, 100].map((height, i) => (
                  <div key={i} className={`flex-1 rounded-t-lg hover:opacity-90 transition-colors cursor-help ${i >= 4 ? i === 4 ? 'bg-secondary' : i === 5 ? 'bg-primary' : 'bg-gradient-to-br from-primary to-secondary' : 'bg-surface-container-low'}`} style={{height: `${height}%`}}></div>
                ))}
              </div>
              <div className="bg-primary-fixed/20 p-4 rounded-2xl flex items-center justify-between font-body">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-on-primary-fixed-variant">trending_up</span>
                  <p className="text-sm font-headline font-bold text-primary">Best Selling Point: <span className="text-secondary">Mandi - Sector 7</span></p>
                </div>
                <span className="text-on-primary-container font-headline font-extrabold">+4% Price</span>
              </div>
            </section>

            <section className="col-span-5 bg-surface-container-low rounded-lg p-8 border border-outline-variant/10">
              <h3 className="font-headline font-bold text-xl text-primary mb-6">Smart Recommendations</h3>
              <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                <RecommendationCard icon="water_drop" label="Irrigation" title="Optimize irrigation for 5 PM rain" desc="Sensor detected incoming front. Saving 4k liters." color="border-primary" />
                <RecommendationCard icon="science" label="Fertilizer" title="Increase Nitrogen in North Field" desc="Soil analysis shows 12% deficit in Zone B." color="border-secondary" />
                <RecommendationCard icon="sync" label="Crop Rotation" title="Rotate Soybeans next cycle" desc="Best yield potential based on 3yr soil rest." color="border-on-tertiary-container" />
              </div>
              <button className="w-full mt-6 flex items-center justify-center gap-2 text-primary font-headline font-bold text-sm hover:opacity-70 transition-opacity">
                Load More Actions <span className="material-symbols-outlined text-lg">expand_more</span>
              </button>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
};

const StatCard = ({ icon, label, value, variant }) => (
  <div className="bg-surface-container-lowest p-6 rounded-lg shadow-md border border-outline-variant/10 flex flex-col justify-between h-40 group hover:translate-y-[-4px] transition-all font-body">
    <div className="flex justify-between items-start">
      <span className="material-symbols-outlined text-primary bg-primary-fixed/30 p-3 rounded-2xl">{icon}</span>
      <span className="text-xs font-headline font-bold text-on-primary-container bg-primary-fixed/20 px-2 py-1 rounded-full">{variant}</span>
    </div>
    <div>
      <p className="text-on-surface-variant text-xs font-headline font-medium uppercase tracking-tight">{label}</p>
      <p className="text-2xl font-headline font-extrabold text-primary">{value}</p>
    </div>
  </div>
);

const FarmItem = ({ name, crop, status, percentage }) => {
  const statusColors = {
    Optimal: 'bg-green-100 text-green-700',
    Warning: 'bg-yellow-100 text-yellow-700',
    Critical: 'bg-red-100 text-red-700'
  };

  const barColors = {
    Optimal: 'bg-green-600',
    Warning: 'bg-yellow-500',
    Critical: 'bg-error'
  };

  return (
    <div className="bg-surface-container-lowest p-4 rounded-xl border border-transparent hover:border-primary/20 transition-all font-body">
      <div className="flex justify-between items-start mb-2">
        <div>
          <h4 className="font-headline font-bold text-primary">{name}</h4>
          <p className="text-xs text-on-surface-variant">{crop}</p>
        </div>
        <span className={`text-xs font-headline font-bold px-2 py-1 rounded-full uppercase ${statusColors[status]}`}>{status}</span>
      </div>
      <div className="flex items-center justify-between mt-4">
        <div className="w-full bg-surface-container-highest h-1.5 rounded-full mr-4">
          <div className={`h-1.5 rounded-full ${barColors[status]}`} style={{width: `${percentage}%`}}></div>
        </div>
        <span className="text-xs font-headline font-bold text-primary">{percentage}</span>
      </div>
    </div>
  );
};

const RecommendationCard = ({ icon, label, title, desc, color }) => (
  <div className={`bg-surface-container-lowest p-5 rounded-2xl shadow-sm border-l-4 ${color}`}>
    <div className="flex items-center gap-3 mb-2">
      <span className={`material-symbols-outlined text-${color.split('-')[1]} text-sm`}>{icon}</span>
      <span className="text-xs font-headline font-bold uppercase text-on-surface-variant">{label}</span>
    </div>
    <p className="text-sm font-headline font-semibold text-primary">{title}</p>
    <p className="text-xs text-on-surface-variant mt-1 font-body">{desc}</p>
  </div>
);

export default Dashboard;

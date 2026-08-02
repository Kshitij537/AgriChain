import React from 'react';

const DashboardSection = () => {
  return (
    <section className="py-12 px-10">
      <div className="max-w-7xl mx-auto">
        <div className="glass-card rounded-xl overflow-hidden border-white/5 shadow-2xl animate-fade-in-up">
          {/* Mock Browser Top */}
          <div className="bg-white/5 px-3 py-2 flex justify-between items-center border-b border-white/5">
            <div className="flex gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500/50"></div>
              <div className="w-2 h-2 rounded-full bg-amber-500/50"></div>
              <div className="w-2 h-2 rounded-full bg-emerald-500/50"></div>
            </div>
            <div className="text-[10px] font-headline font-bold text-white/30 tracking-widest uppercase">
              System Control Panel // Node 04-B
            </div>
            <div className="w-8"></div>
          </div>

          <div className="flex flex-col lg:flex-row min-h-[455px] max-h-[546px]">
            {/* Left Panel: Sidebar Nav */}
            <div className="w-full lg:w-72 bg-white/5 border-r border-white/5 p-5 space-y-5">
              <div className="space-y-3">
                <div className="p-3 bg-emerald-400/10 rounded-lg text-emerald-400 flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-base">dashboard</span>
                  <span className="text-xs font-bold uppercase tracking-wider">Dashboard</span>
                </div>
                <div className="p-3 text-white/40 flex items-center gap-2.5 hover:text-white transition-colors cursor-pointer">
                  <span className="material-symbols-outlined text-base">map</span>
                  <span className="text-xs font-bold uppercase tracking-wider">Fleet Map</span>
                </div>
                <div className="p-3 text-white/40 flex items-center gap-2.5 hover:text-white transition-colors cursor-pointer">
                  <span className="material-symbols-outlined text-base">query_stats</span>
                  <span className="text-xs font-bold uppercase tracking-wider">Analytics</span>
                </div>
              </div>
              <div className="pt-4 border-t border-white/5">
                <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.2em] mb-3">AI Alerts</p>
                <div className="space-y-2.5">
                  <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-[9px] text-red-400 font-bold mb-1">CRITICAL</p>
                    <p className="text-xs text-white/70">Possible Rust detected in Sector 3</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-[9px] text-amber-400 font-bold mb-1">WARNING</p>
                    <p className="text-xs text-white/70">Irrigation cycle delayed in Area 4</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Preview: 3D Map Area */}
            <div className="flex-grow relative bg-neutral-950 p-7 flex flex-col max-h-[468px]">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h5 className="text-3xl font-headline font-bold text-white">Field Overview</h5>
                  <p className="text-white/40 text-sm">Central Valley District • Sector 04-B</p>
                </div>
                <div className="flex gap-4">
                  <div className="bg-white/5 p-4 rounded-lg text-center">
                    <p className="text-xs text-white/40 uppercase font-bold mb-1.5">Temp</p>
                    <p className="text-2xl font-bold text-white">24.2°C</p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-lg text-center">
                    <p className="text-xs text-white/40 uppercase font-bold mb-1.5">Moisture</p>
                    <p className="text-2xl font-bold text-white">62%</p>
                  </div>
                </div>
              </div>

              {/* Map Image */}
              <div className="flex-grow rounded-lg overflow-hidden relative group h-[364px]">
                <img 
                  className="w-full h-full object-cover" 
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBJdhoyfIzn3-ZPzgbjeen7_bOHE7xffvqwoZPK_-ULdLnLyKmBT0gzGv2Dh7WyhuTrRHINz2lkHTqfbLBKNW67-auPiT8Y9Z8l5mirF5UHUsoDnLVXJ74S7tJedu5tfLqHw8olGLI6pmFsBPGoK6qfrl8_sr7pX3VyO-AXNeR3SSukEC0oijXCbWSViuSkXgsBMDjDghnP0eMgWzIz4sb4rvmqB0z9FBAanFm2F2lTpTkbVP5CT8IfifudUJWrEUy2AH-JIeNVg2o" 
                  alt="high resolution 3D heatmap field" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-transparent"></div>

                {/* UI Overlay */}
                <div className="absolute bottom-7 left-7 p-4 glass-card rounded-lg border-white/10">
                  <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-1.5">Sensor Cluster 04-B</p>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-10 bg-emerald-400 rounded-full"></div>
                    <div>
                      <p className="text-lg font-bold text-white">98% Accuracy</p>
                      <p className="text-[9px] text-white/40">Real-time</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Panel: Market & Stats */}
            <div className="w-full lg:w-80 bg-white/5 border-l border-white/5 p-5 space-y-5">
              <div>
                <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.2em] mb-3">Market Moves</p>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-white">Wheat Futures</span>
                    <span className="text-xs font-bold text-emerald-400">+2.4%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-white">Corn Index</span>
                    <span className="text-xs font-bold text-red-400">-0.8%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-white">Global Soy</span>
                    <span className="text-xs font-bold text-emerald-400">+1.1%</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/5">
                <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.2em] mb-3">Global Coverage</p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-secondary-container/10 flex items-center justify-center text-secondary-container">
                      <span className="material-symbols-outlined text-sm">speed</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Sub-second</p>
                      <p className="text-[9px] text-white/40">Latency</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                      <span className="material-symbols-outlined text-sm">public</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">5.9B ac</p>
                      <p className="text-[9px] text-white/40">Coverage</p>
                    </div>
                  </div>
                </div>
              </div>

              <button className="w-full mt-auto py-3.5 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-bold text-xs uppercase tracking-widest shadow-lg shadow-emerald-700/40">
                Launch Suite
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DashboardSection;

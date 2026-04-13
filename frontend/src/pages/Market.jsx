import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const Market = () => {
  const [timeframe, setTimeframe] = useState('week');

  const marketData = [
    { crop: 'Corn', price: 4.25, change: '+2.5%', trend: 'up' },
    { crop: 'Wheat', price: 6.75, change: '-1.2%', trend: 'down' },
    { crop: 'Soybean', price: 11.50, change: '+3.8%', trend: 'up' },
    { crop: 'Rice', price: 14.20, change: '+0.5%', trend: 'up' },
  ];

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <main className="py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <h1 className="text-4xl font-bold text-primary font-headline mb-4">Market Insights</h1>
            <p className="text-lg text-on-surface-variant">Global commodity prices and supply chain analysis</p>
          </div>

          {/* Time Filter */}
          <div className="mb-8 flex gap-4">
            {['day', 'week', 'month'].map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-6 py-2 rounded-lg font-bold transition-all ${
                  timeframe === tf
                    ? 'gradient-primary text-white'
                    : 'bg-surface-container text-primary hover:bg-surface-container-high'
                }`}
              >
                {tf.charAt(0).toUpperCase() + tf.slice(1)}
              </button>
            ))}
          </div>

          {/* Market Prices Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {marketData.map((item, index) => (
              <div key={index} className="glass-card rounded-xl p-6 shadow-sm border border-emerald-900/5 hover:shadow-lg transition-all">
                <h3 className="text-lg font-bold text-primary mb-4">{item.crop}</h3>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-on-surface-variant uppercase font-bold mb-1">Current Price</p>
                    <p className="text-3xl font-bold text-primary font-headline">${item.price}</p>
                  </div>
                  <div>
                    <p className={`text-lg font-bold ${item.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                      {item.change}
                    </p>
                  </div>
                </div>
                <button className="w-full mt-4 text-secondary font-bold hover:text-secondary-container transition-colors flex items-center justify-center gap-2">
                  View Details <span className="material-symbols-outlined">arrow_forward</span>
                </button>
              </div>
            ))}
          </div>

          {/* Supply Chain Overview */}
          <div className="glass-card rounded-xl p-8 shadow-sm border border-emerald-900/5">
            <h2 className="text-2xl font-bold text-primary mb-6 font-headline">Supply Chain Overview</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 bg-blue-50 rounded-lg">
                <p className="text-sm font-bold text-primary mb-2 uppercase">Global Demand</p>
                <p className="text-4xl font-bold text-secondary font-headline">↑ 12%</p>
                <p className="text-xs text-on-surface-variant mt-2">Increase YoY</p>
              </div>
              <div className="p-6 bg-green-50 rounded-lg">
                <p className="text-sm font-bold text-primary mb-2 uppercase">Local Supply</p>
                <p className="text-4xl font-bold text-primary-fixed font-headline">↑ 8%</p>
                <p className="text-xs text-on-surface-variant mt-2">Increase from last harvest</p>
              </div>
              <div className="p-6 bg-orange-50 rounded-lg">
                <p className="text-sm font-bold text-primary mb-2 uppercase">Optimal Window</p>
                <p className="text-4xl font-bold text-secondary-container font-headline">5d</p>
                <p className="text-xs text-on-surface-variant mt-2">Days to peak price</p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Market;

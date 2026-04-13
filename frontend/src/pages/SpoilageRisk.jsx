import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const SpoilageRisk = () => {
  const [selectedProduct, setSelectedProduct] = useState(null);

  const products = [
    {
      name: 'Wheat Storage Unit A',
      temp: '15°C',
      humidity: '65%',
      risk: 'Low',
      riskColor: 'text-green-600',
      days: '45 days storage capacity'
    },
    {
      name: 'Corn Storage Unit B',
      temp: '18°C',
      humidity: '72%',
      risk: 'Medium',
      riskColor: 'text-orange-600',
      days: '28 days until intervention needed'
    },
    {
      name: 'Soybean Storage Unit C',
      temp: '22°C',
      humidity: '78%',
      risk: 'High',
      riskColor: 'text-red-600',
      days: '12 hours until spoilage risk'
    }
  ];

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <main className="py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <h1 className="text-4xl font-bold text-primary font-headline mb-4">Spoilage Risk Analysis</h1>
            <p className="text-lg text-on-surface-variant">Real-time post-harvest storage monitoring and predictions</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {products.map((product, index) => (
              <div
                key={index}
                className="glass-card rounded-xl p-6 shadow-sm border border-emerald-900/5 hover:shadow-lg transition-all cursor-pointer"
                onClick={() => setSelectedProduct(index)}
              >
                <h3 className="text-lg font-bold text-primary mb-4 font-headline">{product.name}</h3>
                
                <div className="space-y-3 mb-4">
                  <div>
                    <p className="text-xs text-on-surface-variant uppercase font-bold mb-1">Temperature</p>
                    <p className="text-xl font-bold text-primary">{product.temp}</p>
                  </div>
                  <div>
                    <p className="text-xs text-on-surface-variant uppercase font-bold mb-1">Humidity</p>
                    <p className="text-xl font-bold text-primary">{product.humidity}</p>
                  </div>
                  <div>
                    <p className="text-xs text-on-surface-variant uppercase font-bold mb-1">Spoilage Risk</p>
                    <p className={`text-xl font-bold ${product.riskColor}`}>{product.risk}</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-outline-variant">
                  <p className="text-xs text-on-surface-variant">{product.days}</p>
                </div>
              </div>
            ))}
          </div>

          {selectedProduct !== null && (
            <div className="glass-card rounded-xl p-8 shadow-sm border border-emerald-900/5">
              <h2 className="text-2xl font-bold text-primary mb-6 font-headline">Detailed Analysis</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="font-bold text-primary mb-4">Current Conditions</h3>
                  <div className="space-y-4">
                    <div className="p-4 bg-surface-container rounded-lg">
                      <p className="text-sm text-on-surface-variant mb-2">Temperature Trend</p>
                      <div className="h-16 bg-gradient-to-r from-blue-200 to-red-200 rounded flex items-center justify-center">
                        <span className="text-primary font-bold">Increasing</span>
                      </div>
                    </div>
                    <div className="p-4 bg-surface-container rounded-lg">
                      <p className="text-sm text-on-surface-variant mb-2">Humidity Level</p>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full w-3/4 bg-secondary"></div>
                      </div>
                      <p className="text-xs text-on-surface-variant mt-2">72% (Acceptable range)</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-primary mb-4">Recommendations</h3>
                  <div className="space-y-3">
                    <div className="p-4 bg-green-50 border-l-4 border-primary-fixed rounded-lg">
                      <p className="font-bold text-primary-fixed mb-1">✓ Ventilation System</p>
                      <p className="text-sm text-on-surface-variant">Operating optimally</p>
                    </div>
                    <div className="p-4 bg-yellow-50 border-l-4 border-secondary-container rounded-lg">
                      <p className="font-bold text-secondary-container mb-1">⚠ Temperature Alert</p>
                      <p className="text-sm text-on-surface-variant">Increase cooling capacity within 24 hours</p>
                    </div>
                    <div className="p-4 bg-blue-50 border-l-4 border-secondary rounded-lg">
                      <p className="font-bold text-secondary mb-1">ℹ Maintenance Scheduled</p>
                      <p className="text-sm text-on-surface-variant">Next inspection: 3 days</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default SpoilageRisk;

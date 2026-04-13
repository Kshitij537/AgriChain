import React from 'react';

const EcosystemSection = () => {
  const features = [
    {
      icon: 'satellite_alt',
      title: 'Satellite NDVI',
      description: 'Multi-spectral imagery analysis providing real-time field health metrics and biomass density tracking from orbit.',
      color: 'text-emerald-400',
      iconBg: 'bg-emerald-500/10',
    },
    {
      icon: 'biotech',
      title: 'AI Disease Detection',
      description: 'Sub-pixel scanning algorithms identifying rust, blight, and pest infestations before they become visible to the human eye.',
      color: 'text-secondary-container',
      iconBg: 'bg-secondary-container/10',
    },
    {
      icon: 'warning',
      title: 'Spoilage Risk',
      description: 'Predictive post-harvest analytics utilizing humidity and microbial data to minimize waste in storage silos.',
      color: 'text-emerald-400',
      iconBg: 'bg-emerald-500/10',
    },
    {
      icon: 'query_stats',
      title: 'Market Insights',
      description: 'Global supply-chain tracking and pricing volatility forecasting integrated directly into your yield targets.',
      color: 'text-blue-400',
      iconBg: 'bg-blue-500/10',
    },
    {
      icon: 'auto_awesome',
      title: 'Smart Recs',
      description: 'Automated daily action items powered by multi-variate weather and soil models for maximum efficiency.',
      color: 'text-purple-400',
      iconBg: 'bg-purple-500/10',
    },
    {
      icon: 'agriculture',
      title: 'Fleet Optimization',
      description: 'Precision pathfinding for autonomous tractors and drones, reducing fuel consumption by up to 28% per hectare.',
      color: 'text-amber-400',
      iconBg: 'bg-amber-500/10',
    },
  ];

  return (
    <section className="py-16 px-10 max-w-7xl mx-auto">
      {/* Section Header */}
      <div className="mb-12 animate-fade-in-up">
        <h2 className="text-2xl md:text-3xl font-headline font-bold tracking-tight mb-2 text-white">
          Ecosystem Intelligence
        </h2>
        <div className="h-1 w-24 bg-gradient-to-r from-emerald-400 to-secondary"></div>
      </div>

      {/* Feature Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature, index) => (
          <div
            key={index}
            className="glass-card p-6 rounded-lg glow-hover transition-all duration-500 group animate-fade-in-up"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            {/* Icon */}
            <div className={`w-12 h-12 rounded-2xl ${feature.iconBg} flex items-center justify-center mb-4 ${feature.color} group-hover:scale-110 transition-transform`}>
              <span className="material-symbols-outlined text-2xl">{feature.icon}</span>
            </div>

            {/* Title */}
            <h3 className="text-lg font-headline font-bold mb-3 text-white">
              {feature.title}
            </h3>

            {/* Description */}
            <p className="text-white/50 leading-relaxed text-sm">
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default EcosystemSection;

import React from 'react';

const EcosystemSection = () => {
  const features = [
    {
      icon: 'satellite_alt',
      title: 'Satellite Crop Scan',
      description: 'See your field\'s crop health from space — updated regularly so you always know how your crops are doing.',
      color: 'text-emerald-400',
      iconBg: 'bg-emerald-500/10',
    },
    {
      icon: 'biotech',
      title: 'Disease Detection',
      description: 'Upload a photo of your crop and get instant alerts for diseases like rust, blight, or pest damage — before it spreads.',
      color: 'text-secondary-container',
      iconBg: 'bg-secondary-container/10',
    },
    {
      icon: 'warning',
      title: 'Spoilage Warning',
      description: 'Know when stored crops are at risk of spoiling. Get alerts based on humidity and temperature so you can act in time.',
      color: 'text-emerald-400',
      iconBg: 'bg-emerald-500/10',
    },
    {
      icon: 'query_stats',
      title: 'Market Prices',
      description: 'Check today\'s crop prices and trends so you can sell at the right time and get the best return for your harvest.',
      color: 'text-blue-400',
      iconBg: 'bg-blue-500/10',
    },
    {
      icon: 'auto_awesome',
      title: 'Daily Farming Tips',
      description: 'Get simple, actionable advice every day — when to water, fertilise, or spray — based on your field\'s condition.',
      color: 'text-purple-400',
      iconBg: 'bg-purple-500/10',
    },
    {
      icon: 'agriculture',
      title: 'Equipment Planning',
      description: 'Plan when and where to use your tractors and equipment to save fuel and cover your fields more efficiently.',
      color: 'text-amber-400',
      iconBg: 'bg-amber-500/10',
    },
  ];

  return (
    <section className="py-16 px-10 max-w-7xl mx-auto">
      {/* Section Header */}
      <div className="mb-12 animate-fade-in-up">
        <h2 className="text-2xl md:text-3xl font-headline font-bold tracking-tight mb-2 text-white">
          Everything You Need on Your Farm
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

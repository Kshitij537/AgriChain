import React from 'react';

const StatsSection = () => {
  const stats = [
    {
      value: '-45%',
      label: 'Reduction in Water Waste',
      description: 'Through precision soil moisture monitoring and smart irrigation scheduling.',
    },
    {
      value: '+22%',
      label: 'Average Yield Increase',
      description: 'Our AI identifies optimal harvesting windows based on ripeness and market demand.',
    },
    {
      value: '10x',
      label: 'Faster Decision Making',
      description: 'AI-summarized data allows managers to cover more acreage in significantly less time.',
    },
  ];

  return (
    <section className="py-16 px-10">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-3 gap-8">
          {stats.map((stat, index) => (
            <div
              key={index}
              className={`text-center md:text-left space-y-4 animate-fade-in-up ${
                index < stats.length - 1 ? 'border-r-0 md:border-r border-white/10 pr-0 md:pr-16' : 'pl-0 md:pl-16'
              }`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="text-4xl md:text-5xl font-extrabold text-emerald-400 font-headline tracking-tighter">
                {stat.value}
              </div>
              <div className="text-base text-white/80 font-medium font-headline">{stat.label}</div>
              <p className="text-xs text-white/50 leading-relaxed">{stat.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default StatsSection;

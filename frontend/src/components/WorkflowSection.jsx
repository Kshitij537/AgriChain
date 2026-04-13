import React from 'react';

const WorkflowSection = () => {
  const steps = [
    {
      number: '01',
      title: 'Select Farm',
      description: 'Geofence boundaries with sub-meter precision via GNSS.',
    },
    {
      number: '02',
      title: 'Analyze Data',
      description: 'Real-time sync of satellite telemetry and on-site IoT sensors.',
    },
    {
      number: '03',
      title: 'Upload Image',
      description: 'Neural-scan of crop photos for micro-level cellular analysis.',
    },
    {
      number: '04',
      title: 'Get Recommendations',
      description: 'Execute AI-optimized plans for peak seasonal yield maximization.',
    },
  ];

  return (
    <section className="py-16 bg-neutral-900/50">
      <div className="max-w-7xl mx-auto px-10">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-headline font-bold tracking-tight mb-3 text-white">
            The Precision Workflow
          </h2>
          <p className="text-white/40 max-w-2xl mx-auto uppercase tracking-widest text-xs font-bold">
            Four Steps to Autonomous Governance
          </p>
        </div>

        {/* Steps Container */}
        <div className="relative flex flex-col md:flex-row justify-between items-start gap-12 md:gap-4">
          {/* Progress Line */}
          <div className="hidden md:block absolute top-10 left-1/2 -translate-x-1/2 w-4/5 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>

          {/* Steps */}
          {steps.map((step, index) => (
            <div
              key={index}
              className="relative z-10 flex flex-col items-center md:w-1/4 text-center group animate-fade-in-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Number Circle */}
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 shadow-2xl transition-all duration-500 ${
                  index === 3
                    ? 'bg-emerald-400 border border-emerald-400/50 shadow-lg shadow-emerald-400/20'
                    : 'bg-neutral-950 border border-white/10 group-hover:border-emerald-400'
                }`}
              >
                <span className={`text-lg font-bold font-headline ${index === 3 ? 'text-neutral-950' : 'text-white'}`}>
                  {step.number}
                </span>
              </div>

              {/* Title */}
              <h4 className="text-lg font-bold mb-2 text-white">
                {step.title}
              </h4>

              {/* Description */}
              <p className="text-white/50 text-xs">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WorkflowSection;

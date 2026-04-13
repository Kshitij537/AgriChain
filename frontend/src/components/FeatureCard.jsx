import React from 'react';

const FeatureCard = ({ icon, iconBg, title, description, onLearnMore }) => {
  return (
    <div className="glass-card p-10 rounded-xl shadow-sm border border-emerald-900/5 hover:shadow-xl hover:shadow-primary/5 transition-all group">
      <div className={`w-16 h-16 ${iconBg} flex items-center justify-center mb-8 shadow-lg group-hover:scale-110 transition-transform rounded-2xl`}>
        <span className="material-symbols-outlined text-3xl">{icon}</span>
      </div>
      <h3 className="text-2xl font-bold text-primary mb-4 font-headline">{title}</h3>
      <p className="text-on-surface-variant leading-relaxed mb-6">{description}</p>
      <button
        onClick={onLearnMore}
        className="flex items-center text-secondary font-bold group-hover:gap-3 transition-all gap-1 cursor-pointer hover:text-secondary-container"
      >
        Learn More <span className="material-symbols-outlined">chevron_right</span>
      </button>
    </div>
  );
};

export default FeatureCard;

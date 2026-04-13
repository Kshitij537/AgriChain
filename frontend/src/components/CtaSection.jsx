import React from 'react';
import { Link } from 'react-router-dom';

const CtaSection = () => {
  return (
    <section className="px-6 pb-20">
      <div className="max-w-7xl mx-auto gradient-primary rounded-xl p-16 md:p-24 relative overflow-hidden text-center flex flex-col items-center">
        {/* Radial Gradient Overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent)] pointer-events-none"></div>

        {/* Grid Pattern */}
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
          <div className="grid grid-cols-12 h-full">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="border-r border-white"></div>
            ))}
          </div>
        </div>

        {/* Content */}
        <h2 className="text-4xl md:text-6xl font-extrabold text-white font-headline mb-8 relative z-10 animate-fade-in-down delay-100">
          Start Smart Farming Today
        </h2>
        <p className="text-emerald-50 text-xl max-w-2xl mb-12 relative z-10 leading-relaxed animate-fade-in-down delay-200">
          Join over 15,000 precision farms worldwide that trust AgriChain  to power their growth and sustainability.
        </p>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-6 relative z-10 animate-fade-in-up delay-300">
          <Link to="/login" className="bg-white text-primary px-12 py-5 rounded-xl font-bold text-lg hover:scale-[1.05] transition-transform shadow-2xl">
            Get Started Free
          </Link>
          <button className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-12 py-5 rounded-xl font-bold text-lg hover:bg-white/20 transition-colors">
            Talk to Sales
          </button>
        </div>
      </div>
    </section>
  );
};

export default CtaSection;

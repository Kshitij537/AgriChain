import React from 'react';

const HeroSection = () => {
  return (
    <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden pt-20">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-neutral-950/60 z-10"></div>
        <img 
          className="w-full h-full object-cover" 
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuBICxqxoo3oXf0dAcfMaYpAq5xPIqh6HwT0RrOnYn71C9Gj8aSypj17bRjdIdJxoizIbMMef1gVXbplPqxQacepQ6061IKkIP724wWxBjwcdF38iv6-0BFtUkqirHIFKBGlmL3fdzvM2ucUOJFEv7g2kgbva9ckA7ndujlL-_qbd9wG3jXEb7QrT8DSndYfydhxE24ZhPI1wemWiWODGQidmFP32Sh4S1-vNWuDIUNuTavdhqyz-_81LRUDv4TW4Evulo9MhkX4Y68" 
          alt="cinematic wide angle shot of a futuristic precision farm at sunrise" 
        />
      </div>

      {/* Content */}
      <div className="relative z-20 text-center max-w-4xl px-6 animate-fade-in-up">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-8 backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-xs font-bold tracking-[0.2em] uppercase text-emerald-400">V3.0 Platform Now Live</span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl md:text-5xl font-headline font-extrabold tracking-tighter mb-6 leading-tight text-white">
          Harvesting <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-secondary-container">Intelligence.</span>
        </h1>

        {/* Description */}
        <p className="text-lg text-white/60 mb-8 font-medium max-w-2xl mx-auto leading-relaxed">
          A planetary-scale OS for the modern agronomist. Predictive analytics, satellite-driven insights, and autonomous fleet management in one seamless interface.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-6">
          <button className="px-8 py-3 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-bold text-base hover:scale-105 transition-transform shadow-xl shadow-emerald-700/20 hover:shadow-2xl hover:shadow-emerald-700/40">
            Deploy Ecosystem
          </button>
          <button className="px-8 py-3 rounded-full bg-white/5 hover:bg-white/10 text-white font-bold text-base border border-white/10 backdrop-blur-md transition-all hover:scale-105">
            View Live Network
          </button>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;

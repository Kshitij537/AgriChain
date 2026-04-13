import React from 'react';
import Navbar from '../components/Navbar';
import HeroSection from '../components/HeroSection';
import EcosystemSection from '../components/EcosystemSection';
import WorkflowSection from '../components/WorkflowSection';
import DashboardSection from '../components/DashboardSection';
import StatsSection from '../components/StatsSection';
import CtaSection from '../components/CtaSection';
import Footer from '../components/Footer';

const Landing = () => {
  return (
    <div className="min-h-screen bg-black overflow-x-hidden">
      <style jsx global>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeInRight {
          from {
            opacity: 0;
            transform: translateX(30px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .animate-fade-in-up {
          animation: fadeInUp 0.6s ease-out forwards;
        }

        .animate-fade-in-right {
          animation: fadeInRight 0.6s ease-out forwards;
        }

        .glass-card {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .glow-hover:hover {
          box-shadow: 0 0 40px rgba(78, 222, 163, 0.15);
        }

        .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
      `}</style>
      
      <Navbar />
      <HeroSection />
      <div id="solutions">
        <EcosystemSection />
      </div>
      <div id="platform">
        <WorkflowSection />
      </div>
      <DashboardSection />
      <div id="insights">
        <StatsSection />
      </div>
      <CtaSection />
      <Footer />
    </div>
  );
};

export default Landing;

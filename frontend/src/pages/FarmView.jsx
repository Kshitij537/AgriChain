import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { t, getCurrentLanguage } from '../utils/translations';

const FarmView = () => {
  const [lang, setLang] = useState(getCurrentLanguage());

  useEffect(() => {
    const handleLanguageChange = () => setLang(getCurrentLanguage());
    window.addEventListener('languageChange', handleLanguageChange);
    return () => window.removeEventListener('languageChange', handleLanguageChange);
  }, []);

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <main className="py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <h1 className="text-4xl font-bold text-primary font-headline mb-4">{t('farmView', 'title', lang)}</h1>
            <p className="text-lg text-on-surface-variant">{t('farmView', 'subtitle', lang)}</p>
          </div>

          <div className="glass-card rounded-xl p-8 shadow-sm border border-emerald-900/5 mb-8">
            <div className="aspect-video bg-gradient-to-br from-emerald-100 to-blue-100 rounded-lg flex items-center justify-center text-center">
              <div>
                <span className="material-symbols-outlined text-6xl text-primary-container block mb-4">map</span>
                <p className="text-primary font-bold">{t('farmView', 'interactiveMap', lang)}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-card rounded-xl p-6 shadow-sm border border-emerald-900/5">
              <h3 className="font-bold text-primary mb-4">{t('farmView', 'fieldMetrics', lang)}</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-on-surface-variant uppercase font-bold mb-2">{t('farmView', 'cropHealth', lang)}</p>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full w-4/5 bg-primary-fixed"></div>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-1">{t('farmView', 'excellent', lang)}</p>
                </div>
                <div>
                  <p className="text-xs text-on-surface-variant uppercase font-bold mb-2">{t('farmView', 'soilMoisture', lang)}</p>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full w-3/5 bg-secondary"></div>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-1">{t('farmView', 'optimal', lang)}</p>
                </div>
              </div>
            </div>

            <div className="glass-card rounded-xl p-6 shadow-sm border border-emerald-900/5">
              <h3 className="font-bold text-primary mb-4">{t('farmView', 'recentAlerts', lang)}</h3>
              <div className="space-y-3">
                <div className="p-3 bg-green-50 rounded border-l-4 border-primary-fixed">
                  <p className="text-xs font-bold text-primary-fixed">{t('farmView', 'irrigationScheduled', lang)}</p>
                  <p className="text-xs text-on-surface-variant">{t('farmView', 'in6Hours', lang)}</p>
                </div>
                <div className="p-3 bg-blue-50 rounded border-l-4 border-secondary">
                  <p className="text-xs font-bold text-secondary">{t('farmView', 'satelliteUpdate', lang)}</p>
                  <p className="text-xs text-on-surface-variant">{t('farmView', 'dataReceived2h', lang)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default FarmView;

import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { t, getCurrentLanguage } from '../utils/translations';

const FarmSetup = () => {
  const [lang, setLang] = useState(getCurrentLanguage());
  const [formData, setFormData] = useState({
    farmName: '',
    location: '',
    acreage: '',
    cropType: '',
    latitude: '',
    longitude: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Form submitted:', formData);
  };

  useEffect(() => {
    const handleLanguageChange = () => setLang(getCurrentLanguage());
    window.addEventListener('languageChange', handleLanguageChange);
    return () => window.removeEventListener('languageChange', handleLanguageChange);
  }, []);

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <main className="py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-12">
            <h1 className="text-4xl font-bold text-primary font-headline mb-4">{t('farmSetup', 'title', lang)}</h1>
            <p className="text-lg text-on-surface-variant">{t('farmSetup', 'subtitle', lang)}</p>
          </div>

          <div className="glass-card rounded-xl p-12 shadow-sm border border-emerald-900/5">
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-primary mb-2">{t('farmSetup', 'farmName', lang)}</label>
                  <input
                    type="text"
                    name="farmName"
                    value={formData.farmName}
                    onChange={handleChange}
                    placeholder={t('farmSetup', 'farmNamePlaceholder', lang)}
                    className="w-full px-4 py-3 border border-outline rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-primary mb-2">{t('farmSetup', 'cropType', lang)}</label>
                  <select
                    name="cropType"
                    value={formData.cropType}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-outline rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    <option value="">{t('farmSetup', 'selectCrop', lang)}</option>
                    <option value="corn">{t('farmSetup', 'corn', lang)}</option>
                    <option value="wheat">{t('farmSetup', 'wheat', lang)}</option>
                    <option value="soybean">{t('farmSetup', 'soybean', lang)}</option>
                    <option value="rice">{t('farmSetup', 'rice', lang)}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-primary mb-2">{t('farmSetup', 'location', lang)}</label>
                  <input
                    type="text"
                    name="location"
                    value={formData.location}
                    onChange={handleChange}
                    placeholder={t('farmSetup', 'locationPlaceholder', lang)}
                    className="w-full px-4 py-3 border border-outline rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-primary mb-2">{t('farmSetup', 'acreage', lang)}</label>
                  <input
                    type="number"
                    name="acreage"
                    value={formData.acreage}
                    onChange={handleChange}
                    placeholder={t('farmSetup', 'acreagePlaceholder', lang)}
                    className="w-full px-4 py-3 border border-outline rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-primary mb-2">{t('farmSetup', 'latitude', lang)}</label>
                  <input
                    type="number"
                    name="latitude"
                    value={formData.latitude}
                    onChange={handleChange}
                    placeholder="e.g., 40.7128"
                    step="0.0001"
                    className="w-full px-4 py-3 border border-outline rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-primary mb-2">{t('farmSetup', 'longitude', lang)}</label>
                  <input
                    type="number"
                    name="longitude"
                    value={formData.longitude}
                    onChange={handleChange}
                    placeholder="e.g., -74.0060"
                    step="0.0001"
                    className="w-full px-4 py-3 border border-outline rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-8">
                <button
                  type="submit"
                  className="flex-1 gradient-primary text-white py-4 rounded-lg font-bold text-lg hover:opacity-90 transition-all"
                >
                  {t('farmSetup', 'createFarm', lang)}
                </button>
                <button
                  type="button"
                  className="flex-1 bg-surface-container-highest text-primary py-4 rounded-lg font-bold text-lg hover:opacity-90 transition-all"
                >
                  {t('boundarySetup', 'cancel', lang)}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default FarmSetup;

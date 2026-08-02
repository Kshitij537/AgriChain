import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { t, getCurrentLanguage } from '../utils/translations';

const Sidebar = ({ onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [lang, setLang] = useState(getCurrentLanguage());

  // Listen for language changes
  useEffect(() => {
    const handleLanguageChange = () => {
      setLang(getCurrentLanguage());
    };

    window.addEventListener('languageChange', handleLanguageChange);
    return () => window.removeEventListener('languageChange', handleLanguageChange);
  }, []);

  // Determine if a link is active
  const isActive = (path) => location.pathname === path;

  // Navigation items
  const navItems = [
    { path: '/dashboard', icon: 'dashboard', labelKey: 'dashboard' },
    { path: '/saved-fields', icon: 'potted_plant', labelKey: 'fields' },
    { path: '/weather', icon: 'partly_cloudy_day', labelKey: 'weather' },
    { path: '/disease-detection', icon: 'magnification_small', labelKey: 'diseases' },
    { path: '/spoilage-risk', icon: 'warning', labelKey: 'spoilage' },
    { path: '/market', icon: 'trending_up', labelKey: 'market' },
    { path: '#', icon: 'lightbulb', labelKey: 'recommendations' },
  ];

  return (
    <aside className="fixed left-0 top-0 h-full flex flex-col py-6 bg-surface w-72 z-50 border-r border-outline-variant/10">
      {/* Logo Section */}
      <div className="px-8 mb-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white">
            <span className="material-symbols-outlined">eco</span>
          </div>
          <div>
            <h1 className="text-2xl font-headline font-extrabold text-primary">AgriChain</h1>
            <p className="text-xs font-body font-medium opacity-60">{t('common', 'smartFarmingAssistant', lang)}</p>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-2 overflow-y-auto px-4">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center gap-3 px-6 py-3 rounded-full transition-all duration-200 font-body text-sm ${
              isActive(item.path)
                ? 'bg-gradient-to-br from-primary to-secondary text-white shadow-lg transform scale-105'
                : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            <span className="font-headline font-bold">{t('navigation', item.labelKey, lang)}</span>
          </Link>
        ))}
      </nav>

      {/* Bottom Actions */}
      <div className="mt-auto px-4 space-y-2">
        <button className="w-full bg-gradient-to-br from-primary to-secondary text-white font-headline font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 mb-6 hover:shadow-xl transition-shadow">
          <span className="material-symbols-outlined">auto_awesome</span>
          {t('dashboard', 'checkMyCrops', lang)}
        </button>

        <div className="pt-6 border-t border-outline-variant/10 space-y-2">
          <button className="w-full text-on-surface-variant px-6 py-2 flex items-center gap-3 hover:opacity-80 text-left font-body text-sm rounded-full hover:bg-surface-container-high transition-colors">
            <span className="material-symbols-outlined">settings</span>
            <span>{t('navigation', 'settings', lang)}</span>
          </button>
          <button className="w-full text-on-surface-variant px-6 py-2 flex items-center gap-3 hover:opacity-80 text-left font-body text-sm rounded-full hover:bg-surface-container-high transition-colors">
            <span className="material-symbols-outlined">help</span>
            <span>{t('navigation', 'help', lang)}</span>
          </button>
          {onLogout && (
            <button
              onClick={onLogout}
              className="w-full text-on-surface-variant px-6 py-2 flex items-center gap-3 hover:opacity-80 text-left font-body text-sm rounded-full hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined">logout</span>
              <span>{t('navigation', 'logout', lang)}</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;

import React, { useState, useEffect } from 'react';
import LanguageSelector from './LanguageSelector';
import { t, getCurrentLanguage } from '../utils/translations';

const Header = ({ user, searchPlaceholder = "Search fields, diseases, or market trends..." }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [lang, setLang] = useState(getCurrentLanguage());

  useEffect(() => {
    const handleLanguageChange = () => setLang(getCurrentLanguage());
    window.addEventListener('languageChange', handleLanguageChange);
    return () => window.removeEventListener('languageChange', handleLanguageChange);
  }, []);

  const resolvedSearchPlaceholder =
    searchPlaceholder === "Search fields, diseases, or market trends..."
      ? t('common', 'searchFieldsPlaceholder', lang)
      : searchPlaceholder;

  return (
    <header className="fixed top-0 left-72 h-20 px-8 w-[calc(100%-18rem)] flex justify-between items-center bg-surface/80 backdrop-blur-xl z-40 border-b border-outline-variant/10">
      {/* Search Bar */}
      <div className="flex items-center bg-surface-container-highest/40 px-4 py-2 rounded-full w-96 focus-within:ring-2 focus-within:ring-primary/20 font-body">
        <span className="material-symbols-outlined text-on-surface-variant mr-2">search</span>
        <input
          className="bg-transparent border-none focus:ring-0 text-sm w-full placeholder:text-on-surface-variant/60 font-body"
          placeholder={resolvedSearchPlaceholder}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-6">
        {/* Language Selector */}
        <LanguageSelector />
        
        {/* Icons */}
        <div className="flex items-center gap-4 text-on-surface-variant">
          <button className="p-2 hover:opacity-80 relative font-body transition-opacity">
            <span className="material-symbols-outlined">notifications</span>
            <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full"></span>
          </button>
          <button className="p-2 hover:opacity-80 font-body transition-opacity">
            <span className="material-symbols-outlined">apps</span>
          </button>
        </div>

        {/* User Profile */}
        <div className="flex items-center gap-3 pl-6 border-l border-outline-variant/20">
          <div className="text-right">
            <p className="text-sm font-headline font-semibold text-primary">{user?.fullName || t('common', 'farmer', lang)}</p>
            <p className="text-xs text-on-surface-variant uppercase tracking-wider font-body">
              {user?.role || t('common', 'precisionFarmer', lang)}
            </p>
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-headline font-bold">
            {(user?.fullName || 'F')[0]}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;

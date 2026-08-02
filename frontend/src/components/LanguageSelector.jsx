import React, { useState, useEffect } from 'react';
import { languages, getCurrentLanguage, setCurrentLanguage, t } from '../utils/translations';

const LanguageSelector = () => {
  const [currentLang, setCurrentLang] = useState(getCurrentLanguage());
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleLanguageChange = () => {
      setCurrentLang(getCurrentLanguage());
    };

    window.addEventListener('languageChange', handleLanguageChange);
    return () => window.removeEventListener('languageChange', handleLanguageChange);
  }, []);

  const handleLanguageChange = (langCode) => {
    setCurrentLanguage(langCode);
    setCurrentLang(langCode);
    setIsOpen(false);
    // No page reload - just dispatch event for all components to update
  };

  const currentLanguage = languages.find(lang => lang.code === currentLang);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-container-high transition-colors"
        title="Change Language / भाषा बदलें / भाषा बदला"
      >
        <span className="material-symbols-outlined text-lg text-on-surface-variant">language</span>
        <span className="text-sm font-semibold text-on-surface">{currentLanguage?.nativeName}</span>
        <span className={`material-symbols-outlined text-sm text-on-surface-variant transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-outline-variant z-50 overflow-hidden">
            <div className="py-2">
              <div className="px-4 py-2 border-b border-outline-variant/20">
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                  {t('common', 'selectLanguage', currentLang)}
                </p>
              </div>
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  className={`w-full px-4 py-3 text-left hover:bg-surface-container transition-colors flex items-center justify-between ${
                    currentLang === lang.code ? 'bg-primary-container' : ''
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold text-primary">{lang.nativeName}</p>
                    <p className="text-xs text-on-surface-variant">{lang.name}</p>
                  </div>
                  {currentLang === lang.code && (
                    <span className="material-symbols-outlined text-primary">check</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default LanguageSelector;

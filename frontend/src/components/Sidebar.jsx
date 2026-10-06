import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { t, getCurrentLanguage } from '../utils/translations';
import { getPrimaryUserType } from '../utils/userUtils';
import mp from '../services/marketplaceService';

const Sidebar = ({ onLogout, userType = null }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [lang, setLang] = useState(getCurrentLanguage());
  const [detectedUserType, setDetectedUserType] = useState('farmer');
  const [unreadCounts, setUnreadCounts] = useState({
    messages: 0,
    offers: 0,
    notifications: 0
  });

  // Auto-detect user type from localStorage if not explicitly provided
  useEffect(() => {
    if (userType) {
      // If explicitly provided, use that
      setDetectedUserType(userType);
    } else {
      // Otherwise, detect using utility function
      setDetectedUserType(getPrimaryUserType());
    }
  }, [userType, location.pathname]); // Re-check on route change

  // Fetch unread counts for messages, offers, and notifications
  useEffect(() => {
    const fetchUnreadCounts = async () => {
      try {
        // The three counts are independent, so they are fetched together and
        // each failure costs only its own badge. Nesting the offer and
        // notification calls inside the conversation check, as this did, meant
        // one failing conversations request silently hid all three badges.
        const [conversationsResult, offersResult, notificationsResult] = await Promise.all([
          mp.listConversations({ limit: 100 }),
          mp.listOffers({ direction: 'received', status: 'pending' }),
          mp.listNotifications({ unreadOnly: true, limit: 100 })
        ]);

        setUnreadCounts({
          // Threads with anything unread, not total unread messages - the badge
          // is "how many conversations need you".
          messages: conversationsResult.ok
            ? (conversationsResult.data?.filter((c) => c.unreadCount > 0).length || 0)
            : 0,
          offers: offersResult.ok ? (offersResult.data?.length || 0) : 0,
          notifications: notificationsResult.ok ? (notificationsResult.data?.length || 0) : 0
        });
      } catch (error) {
        console.error('Error fetching unread counts:', error);
      }
    };

    // Fetch initially
    fetchUnreadCounts();

    // Refresh every 30 seconds
    const interval = setInterval(fetchUnreadCounts, 30000);

    return () => clearInterval(interval);
  }, [detectedUserType]);

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

  // Farmer navigation items
  const farmerNavItems = [
    { path: '/dashboard', icon: 'dashboard', labelKey: 'dashboard' },
    { path: '/saved-fields', icon: 'potted_plant', labelKey: 'fields' },
    { path: '/weather', icon: 'partly_cloudy_day', labelKey: 'weather' },
    { path: '/disease-detection', icon: 'magnification_small', labelKey: 'diseases' },
    { path: '/spoilage-risk', icon: 'warning', labelKey: 'spoilage' },
    { path: '/market', icon: 'trending_up', labelKey: 'market' },
    { path: '/marketplace', icon: 'storefront', labelKey: 'buyers' },
    { path: '/marketplace/messages', icon: 'chat', label: 'Messages' },
    { path: '/marketplace/offers', icon: 'handshake', label: 'Offers' },
    { path: '#', icon: 'lightbulb', labelKey: 'recommendations' },
  ];

  // Buyer navigation items
  const buyerNavItems = [
    { path: '/buyer', icon: 'dashboard', label: 'Dashboard' },
    { path: '/buyer/requirements', icon: 'list_alt', label: 'My Requirements' },
    { path: '/buyer/browse', icon: 'storefront', label: 'Browse Farmers' },
    { path: '/marketplace/messages', icon: 'chat', label: 'Messages' },
    { path: '/marketplace/offers', icon: 'handshake', label: 'Offers & Deals' },
  ];

  // Select navigation items based on detected user type
  const navItems = detectedUserType === 'buyer' ? buyerNavItems : farmerNavItems;

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
        {navItems.map((item, index) => {
          // Determine if this item should show a badge
          let badgeCount = 0;
          if (item.path === '/marketplace/messages') {
            badgeCount = unreadCounts.messages;
          } else if (item.path === '/marketplace/offers') {
            badgeCount = unreadCounts.offers;
          }

          return (
            <Link
              key={`${detectedUserType}-${item.path}-${index}`}
              to={item.path}
              className={`flex items-center gap-3 px-6 py-3 rounded-full transition-all duration-200 font-body text-sm relative ${
                isActive(item.path)
                  ? 'bg-gradient-to-br from-primary to-secondary text-white shadow-lg transform scale-105'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="font-headline font-bold">
                {item.labelKey ? t('navigation', item.labelKey, lang) : item.label}
              </span>
              {badgeCount > 0 && (
                <span className="ml-auto flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-error text-on-error text-[10px] font-bold">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </Link>
          );
        })}
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

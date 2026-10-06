import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import LanguageSelector from './LanguageSelector';
import { t, getCurrentLanguage } from '../utils/translations';
import mp from '../services/marketplaceService';

const Header = ({ user, searchPlaceholder = "Search fields, diseases, or market trends..." }) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [lang, setLang] = useState(getCurrentLanguage());
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const notificationRef = useRef(null);

  useEffect(() => {
    const handleLanguageChange = () => setLang(getCurrentLanguage());
    window.addEventListener('languageChange', handleLanguageChange);
    return () => window.removeEventListener('languageChange', handleLanguageChange);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotificationDropdown(false);
      }
    };

    if (showNotificationDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotificationDropdown]);

  // Fetch notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const result = await mp.listNotifications({ limit: 10 });
        if (result.ok) {
          setNotifications(result.data || []);
          const unread = result.data?.filter(n => !n.isRead).length || 0;
          setUnreadNotifications(unread);
        }
      } catch (error) {
        console.error('Error fetching notifications:', error);
      }
    };

    fetchNotifications();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleNotificationClick = async (notification) => {
    // Mark as read
    if (!notification.isRead) {
      await mp.markNotificationRead(notification.id);
      setUnreadNotifications(prev => Math.max(0, prev - 1));
    }

    // Navigate based on notification type
    if (notification.conversationId) {
      navigate(`/marketplace/messages/${notification.conversationId}`);
    } else if (notification.offerId) {
      navigate('/marketplace/offers');
    }
    
    setShowNotificationDropdown(false);
  };

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
          {/* Notifications */}
          <div className="relative" ref={notificationRef}>
            <button 
              onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
              className="p-2 hover:opacity-80 relative font-body transition-opacity"
            >
              <span className="material-symbols-outlined">notifications</span>
              {unreadNotifications > 0 && (
                <span className="absolute top-1 right-1 flex items-center justify-center min-w-[16px] h-4 px-1 bg-error text-on-error rounded-full text-[10px] font-bold">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {showNotificationDropdown && (
              <div className="absolute right-0 top-12 w-80 bg-surface-container-lowest rounded-2xl shadow-xl border border-outline-variant/20 overflow-hidden z-50">
                <div className="p-4 border-b border-outline-variant/20">
                  <h3 className="font-headline font-bold text-sm text-on-surface">Notifications</h3>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center">
                      <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2 block">
                        notifications_off
                      </span>
                      <p className="text-xs text-on-surface-variant">No notifications yet</p>
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <button
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        className={`w-full p-4 text-left hover:bg-surface-container-high transition-colors border-b border-outline-variant/10 ${
                          !notification.isRead ? 'bg-primary-container/20' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="material-symbols-outlined text-primary text-xl">
                            {notification.type === 'message' ? 'chat' : 
                             notification.type === 'offer' ? 'handshake' : 
                             'notifications'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-on-surface mb-1">
                              {notification.title}
                            </p>
                            <p className="text-[11px] text-on-surface-variant line-clamp-2">
                              {notification.message}
                            </p>
                            <p className="text-[10px] text-on-surface-variant mt-1">
                              {new Date(notification.createdAt).toLocaleString()}
                            </p>
                          </div>
                          {!notification.isRead && (
                            <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1"></span>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
                {notifications.length > 0 && (
                  <div className="p-3 border-t border-outline-variant/20">
                    <button
                      onClick={async () => {
                        await mp.markAllNotificationsRead();
                        setUnreadNotifications(0);
                        setShowNotificationDropdown(false);
                      }}
                      className="w-full py-2 text-xs font-bold text-primary hover:opacity-80"
                    >
                      Mark all as read
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

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

import React, { useState, useEffect } from 'react';
import Icon from '../AppIcon';
import Select from './Select';

const Header = () => {
  const [selectedLocation, setSelectedLocation] = useState('store-001');
  const [connectionStatus, setConnectionStatus] = useState('connected');
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const locations = [
    { value: 'store-001', label: 'Downtown Store #001' },
    { value: 'store-002', label: 'Mall Location #002' },
    { value: 'store-003', label: 'Suburban Store #003' },
    { value: 'store-004', label: 'Express Location #004' },
  ];

  const navigationItems = [];

  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdate(new Date());
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setLastUpdate(new Date());
    setConnectionStatus('refreshing');
    setTimeout(() => setConnectionStatus('connected'), 1000);
  };

  const handleLocationChange = (newLocation) => {
    setSelectedLocation(newLocation);
  };

  const formatLastUpdate = (date) => {
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return date?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <header className="sticky top-0 z-100 bg-card border-b border-border">
      <div className="flex items-center justify-between h-16 px-6">
        {/* Logo and Brand */}
        <div className="flex items-center space-x-8">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-8 h-8 bg-primary rounded-lg">
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5 text-primary-foreground"
                fill="currentColor"
              >
                <path d="M12 2L2 7v10c0 5.55 3.84 9.74 9 11 5.16-1.26 9-5.45 9-11V7l-10-5z"/>
                <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" fill="none"/>
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-semibold text-foreground">LaundryKing</span>
              <span className="text-xs text-muted-foreground -mt-1">Analytics</span>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            {navigationItems?.map((item) => (
              <a
                key={item?.path}
                href={item?.path}
                className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-primary bg-primary/10 rounded-lg transition-smooth hover:bg-primary/20"
                title={item?.tooltip}
              >
                <Icon name={item?.icon} size={16} />
                <span>{item?.label}</span>
              </a>
            ))}
          </nav>
        </div>

        {/* Right Side Controls */}
        {/* Removed location selector and status indicator for cleaner header */}
        {/* Mobile Menu Button remains */}
        <div className="flex items-center space-x-4">
          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-smooth"
          >
            <Icon name={isMobileMenuOpen ? "X" : "Menu"} size={20} />
          </button>
        </div>
      </div>
      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-card">
          <div className="px-6 py-4 space-y-4">
            {/* Mobile Navigation */}
            <nav className="space-y-2">
              {navigationItems?.map((item) => (
                <a
                  key={item?.path}
                  href={item?.path}
                  className="flex items-center space-x-3 px-3 py-3 text-sm font-medium text-primary bg-primary/10 rounded-lg"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Icon name={item?.icon} size={16} />
                  <span>{item?.label}</span>
                </a>
              ))}
            </nav>

            {/* Mobile Location Selector */}
            <div className="sm:hidden">
              <Select
                label="Location"
                options={locations}
                value={selectedLocation}
                onChange={handleLocationChange}
                placeholder="Select location"
              />
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
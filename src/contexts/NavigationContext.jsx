import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export const NavigationContext = createContext(null);

const TAB_ALIASES = {
  'expiry': 'renewals',
  'disabled': 'disabled-users',
  'storage-health': 'storage'
};

const VALID_TABS = [
  'dashboard',
  'users',
  'employees',
  'vps',
  'hardware-specs',
  'server-users',
  'assignment',
  'renewals',
  'sessions',
  'logs',
  'settings',
  'tickets',
  'monitoring',
  'disabled-users',
  'storage',
  'daily-activity',
  'reports'
];

function normalizeTab(raw) {
  if (!raw) return 'dashboard';
  const clean = raw.toLowerCase().trim();
  const resolved = TAB_ALIASES[clean] || clean;
  return VALID_TABS.includes(resolved) ? resolved : null;
}

export function NavigationProvider({ children, initialTab = 'dashboard' }) {
  const [activeTab, setActiveTabState] = useState(() => {
    const hash = (window.location.hash || '').replace(/^#\/?/, '');
    const valid = normalizeTab(hash);
    return valid || initialTab;
  });

  const [reportsTargetServerId, setReportsTargetServerId] = useState(null);
  const [serverUsersTargetServerId, setServerUsersTargetServerId] = useState(null);
  const [hardwareSpecsTargetServerId, setHardwareSpecsTargetServerId] = useState(null);

  const setActiveTab = useCallback((tab) => {
    if (!tab) return;
    const resolved = normalizeTab(tab) || tab;
    setActiveTabState(resolved);
    if (window.location.hash !== `#${resolved}`) {
      window.history.pushState(null, '', `#${resolved}`);
    }
  }, []);

  // Listen for browser back / forward navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = (window.location.hash || '').replace(/^#\/?/, '');
      const valid = normalizeTab(hash);
      if (valid) {
        setActiveTabState(valid);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handleHashChange);
    };
  }, []);

  const navigateToReports = useCallback((serverId) => {
    if (serverId) setReportsTargetServerId(serverId);
    setActiveTab('reports');
  }, [setActiveTab]);

  const navigateToServerUsers = useCallback((serverId) => {
    if (serverId) setServerUsersTargetServerId(serverId);
    setActiveTab('server-users');
  }, [setActiveTab]);

  const navigateToHardwareSpecs = useCallback((serverId) => {
    if (serverId) setHardwareSpecsTargetServerId(serverId);
    setActiveTab('hardware-specs');
  }, [setActiveTab]);

  return (
    <NavigationContext.Provider
      value={{
        activeTab,
        setActiveTab,
        reportsTargetServerId,
        setReportsTargetServerId,
        serverUsersTargetServerId,
        setServerUsersTargetServerId,
        hardwareSpecsTargetServerId,
        setHardwareSpecsTargetServerId,
        navigateToReports,
        navigateToServerUsers,
        navigateToHardwareSpecs
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return ctx;
}

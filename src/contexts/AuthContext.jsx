import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export const AuthContext = createContext(null);

export const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000/api'
  : '/api';

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // Configurable Rights Policies
  const [employeePermissions, setEmployeePermissions] = useState({
    canExport: false,
    canAddClient: true,
    canEditClient: true,
    canDeleteClient: true,
    canRenewClient: true,
    canEditServer: false,
    canSuperLogin: true,
    canApproveRequests: true
  });

  const [salespersonPermissions, setSalespersonPermissions] = useState({
    canExport: false,
    canAddClient: true,
    canEditClient: true,
    canDeleteClient: false,
    canRenewClient: true,
    canEditServer: false,
    canSuperLogin: false,
    canApproveRequests: false
  });

  // Central authenticated API fetch helper with HttpOnly credentials
  const authFetch = useCallback(async (url, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    try {
      const res = await fetch(url, {
        ...options,
        headers,
        credentials: 'include'
      });
      return res;
    } catch (e) {
      throw e;
    }
  }, []);

  // 1. Check tab session on initial startup
  useEffect(() => {
    const checkAuthSession = async () => {
      const isTabAuthorized = sessionStorage.getItem('vps_tab_alive') === '1';

      if (!isTabAuthorized) {
        setCurrentUser(null);
        setIsAuthChecking(false);
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.employee) {
            setCurrentUser(data.employee);
            sessionStorage.setItem('vps_tab_alive', '1');
          } else {
            setCurrentUser(null);
            sessionStorage.removeItem('vps_tab_alive');
          }
        } else {
          setCurrentUser(null);
          sessionStorage.removeItem('vps_tab_alive');
        }
      } catch (e) {
        console.warn("Session validation error:", e);
        setCurrentUser(null);
      } finally {
        setIsAuthChecking(false);
      }
    };

    checkAuthSession();
  }, []);

  // 2. Tab session heartbeat every 30s
  useEffect(() => {
    if (!currentUser) return;

    const heartbeatInterval = setInterval(() => {
      fetch(`${API_BASE}/auth/heartbeat`, {
        method: 'POST',
        credentials: 'include'
      }).catch(() => {});
    }, 30000);

    return () => clearInterval(heartbeatInterval);
  }, [currentUser]);

  const login = useCallback((employee) => {
    setCurrentUser(employee);
    sessionStorage.setItem('vps_tab_alive', '1');
  }, []);

  const logout = useCallback(async () => {
    try {
      sessionStorage.removeItem('vps_tab_alive');
      sessionStorage.removeItem('offline_vps_warned');
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (e) {
      console.warn("Logout error:", e);
    }
    setCurrentUser(null);
  }, []);

  const effectivePermissions = currentUser?.role === 'SUPER_ADMIN'
    ? {
        canExport: true,
        canAddClient: true,
        canEditClient: true,
        canDeleteClient: true,
        canRenewClient: true,
        canEditServer: true,
        canSuperLogin: true,
        canApproveRequests: true
      }
    : (currentUser?.role === 'SALESPERSON' ? salespersonPermissions : employeePermissions);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        isAuthChecking,
        isAuthenticated: !!currentUser,
        employeePermissions,
        setEmployeePermissions,
        salespersonPermissions,
        setSalespersonPermissions,
        effectivePermissions,
        authFetch,
        login,
        logout,
        API_BASE
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

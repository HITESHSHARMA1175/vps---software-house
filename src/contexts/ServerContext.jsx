import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth, API_BASE } from './AuthContext';
import { useToast } from './ToastContext';

export const ServerContext = createContext(null);

export function ServerProvider({ children }) {
  const { currentUser, authFetch } = useAuth();
  const { showToast } = useToast();

  const [servers, setServers] = useState([]);
  const [telemetryData, setTelemetryData] = useState({});
  const [hardwareHistory, setHardwareHistory] = useState([]);
  const [isRefreshingTelemetry, setIsRefreshingTelemetry] = useState(false);

  // 1. Fetch Servers
  const fetchServers = useCallback(async () => {
    if (!currentUser) return [];
    try {
      const res = await authFetch(`${API_BASE}/servers`);
      if (res.ok) {
        const val = await res.json();
        const list = Array.isArray(val) ? val : (val.servers || []);
        if (list.length > 0) setServers(list);
        return list;
      }
    } catch (e) {
      console.warn("Failed to fetch servers:", e);
    }
    return [];
  }, [currentUser, authFetch]);

  // 2. Fetch Live Telemetry & Hardware History
  const fetchTelemetry = useCallback(async () => {
    if (!currentUser) return;
    try {
      const res = await authFetch(`${API_BASE}/servers/telemetry`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.telemetry) {
          setTelemetryData(data.telemetry);
        }
        if (data.success && Array.isArray(data.hardwareHistory)) {
          setHardwareHistory(data.hardwareHistory);
        }
      }
    } catch (e) {
      // Telemetry error can be transient
    }
  }, [currentUser, authFetch]);

  // 2.1 Fetch Explicit Hardware History
  const fetchHardwareHistory = useCallback(async (serverId) => {
    if (!currentUser) return [];
    try {
      const url = serverId ? `${API_BASE}/servers/${serverId}/hardware-history` : `${API_BASE}/servers/hardware-history`;
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.history)) {
          setHardwareHistory(data.history);
          return data.history;
        }
      }
    } catch (e) {
      console.warn("Failed to fetch hardware history:", e);
    }
    return [];
  }, [currentUser, authFetch]);

  // 3. Manual Refresh with indicator
  const refreshTelemetry = useCallback(async () => {
    setIsRefreshingTelemetry(true);
    try {
      await Promise.allSettled([fetchServers(), fetchTelemetry()]);
      showToast('Telemetry and server fleet synchronized!', 'info');
    } finally {
      setTimeout(() => setIsRefreshingTelemetry(false), 600);
    }
  }, [fetchServers, fetchTelemetry, showToast]);

  // 4. Background Polling (telemetry 10s, servers 30s)
  useEffect(() => {
    if (!currentUser) return;

    fetchServers();
    fetchTelemetry();

    const teleInterval = setInterval(fetchTelemetry, 10000);
    const srvInterval = setInterval(fetchServers, 30000);

    return () => {
      clearInterval(teleInterval);
      clearInterval(srvInterval);
    };
  }, [currentUser, fetchServers, fetchTelemetry]);

  // 5. Offline Server Computation
  const offlineServersList = useMemo(() => {
    if (!servers || servers.length === 0) return [];
    return servers.map(s => {
      const sIpPure = s.ipPort ? s.ipPort.split(':')[0] : '';
      const tData = telemetryData[s.id] || telemetryData[s.ipPort] || telemetryData[s.name] || (sIpPure && telemetryData[sIpPure]) || null;
      const lastPingMs = tData?.lastPingTimestamp || 0;
      const secondsAgo = lastPingMs ? Math.max(0, Math.floor((Date.now() - lastPingMs) / 1000)) : 999;
      const isOnline = !!(tData && lastPingMs && secondsAgo < 180);

      let lastPingText = 'Never Connected';
      if (lastPingMs) {
        lastPingText = secondsAgo < 60 ? `${secondsAgo}s ago` : `${Math.floor(secondsAgo / 60)}m ago`;
      }

      return {
        ...s,
        isOnline,
        lastPingTimestamp: lastPingMs,
        lastPingText,
        secondsAgo
      };
    }).filter(s => !s.isOnline);
  }, [servers, telemetryData]);

  // 6. Server CRUD
  const addServer = useCallback(async (newServer) => {
    setServers(prev => [...prev, newServer]);
    showToast(`Server "${newServer.name}" added successfully!`);
    try {
      const res = await authFetch(`${API_BASE}/servers`, {
        method: 'POST',
        body: JSON.stringify(newServer)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Server rejected creation');
      }
      const created = await res.json().catch(() => ({}));
      await fetchServers();
      return created; // may carry the one-time agentKey / agentInstall
    } catch (e) {
      showToast(`Failed to persist server: ${e.message}`, 'error');
      await fetchServers();
      throw e;
    }
  }, [authFetch, fetchServers, showToast]);

  const editServer = useCallback(async (updatedServer) => {
    setServers(prev => prev.map(s => s.id === updatedServer.id ? updatedServer : s));
    showToast(`Server "${updatedServer.name}" updated!`);
    try {
      const res = await authFetch(`${API_BASE}/servers/${updatedServer.id}`, {
        method: 'PUT',
        body: JSON.stringify(updatedServer)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Server rejected update');
      }
      await fetchServers();
    } catch (e) {
      showToast(`Failed to update server specs: ${e.message}`, 'error');
      await fetchServers();
      throw e;
    }
  }, [authFetch, fetchServers, showToast]);

  const deleteServer = useCallback(async (serverId) => {
    const target = servers.find(s => s.id === serverId);
    setServers(prev => prev.filter(s => s.id !== serverId));
    showToast(`Server deleted.`);
    try {
      const res = await authFetch(`${API_BASE}/servers/${serverId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Server rejected deletion');
      }
      await fetchServers();
    } catch (e) {
      showToast(`Failed to delete server from database: ${e.message}`, 'error');
      await fetchServers();
      throw e;
    }
  }, [servers, authFetch, fetchServers, showToast]);

  // 7. Remote Action Helpers
  const changeUserStatus = useCallback(async (serverId, username, status) => {
    try {
      const res = await authFetch(`${API_BASE}/servers/${serverId}/change-user-status`, {
        method: 'POST',
        body: JSON.stringify({ username, status })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || `User status changed to ${status}!`);
        setTimeout(fetchTelemetry, 2500);
        return data;
      } else {
        throw new Error(data.error || 'Failed to dispatch status update');
      }
    } catch (e) {
      showToast(`Error changing status: ${e.message}`, 'error');
      throw e;
    }
  }, [authFetch, fetchTelemetry, showToast]);

  const forceLogoffSession = useCallback(async (serverId, sessionId, username) => {
    try {
      const res = await authFetch(`${API_BASE}/servers/${serverId}/logoff-session`, {
        method: 'POST',
        body: JSON.stringify({ sessionId, username })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || `Logoff dispatched for session ${sessionId} (${username})! 🚪`);
        setTimeout(fetchTelemetry, 2500);
        return data;
      } else {
        throw new Error(data.error || 'Failed to dispatch logoff');
      }
    } catch (e) {
      showToast(`Error terminating session: ${e.message}`, 'error');
      throw e;
    }
  }, [authFetch, fetchTelemetry, showToast]);

  return (
    <ServerContext.Provider
      value={{
        servers,
        setServers,
        telemetryData,
        setTelemetryData,
        hardwareHistory,
        setHardwareHistory,
        fetchHardwareHistory,
        offlineServersList,
        isRefreshingTelemetry,
        fetchServers,
        fetchTelemetry,
        refreshTelemetry,
        addServer,
        editServer,
        deleteServer,
        changeUserStatus,
        forceLogoffSession
      }}
    >
      {children}
    </ServerContext.Provider>
  );
}

export function useServers() {
  const ctx = useContext(ServerContext);
  if (!ctx) {
    throw new Error('useServers must be used within a ServerProvider');
  }
  return ctx;
}

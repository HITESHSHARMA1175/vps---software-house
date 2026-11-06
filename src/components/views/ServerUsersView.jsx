import React, { useState, useEffect, useMemo } from 'react';
import {
  UserCog,
  Server,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  Key,
  LogOut,
  Radio,
  ExternalLink,
  Users,
  ShieldCheck,
  Building,
  HardDrive,
  Calendar,
  Sparkles,
  Info,
  Check,
  Copy,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import ChangeServerUserPasswordModal from '../ChangeServerUserPasswordModal';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../hooks/useAuth';

export default function ServerUsersView({
  servers = [],
  users = [],
  telemetryData = {},
  initialServerId = null,
  onDirectRemoteConnect = null,
  onRefreshTelemetry = null,
  onForceLogoffSession = null
}) {
  const { showToast } = useToast();
  const { authFetch } = useAuth();

  const [selectedServerId, setSelectedServerId] = useState(() => {
    if (initialServerId && servers.some(s => s.id === initialServerId)) {
      return initialServerId;
    }
    return servers[0]?.id || 'all';
  });

  const [osUsers, setOsUsers] = useState([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    enabledCount: 0,
    disabledCount: 0,
    activeSessionsCount: 0,
    unlinkedCount: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL', 'ENABLED', 'DISABLED', 'SESSIONS', 'UNLINKED'
  const [sortField, setSortField] = useState('username');
  const [sortDirection, setSortDirection] = useState('asc');
  const [actionInProgress, setActionInProgress] = useState({}); // { [userId]: true }

  // Modal State for Password Change
  const [passwordModalUser, setPasswordModalUser] = useState(null);

  useEffect(() => {
    if (initialServerId && servers.some(s => s.id === initialServerId)) {
      setSelectedServerId(initialServerId);
    }
  }, [initialServerId, servers]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Fetch OS users for selected server(s)
  const fetchOsUsers = async () => {
    setIsLoading(true);
    try {
      const targetParam = selectedServerId || 'all';
      const res = await authFetch(`/api/servers/${encodeURIComponent(targetParam)}/os-users`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.users)) {
          setOsUsers(data.users);
          if (data.stats) setStats(data.stats);
          setIsLoading(false);
          return;
        }
      }
    } catch (e) {
      console.error('Error fetching OS users:', e);
    }

    // Client-side fallback generation if endpoint is temporarily unreachable
    generateClientFallbackUsers();
    setIsLoading(false);
  };

  const generateClientFallbackUsers = () => {
    const targetServers = selectedServerId === 'all'
      ? servers
      : servers.filter(s => s.id === selectedServerId || s.ipPort === selectedServerId);

    const generated = [];
    targetServers.forEach(srv => {
      const sIpPure = srv.ipPort ? srv.ipPort.split(':')[0] : '';
      const tData = telemetryData[srv.id] || telemetryData[srv.ipPort] || telemetryData[srv.name] || (sIpPure && telemetryData[sIpPure]) || null;
      const rawAll = tData?.allServerUsers || srv.lastKnownAllUsers || [];
      const rawDis = new Set((tData?.disabledServerUsers || srv.lastKnownDisabledUsers || []).map(u => String(u).toLowerCase().trim()));
      const rawSessions = tData?.detailedSessions || [];

      const assigned = users.filter(u => u.serverId === srv.id || u.serverId === srv.ipPort);
      const assignedMap = new Map();
      assigned.forEach(u => { if (u.username) assignedMap.set(u.username.toLowerCase().trim(), u); });

      const candSet = new Set();
      (Array.isArray(rawAll) ? rawAll : []).forEach(u => candSet.add(String(u).trim()));
      assigned.forEach(u => { if (u.username) candSet.add(u.username.trim()); });

      candSet.forEach(uName => {
        const lower = uName.toLowerCase();
        if (lower.match(/^(Administrator|Guest|DefaultAccount|WDAGUtilityAccount)$/i)) return;

        const matchedClient = assignedMap.get(lower) || null;
        const matchedSess = rawSessions.find(s => (s.username || '').toLowerCase().trim().startsWith(lower));

        const isEnabled = !rawDis.has(lower) && (!matchedClient || matchedClient.status !== 'DISABLED');
        const sessionState = matchedSess ? (matchedSess.state === 'Disconnected' ? 'DISCONNECTED' : 'ACTIVE') : 'OFFLINE';

        generated.push({
          id: `os-user-${srv.id}-${lower}`,
          username: uName,
          serverId: srv.id,
          serverName: srv.name || srv.ipPort || srv.id,
          serverIp: srv.ipPort || '',
          isEnabled,
          status: isEnabled ? 'Active' : 'Disabled',
          sessionState,
          sessionId: matchedSess ? matchedSess.sessionId : null,
          logonTime: matchedSess ? matchedSess.logonTime : null,
          isLinked: !!matchedClient,
          client: matchedClient
        });
      });
    });

    setOsUsers(generated);
    setStats({
      totalUsers: generated.length,
      enabledCount: generated.filter(u => u.isEnabled).length,
      disabledCount: generated.filter(u => !u.isEnabled).length,
      activeSessionsCount: generated.filter(u => u.sessionState === 'ACTIVE' || u.sessionState === 'DISCONNECTED').length,
      unlinkedCount: generated.filter(u => !u.isLinked).length
    });
  };

  useEffect(() => {
    fetchOsUsers();
  }, [selectedServerId]);

  // Actions
  const handleToggleStatus = async (user) => {
    const targetServer = servers.find(s => s.id === user.serverId || s.ipPort === user.serverId) || { id: user.serverId, name: user.serverName || user.serverId };

    const newEnabledState = !user.isEnabled;
    const actionLabel = newEnabledState ? 'ENABLE' : 'DISABLE';

    setActionInProgress(prev => ({ ...prev, [user.id]: true }));

    try {
      const res = await authFetch(`/api/servers/${encodeURIComponent(targetServer.id)}/change-user-status`, {
        method: 'POST',
        body: JSON.stringify({
          username: user.username,
          enable: newEnabledState,
          enabled: newEnabledState
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Account '${user.username}' is now ${newEnabledState ? 'ENABLED' : 'DISABLED'} on Windows VPS! 🎉`);
        setOsUsers(prev => prev.map(u => u.id === user.id ? { ...u, isEnabled: newEnabledState, status: newEnabledState ? 'Active' : 'Disabled' } : u));
        setStats(prev => ({
          ...prev,
          enabledCount: prev.enabledCount + (newEnabledState ? 1 : -1),
          disabledCount: prev.disabledCount + (newEnabledState ? -1 : 1)
        }));
        if (onRefreshTelemetry) onRefreshTelemetry();
      } else {
        showToast(data.error?.message || data.error || `Failed to ${actionLabel} account on server`, 'error');
      }
    } catch (e) {
      showToast(`Network or server error while executing ${actionLabel}`, 'error');
    } finally {
      setActionInProgress(prev => ({ ...prev, [user.id]: false }));
    }
  };

  const handleForceLogoff = async (user) => {
    if (!user.sessionId && !user.username) {
      showToast('No active session ID or username found to log off', 'error');
      return;
    }

    const targetServer = servers.find(s => s.id === user.serverId || s.ipPort === user.serverId) || { id: user.serverId, name: user.serverName || user.serverId };

    if (!window.confirm(`Force logoff session #${user.sessionId || 'Active'} for '${user.username}' from ${targetServer.name}?`)) {
      return;
    }

    setActionInProgress(prev => ({ ...prev, [user.id]: true }));

    try {
      if (onForceLogoffSession) {
        await onForceLogoffSession(targetServer.id, user.sessionId, user.username);
      } else {
        const res = await authFetch(`/api/servers/${encodeURIComponent(targetServer.id)}/logoff-session`, {
          method: 'POST',
          body: JSON.stringify({
            sessionId: user.sessionId,
            username: user.username
          })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error?.message || data.error || 'Failed to dispatch session logoff');
        }
      }

      showToast(`Session for '${user.username}' terminated.`);
      setOsUsers(prev => prev.map(u => u.id === user.id ? { ...u, sessionState: 'OFFLINE', sessionId: null } : u));
      setStats(prev => ({ ...prev, activeSessionsCount: Math.max(0, prev.activeSessionsCount - 1) }));
      if (onRefreshTelemetry) onRefreshTelemetry();
    } catch (e) {
      showToast('Error sending logoff request: ' + (e.message || 'Network error'), 'error');
    } finally {
      setActionInProgress(prev => ({ ...prev, [user.id]: false }));
    }
  };

  // Filtered & Sorted list
  const filteredUsers = useMemo(() => {
    const list = osUsers.filter(u => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = u.username.toLowerCase().includes(q);
        const matchesServer = (u.serverName || '').toLowerCase().includes(q);
        const matchesClient = u.client && (u.client.company || '').toLowerCase().includes(q);
        if (!matchesName && !matchesServer && !matchesClient) return false;
      }

      // Filter chips
      if (activeFilter === 'ENABLED') return u.isEnabled;
      if (activeFilter === 'DISABLED') return !u.isEnabled;
      if (activeFilter === 'SESSIONS') return u.sessionState === 'ACTIVE' || u.sessionState === 'DISCONNECTED';
      if (activeFilter === 'UNLINKED') return !u.isLinked;

      return true;
    });

    return [...list].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (sortField === 'username') {
        valA = (a.username || '').toLowerCase();
        valB = (b.username || '').toLowerCase();
      } else if (sortField === 'server') {
        valA = (a.serverName || '').toLowerCase();
        valB = (b.serverName || '').toLowerCase();
      } else if (sortField === 'status') {
        valA = a.isEnabled ? 1 : 0;
        valB = b.isEnabled ? 1 : 0;
      } else if (sortField === 'session') {
        valA = a.sessionState || '';
        valB = b.sessionState || '';
      }
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [osUsers, searchQuery, activeFilter, sortField, sortDirection]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* 1. Header & Server Context Bar */}
      <div className="surface-card" style={{
        padding: '14px 18px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        borderLeft: '4px solid var(--accent-indigo)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--accent-indigo-bg)',
            border: '1px solid var(--accent-indigo-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <UserCog size={20} color="var(--accent-indigo)" />
          </div>
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              Server OS User Controller
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Direct Windows VPS Local Accounts Management — Enable / Disable &amp; Password Sync.
            </p>
          </div>
        </div>

        {/* Server Selector & Refresh Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Server size={14} color="var(--accent-indigo)" />
            <select
              value={selectedServerId}
              onChange={(e) => setSelectedServerId(e.target.value)}
              className="select"
              style={{
                fontSize: '12px',
                fontWeight: '600',
                height: '32px',
                minWidth: '200px'
              }}
            >
              <option value="all">🌐 All VPS Servers ({servers.length} Nodes)</option>
              {servers.map(srv => (
                <option key={srv.id} value={srv.id}>
                  {srv.name} ({srv.ipPort})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              if (onRefreshTelemetry) onRefreshTelemetry();
              fetchOsUsers();
            }}
            className="btn btn-secondary btn-sm"
            title="Refresh Server User Telemetry"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* 2. Executive Stat Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        {/* Card 1: Total Server OS Accounts */}
        <div className="surface-card" style={{ padding: '14px', borderLeft: '3px solid var(--accent-indigo)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              OS Accounts
            </span>
            <Users size={15} color="var(--accent-indigo)" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)', lineHeight: 1.1 }}>
            {stats.totalUsers}
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Discovered on Windows nodes
          </div>
        </div>

        {/* Card 2: Enabled Accounts */}
        <div className="surface-card" style={{ padding: '14px', borderLeft: '3px solid var(--accent-emerald)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Enabled
            </span>
            <Unlock size={15} color="var(--accent-emerald)" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--accent-emerald)', lineHeight: 1.1 }}>
            {stats.enabledCount}
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Active &amp; permitted on Windows
          </div>
        </div>

        {/* Card 3: Disabled Accounts */}
        <div className="surface-card" style={{ padding: '14px', borderLeft: '3px solid var(--accent-rose)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Disabled
            </span>
            <Lock size={15} color="var(--accent-rose)" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--accent-rose)', lineHeight: 1.1 }}>
            {stats.disabledCount}
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Locked out (<code>/active:no</code>)
          </div>
        </div>

        {/* Card 4: Active/Disconnected RDP Sessions */}
        <div className="surface-card" style={{ padding: '14px', borderLeft: '3px solid var(--accent-sky)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              In RAM (Sessions)
            </span>
            <Radio size={15} color="var(--accent-sky)" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--accent-sky)', lineHeight: 1.1 }}>
            {stats.activeSessionsCount}
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Loaded in Server RAM
          </div>
        </div>

        {/* Card 5: Unlinked Direct OS Accounts */}
        <div className="surface-card" style={{ padding: '14px', borderLeft: '3px solid var(--accent-amber)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Server-Only
            </span>
            <AlertTriangle size={15} color="var(--accent-amber)" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--accent-amber)', lineHeight: 1.1 }}>
            {stats.unlinkedCount}
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Direct OS accounts
          </div>
        </div>
      </div>

      {/* 3. Search Bar & Filter Chips */}
      <div className="surface-card" style={{
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search accounts by username, company, or server..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input"
            style={{ height: '32px', paddingLeft: '30px', fontSize: '12px' }}
          />
        </div>

        {/* Filter Chips */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'ALL', label: `All Users (${osUsers.length})` },
            { id: 'ENABLED', label: `🟢 Enabled (${stats.enabledCount})` },
            { id: 'DISABLED', label: `🔴 Disabled (${stats.disabledCount})` },
            { id: 'SESSIONS', label: `⚡ In RAM (${stats.activeSessionsCount})` },
            { id: 'UNLINKED', label: `⚠️ Server-Only (${stats.unlinkedCount})` }
          ].map(chip => (
            <button
              key={chip.id}
              onClick={() => setActiveFilter(chip.id)}
              className={`btn btn-xs ${activeFilter === chip.id ? 'btn-primary' : 'btn-secondary'}`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Server Users Data Table */}
      <div className="table-wrapper">
        <div className="table-container">
          <table className="table-modern">
            <thead>
              <tr>
                <th onClick={() => handleSort('username')} style={{ cursor: 'pointer', userSelect: 'none' }} title="Sort by Username">
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    Windows OS Account
                    {sortField === 'username' ? (
                      sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                    ) : (
                      <ArrowUpDown size={12} style={{ opacity: 0.4 }} />
                    )}
                  </div>
                </th>
                <th onClick={() => handleSort('server')} style={{ cursor: 'pointer', userSelect: 'none' }} title="Sort by Server">
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    Target VPS Server
                    {sortField === 'server' ? (
                      sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                    ) : (
                      <ArrowUpDown size={12} style={{ opacity: 0.4 }} />
                    )}
                  </div>
                </th>
                <th>Portal Link Status</th>
                <th onClick={() => handleSort('status')} style={{ cursor: 'pointer', userSelect: 'none' }} title="Sort by State">
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    Windows State
                    {sortField === 'status' ? (
                      sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                    ) : (
                      <ArrowUpDown size={12} style={{ opacity: 0.4 }} />
                    )}
                  </div>
                </th>
                <th onClick={() => handleSort('session')} style={{ cursor: 'pointer', userSelect: 'none' }} title="Sort by Live Session">
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    Live Session
                    {sortField === 'session' ? (
                      sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                    ) : (
                      <ArrowUpDown size={12} style={{ opacity: 0.4 }} />
                    )}
                  </div>
                </th>
                <th style={{ textAlign: 'right' }}>Direct Server Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px auto', display: 'block', color: 'var(--accent-indigo)' }} />
                    <span style={{ fontSize: '13px', fontWeight: '600' }}>Scanning Windows Local Accounts from VPS Agent...</span>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
                    <div style={{ maxWidth: '320px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <UserCog size={36} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                      <strong style={{ color: 'var(--text-primary)', fontSize: '14px' }}>No Server Accounts Found</strong>
                      <p style={{ fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                        {searchQuery ? `No accounts match "${searchQuery}". Try clearing search or choosing another filter.` : 'No OS user accounts found on this VPS server.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map(u => {
                  const isBusy = !!actionInProgress[u.id];

                  return (
                    <tr
                      key={u.id}
                      style={{
                        backgroundColor: !u.isEnabled ? 'rgba(244, 63, 94, 0.04)' : undefined
                      }}
                    >
                      {/* 1. Windows OS Account */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '30px',
                            height: '30px',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: u.isEnabled ? 'var(--accent-emerald-bg)' : 'var(--accent-rose-bg)',
                            color: u.isEnabled ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                            border: `1px solid ${u.isEnabled ? 'var(--accent-emerald-border)' : 'var(--accent-rose-border)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: '800',
                            fontSize: '11px'
                          }}>
                            {u.username.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-mono" style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)' }}>
                              {u.username}
                            </div>
                            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                              Windows Local User
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Target VPS Server */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Server size={13} color="var(--accent-indigo)" />
                          <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>
                            {u.serverName}
                          </span>
                        </div>
                        {u.serverIp && (
                          <div className="font-mono" style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginLeft: '19px' }}>
                            {u.serverIp}
                          </div>
                        )}
                      </td>

                      {/* 3. Portal Link Status */}
                      <td>
                        {u.isLinked ? (
                          <div>
                            <span className="badge badge-emerald" style={{ fontSize: '10px' }}>
                              <CheckCircle2 size={10} /> Linked: {u.client?.company || 'Client'}
                            </span>
                            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              Drive: <strong>{u.client?.drive || '-'}</strong> • Exp: {u.client?.expiryDate || 'N/A'}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="badge badge-amber" style={{ fontSize: '10px' }}>
                              <AlertTriangle size={10} /> Direct OS Account
                            </span>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
                              Created on Windows directly
                            </div>
                          </div>
                        )}
                      </td>

                      {/* 4. Windows State (Enabled / Disabled) */}
                      <td>
                        {u.isEnabled ? (
                          <span className="badge badge-emerald" style={{ fontSize: '10.5px' }}>
                            <Unlock size={11} /> ENABLED
                          </span>
                        ) : (
                          <span className="badge badge-rose" style={{ fontSize: '10.5px' }}>
                            <Lock size={11} /> DISABLED
                          </span>
                        )}
                      </td>

                      {/* 5. Live Session */}
                      <td>
                        {u.sessionState === 'ACTIVE' ? (
                          <div>
                            <span className="badge badge-emerald" style={{ fontSize: '10px' }}>
                              <span className="status-pip status-pip-emerald" style={{ width: '5px', height: '5px' }} />
                              ONLINE (RDP)
                            </span>
                            {u.sessionId && (
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Sess #{u.sessionId} • {u.logonTime || 'Active'}
                              </div>
                            )}
                          </div>
                        ) : u.sessionState === 'DISCONNECTED' ? (
                          <div>
                            <span className="badge badge-amber" style={{ fontSize: '10px' }}>
                              <Radio size={10} /> IN RAM (Disc)
                            </span>
                            {u.sessionId && (
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Sess #{u.sessionId}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Offline</span>
                        )}
                      </td>

                      {/* 6. Direct Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '5px', flexWrap: 'wrap' }}>
                          {/* Change Password Button */}
                          <button
                            onClick={() => setPasswordModalUser(u)}
                            disabled={isBusy}
                            className="btn btn-secondary btn-xs"
                            title="Change password on Windows VPS"
                          >
                            <Key size={11} color="var(--accent-amber)" /> Password
                          </button>

                          {/* Toggle Status (Enable / Disable) */}
                          <button
                            onClick={() => handleToggleStatus(u)}
                            disabled={isBusy}
                            className={`btn btn-xs ${u.isEnabled ? 'btn-danger' : 'btn-success'}`}
                            title={u.isEnabled ? 'Disable user on Windows VPS' : 'Enable user on Windows VPS'}
                          >
                            {isBusy ? (
                              <RefreshCw size={11} className="animate-spin" />
                            ) : u.isEnabled ? (
                              <>
                                <Lock size={11} /> Disable
                              </>
                            ) : (
                              <>
                                <Unlock size={11} /> Enable
                              </>
                            )}
                          </button>

                          {/* Force Logoff (If in session) */}
                          {u.sessionState !== 'OFFLINE' && (
                            <button
                              onClick={() => handleForceLogoff(u)}
                              disabled={isBusy}
                              className="btn btn-warning btn-xs"
                              title="Force logoff RDP session from Windows VPS"
                            >
                              <LogOut size={11} /> Logoff
                            </button>
                          )}

                          {/* Direct Web RDP Connect (If linked) */}
                          {u.isLinked && onDirectRemoteConnect && (
                            <button
                              onClick={() => onDirectRemoteConnect(u.client)}
                              className="btn btn-secondary btn-xs"
                              title="Connect to remote desktop session"
                            >
                              <ExternalLink size={11} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Change Password Modal */}
      {passwordModalUser && (
        <ChangeServerUserPasswordModal
          isOpen={!!passwordModalUser}
          onClose={() => setPasswordModalUser(null)}
          targetUser={passwordModalUser}
          onSuccess={(uName, sId, msg) => {
            showToast(msg || `Password updated for '${uName}' on Windows VPS.`);
          }}
        />
      )}
    </div>
  );
}

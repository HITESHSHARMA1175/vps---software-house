import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Zap,
  Users,
  Server,
  Search,
  Filter,
  RefreshCw,
  Clock,
  LogOut,
  AlertTriangle,
  CheckCircle2,
  Download,
  Trash2,
  Sliders,
  Radio,
  ExternalLink,
  ChevronRight,
  Info
} from 'lucide-react';
import { useAuth, API_BASE } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';

export default function SessionSecurityView({
  servers = [],
  users = [],
  currentUser
}) {
  const { authFetch } = useAuth();
  const { showToast } = useToast();

  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState({
    totalIntercepted: 0,
    todayLoggedOff: 0,
    uniqueUsersCount: 0,
    lastEvent: null
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedServer, setSelectedServer] = useState('ALL');
  const [selectedAction, setSelectedAction] = useState('ALL');

  // Policy Modal
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
  const [policyServerId, setPolicyServerId] = useState('ALL');
  const [policyMode, setPolicyMode] = useState('Enforce');
  const [policyGrace, setPolicyGrace] = useState(3);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const isSuperAdmin = currentUser && (currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'ADMIN');

  // Fetch Duplicate Login Events from Backend
  const fetchEvents = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const res = await authFetch(`${API_BASE}/duplicate-logins`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        if (data.stats) {
          setStats(data.stats);
        }
      }
    } catch (err) {
      console.error('Failed to fetch duplicate login events:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchEvents(false);
  }, [fetchEvents]);

  // Periodic Auto-Refresh (Every 5 seconds)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchEvents(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchEvents]);

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter(evt => {
      if (selectedServer !== 'ALL' && evt.serverId !== selectedServer) {
        return false;
      }
      if (selectedAction !== 'ALL' && evt.action !== selectedAction) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const uMatch = (evt.username || '').toLowerCase().includes(q);
        const sMatch = (evt.serverName || '').toLowerCase().includes(q) || (evt.serverId || '').toLowerCase().includes(q);
        const reasonMatch = (evt.reason || '').toLowerCase().includes(q);
        const sessMatch = String(evt.newSessionId || '').includes(q) || String(evt.oldSessionId || '').includes(q);
        if (!uMatch && !sMatch && !reasonMatch && !sessMatch) return false;
      }
      return true;
    });
  }, [events, selectedServer, selectedAction, searchQuery]);

  // Handle Configure Duplicate Session Policy
  const handleSavePolicy = async () => {
    setSavingPolicy(true);
    try {
      const targetServers = policyServerId === 'ALL' 
        ? servers 
        : servers.filter(s => s.id === policyServerId);

      if (targetServers.length === 0) {
        showToast('No servers selected for policy update.', 'warning');
        setSavingPolicy(false);
        return;
      }

      let successCount = 0;
      for (const srv of targetServers) {
        const res = await authFetch(`${API_BASE}/servers/${srv.id}/duplicate-session-policy`, {
          method: 'POST',
          body: JSON.stringify({
            mode: policyMode,
            gracePeriodSeconds: Number(policyGrace)
          })
        });
        if (res.ok) successCount++;
      }

      showToast(`Dispatched ${policyMode} policy (${policyGrace}s grace) to ${successCount} server(s).`, 'success');
      setIsPolicyModalOpen(false);
    } catch (err) {
      showToast('Error applying policy: ' + err.message, 'error');
    } finally {
      setSavingPolicy(false);
    }
  };

  // Handle Purge All Logs
  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to purge all duplicate login audit records? This action cannot be undone.')) {
      return;
    }
    try {
      const res = await authFetch(`${API_BASE}/duplicate-logins/clear`, {
        method: 'POST'
      });
      if (res.ok) {
        showToast('All duplicate login logs cleared successfully.', 'success');
        setEvents([]);
        setStats({ totalIntercepted: 0, todayLoggedOff: 0, uniqueUsersCount: 0, lastEvent: null });
      } else {
        showToast('Failed to clear logs.', 'error');
      }
    } catch (err) {
      showToast('Error clearing logs: ' + err.message, 'error');
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (filteredEvents.length === 0) {
      showToast('No events to export.', 'warning');
      return;
    }

    let csv = "data:text/csv;charset=utf-8,\uFEFF";
    csv += "Timestamp,User,Server Name,Server ID,Action,Kept Session ID,Terminated Session ID,Reason\n";

    filteredEvents.forEach(e => {
      const row = [
        `"${e.timestamp || e.createdAt || ''}"`,
        `"${e.username || ''}"`,
        `"${(e.serverName || '').replace(/"/g, '""')}"`,
        `"${e.serverId || ''}"`,
        `"${e.action || ''}"`,
        `"${e.newSessionId || ''}"`,
        `"${e.oldSessionId || ''}"`,
        `"${(e.reason || '').replace(/"/g, '""')}"`
      ];
      csv += row.join(",") + "\n";
    });

    const encodedUri = encodeURI(csv);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Single_Session_Guard_Audit_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported audit report to CSV.', 'success');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Banner & Status */}
      <div className="surface-card" style={{
        padding: '16px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px',
        background: 'linear-gradient(135deg, rgba(16, 24, 40, 0.95) 0%, rgba(15, 23, 42, 0.9) 100%)',
        border: '1px solid rgba(239, 68, 68, 0.25)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ef4444'
          }}>
            <ShieldAlert size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: '800', color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>
                Single Session Guard &amp; Multi-Login Auto-Logout
              </h2>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '3px 10px',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: '700',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                border: '1px solid rgba(16, 185, 129, 0.3)'
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 8px #10b981' }}></span>
                AUTO-LOGOFF ACTIVE
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.65)', margin: '4px 0 0 0' }}>
              Autonomous Windows VPS agent daemon: terminates duplicate older sessions within 3 seconds, keeping newest logon active.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="btn btn-secondary"
            style={{
              fontSize: '12px',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderColor: autoRefresh ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.1)'
            }}
            title={autoRefresh ? 'Auto-refreshing every 5s' : 'Auto-refresh paused'}
          >
            <Radio size={14} color={autoRefresh ? '#10b981' : '#888'} />
            {autoRefresh ? 'Live Feed (5s)' : 'Live Feed Paused'}
          </button>

          <button
            onClick={() => fetchEvents(false)}
            disabled={refreshing}
            className="btn btn-secondary"
            style={{ fontSize: '12px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>

          {isSuperAdmin && (
            <button
              onClick={() => setIsPolicyModalOpen(true)}
              className="btn btn-primary"
              style={{
                fontSize: '12px',
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                border: 'none',
                fontWeight: '600'
              }}
            >
              <Sliders size={14} />
              Policy Settings
            </button>
          )}

          <button
            onClick={handleExportCSV}
            className="btn btn-secondary"
            style={{ fontSize: '12px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Download size={14} />
            Export CSV
          </button>

          {isSuperAdmin && events.length > 0 && (
            <button
              onClick={handleClearLogs}
              className="btn btn-secondary"
              style={{
                fontSize: '12px',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: '#ef4444',
                borderColor: 'rgba(239, 68, 68, 0.3)'
              }}
              title="Purge all audit logs"
            >
              <Trash2 size={14} />
              Clear Logs
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '12px'
      }}>
        {/* Card 1: Total Intercepted */}
        <div className="surface-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ef4444'
          }}>
            <ShieldAlert size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Multi-Logins Intercepted
            </div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>
              {stats.totalIntercepted}
            </div>
          </div>
        </div>

        {/* Card 2: Today's Auto-Logoffs */}
        <div className="surface-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f59e0b'
          }}>
            <Zap size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Auto-Logoffs Today
            </div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#f59e0b', marginTop: '2px' }}>
              {stats.todayLoggedOff}
            </div>
          </div>
        </div>

        {/* Card 3: Unique Users Monitored */}
        <div className="surface-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            backgroundColor: 'rgba(59, 130, 246, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#3b82f6'
          }}>
            <Users size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Unique Users Caught
            </div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>
              {stats.uniqueUsersCount}
            </div>
          </div>
        </div>

        {/* Card 4: Protection Engine */}
        <div className="surface-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#10b981'
          }}>
            <ShieldCheck size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Agent Rule Policy
            </div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#10b981', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              Enforce (3s Auto-Kill)
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="surface-card" style={{
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 280px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '380px' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search user, server, session ID or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '32px', fontSize: '12px', height: '34px', width: '100%' }}
            />
          </div>

          <select
            value={selectedServer}
            onChange={(e) => setSelectedServer(e.target.value)}
            className="form-input"
            style={{ fontSize: '12px', height: '34px', minWidth: '150px' }}
          >
            <option value="ALL">All VPS Servers ({servers.length})</option>
            {servers.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.ipPort})</option>
            ))}
          </select>

          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="form-input"
            style={{ fontSize: '12px', height: '34px', minWidth: '150px' }}
          >
            <option value="ALL">All Actions</option>
            <option value="ENFORCE_LOGOFF">Auto-Logged Off (Enforce)</option>
            <option value="AUDIT">Audit Only</option>
          </select>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Showing <strong>{filteredEvents.length}</strong> of <strong>{events.length}</strong> record(s)
        </div>
      </div>

      {/* Events Table */}
      <div className="surface-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'var(--text-muted)',
                fontWeight: '600'
              }}>
                <th style={{ padding: '12px 16px' }}>TIMESTAMP</th>
                <th style={{ padding: '12px 16px' }}>USER ACCOUNT</th>
                <th style={{ padding: '12px 16px' }}>VPS SERVER NODE</th>
                <th style={{ padding: '12px 16px' }}>NEW LOGIN (KEPT)</th>
                <th style={{ padding: '12px 16px' }}>OLD SESSION (TERMINATED)</th>
                <th style={{ padding: '12px 16px' }}>ENFORCEMENT ACTION</th>
                <th style={{ padding: '12px 16px' }}>DETECTION REASON</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px', display: 'block' }} />
                    Loading duplicate login audit trail...
                  </td>
                </tr>
              ) : filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '48px 20px', textAlign: 'center' }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      color: '#10b981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 12px'
                    }}>
                      <ShieldCheck size={28} />
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                      No Duplicate Logins Intercepted
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '420px', margin: '4px auto 0' }}>
                      {searchQuery || selectedServer !== 'ALL' || selectedAction !== 'ALL'
                        ? 'No records match your active search filters.'
                        : 'Single Session Guard is active across all servers. When any user logs in from multiple devices, the older session will be terminated and recorded here automatically.'}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEvents.map((evt, idx) => {
                  const matchedUser = users.find(u => (u.username || '').toLowerCase() === (evt.username || '').toLowerCase());
                  const isEnforced = evt.action === 'ENFORCE_LOGOFF';

                  return (
                    <tr
                      key={evt.id || idx}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.015)',
                        transition: 'background-color 0.15s ease'
                      }}
                      className="hover-row"
                    >
                      {/* Timestamp */}
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: 'var(--text-primary)', fontWeight: '500' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Clock size={13} color="var(--text-muted)" />
                          <span>{evt.timestamp || evt.createdAt}</span>
                        </div>
                      </td>

                      {/* User Account */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(239, 68, 68, 0.15)',
                            color: '#ef4444',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: '700',
                            fontSize: '11px'
                          }}>
                            {(evt.username || 'U').substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                              {evt.username}
                            </div>
                            {matchedUser && (
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                {matchedUser.company || matchedUser.tallySerial || 'Client'}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* VPS Server Node */}
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Server size={13} color="var(--accent-blue)" />
                          <div>
                            <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                              {evt.serverName || evt.serverId}
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              ID: {evt.serverId}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Kept Session (New) */}
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '700',
                          backgroundColor: 'rgba(16, 185, 129, 0.15)',
                          color: '#10b981',
                          border: '1px solid rgba(16, 185, 129, 0.3)'
                        }}>
                          <CheckCircle2 size={12} />
                          Session #{evt.newSessionId || 'N/A'} (Active)
                        </span>
                      </td>

                      {/* Terminated Session (Old) */}
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '700',
                          backgroundColor: 'rgba(239, 68, 68, 0.15)',
                          color: '#ef4444',
                          border: '1px solid rgba(239, 68, 68, 0.3)'
                        }}>
                          <LogOut size={12} />
                          Session #{evt.oldSessionId || 'N/A'} (Logged Off)
                        </span>
                      </td>

                      {/* Enforcement Action */}
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '3px 9px',
                          borderRadius: '9999px',
                          fontSize: '10px',
                          fontWeight: '800',
                          backgroundColor: isEnforced ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                          color: isEnforced ? '#f87171' : '#fbbf24',
                          border: `1px solid ${isEnforced ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`
                        }}>
                          {isEnforced ? '⚡ AUTO-LOGGED OFF' : '⚠️ AUDIT RECORDED'}
                        </span>
                      </td>

                      {/* Detection Reason */}
                      <td style={{ padding: '12px 16px', maxWidth: '320px', color: 'var(--text-muted)' }}>
                        <div style={{
                          fontSize: '11px',
                          lineHeight: '1.4',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }} title={evt.reason}>
                          {evt.reason || 'Multiple concurrent sessions detected. Old session terminated.'}
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

      {/* Policy Settings Modal */}
      {isPolicyModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="surface-card" style={{
            width: '100%',
            maxWidth: '520px',
            padding: '24px',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#3b82f6'
                }}>
                  <Sliders size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                    Duplicate Session Policy
                  </h3>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                    Configure automatic session kill rules dispatched to VPS agent daemons.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPolicyModalOpen(false)}
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Target Servers */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Target VPS Server(s)
                </label>
                <select
                  value={policyServerId}
                  onChange={(e) => setPolicyServerId(e.target.value)}
                  className="form-input"
                  style={{ width: '100%', fontSize: '13px' }}
                >
                  <option value="ALL">All Online Servers ({servers.length})</option>
                  {servers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.ipPort})</option>
                  ))}
                </select>
              </div>

              {/* Mode Selection */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Enforcement Mode
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div
                    onClick={() => setPolicyMode('Enforce')}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      border: `2px solid ${policyMode === 'Enforce' ? '#ef4444' : 'rgba(255, 255, 255, 0.1)'}`,
                      backgroundColor: policyMode === 'Enforce' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ fontWeight: '700', fontSize: '13px', color: policyMode === 'Enforce' ? '#ef4444' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Zap size={15} />
                      Enforce (Auto-Logoff)
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Immediately terminates older session and keeps newest logon active.
                    </div>
                  </div>

                  <div
                    onClick={() => setPolicyMode('Audit')}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      border: `2px solid ${policyMode === 'Audit' ? '#f59e0b' : 'rgba(255, 255, 255, 0.1)'}`,
                      backgroundColor: policyMode === 'Audit' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ fontWeight: '700', fontSize: '13px', color: policyMode === 'Audit' ? '#f59e0b' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertTriangle size={15} />
                      Audit Only
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Records multi-login events in audit log without terminating sessions.
                    </div>
                  </div>
                </div>
              </div>

              {/* Grace Period */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Grace Period Before Forceful Termination: <strong>{policyGrace} seconds</strong>
                </label>
                <input
                  type="range"
                  min="0"
                  max="15"
                  step="1"
                  value={policyGrace}
                  onChange={(e) => setPolicyGrace(e.target.value)}
                  style={{ width: '100%', accentColor: '#3b82f6', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  <span>0s (Immediate)</span>
                  <span>3s (Recommended)</span>
                  <span>10s (Buffered)</span>
                  <span>15s (Max)</span>
                </div>
              </div>

              {/* Info Notice */}
              <div style={{
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                fontSize: '11px',
                color: 'rgba(255, 255, 255, 0.8)'
              }}>
                <Info size={15} color="#3b82f6" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>
                  The agent watchdog executes forceful termination via Windows Terminal Services API (`WTSLogoffSession`), `logoff.exe`, and `rwinsta.exe`. Whitelisted administrator accounts are never terminated.
                </span>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsPolicyModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', padding: '8px 16px' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePolicy}
                  disabled={savingPolicy}
                  className="btn btn-primary"
                  style={{ fontSize: '12px', padding: '8px 18px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {savingPolicy ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Dispatch Policy Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

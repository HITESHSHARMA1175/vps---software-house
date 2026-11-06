import React, { useState, useMemo } from 'react';
import {
  Radio,
  Zap,
  Shield,
  Server,
  ExternalLink,
  Power,
  Search,
  CheckCircle2,
  RefreshCw,
  Users,
  Clock,
  Laptop,
  AlertTriangle,
  LogOut,
  PauseCircle,
  Activity,
  Eye
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import ShadowSessionModal from '../ShadowSessionModal';
import LiveScreenModal from '../LiveScreenModal';

export default function SessionsView({
  employeeSessions = [],
  users = [],
  servers = [],
  telemetryData = {},
  currentUser,
  onTerminateEmployeeSession,
  onForceLogoffSession,
  onDirectRemoteConnect,
  showToast
}) {
  const { showToast: globalToast } = useToast();
  const notify = showToast || globalToast;

  const [activeTab, setActiveTab] = useState('VPS_SESSIONS'); // 'VPS_SESSIONS', 'EMPLOYEES', 'CLIENTS'
  const [sessionFilter, setSessionFilter] = useState('ALL'); // 'ALL', 'ACTIVE', 'DISCONNECTED'
  const [searchQuery, setSearchQuery] = useState('');
  const [terminatingSessionId, setTerminatingSessionId] = useState(null);
  const [selectedSessionForShadow, setSelectedSessionForShadow] = useState(null);
  const [selectedSessionForLiveScreen, setSelectedSessionForLiveScreen] = useState(null);

  const isSuperAdmin = currentUser && (currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'ADMIN');

  // Aggregate all live VPS sessions (Active + Disconnected) across all server nodes
  const allVpsSessions = useMemo(() => {
    const list = [];
    const seenMap = new Set();

    servers.forEach(s => {
      const sIpPure = s.ipPort ? s.ipPort.split(':')[0] : '';
      const t = telemetryData[s.id] || telemetryData[s.ipPort] || telemetryData[s.name] || (sIpPure && telemetryData[sIpPure]) || null;
      
      if (t && Array.isArray(t.detailedSessions)) {
        t.detailedSessions.forEach(sess => {
          const uLower = (sess.username || '').toLowerCase().trim();
          const sessId = String(sess.sessionId || '1');
          const uniqueKey = `${s.id}-${uLower}-${sessId}`;

          if (!seenMap.has(uniqueKey) && sess.username) {
            seenMap.add(uniqueKey);
            const matchedUser = users.find(u => 
              (u.username || '').toLowerCase() === uLower && 
              (u.serverId === s.id || u.serverId === s.ipPort || u.serverIp === s.ipPort)
            );

            list.push({
              ...sess,
              serverId: s.id,
              serverName: s.name,
              serverIp: s.ipPort,
              company: matchedUser ? matchedUser.company : sess.username,
              drive: matchedUser ? matchedUser.drive : 'Local',
              matchedUser: matchedUser || null
            });
          }
        });
      }
    });

    return list;
  }, [servers, telemetryData, users]);

  // Counts
  const activeSessionsCount = allVpsSessions.filter(s => s.state === 'Active').length;
  const disconnectedSessionsCount = allVpsSessions.filter(s => s.state === 'Disconnected').length;

  // Filtered VPS sessions
  const filteredVpsSessions = useMemo(() => {
    return allVpsSessions.filter(sess => {
      if (sessionFilter === 'ACTIVE' && sess.state !== 'Active') return false;
      if (sessionFilter === 'DISCONNECTED' && sess.state !== 'Disconnected') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchUser = sess.username.toLowerCase().includes(q);
        const matchComp = (sess.company || '').toLowerCase().includes(q);
        const matchServer = (sess.serverName || '').toLowerCase().includes(q) || (sess.serverIp || '').toLowerCase().includes(q);
        if (!matchUser && !matchComp && !matchServer) return false;
      }

      return true;
    });
  }, [allVpsSessions, sessionFilter, searchQuery]);

  const handleLogoff = async (session) => {
    if (!window.confirm(`Force log off user "${session.username}" (Session ${session.sessionId}) on ${session.serverName || 'VPS'}?`)) {
      return;
    }

    try {
      setTerminatingSessionId(session.sessionId);
      if (onForceLogoffSession) {
        await onForceLogoffSession(session.serverId, session.sessionId, session.username);
      }
    } finally {
      setTerminatingSessionId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Header & Main Navigation */}
      <div className="surface-card" style={{
        padding: '14px 18px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Radio size={18} color="var(--accent-emerald)" /> Active Sessions &amp; Connection Monitoring
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
            Real-time Windows VPS user sessions, active RDP streams, and administrative logins.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('VPS_SESSIONS')}
            className={`btn btn-sm ${activeTab === 'VPS_SESSIONS' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Activity size={13} /> VPS Sessions ({allVpsSessions.length})
          </button>

          <button
            onClick={() => setActiveTab('EMPLOYEES')}
            className={`btn btn-sm ${activeTab === 'EMPLOYEES' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Users size={13} /> Staff Logins ({employeeSessions.length})
          </button>

          <button
            onClick={() => setActiveTab('CLIENTS')}
            className={`btn btn-sm ${activeTab === 'CLIENTS' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Server size={13} /> Client Gateways ({users.length})
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 1. WINDOWS VPS LIVE SESSIONS (Active vs Disconnected) */}
      {/* ============================================================== */}
      {activeTab === 'VPS_SESSIONS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Quick Metrics Banner */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div className="surface-card" style={{
              padding: '14px',
              borderLeft: '3px solid var(--accent-emerald)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--accent-emerald-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Zap size={18} color="var(--accent-emerald)" />
              </div>
              <div>
                <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--accent-emerald)', lineHeight: 1.1 }}>{activeSessionsCount}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>Active Sessions (Online)</div>
              </div>
            </div>

            <div className="surface-card" style={{
              padding: '14px',
              borderLeft: '3px solid var(--accent-amber)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--accent-amber-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <PauseCircle size={18} color="var(--accent-amber)" />
              </div>
              <div>
                <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--accent-amber)', lineHeight: 1.1 }}>{disconnectedSessionsCount}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>Disconnected (In Memory)</div>
              </div>
            </div>

            <div className="surface-card" style={{
              padding: '14px',
              borderLeft: '3px solid var(--accent-sky)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--primary-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Laptop size={18} color="var(--accent-sky)" />
              </div>
              <div>
                <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-primary)', lineHeight: 1.1 }}>{allVpsSessions.length}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>Total VPS Sessions</div>
              </div>
            </div>
          </div>

          {/* Sub-Filters & Search Bar */}
          <div className="surface-card" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            padding: '12px 16px'
          }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setSessionFilter('ALL')}
                className={`btn btn-xs ${sessionFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
              >
                All ({allVpsSessions.length})
              </button>
              <button
                onClick={() => setSessionFilter('ACTIVE')}
                className={`btn btn-xs ${sessionFilter === 'ACTIVE' ? 'btn-success' : 'btn-secondary'}`}
              >
                ● Active ({activeSessionsCount})
              </button>
              <button
                onClick={() => setSessionFilter('DISCONNECTED')}
                className={`btn btn-xs ${sessionFilter === 'DISCONNECTED' ? 'btn-warning' : 'btn-secondary'}`}
              >
                ⏸ Disconnected ({disconnectedSessionsCount})
              </button>
            </div>

            <div style={{ position: 'relative', minWidth: '240px' }}>
              <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Search user, company, or server..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="input"
                style={{ height: '32px', paddingLeft: '30px', fontSize: '12px' }}
              />
            </div>
          </div>

          {/* Table */}
          <div className="table-wrapper">
            <div className="table-container">
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>User &amp; Company</th>
                    <th>Target Server</th>
                    <th>Session Details</th>
                    <th>Connection State</th>
                    <th>Idle Time</th>
                    <th>Logon Timestamp</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVpsSessions.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
                        <div style={{ maxWidth: '340px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <Radio size={36} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                          <strong style={{ color: 'var(--text-primary)', fontSize: '14px' }}>No VPS Sessions Detected</strong>
                          <p style={{ fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                            {allVpsSessions.length === 0 
                              ? 'No active or disconnected RDP sessions are currently loaded in RAM across connected server nodes.' 
                              : 'No sessions match your search or filter criteria.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredVpsSessions.map((sess, idx) => {
                      const isActive = sess.state === 'Active';
                      const isTerminating = terminatingSessionId === sess.sessionId;

                      return (
                        <tr key={`${sess.serverId}-${sess.username}-${sess.sessionId}-${idx}`}>
                          <td>
                            <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{sess.username}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{sess.company}</div>
                          </td>

                          <td>
                            <div style={{ fontWeight: '600', color: 'var(--accent-sky)' }}>{sess.serverName || sess.serverId}</div>
                            <div className="font-mono" style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{sess.serverIp}</div>
                          </td>

                          <td>
                            <span className="font-mono" style={{
                              fontSize: '11px',
                              backgroundColor: 'rgba(255, 255, 255, 0.06)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              color: 'var(--text-secondary)'
                            }}>
                              ID: {sess.sessionId} ({sess.sessionName || 'RDP'})
                            </span>
                          </td>

                          <td>
                            {isActive ? (
                              <span className="badge badge-emerald">
                                <span className="status-pip status-pip-emerald" style={{ width: '5px', height: '5px' }} />
                                Active (Online)
                              </span>
                            ) : (
                              <span className="badge badge-amber">
                                <PauseCircle size={11} />
                                Disconnected (In RAM)
                              </span>
                            )}
                          </td>

                          <td className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {sess.idleTime || 'none'}
                          </td>

                          <td className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {sess.logonTime || 'Live'}
                          </td>

                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                              {/* 1-Click Zero-Login Live Screen View */}
                              <button
                                onClick={() => setSelectedSessionForLiveScreen(sess)}
                                className="btn btn-xs"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '3px 8px',
                                  background: 'linear-gradient(135deg, #10b981, #059669)',
                                  border: 'none',
                                  color: '#ffffff',
                                  fontWeight: '700',
                                  boxShadow: '0 0 10px rgba(16, 185, 129, 0.35)'
                                }}
                                title="Zero Login Direct Live Screen View"
                              >
                                <Eye size={11} color="#ffffff" />
                                <span>Live View</span>
                              </button>

                              {onDirectRemoteConnect && (
                                <button
                                  onClick={() => onDirectRemoteConnect({
                                    company: sess.company,
                                    username: sess.username,
                                    password: sess.matchedUser?.password,
                                    serverId: sess.serverId,
                                    serverIp: sess.serverIp,
                                    drive: sess.drive
                                  }, 'USER')}
                                  className="btn btn-secondary btn-xs"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '3px 7px', borderColor: 'rgba(56, 189, 248, 0.3)', color: '#38bdf8' }}
                                  title="Open TSplus Web Console"
                                >
                                  <ExternalLink size={11} color="#38bdf8" />
                                  <span>Web</span>
                                </button>
                              )}

                              <button
                                onClick={() => setSelectedSessionForShadow(sess)}
                                className="btn btn-secondary btn-xs"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                title="1-Click Remote Assist & Session Shadow"
                              >
                                <Eye size={11} color="#38bdf8" />
                                <span>Assist</span>
                              </button>

                              <button
                                onClick={() => handleLogoff(sess)}
                                disabled={isTerminating}
                                className="btn btn-danger btn-xs"
                                title="Force remote Windows logoff command (logoff.exe)"
                              >
                                <LogOut size={11} />
                                {isTerminating ? 'Logging off...' : 'Logoff'}
                              </button>
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
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. EMPLOYEE SESSIONS TABLE */}
      {/* ============================================================== */}
      {activeTab === 'EMPLOYEES' && (
        <div className="table-wrapper">
          <div className="table-container">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Employee &amp; Role</th>
                  <th>Session ID</th>
                  <th>IP Address &amp; Client</th>
                  <th>Login Timestamp</th>
                  <th>Last Heartbeat</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employeeSessions.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
                      <div style={{ maxWidth: '340px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <Users size={36} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                        <strong style={{ color: 'var(--text-primary)', fontSize: '14px' }}>No Active Staff Sessions</strong>
                        <p style={{ fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                          There are currently no staff or administrative users logged into the web portal.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  employeeSessions.map(sess => (
                    <tr key={sess.id}>
                      <td>
                        <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{sess.employee_name || 'Staff'}</div>
                        <div style={{ fontSize: '11px', color: 'var(--accent-sky)' }}>{sess.employee_username} ({sess.employee_role})</div>
                      </td>

                      <td className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {sess.id}
                      </td>

                      <td>
                        <div className="font-mono" style={{ color: 'var(--accent-sky)', fontSize: '11px' }}>{sess.ip_address || '127.0.0.1'}</div>
                        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sess.user_agent || 'Web Browser'}
                        </div>
                      </td>

                      <td className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {sess.created_at || 'Just now'}
                      </td>

                      <td className="font-mono" style={{ fontSize: '11px', color: 'var(--accent-emerald)' }}>
                        {sess.last_seen || 'Active now'}
                      </td>

                      <td>
                        <span className="badge badge-emerald">
                          ● Active Session
                        </span>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        {isSuperAdmin && (
                          <button
                            onClick={() => onTerminateEmployeeSession(sess.id)}
                            className="btn btn-danger btn-xs"
                            title="Force Invalidate Server Session"
                          >
                            <Power size={11} /> Terminate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. CLIENT GATEWAYS TABLE */}
      {/* ============================================================== */}
      {activeTab === 'CLIENTS' && (
        <div className="table-wrapper">
          <div className="table-container">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Username &amp; Company</th>
                  <th>Session Mode</th>
                  <th>VPS Gateway Endpoint</th>
                  <th>Protocol / Port</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
                      <div style={{ maxWidth: '340px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <Zap size={36} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                        <strong style={{ color: 'var(--text-primary)', fontSize: '14px' }}>No Client Gateways Available</strong>
                        <p style={{ fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                          No client users found. Add users to enable one-click browser console gateways.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  users.map(user => {
                  const server = servers.find(s => s.id === user.serverId);

                  return (
                    <tr key={user.id}>
                      <td>
                        <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{user.username}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{user.company} ({user.drive})</div>
                      </td>

                      <td>
                        <span className="badge badge-blue">
                          ⚡ Client Remote Desktop
                        </span>
                      </td>

                      <td className="font-mono" style={{ color: 'var(--text-secondary)', fontSize: '11.5px' }}>
                        {server ? server.ipPort : 'N/A'}
                      </td>

                      <td>
                        <span style={{ color: 'var(--accent-emerald)', fontWeight: '600' }}>TSplus HTML5 (Port 443 HTTPS)</span>
                      </td>

                      <td>
                        <span className="badge badge-emerald">
                          ● Ready to Connect
                        </span>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => onDirectRemoteConnect(user, 'USER')}
                          className="btn btn-success btn-xs"
                        >
                          <Zap size={11} /> Launch Web Console
                        </button>
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 1-Click Remote Assist / Session Shadow Modal */}
      {selectedSessionForShadow && (
        <ShadowSessionModal
          isOpen={!!selectedSessionForShadow}
          session={selectedSessionForShadow}
          onClose={() => setSelectedSessionForShadow(null)}
          onDirectRemoteConnect={onDirectRemoteConnect}
          onOpenLiveScreen={(sess) => setSelectedSessionForLiveScreen(sess)}
        />
      )}

      {/* Zero-Login Live Screen Modal */}
      {selectedSessionForLiveScreen && (
        <LiveScreenModal
          isOpen={!!selectedSessionForLiveScreen}
          session={selectedSessionForLiveScreen}
          onClose={() => setSelectedSessionForLiveScreen(null)}
          onOpenWebConsole={(sess) => {
            if (onDirectRemoteConnect) {
              onDirectRemoteConnect({
                company: sess.company,
                username: sess.username,
                password: sess.matchedUser?.password,
                serverId: sess.serverId,
                serverIp: sess.serverIp,
                drive: sess.drive
              }, 'USER');
            }
          }}
        />
      )}
    </div>
  );
}

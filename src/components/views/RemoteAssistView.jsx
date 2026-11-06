import React, { useState, useMemo, useEffect } from 'react';
import {
  ScreenShare,
  Eye,
  Server,
  Users,
  Search,
  RefreshCw,
  Copy,
  Check,
  Download,
  ExternalLink,
  ShieldCheck,
  Zap,
  Sparkles,
  AlertTriangle,
  PauseCircle,
  PlayCircle,
  Laptop,
  CheckCircle2,
  MousePointer,
  Monitor,
  Settings,
  LogOut,
  Radio
} from 'lucide-react';
import ShadowSessionModal from '../ShadowSessionModal';
import LiveScreenModal from '../LiveScreenModal';

export default function RemoteAssistView({
  users = [],
  servers = [],
  telemetryData = {},
  onDirectRemoteConnect,
  onForceLogoffSession,
  onRefreshTelemetry
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedServerFilter, setSelectedServerFilter] = useState('ALL');
  const [stateFilter, setStateFilter] = useState('ALL'); // 'ALL', 'ACTIVE', 'DISCONNECTED'
  const [selectedSessionForModal, setSelectedSessionForModal] = useState(null);
  const [selectedSessionForLiveScreen, setSelectedSessionForLiveScreen] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [policyStatus, setPolicyStatus] = useState('');
  const [isVerifyingPolicy, setIsVerifyingPolicy] = useState(false);

  // Quick Launcher State
  const [quickSelectedKey, setQuickSelectedKey] = useState('');
  const [quickControlMode, setQuickControlMode] = useState('control');

  // Aggregate all live VPS sessions across servers
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
              uniqueKey,
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

  // Filtered sessions
  const filteredSessions = useMemo(() => {
    return allVpsSessions.filter(sess => {
      if (selectedServerFilter !== 'ALL' && sess.serverId !== selectedServerFilter) {
        return false;
      }
      if (stateFilter === 'ACTIVE' && sess.state !== 'Active') return false;
      if (stateFilter === 'DISCONNECTED' && sess.state !== 'Disconnected') return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (sess.username && sess.username.toLowerCase().includes(q)) ||
        (sess.company && sess.company.toLowerCase().includes(q)) ||
        (sess.serverName && sess.serverName.toLowerCase().includes(q)) ||
        (sess.serverIp && sess.serverIp.toLowerCase().includes(q)) ||
        String(sess.sessionId).includes(q)
      );
    });
  }, [allVpsSessions, selectedServerFilter, stateFilter, searchQuery]);

  // Quick Assist launcher download helper
  // 1-Click Client Connect RDP File Generator (Zero Server Login - Connects as Client)
  const handleDownloadClientRdpForSession = (sess) => {
    const serverIp = sess.serverIp || '127.0.0.1:3389';
    const username = sess.username || 'User';
    const pass = sess.matchedUser?.password || '';

    const rdpContent = `full address:s:${serverIp}
username:s:${username}
prompt for credentials:i:1
screen mode id:i:2
use multimon:i:0
span monitors:i:0
redirectclipboard:i:1
administrative session:i:0
`;
    const blob = new Blob([rdpContent], { type: 'application/x-rdp' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Connect_${username}_Session.rdp`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (pass) {
      navigator.clipboard.writeText(pass);
      setPolicyStatus(`✅ Password for '${username}' copied to clipboard! Double-click the downloaded RDP file and press Ctrl + V.`);
      setTimeout(() => setPolicyStatus(''), 6000);
    }
  };

  const handleCopyMstsc = (sess, mode = 'control') => {
    const controlFlag = mode === 'control' ? '/control' : '';
    // Use local shadow command to eliminate Windows "computer name is invalid" custom port parsing bug
    const cmd = `mstsc /shadow:${sess.sessionId} ${controlFlag} /noConsentPrompt`.replace(/\s+/g, ' ').trim();
    navigator.clipboard.writeText(cmd);
    setCopiedId(sess.uniqueKey);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleVerifyAllPolicies = async () => {
    setIsVerifyingPolicy(true);
    setPolicyStatus('');
    try {
      let count = 0;
      for (const s of servers) {
        try {
          await fetch(`/api/servers/${s.id}/configure-shadow`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shadowLevel: 2 })
          });
          count++;
        } catch (e) {}
      }
      setPolicyStatus(`✅ Dispatched RDS Shadow policy configuration to ${count} connected VPS node(s).`);
      setTimeout(() => setPolicyStatus(''), 4000);
    } catch (e) {
      setPolicyStatus('⚠️ Failed to dispatch policy update.');
    } finally {
      setIsVerifyingPolicy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Module Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ScreenShare size={24} color="#38bdf8" />
            Remote Assist &amp; Screen Shadowing Hub
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: 0, marginTop: '4px' }}>
            1-Click instant desktop screen assistance and interactive Tally support using native Windows RDS &amp; TSplus engine (Zero AnyDesk required).
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handleVerifyAllPolicies}
            disabled={isVerifyingPolicy}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '11.5px', gap: '6px' }}
            title="Auto-configure Windows RDS Shadow policy across all fleet nodes"
          >
            <Settings size={13} color="#38bdf8" />
            <span>{isVerifyingPolicy ? 'Configuring...' : 'Verify Fleet Policy'}</span>
          </button>

          <button
            onClick={() => {
              if (onRefreshTelemetry) onRefreshTelemetry();
            }}
            className="btn btn-primary btn-sm"
            style={{ fontSize: '11.5px', gap: '6px' }}
          >
            <RefreshCw size={13} />
            <span>Refresh Fleet</span>
          </button>
        </div>
      </div>

      {policyStatus && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid #10b981',
          borderRadius: '8px',
          padding: '10px 14px',
          fontSize: '12px',
          color: '#34d399',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={16} />
          <span>{policyStatus}</span>
        </div>
      )}

      {/* 2. Key Metrics Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div className="surface-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ScreenShare size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Active Online Sessions</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#34d399', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{activeSessionsCount}</span>
              <span className="badge badge-emerald" style={{ fontSize: '10px', padding: '1px 6px' }}>Ready to Assist</span>
            </div>
          </div>
        </div>

        <div className="surface-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PauseCircle size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Disconnected in RAM</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>
              {disconnectedSessionsCount} <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Idle Sessions</span>
            </div>
          </div>
        </div>

        <div className="surface-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Server size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Fleet Nodes Monitored</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>
              {servers.length} <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Servers Online</span>
            </div>
          </div>
        </div>

        <div className="surface-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(168, 85, 247, 0.12)', color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Performance Protocol</div>
            <div style={{ fontSize: '16px', fontWeight: '800', color: '#a855f7', marginTop: '2px' }}>
              Native 60 FPS RDP
            </div>
          </div>
        </div>
      </div>

      {/* 3. Fast Assist Launcher Panel */}
      <div className="surface-card" style={{ padding: '18px', borderRadius: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Sparkles size={16} color="#38bdf8" />
          <span style={{ fontSize: '13.5px', fontWeight: '700', color: '#ffffff' }}>Instant Remote Assist Launcher</span>
          <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>— Quickly select any user currently logged into Tally</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', alignItems: 'flex-end' }}>
          <div>
            <label className="form-label" style={{ fontSize: '11.5px', marginBottom: '4px' }}>Select Live Client Session</label>
            <select
              className="form-input"
              value={quickSelectedKey}
              onChange={e => setQuickSelectedKey(e.target.value)}
              style={{ fontSize: '12px', height: '36px' }}
            >
              <option value="">-- Choose Online Session ({allVpsSessions.length}) --</option>
              {allVpsSessions.map(sess => (
                <option key={sess.uniqueKey} value={sess.uniqueKey}>
                  {sess.company} ({sess.username}) — [Server: {sess.serverName} | Sess ID: {sess.sessionId}]
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '11.5px', marginBottom: '4px' }}>Access Control Mode</label>
            <select
              className="form-input"
              value={quickControlMode}
              onChange={e => setQuickControlMode(e.target.value)}
              style={{ fontSize: '12px', height: '36px' }}
            >
              <option value="control">⚡ Full Control (Mouse + Keyboard Assist)</option>
              <option value="view">👁️ View-Only (Silent Monitor)</option>
            </select>
          </div>

          <div>
            <button
              onClick={() => {
                const target = allVpsSessions.find(s => s.uniqueKey === quickSelectedKey);
                if (target) setSelectedSessionForLiveScreen(target);
              }}
              disabled={!quickSelectedKey}
              className="btn"
              style={{
                height: '36px',
                width: '100%',
                fontSize: '12px',
                gap: '6px',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#ffffff',
                fontWeight: '700',
                border: 'none',
                boxShadow: quickSelectedKey ? '0 0 12px rgba(16, 185, 129, 0.4)' : undefined
              }}
            >
              <Eye size={14} color="#ffffff" /> 👁️ Direct Screen View (No Login)
            </button>
          </div>

          <div>
            <button
              onClick={() => {
                const target = allVpsSessions.find(s => s.uniqueKey === quickSelectedKey);
                if (target) setSelectedSessionForModal(target);
              }}
              disabled={!quickSelectedKey}
              className="btn btn-primary"
              style={{ height: '36px', width: '100%', fontSize: '12px', gap: '6px' }}
            >
              <ExternalLink size={14} /> Open Assist Console
            </button>
          </div>

          <div>
            <button
              onClick={() => {
                const target = allVpsSessions.find(s => s.uniqueKey === quickSelectedKey);
                if (target) handleDownloadClientRdpForSession(target);
              }}
              disabled={!quickSelectedKey}
              className="btn btn-secondary"
              style={{ height: '36px', width: '100%', fontSize: '12px', gap: '6px', borderColor: 'rgba(52, 211, 153, 0.4)', color: '#34d399' }}
            >
              <Zap size={14} color="#34d399" /> 1-Click Client Connect (.RDP)
            </button>
          </div>
        </div>
      </div>

      {/* 4. Live Sessions Table */}
      <div className="surface-card" style={{ padding: '18px', borderRadius: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              Live RDP &amp; TSplus Sessions Across Fleet
            </h3>
            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: 0, marginTop: '2px' }}>
              Direct screen shadowing to resolve Tally and printing issues in 1 click
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Filter by Server */}
            <select
              className="form-input"
              value={selectedServerFilter}
              onChange={e => setSelectedServerFilter(e.target.value)}
              style={{ height: '30px', fontSize: '11.5px', width: '150px', padding: '2px 8px' }}
            >
              <option value="ALL">All VPS Nodes</option>
              {servers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            {/* Filter by State */}
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => setStateFilter('ALL')}
                className={`btn btn-xs ${stateFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
              >
                All ({allVpsSessions.length})
              </button>
              <button
                onClick={() => setStateFilter('ACTIVE')}
                className={`btn btn-xs ${stateFilter === 'ACTIVE' ? 'btn-primary' : 'btn-secondary'}`}
              >
                Active ({activeSessionsCount})
              </button>
              <button
                onClick={() => setStateFilter('DISCONNECTED')}
                className={`btn btn-xs ${stateFilter === 'DISCONNECTED' ? 'btn-primary' : 'btn-secondary'}`}
              >
                In RAM ({disconnectedSessionsCount})
              </button>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', width: '180px' }}>
              <Search size={13} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search user / client..."
                className="input"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ height: '30px', paddingLeft: '28px', fontSize: '11.5px' }}
              />
            </div>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Client &amp; Company</th>
                <th>VPS Node</th>
                <th>Session ID</th>
                <th>State</th>
                <th>Idle Time</th>
                <th>Logon Time</th>
                <th style={{ textAlign: 'right' }}>Remote Assist Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    No sessions match the selected filter. Ensure users are logged into Tally or the VPS.
                  </td>
                </tr>
              ) : (
                filteredSessions.map(sess => {
                  const isActive = sess.state === 'Active';
                  const isCopied = copiedId === sess.uniqueKey;

                  return (
                    <tr key={sess.uniqueKey}>
                      <td>
                        <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{sess.company}</div>
                        <div style={{ fontSize: '11px', color: '#38bdf8' }}>
                          User: <code>{sess.username}</code> ({sess.drive})
                        </div>
                      </td>

                      <td>
                        <div style={{ fontWeight: '600', color: '#cbd5e1' }}>{sess.serverName}</div>
                        <div className="font-mono" style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{sess.serverIp}</div>
                      </td>

                      <td>
                        <span className="font-mono" style={{
                          fontSize: '11px',
                          backgroundColor: 'rgba(255, 255, 255, 0.06)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          color: '#38bdf8'
                        }}>
                          ID: {sess.sessionId} ({sess.sessionName || 'RDP'})
                        </span>
                      </td>

                      <td>
                        {isActive ? (
                          <span className="badge badge-emerald">
                            <span className="status-pip status-pip-emerald" style={{ width: '5px', height: '5px' }} />
                            Online
                          </span>
                        ) : (
                          <span className="badge badge-amber">
                            <PauseCircle size={10} />
                            Disconnected
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
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
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

                          <button
                            onClick={() => handleDownloadClientRdpForSession(sess)}
                            className="btn btn-secondary btn-xs"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '3px 8px', borderColor: 'rgba(52, 211, 153, 0.4)', color: '#34d399' }}
                            title="1-Click Direct Connect from Laptop (Password Auto-Copied)"
                          >
                            <Zap size={11} color="#34d399" />
                            <span>1-Click RDP</span>
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
                              title="Launch Browser Web Screen (Zero Setup)"
                            >
                              <ExternalLink size={11} color="#38bdf8" />
                              <span>Web</span>
                            </button>
                          )}

                          <button
                            onClick={() => setSelectedSessionForModal(sess)}
                            className="btn btn-primary btn-xs"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px' }}
                            title="Open Remote Assist Options"
                          >
                            <Eye size={12} />
                            <span>Assist</span>
                          </button>

                          {onForceLogoffSession && (
                            <button
                              onClick={() => {
                                if (window.confirm(`Force logoff session ${sess.sessionId} (${sess.username})?`)) {
                                  onForceLogoffSession({
                                    serverId: sess.serverId,
                                    sessionId: sess.sessionId,
                                    username: sess.username
                                  });
                                }
                              }}
                              className="btn btn-danger btn-xs"
                              style={{ padding: '3px 6px' }}
                              title="Force logoff session"
                            >
                              <LogOut size={10} />
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

      {/* 5. Shadow Modal Integration */}
      {selectedSessionForModal && (
        <ShadowSessionModal
          isOpen={!!selectedSessionForModal}
          session={selectedSessionForModal}
          onClose={() => setSelectedSessionForModal(null)}
          onDirectRemoteConnect={onDirectRemoteConnect}
          onOpenLiveScreen={(sess) => setSelectedSessionForLiveScreen(sess)}
        />
      )}

      {/* 6. Live Screen Modal Integration (Zero Login Required) */}
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

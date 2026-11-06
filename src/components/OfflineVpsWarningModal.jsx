import React, { useState } from 'react';
import { 
  AlertTriangle, 
  X, 
  RefreshCw, 
  Server, 
  Terminal, 
  Copy, 
  Check, 
  WifiOff, 
  MonitorPlay,
  Clock
} from 'lucide-react';

export default function OfflineVpsWarningModal({ 
  isOpen, 
  onClose, 
  offlineServers = [], 
  onRefreshTelemetry, 
  onNavigateToVps,
  onDirectRemoteConnect 
}) {
  const [copiedId, setCopiedId] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!isOpen || !offlineServers || offlineServers.length === 0) return null;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (onRefreshTelemetry) {
      await onRefreshTelemetry();
    }
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1200);
  };

  const getAgentCommand = (srv) => {
    const srvTarget = srv.ipPort || srv.id || srv.name;
    const encodedId = encodeURIComponent(srvTarget);
    const origin = typeof window !== 'undefined'
      ? (window.location.origin.includes('localhost') ? 'https://vps.innovationwebworks.in' : window.location.origin)
      : 'https://vps.innovationwebworks.in';
    return `[Net.ServicePointManager]::SecurityProtocol = 3072 -bor 768 -bor 192; (New-Object Net.WebClient).DownloadString('${origin}/install.ps1?s=${encodedId}') | iex`;
  };

  const handleCopyCommand = (srv, e) => {
    if (e) e.stopPropagation();
    const cmd = getAgentCommand(srv);
    navigator.clipboard.writeText(cmd);
    setCopiedId(srv.id || srv.name);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleCopyAllCommands = () => {
    const allCmds = offlineServers.map(s => `# === Start Agent for ${s.name || s.ipPort} ===\n${getAgentCommand(s)}`).join('\n\n');
    navigator.clipboard.writeText(allCmds);
    setCopiedId('ALL');
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999, backdropFilter: 'blur(12px)', backgroundColor: 'rgba(5, 7, 15, 0.85)' }}>
      <div 
        className="modal-content telemetry-warning-modal" 
        onClick={e => e.stopPropagation()} 
        style={{ 
          maxWidth: '920px', 
          width: '95%',
          backgroundColor: '#0c101d', 
          border: '1px solid rgba(239, 68, 68, 0.35)',
          boxShadow: '0 0 50px rgba(239, 68, 68, 0.2), 0 25px 50px -12px rgba(0, 0, 0, 0.75)',
          borderRadius: '20px',
          padding: '0',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh'
        }}
      >
        {/* TOP ALERT ACCENT STRIP */}
        <div className="telemetry-modal-header" style={{ 
          height: '6px', 
          width: '100%', 
          background: 'linear-gradient(90deg, #ef4444 0%, #f59e0b 50%, #ef4444 100%)',
          backgroundSize: '200% 100%'
        }} />

        {/* MODAL HEADER */}
        <div className="telemetry-modal-titlebar" style={{ 
          padding: '24px 28px 20px', 
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'flex-start',
          backgroundColor: 'rgba(239, 68, 68, 0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div className="telemetry-modal-alert-icon" style={{ 
              width: '52px', 
              height: '52px', 
              borderRadius: '14px', 
              backgroundColor: 'rgba(239, 68, 68, 0.15)', 
              border: '1px solid rgba(239, 68, 68, 0.4)',
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: '#ef4444',
              boxShadow: '0 0 20px rgba(239, 68, 68, 0.25)',
              flexShrink: 0
            }}>
              <WifiOff size={28} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <span style={{ 
                  backgroundColor: 'rgba(239, 68, 68, 0.2)', 
                  color: '#f87171', 
                  fontSize: '11px', 
                  fontWeight: '800', 
                  padding: '3px 9px', 
                  borderRadius: '6px',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  border: '1px solid rgba(239, 68, 68, 0.3)'
                }}>
                  CRITICAL TELEMETRY ALERT
                </span>
                <span style={{ color: '#94a3b8', fontSize: '13px', fontWeight: '600' }}>
                  {offlineServers.length} Node{offlineServers.length > 1 ? 's' : ''} Unreachable
                </span>
              </div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#ffffff', margin: 0, letterSpacing: '-0.02em' }}>
                ⚠️ Warning: VPS Server Node{offlineServers.length > 1 ? 's' : ''} Offline
              </h2>
            </div>
          </div>

          <button 
            onClick={onClose}
            style={{ 
              background: 'rgba(255, 255, 255, 0.05)', 
              border: '1px solid rgba(255, 255, 255, 0.1)', 
              color: '#94a3b8', 
              borderRadius: '10px', 
              padding: '8px', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            title="Dismiss Alert"
          >
            <X size={20} />
          </button>
        </div>

        {/* SUMMARY ADVISORY BANNER */}
        <div className="telemetry-modal-advisory" style={{ 
          padding: '14px 28px', 
          backgroundColor: 'rgba(245, 158, 11, 0.07)', 
          borderBottom: '1px solid rgba(245, 158, 11, 0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '13px',
          color: '#fde68a',
          lineHeight: '1.45'
        }}>
          <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink: 0 }} />
          <span>
            <strong>Action Required:</strong> Real-time RDP session telemetry, active user status, and daily activity logs cannot be fetched for these servers. Please verify that the target Windows VPS is powered on and the background PowerShell agent service is running.
          </span>
        </div>

        {/* MODAL BODY (SCROLLABLE) */}
        <div className="telemetry-modal-body" style={{ padding: '24px 28px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Affected VPS Server Nodes ({offlineServers.length})
            </span>
            <button
              onClick={handleCopyAllCommands}
              className="btn btn-secondary"
              style={{ fontSize: '12px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {copiedId === 'ALL' ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              {copiedId === 'ALL' ? 'All Script Commands Copied!' : 'Copy All Agent Startup Scripts'}
            </button>
          </div>

          {/* LIST OF OFFLINE SERVERS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {offlineServers.map((srv, index) => {
              const isCopied = copiedId === (srv.id || srv.name);
              const cmd = getAgentCommand(srv);

              return (
                <article className="telemetry-node-card"
                  key={srv.id || srv.ipPort || index}
                  style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: '14px',
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    transition: 'border-color 0.2s, background-color 0.2s',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  {/* Left warning indicator bar */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: '4px',
                    backgroundColor: '#ef4444'
                  }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(239, 68, 68, 0.12)',
                        color: '#f87171',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid rgba(239, 68, 68, 0.3)'
                      }}>
                        <Server size={20} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '15px', fontWeight: '800', color: '#ffffff' }}>
                            {srv.name || srv.ipPort}
                          </span>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: '700',
                            padding: '2px 8px',
                            borderRadius: '5px',
                            backgroundColor: 'rgba(239, 68, 68, 0.2)',
                            color: '#fca5a5',
                            border: '1px solid rgba(239, 68, 68, 0.4)'
                          }}>
                            OFFLINE
                          </span>
                        </div>
                        <div style={{ fontSize: '12.5px', color: '#94a3b8', marginTop: '2px', display: 'flex', gap: '14px' }}>
                          <span>IP/Port: <strong style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>{srv.ipPort || 'N/A'}</strong></span>
                          <span>•</span>
                          <span>Type: <strong style={{ color: '#cbd5e1' }}>{srv.serverType || 'Windows VPS'}</strong></span>
                          <span>•</span>
                          <span>Max Users: <strong style={{ color: '#cbd5e1' }}>{srv.totalUsersLimit || 30}</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* Status & Last Ping Tag */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        fontSize: '11.5px',
                        color: '#f87171',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <Clock size={13} />
                        {srv.lastPingText ? `Last Ping: ${srv.lastPingText}` : 'No Telemetry Received'}
                      </span>

                      {onDirectRemoteConnect && srv.ipPort && (
                        <button
                          onClick={() => onDirectRemoteConnect(srv)}
                          className="btn btn-secondary"
                          style={{ fontSize: '11.5px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
                          title="Connect via RDP Console"
                        >
                          <MonitorPlay size={13} /> Remote Connect
                        </button>
                      )}
                    </div>
                  </div>

                  {/* PowerShell Agent Quick Start Command */}
                  <div style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                      <Terminal size={15} color="#38bdf8" style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: '11.5px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        Master Command:
                      </span>
                      <code style={{
                        fontSize: '11.5px',
                        color: '#7dd3fc',
                        fontFamily: 'JetBrains Mono, monospace',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        direction: 'rtl',
                        textAlign: 'left'
                      }}>
                        {cmd}
                      </code>
                    </div>

                    <button
                      onClick={(e) => handleCopyCommand(srv, e)}
                      style={{
                        padding: '5px 12px',
                        fontSize: '11.5px',
                        fontWeight: '700',
                        borderRadius: '6px',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        backgroundColor: isCopied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.12)',
                        color: isCopied ? '#34d399' : '#38bdf8',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        flexShrink: 0,
                        transition: 'all 0.2s'
                      }}
                    >
                      {isCopied ? <Check size={13} /> : <Copy size={13} />}
                      {isCopied ? 'Copied Master Command!' : 'Copy Master Command'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {/* QUICK INSTRUCTIONS */}
          <div className="telemetry-troubleshooting" style={{
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            border: '1px dashed rgba(255, 255, 255, 0.12)',
            borderRadius: '12px',
            padding: '14px 18px',
            fontSize: '12.5px',
            color: '#94a3b8',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            <strong style={{ color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
              💡 Quick Troubleshooting Steps:
            </strong>
            <div>1. Login to the target Windows VPS using <strong>Remote Desktop (RDP)</strong>.</div>
            <div>2. Open <strong>PowerShell as Administrator</strong>.</div>
            <div>3. Paste and run the <strong>Restart Agent Script</strong> above to instantly restore the live telemetry stream.</div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="telemetry-modal-footer" style={{ 
          padding: '18px 28px', 
          borderTop: '1px solid rgba(255, 255, 255, 0.08)', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="btn btn-secondary"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              fontSize: '13px',
              fontWeight: '700'
            }}
          >
            <RefreshCw size={15} className={isRefreshing ? 'spin' : ''} />
            {isRefreshing ? 'Pinging Telemetry...' : 'Retry & Sync Telemetry'}
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            {onNavigateToVps && (
              <button
                onClick={() => {
                  onClose();
                  onNavigateToVps();
                }}
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
              >
                <Server size={15} />
                Open VPS Servers View
              </button>
            )}

            <button
              onClick={onClose}
              className="btn btn-primary"
              style={{ 
                backgroundColor: '#ef4444', 
                borderColor: '#ef4444',
                color: '#ffffff',
                fontWeight: '800',
                fontSize: '13px',
                padding: '8px 20px',
                boxShadow: '0 0 15px rgba(239, 68, 68, 0.4)'
              }}
            >
              Acknowledge & Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

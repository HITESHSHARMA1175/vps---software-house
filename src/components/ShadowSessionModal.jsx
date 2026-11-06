import React, { useState } from 'react';
import {
  X,
  Eye,
  Monitor,
  MousePointer,
  Download,
  Copy,
  Check,
  ShieldCheck,
  Zap,
  Sparkles,
  ExternalLink,
  Settings,
  AlertTriangle,
  Server,
  Terminal,
  Globe,
  Lock,
  UserCheck
} from 'lucide-react';

export default function ShadowSessionModal({
  isOpen,
  session,
  onClose,
  onDirectRemoteConnect,
  onOpenLiveScreen
}) {
  const [controlMode, setControlMode] = useState('control');
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [copiedServerCmd, setCopiedServerCmd] = useState(false);
  const [copiedRdpCmd, setCopiedRdpCmd] = useState(false);
  const [activeTab, setActiveTab] = useState('NO_SERVER_LOGIN'); // 'NO_SERVER_LOGIN' or 'INSIDE_SERVER'

  if (!isOpen || !session) return null;

  const serverIp = session.serverIp || '127.0.0.1:3389';
  const serverName = session.serverName || session.serverId || 'VPS Server';
  const sessionId = session.sessionId || '1';
  const username = session.username || 'User';
  const company = session.company || username;
  const clientPassword = session.matchedUser?.password || '';

  // Local shadow command (for running inside the server)
  const controlFlag = controlMode === 'control' ? '/control' : '';
  const serverLocalCommand = `mstsc /shadow:${sessionId} ${controlFlag} /noConsentPrompt`.replace(/\s+/g, ' ').trim();

  // 1-Click Client Connect RDP File (Direct from Laptop - NO SERVER LOGIN NEEDED)
  const handleDownloadClientRdp = () => {
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

    // Auto-copy password to clipboard for 1-click convenience
    if (clientPassword) {
      navigator.clipboard.writeText(clientPassword);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 4000);
    }
  };

  const handleCopyPassword = () => {
    if (clientPassword) {
      navigator.clipboard.writeText(clientPassword);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    }
  };

  const handleCopyServerCmd = () => {
    navigator.clipboard.writeText(serverLocalCommand);
    setCopiedServerCmd(true);
    setTimeout(() => setCopiedServerCmd(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'rgba(56, 189, 248, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8'
            }}>
              <Zap size={18} />
            </div>
            <div>
              <span style={{ fontSize: '15px', fontWeight: '700' }}>Instant Remote Assist &amp; Screen Viewer</span>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '400' }}>
                Zero Server Login Required — Direct from your laptop or browser
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Target Session Card */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '8px',
          padding: '12px 14px',
          marginBottom: '14px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '10.5px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.05em' }}>
                Client Subscription
              </div>
              <div style={{ fontSize: '15px', fontWeight: '800', color: '#ffffff', marginTop: '2px' }}>
                {company}
              </div>
              <div style={{ fontSize: '12px', color: '#38bdf8', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Username: <code>{username}</code></span>
                {clientPassword && (
                  <button
                    onClick={handleCopyPassword}
                    style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '4px',
                      color: '#cbd5e1',
                      fontSize: '11px',
                      padding: '1px 6px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Click to copy password"
                  >
                    <Lock size={10} />
                    <span>{copiedPassword ? 'Password Copied!' : 'Copy Password'}</span>
                  </button>
                )}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '10.5px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.05em' }}>
                VPS Server Node
              </div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#cbd5e1', marginTop: '2px' }}>
                {serverName}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', marginTop: '4px' }}>
                <span className="font-mono" style={{ fontSize: '11px', color: '#94a3b8' }}>{serverIp}</span>
                <span className="badge badge-emerald" style={{ fontSize: '10px', padding: '2px 6px' }}>
                  Session ID: {sessionId}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Toggle: Zero Server Login vs Inside Server */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <button
            onClick={() => setActiveTab('NO_SERVER_LOGIN')}
            className={`btn btn-sm ${activeTab === 'NO_SERVER_LOGIN' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, fontSize: '12px', gap: '6px' }}
          >
            <Sparkles size={14} /> ⭐ Direct from Laptop (Zero Server Login)
          </button>
          <button
            onClick={() => setActiveTab('INSIDE_SERVER')}
            className={`btn btn-sm ${activeTab === 'INSIDE_SERVER' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, fontSize: '12px', gap: '6px' }}
          >
            <Terminal size={14} /> Inside VPS Server (Local Shadow)
          </button>
        </div>

        {/* TAB 1: ZERO SERVER LOGIN (LAPTOP / BROWSER DIRECT) */}
        {activeTab === 'NO_SERVER_LOGIN' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Action Card 0: Zero-Login Direct Live Screen Viewer */}
            {onOpenLiveScreen && (
              <div style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                borderRadius: '8px',
                padding: '14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px'
              }}>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: '800', color: '#34d399', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Eye size={17} /> 1. Direct Live Screen View (Zero Passwords / Zero Login)
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#cbd5e1', marginTop: '3px' }}>
                    Click karein aur bina kisi password ya login ke direct live screen dekhein right here in dashboard.
                  </div>
                </div>

                <button
                  onClick={() => {
                    onClose();
                    onOpenLiveScreen(session);
                  }}
                  className="btn"
                  style={{
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: '700',
                    padding: '8px 14px',
                    whiteSpace: 'nowrap',
                    gap: '5px',
                    boxShadow: '0 0 12px rgba(16, 185, 129, 0.4)'
                  }}
                >
                  <Eye size={14} color="#ffffff" />
                  <span>Launch Live Screen</span>
                </button>
              </div>
            )}

            {/* Action Card 1: In-Browser Web Console */}
            {onDirectRemoteConnect && (
              <div style={{
                background: 'rgba(2, 132, 199, 0.08)',
                border: '1px solid rgba(2, 132, 199, 0.3)',
                borderRadius: '8px',
                padding: '14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px'
              }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Globe size={16} /> 1. In-Browser HTML5 Web Console
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
                    Apne laptop ke Chrome/Edge browser me direct Tally screen kholein (Zero software, zero login).
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onDirectRemoteConnect({
                      company,
                      username,
                      password: clientPassword,
                      serverId: session.serverId,
                      serverIp: session.serverIp,
                      drive: session.drive
                    }, 'USER');
                  }}
                  className="btn btn-primary"
                  style={{ fontSize: '12px', padding: '8px 14px', gap: '6px', whiteSpace: 'nowrap' }}
                >
                  <ExternalLink size={14} /> Open Web Screen
                </button>
              </div>
            )}

            {/* Action Card 2: 1-Click Client RDP File */}
            <div style={{
              background: 'rgba(52, 211, 153, 0.06)',
              border: '1px solid rgba(52, 211, 153, 0.25)',
              borderRadius: '8px',
              padding: '14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#34d399', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Zap size={16} /> 2. 1-Click Direct Client Connect (.RDP)
                </div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
                  Seedha client ke session me login karein. Click karte hi password auto-copy ho jayega!
                </div>
              </div>

              <button
                type="button"
                onClick={handleDownloadClientRdp}
                className="btn btn-secondary"
                style={{
                  fontSize: '12px',
                  padding: '8px 14px',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  borderColor: 'rgba(52, 211, 153, 0.4)',
                  color: '#34d399'
                }}
              >
                <Download size={14} /> 1-Click Connect (.RDP)
              </button>
            </div>

            {copiedPassword && (
              <div style={{
                background: 'rgba(52, 211, 153, 0.1)',
                border: '1px solid #10b981',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '11.5px',
                color: '#34d399',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Check size={14} /> Password clipboard me copy ho gaya hai! Windows connect hone par bas <strong>Ctrl + V</strong> paste karein.
              </div>
            )}
          </div>
        )}

        {/* TAB 2: INSIDE SERVER (LOCAL SHADOW) */}
        {activeTab === 'INSIDE_SERVER' && (
          <div style={{
            background: 'rgba(0, 0, 0, 0.35)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            padding: '14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Terminal size={14} /> VPS Server Command (Run inside Server):
              </span>
              <button
                onClick={handleCopyServerCmd}
                className="btn btn-secondary btn-xs"
                style={{ fontSize: '11px', gap: '4px' }}
              >
                {copiedServerCmd ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                <span>{copiedServerCmd ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px' }}>
              VPS ke andar <strong>Win + R</strong> ya Administrator PowerShell me ye paste karke Enter karein:
            </div>

            <code style={{
              display: 'block',
              fontSize: '12px',
              color: '#34d399',
              fontFamily: 'Consolas, monospace',
              background: 'rgba(0,0,0,0.5)',
              padding: '8px 10px',
              borderRadius: '4px',
              border: '1px solid rgba(255, 255, 255, 0.05)'
            }}>
              {serverLocalCommand}
            </code>

            <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '8px' }}>
              Exit shadow shortcut: <strong>Ctrl + Shift + *</strong>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            style={{ fontSize: '11.5px' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

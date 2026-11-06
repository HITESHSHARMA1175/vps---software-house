import React, { useState, useEffect } from 'react';
import {
  X,
  Terminal,
  Copy,
  Check,
  ShieldCheck,
  Server,
  Radio,
  Cpu,
  Clock,
  ExternalLink,
  Layers,
  HelpCircle
} from 'lucide-react';

export default function AgentInstallModal({
  isOpen,
  onClose,
  server,
  isOnline = false
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen || !server) return null;

  const targetId = server.ipPort || server.id || 'srv-node-1';
  const encodedId = encodeURIComponent(targetId);
  const portalBaseUrl = window.location.origin.includes('localhost')
    ? 'https://vps.innovationwebworks.in'
    : window.location.origin;

  const powershellCommand = `[Net.ServicePointManager]::SecurityProtocol = 3072 -bor 768 -bor 192; (New-Object Net.WebClient).DownloadString('${portalBaseUrl}/install.ps1?s=${encodedId}') | iex`;

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2500);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '680px',
          width: '95%',
          backgroundColor: '#0f172a',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0) 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#818cf8'
              }}
            >
              <Terminal size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
                1-Click Universal VPS Agent Setup
              </h3>
              <p style={{ fontSize: '0.76rem', color: '#94a3b8', margin: '2px 0 0 0' }}>
                Auto-generated command for: <strong style={{ color: '#e2e8f0' }}>{server.name}</strong> ({server.ipPort})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="modal-close"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: 'none',
              color: '#94a3b8',
              borderRadius: '8px',
              padding: '6px',
              cursor: 'pointer',
              display: 'flex'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Live Status Pill & OS Compatibility Banner */}
        <div style={{ padding: '1rem 1.5rem 0.5rem 1.5rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${isOnline ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.2)'}`,
              borderRadius: '10px',
              padding: '0.65rem 0.9rem',
              marginBottom: '1rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: isOnline ? '#10b981' : '#ef4444',
                  boxShadow: isOnline ? '0 0 10px #10b981' : '0 0 10px #ef4444'
                }}
              />
              <span style={{ fontSize: '0.82rem', fontWeight: '600', color: isOnline ? '#34d399' : '#f87171' }}>
                {isOnline
                  ? '🟢 Server Agent Connected & Online (Real-time telemetry active)'
                  : '🔴 Agent Not Connected Yet — Run the command below to connect'}
              </span>
            </div>
            <span
              style={{
                fontSize: '0.72rem',
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                padding: '2px 8px',
                borderRadius: '6px',
                color: '#cbd5e1'
              }}
            >
              Target: {targetId}
            </span>
          </div>

          {/* Universal Master Command Block (Single Authoritative Command) */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <p style={{ fontSize: '0.82rem', color: '#cbd5e1', margin: 0, fontWeight: '600' }}>
                ⚡ Run in <strong>PowerShell (As Administrator)</strong> on the Windows VPS:
              </p>
              <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: '700', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '2px 8px', borderRadius: '6px' }}>
                3-Layer Self-Healing Active
              </span>
            </div>

            <div
              style={{
                position: 'relative',
                backgroundColor: '#030712',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: '12px',
                padding: '14px 16px',
                fontFamily: 'Consolas, Monaco, monospace',
                fontSize: '0.8rem',
                color: '#38bdf8',
                wordBreak: 'break-all',
                lineHeight: '1.5',
                boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.6)'
              }}
            >
              {powershellCommand}
              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleCopy(powershellCommand)}
                  style={{
                    backgroundColor: copied ? '#10b981' : '#4f46e5',
                    border: 'none',
                    color: '#ffffff',
                    padding: '8px 20px',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {copied ? (
                    <>
                      <Check size={16} /> Copied Master Command!
                    </>
                  ) : (
                    <>
                      <Copy size={16} /> Copy Master Command
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Feature Highlights Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '10px',
              marginTop: '16px',
              paddingTop: '12px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)'
            }}
          >
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                padding: '8px 10px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px'
              }}
            >
              <ShieldCheck size={18} color="#34d399" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#f1f5f9' }}>
                  Antivirus &amp; Defender Safe
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                  Auto-adds Defender directory exclusions so protection engines never block agent operation.
                </div>
              </div>
            </div>

            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                padding: '8px 10px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px'
              }}
            >
              <Clock size={18} color="#818cf8" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#f1f5f9' }}>
                  24/7 Session 0 Service
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                  Runs under NT AUTHORITY\SYSTEM. Continues running uninterrupted when admins log off RDP.
                </div>
              </div>
            </div>

            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                padding: '8px 10px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px'
              }}
            >
              <Layers size={18} color="#38bdf8" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#f1f5f9' }}>
                  Universal OS Compatibility
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                  Supports Windows Server 2008 R2, 2012, 2012 R2, 2016, 2019, 2022, 2025 &amp; Windows 10/11.
                </div>
              </div>
            </div>

            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                padding: '8px 10px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px'
              }}
            >
              <Cpu size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#f1f5f9' }}>
                  Full Remote Actions
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                  Remote password change, account enable/disable, and session force logoff straight from portal.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            backgroundColor: 'rgba(15, 23, 42, 0.4)'
          }}
        >
          <button
            onClick={onClose}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              color: '#ffffff',
              padding: '8px 18px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Done / Close
          </button>
        </div>
      </div>
    </div>
  );
}

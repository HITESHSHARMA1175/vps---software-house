import React, { useState } from 'react';
import { KeyRound, Copy, Check, Download, AlertTriangle, X } from 'lucide-react';

/**
 * One-time Agent_Key display.
 *
 * - Success: shows the plaintext key, a copy button and an installer download link.
 * - Error: shows only the error message (no key, no link).
 * - The key and link exist only while this panel is mounted; the parent clears its state on close.
 */
export default function AgentKeyPanel({ agentKey, installerUrl, error, onClose }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');

  const handleCopy = async () => {
    setCopyError('');
    try {
      await navigator.clipboard.writeText(agentKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      setCopied(false);
      setCopyError('Copy failed. Select the key and copy it manually.');
    }
  };

  if (error) {
    return (
      <div
        role="alert"
        style={{
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: '10px',
          padding: '0.75rem 1rem',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '0.75rem'
        }}
      >
        <div style={{ display: 'flex', gap: '8px', color: '#fca5a5', fontSize: '0.82rem' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{error}</span>
        </div>
        <button type="button" className="modal-close" aria-label="Dismiss error" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
    );
  }

  if (!agentKey) return null;

  return (
    <div
      style={{
        backgroundColor: 'rgba(245, 158, 11, 0.08)',
        border: '1px solid rgba(245, 158, 11, 0.35)',
        borderRadius: '10px',
        padding: '0.9rem 1rem'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <strong style={{ fontSize: '0.88rem', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <KeyRound size={16} /> New agent key
        </strong>
        <button type="button" className="modal-close" aria-label="Close agent key panel" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <p style={{ fontSize: '0.78rem', color: '#cbd5e1', margin: '0 0 8px 0', lineHeight: 1.4 }}>
        This key is shown once. Copy it now; it cannot be viewed again after you close this panel.
      </p>

      <div
        style={{
          backgroundColor: '#030712',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '8px',
          padding: '10px 12px',
          fontFamily: 'Consolas, Monaco, monospace',
          fontSize: '0.8rem',
          color: '#e2e8f0',
          wordBreak: 'break-all',
          userSelect: 'all'
        }}
      >
        {agentKey}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={handleCopy}>
          {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy key</>}
        </button>
        {installerUrl && (
          <a
            className="btn btn-secondary btn-sm"
            href={installerUrl}
            download="install.ps1"
            rel="noopener noreferrer"
          >
            <Download size={14} /> Download installer
          </a>
        )}
      </div>

      {copyError && (
        <div role="alert" style={{ marginTop: '8px', fontSize: '0.75rem', color: '#fca5a5' }}>{copyError}</div>
      )}
    </div>
  );
}

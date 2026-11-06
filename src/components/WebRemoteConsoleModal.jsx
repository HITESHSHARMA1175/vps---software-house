import React, { useState, useEffect, useRef } from 'react';
import { X, Monitor, ExternalLink, Copy, Check, ShieldCheck, Key, User, Globe, ArrowRight, Sparkles, RefreshCw, Zap, Lock, Shield, AlertTriangle, Play } from 'lucide-react';

export function buildVpsLoginUrl(server, targetUsername, targetPassword, useHttp = false) {
  let rawHost = '192.168.1.100';

  if (server) {
    if (server.httpsUrl && server.httpsUrl.trim()) {
      rawHost = server.httpsUrl.trim();
    } else if (server.ipPort && server.ipPort.trim()) {
      rawHost = server.ipPort.trim();
    } else if (server.name && server.name.trim()) {
      rawHost = server.name.trim();
    }
  }

  // Strip http:// or https:// if present
  rawHost = rawHost.replace(/^https?:\/\//i, '').trim();

  // Extract pure IP/hostname before any colon : to eliminate old port overrides
  const pureHost = rawHost.split(':')[0].trim() || '192.168.1.100';

  // Standard TSplus HTML5 Web Client Auto-Logon URL
  const protocol = useHttp ? 'http' : 'https';
  const port = useHttp ? '80' : '443';

  const userParam = targetUsername ? `user=${encodeURIComponent(targetUsername)}` : '';
  const pwdParam = targetPassword ? `&pwd=${encodeURIComponent(targetPassword)}` : '';
  const queryStr = (userParam || pwdParam) ? `?${userParam}${pwdParam}` : '';

  return `${protocol}://${pureHost}:${port}/software/html5.html${queryStr}`;
}

export default function WebRemoteConsoleModal({ isOpen, onClose, user, server, loginMode = 'USER' }) {
  const [copiedField, setCopiedField] = useState(null);
  const [useHttpFallback, setUseHttpFallback] = useState(false);
  const iframeRef = useRef(null);

  const isSuperclientMode = loginMode === 'SUPERCLIENT';

  const targetUsername = isSuperclientMode
    ? (server ? server.superClientUser || 'Superclient' : 'Superclient')
    : user.username;

  const targetPassword = isSuperclientMode
    ? (server ? server.superClientPass || 'Pass#123' : 'Pass#123')
    : (user.password || 'Pass#123');

  const directAutoLoginUrl = buildVpsLoginUrl(server, targetUsername, targetPassword, useHttpFallback);

  // JavaScript Bookmarklet snippet for 1-Click Auto-Fill on TSplus
  const bookmarkletCode = `javascript:(function(){var u='${targetUsername}',p='${targetPassword}';var uEl=document.getElementById('editbox_username')||document.querySelector('input[type="text"]')||document.querySelector('input[name="login"]');var pEl=document.getElementById('editbox_password')||document.querySelector('input[type="password"]')||document.querySelector('input[name="password"]');if(uEl){uEl.value=u;uEl.dispatchEvent(new Event('input'));}if(pEl){pEl.value=p;pEl.dispatchEvent(new Event('input'));}var b=document.querySelector('input[type="submit"]')||document.querySelector('button')||document.getElementById('logonbutton');if(b)b.click();})();`;

  useEffect(() => {
    if (isOpen) {
      if (targetUsername) {
        // Auto-copy Username ID on modal launch for fast 1-click paste
        try {
          navigator.clipboard.writeText(targetUsername);
        } catch (e) {}
      }
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, targetUsername, onClose]);

  if (!isOpen || !user) return null;

  const copyToClipboard = (text, fieldName) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (e) {}
  };

  const handleOpenExternalAutoLogin = (forceHttp = false) => {
    const targetUrl = buildVpsLoginUrl(server, targetUsername, targetPassword, forceHttp);
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCopyBypassCode = () => {
    navigator.clipboard.writeText('thisisunsafe');
    setCopiedField('bypass');
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleCopyBookmarklet = () => {
    navigator.clipboard.writeText(bookmarkletCode);
    setCopiedField('bookmarklet');
    setTimeout(() => setCopiedField(null), 2500);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1500 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '980px', width: '95%', padding: '1.5rem' }}>
        <div className="modal-header" style={{ marginBottom: '1rem' }}>
          <div className="modal-title" style={{ color: isSuperclientMode ? '#f59e0b' : '#34d399', fontSize: '1.15rem' }}>
            {isSuperclientMode ? <Shield size={22} color="#f59e0b" /> : <Monitor size={22} color="#34d399" />}
            {isSuperclientMode ? `👑 TSplus Superclient Admin Portal` : `⚡ TSplus User Account Remote Portal`}
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Floating Fast Auto-Fill Assistance Bar */}
        <div style={{
          background: isSuperclientMode
            ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(15, 23, 42, 0.95))'
            : 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(15, 23, 42, 0.95))',
          border: isSuperclientMode
            ? '1px solid rgba(245, 158, 11, 0.6)'
            : '1px solid rgba(16, 185, 129, 0.6)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem 1.25rem',
          marginBottom: '1rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: isSuperclientMode ? '#fcd34d' : '#6ee7b7', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={14} color={isSuperclientMode ? '#f59e0b' : '#34d399'} />
                TSplus 1-Click Fast Credentials Toolbar
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#ffffff', marginTop: '2px' }}>
                {user.company} <span style={{ fontSize: '0.85rem', color: '#93c5fd', fontWeight: '600' }}>({server ? server.name : 'VPS'})</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '0.45rem 0.75rem', color: '#fcd34d', borderColor: 'rgba(245, 158, 11, 0.4)' }}
                onClick={handleCopyBypassCode}
              >
                {copiedField === 'bypass' ? <Check size={14} color="#10b981" /> : <Zap size={14} />}
                {copiedField === 'bypass' ? '✓ Bypass Code Copied' : 'Copy Chrome Bypass (thisisunsafe)'}
              </button>

              <button
                className="btn btn-primary"
                style={{
                  background: isSuperclientMode ? 'linear-gradient(135deg, #d97706, #b45309)' : 'linear-gradient(135deg, #ea580c, #c2410c)',
                  border: 'none',
                  fontSize: '0.85rem',
                  padding: '0.45rem 0.85rem'
                }}
                onClick={() => handleOpenExternalAutoLogin(false)}
              >
                <ExternalLink size={14} /> Open TSplus Tab
              </button>
            </div>
          </div>

          {/* 3-Step Instant Auto-Fill Buttons Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '0.75rem',
            backgroundColor: 'rgba(9, 14, 26, 0.8)',
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid var(--border-color)'
          }}>
            {/* Step 1: Copy Username */}
            <button
              type="button"
              className="btn btn-secondary"
              style={{
                justify: 'space-between',
                padding: '0.6rem 0.85rem',
                backgroundColor: copiedField === 'user' ? 'rgba(16, 185, 129, 0.2)' : undefined,
                borderColor: copiedField === 'user' ? '#10b981' : undefined
              }}
              onClick={() => copyToClipboard(targetUsername, 'user')}
            >
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>1️⃣ Step 1: User ID</div>
                <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#ffffff' }}>{targetUsername}</div>
              </div>
              {copiedField === 'user' ? <Check size={16} color="#34d399" /> : <Copy size={16} color="#38bdf8" />}
            </button>

            {/* Step 2: Copy Password */}
            <button
              type="button"
              className="btn btn-secondary"
              style={{
                justify: 'space-between',
                padding: '0.6rem 0.85rem',
                backgroundColor: copiedField === 'pass' ? 'rgba(16, 185, 129, 0.2)' : undefined,
                borderColor: copiedField === 'pass' ? '#10b981' : undefined
              }}
              onClick={() => copyToClipboard(targetPassword, 'pass')}
            >
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>2️⃣ Step 2: Password</div>
                <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#f59e0b' }}>{targetPassword}</div>
              </div>
              {copiedField === 'pass' ? <Check size={16} color="#34d399" /> : <Key size={16} color="#f59e0b" />}
            </button>

            {/* Step 3: 1-Click Auto-Fill Injector */}
            <button
              type="button"
              className="btn btn-primary"
              style={{
                justify: 'space-between',
                padding: '0.6rem 0.85rem',
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                border: 'none'
              }}
              onClick={handleCopyBookmarklet}
              title="Copy 1-Click JavaScript Auto-Fill script to paste in browser console / address bar!"
            >
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '0.7rem', color: '#c7d2fe', textTransform: 'uppercase', fontWeight: '700' }}>3️⃣ Step 3: Auto-Fill Injector</div>
                <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#ffffff' }}>Copy 1-Click Script</div>
              </div>
              {copiedField === 'bookmarklet' ? <Check size={16} color="#34d399" /> : <Play size={16} color="#ffffff" />}
            </button>
          </div>
        </div>


        {/* Embedded VPS Browser Web Console Frame */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: '460px',
          background: '#090e1a',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)',
          overflow: 'hidden'
        }}>
          {/* Top Address Toolbar inside Frame */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.95)',
            padding: '0.5rem 0.85rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justify: 'space-between',
            fontSize: '0.78rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
              <Lock size={14} color={isSuperclientMode ? '#f59e0b' : '#34d399'} />
              <span className="font-mono" style={{ color: '#f8fafc' }}>{directAutoLoginUrl}</span>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                className="btn btn-secondary"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}
                onClick={() => setUseHttpFallback(!useHttpFallback)}
              >
                Switch to {useHttpFallback ? 'HTTPS:443' : 'HTTP:8080'}
              </button>

              <button
                className="btn btn-secondary"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}
                onClick={() => {
                  if (iframeRef.current) iframeRef.current.src = directAutoLoginUrl;
                }}
              >
                <RefreshCw size={12} /> Reload Frame
              </button>
            </div>
          </div>

          <iframe
            ref={iframeRef}
            src={directAutoLoginUrl}
            title="TSplus Web Remote Console"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            style={{
              width: '100%',
              height: 'calc(100% - 35px)',
              border: 'none',
              background: '#ffffff'
            }}
          />
        </div>
      </div>
    </div>
  );
}

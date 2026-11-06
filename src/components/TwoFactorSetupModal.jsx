import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Copy,
  Check,
  Download,
  Key,
  RefreshCw,
  Lock,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import QRCode from 'qrcode';

export default function TwoFactorSetupModal({
  isOpen,
  onClose,
  currentUser,
  onUpdateCurrentUser,
  showToast
}) {
  const [loading, setLoading] = useState(false);
  const [setupData, setSetupData] = useState(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [isDisabling, setIsDisabling] = useState(false);

  const is2FAActive = Boolean(currentUser?.two_factor_enabled);

  // Initialize setup data when modal opens
  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      setSuccessMsg('');
      setVerificationCode('');
      setDisablePassword('');
      setIsDisabling(false);

      if (!is2FAActive) {
        startSetup();
      }
    }
  }, [isOpen, is2FAActive]);

  const startSetup = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setSetupData(data);
        // Generate QR code data URL
        const dataUrl = await QRCode.toDataURL(data.otpauthUrl, {
          width: 240,
          margin: 2,
          color: {
            dark: '#080b11',
            light: '#ffffff'
          }
        });
        setQrCodeDataUrl(dataUrl);
      } else {
        setErrorMsg(data.message || 'Failed to initialize 2FA setup.');
      }
    } catch (err) {
      setErrorMsg('Network error connecting to auth server.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSetup = async (e) => {
    e.preventDefault();
    if (!verificationCode || verificationCode.trim().length !== 6) {
      setErrorMsg('Please enter the 6-digit code shown in Google Authenticator.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/auth/2fa/confirm-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          code: verificationCode.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg('Google Authenticator 2FA is now ACTIVE on your account!');
        if (onUpdateCurrentUser) {
          onUpdateCurrentUser({ ...currentUser, two_factor_enabled: true });
        }
        if (showToast) showToast('Google Authenticator 2FA successfully activated! 🛡️');
      } else {
        setErrorMsg(data.message || 'Invalid code. Please ensure your phone clock is synced.');
      }
    } catch (err) {
      setErrorMsg('Failed to verify code. Please check connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable2FA = async (e) => {
    e.preventDefault();
    if (!disablePassword) {
      setErrorMsg('Password is required to disable 2FA.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          password: disablePassword
        })
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg('Two-factor authentication has been disabled.');
        if (onUpdateCurrentUser) {
          onUpdateCurrentUser({ ...currentUser, two_factor_enabled: false });
        }
        if (showToast) showToast('Two-factor authentication disabled.');
        setIsDisabling(false);
        setDisablePassword('');
      } else {
        setErrorMsg(data.message || 'Incorrect password.');
      }
    } catch (err) {
      setErrorMsg('Failed to disable 2FA.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text);
    if (type === 'key') {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2000);
    }
  };

  const downloadBackupCodes = () => {
    if (!setupData?.backupCodes) return;
    const content = `INNOVATION VPS MANAGEMENT PORTAL - EMERGENCY BACKUP RECOVERY CODES
Account: ${currentUser?.username || 'Admin'}
Generated: ${new Date().toISOString()}

Use each 8-character code once if you lose access to Google Authenticator:
-------------------------------------------------------------------------
${setupData.backupCodes.map((code, idx) => `${idx + 1}. ${code}`).join('\n')}
-------------------------------------------------------------------------
Keep these codes in a safe, offline location.`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `VPS-Backup-Codes-${currentUser?.username || 'admin'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 7, 13, 0.85)',
        backdropFilter: 'blur(12px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem'
      }}
    >
      <div
        className="glass-card"
        style={{
          maxWidth: '620px',
          width: '100%',
          backgroundColor: '#0d131f',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 35px rgba(56, 189, 248, 0.1)',
          borderRadius: '20px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.75rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: is2FAActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                border: `1px solid ${is2FAActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(56, 189, 248, 0.3)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {is2FAActive ? (
                <ShieldCheck size={20} color="#10b981" />
              ) : (
                <Shield size={20} color="#38bdf8" />
              )}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#ffffff' }}>
                Google Authenticator 2FA
              </h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
                Multi-Factor Security for VPS Management Console
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ padding: '6px', borderRadius: '8px', color: '#94a3b8' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.75rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {errorMsg && (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#fca5a5',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                fontSize: '0.825rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <ShieldAlert size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                color: '#6ee7b7',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                fontSize: '0.825rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <ShieldCheck size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* ACTIVE STATE VIEW */}
          {is2FAActive ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: '14px',
                  padding: '1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem'
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <ShieldCheck size={28} color="#10b981" />
                </div>
                <div>
                  <h4 style={{ margin: 0, color: '#ffffff', fontSize: '1rem', fontWeight: '700' }}>
                    Two-Factor Authentication is Active
                  </h4>
                  <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.4 }}>
                    Your account is protected by Google Authenticator. Every sign-in requires your password plus a 6-digit dynamic code.
                  </p>
                </div>
              </div>

              {!isDisabling ? (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setIsDisabling(true)}
                    className="btn btn-secondary btn-sm"
                    style={{
                      borderColor: 'rgba(239, 68, 68, 0.35)',
                      color: '#f87171',
                      padding: '0.6rem 1.1rem'
                    }}
                  >
                    <Lock size={14} /> Disable Two-Factor Authentication
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn btn-primary btn-sm"
                    style={{ padding: '0.6rem 1.25rem' }}
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleDisable2FA} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      borderRadius: '12px',
                      padding: '1.25rem'
                    }}
                  >
                    <div style={{ fontWeight: '700', color: '#fca5a5', fontSize: '0.875rem', marginBottom: '8px' }}>
                      Confirm Deactivation
                    </div>
                    <p style={{ margin: '0 0 12px 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                      Enter your current login password to confirm turning off 2FA protection:
                    </p>
                    <input
                      type="password"
                      required
                      placeholder="Enter your account password"
                      value={disablePassword}
                      onChange={(e) => setDisablePassword(e.target.value)}
                      className="form-input"
                      style={{
                        backgroundColor: '#111827',
                        borderColor: 'rgba(255, 255, 255, 0.15)',
                        color: '#ffffff',
                        padding: '0.7rem 0.9rem',
                        fontSize: '0.875rem',
                        borderRadius: '8px',
                        width: '100%'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => setIsDisabling(false)}
                      className="btn btn-secondary btn-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="btn btn-sm"
                      style={{
                        backgroundColor: '#dc2626',
                        color: '#ffffff',
                        fontWeight: '700',
                        padding: '0.6rem 1.25rem'
                      }}
                    >
                      {loading ? 'Disabling...' : 'Confirm Disable 2FA'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* SETUP WIZARD VIEW */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Step 1: Install App notice */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  backgroundColor: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '0.85rem 1rem'
                }}
              >
                <Smartphone size={22} color="#38bdf8" />
                <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                  <strong style={{ color: '#ffffff' }}>Step 1:</strong> Open <strong>Google Authenticator</strong> (or Microsoft Authenticator) on your phone.
                </div>
              </div>

              {/* Step 2: QR Code and Secret */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1.25rem',
                  alignItems: 'center'
                }}
              >
                {/* QR Code Container */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#ffffff',
                    padding: '1rem',
                    borderRadius: '16px',
                    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)'
                  }}
                >
                  {qrCodeDataUrl ? (
                    <img
                      src={qrCodeDataUrl}
                      alt="Google Authenticator QR Code"
                      style={{ width: '180px', height: '180px', display: 'block' }}
                    />
                  ) : (
                    <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                      <RefreshCw size={24} className="spin" />
                    </div>
                  )}
                  <span style={{ fontSize: '0.72rem', color: '#475569', fontWeight: '700', marginTop: '6px' }}>
                    Scan with Authenticator App
                  </span>
                </div>

                {/* Key Details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '600', display: 'block', marginBottom: '4px' }}>
                      Can't scan? Copy Secret Key:
                    </label>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: '#111827',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '8px',
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                        color: '#38bdf8'
                      }}
                    >
                      <span style={{ letterSpacing: '0.05em' }}>{setupData?.secret || 'Generating...'}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(setupData?.secret || '', 'key')}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: copiedKey ? '#34d399' : '#94a3b8',
                          cursor: 'pointer',
                          padding: '4px'
                        }}
                        title="Copy Secret"
                      >
                        {copiedKey ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.4 }}>
                    Account Name: <strong style={{ color: '#ffffff' }}>{currentUser?.username || 'admin'}</strong>
                    <br />
                    Type: <span style={{ color: '#cbd5e1' }}>Time-based (30s)</span>
                  </div>
                </div>
              </div>

              {/* Step 3: Emergency Backup Codes */}
              {setupData?.backupCodes && (
                <div
                  style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    padding: '1rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Key size={14} color="#f59e0b" /> Emergency Backup Recovery Codes
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(setupData.backupCodes.join('\n'), 'codes')}
                        className="btn btn-ghost btn-xs"
                        style={{ fontSize: '0.72rem', color: copiedCodes ? '#34d399' : '#38bdf8' }}
                      >
                        {copiedCodes ? <Check size={12} /> : <Copy size={12} />} Copy All
                      </button>
                      <button
                        type="button"
                        onClick={downloadBackupCodes}
                        className="btn btn-ghost btn-xs"
                        style={{ fontSize: '0.72rem', color: '#38bdf8' }}
                      >
                        <Download size={12} /> Download (.txt)
                      </button>
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '6px',
                      backgroundColor: '#0a0e17',
                      padding: '8px',
                      borderRadius: '8px'
                    }}
                  >
                    {setupData.backupCodes.map((c, i) => (
                      <code
                        key={i}
                        style={{
                          fontSize: '0.75rem',
                          color: '#e2e8f0',
                          fontFamily: 'monospace',
                          textAlign: 'center',
                          padding: '3px 0'
                        }}
                      >
                        {c}
                      </code>
                    ))}
                  </div>
                  <p style={{ margin: '6px 0 0 0', fontSize: '0.7rem', color: '#94a3b8' }}>
                    Save these codes! If you lose your phone, you can enter any backup code to sign in.
                  </p>
                </div>
              )}

              {/* Step 4: Verification Code Form */}
              <form onSubmit={handleConfirmSetup} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: '700', color: '#ffffff', marginBottom: '6px' }}>
                    Step 2: Enter 6-Digit Code from Authenticator to Activate:
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    autoFocus
                    placeholder="000000"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                    className="form-input"
                    style={{
                      backgroundColor: '#111827',
                      borderColor: 'rgba(56, 189, 248, 0.4)',
                      color: '#ffffff',
                      fontSize: '1.4rem',
                      fontWeight: '800',
                      letterSpacing: '0.3em',
                      textAlign: 'center',
                      borderRadius: '10px',
                      padding: '0.75rem',
                      width: '100%'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn btn-secondary btn-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading || verificationCode.length !== 6}
                    className="btn btn-primary btn-sm"
                    style={{
                      padding: '0.65rem 1.5rem',
                      fontWeight: '700',
                      background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                      boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)'
                    }}
                  >
                    {loading ? 'Activating...' : (
                      <>
                        <ShieldCheck size={16} /> Activate 2FA Protection
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

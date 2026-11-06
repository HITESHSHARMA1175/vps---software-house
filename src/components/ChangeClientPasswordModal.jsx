import React, { useState, useEffect } from 'react';
import { X, Key, Lock, Eye, EyeOff, CheckCircle2, ShieldCheck, Server, Sparkles, Copy, Check, AlertCircle } from 'lucide-react';

export default function ChangeClientPasswordModal({
  isOpen,
  onClose,
  user,
  server,
  onSubmitPassword
}) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset form only when modal opens
  useEffect(() => {
    if (isOpen) {
      setNewPassword('');
      setConfirmPassword('');
      setError(null);
      setIsSuccess(false);
      setCopied(false);
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !user) return null;

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
    let pwd = '';
    // Guarantee complexity: 1 uppercase, 1 lowercase, 1 digit, 1 special
    pwd += 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)];
    pwd += 'abcdefghijkmnpqrstuvwxyz'[Math.floor(Math.random() * 24)];
    pwd += '23456789'[Math.floor(Math.random() * 8)];
    pwd += '!@#$%^&*'[Math.floor(Math.random() * 8)];
    for (let i = 0; i < 6; i++) {
      pwd += chars[Math.floor(Math.random() * chars.length)];
    }
    pwd = pwd.split('').sort(() => 0.5 - Math.random()).join('');
    setNewPassword(pwd);
    setConfirmPassword(pwd);
    setShowPassword(true);
    setError(null);
  };

  const handleCopy = () => {
    if (!newPassword) return;
    navigator.clipboard.writeText(newPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!newPassword || newPassword.trim().length < 6) {
      setError('Password Policy: Minimum 6 characters required to satisfy Windows Server complexity.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please verify.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmitPassword(user.id, newPassword.trim());
      setIsSuccess(true);
      // Auto close after 2.5s or user can click Done
      setTimeout(() => {
        onClose();
      }, 2500);
    } catch (err) {
      setError(err.message || 'Failed to update client password on VPS.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={e => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      style={{ zIndex: 99999 }}
    >
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '440px', backgroundColor: '#0f172a', border: '1px solid rgba(255, 255, 255, 0.12)' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: isSuccess ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `1px solid ${isSuccess ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
            }}>
              {isSuccess ? <CheckCircle2 size={20} color="#34d399" /> : <Key size={20} color="#fbbf24" />}
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#ffffff', margin: 0 }}>
                {isSuccess ? 'Password Updated!' : 'Change VPS Password'}
              </h3>
              <p style={{ fontSize: '0.74rem', color: '#94a3b8', margin: '2px 0 0 0' }}>
                Directly syncs to Windows VPS local user account
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* User & Server Context Card */}
        <div style={{
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '5px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>Company / Client:</span>
            <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#ffffff' }}>{user.company}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>Windows Username:</span>
            <span style={{ fontSize: '0.82rem', fontFamily: 'monospace', fontWeight: '700', color: '#38bdf8' }}>{user.username}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>Target VPS Node:</span>
            <span style={{ fontSize: '0.76rem', color: '#34d399', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Server size={12} /> {server?.name || user.serverId || 'VPS Node'}
            </span>
          </div>
        </div>

        {/* Success View */}
        {isSuccess ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '12px 0' }}>
            <div style={{
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '8px',
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <CheckCircle2 size={20} color="#34d399" style={{ flexShrink: 0 }} />
              <div>
                <strong style={{ fontSize: '13px', color: '#a7f3d0' }}>Password Successfully Updated!</strong>
                <p style={{ fontSize: '11px', color: '#cbd5e1', margin: '2px 0 0 0' }}>
                  Automated sync job dispatched to Windows VPS. Applies in 10 seconds.
                </p>
              </div>
            </div>

            {/* Display Updated Password with Copy Button */}
            <div style={{
              backgroundColor: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '10px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>New Password:</div>
                <div className="font-mono" style={{ fontSize: '14px', fontWeight: '800', color: '#38bdf8', letterSpacing: '0.05em', marginTop: '2px' }}>
                  {newPassword}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '11px', gap: '5px' }}
              >
                {copied ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="btn btn-primary"
              style={{ width: '100%', height: '36px', marginTop: '6px' }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Automated VPS Sync Callout */}
            <div style={{
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '8px',
              padding: '0.65rem 0.85rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px'
            }}>
              <ShieldCheck size={16} color="#34d399" style={{ marginTop: '2px', flexShrink: 0 }} />
              <p style={{ fontSize: '0.74rem', color: '#a7f3d0', margin: 0, lineHeight: 1.4 }}>
                <strong>Automated Server Sync:</strong> Once submitted, the agent on this Windows VPS executes <code style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '1px 4px', borderRadius: '4px' }}>Set-LocalUser</code> in ~10 seconds. The client can immediately use the new password for RDP / TSplus.
              </p>
            </div>

            {error && (
              <div style={{
                backgroundColor: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                color: '#fda4af',
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.8rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <label style={{ fontSize: '0.76rem', fontWeight: '700', color: '#94a3b8' }}>
                    NEW PASSWORD *
                  </label>
                  <button
                    type="button"
                    onClick={generatePassword}
                    className="btn btn-ghost btn-xs"
                    style={{ fontSize: '10.5px', color: '#fbbf24', padding: '1px 6px', gap: '4px' }}
                    title="Generate random complex password"
                  >
                    <Sparkles size={11} /> Generate
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter new password (min 6 chars)"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(15, 23, 42, 0.7)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '0.6rem 4.5rem 0.6rem 0.85rem',
                      color: '#ffffff',
                      fontSize: '0.85rem',
                      fontFamily: showPassword ? 'inherit' : 'monospace'
                    }}
                  />
                  <div style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {newPassword && (
                      <button
                        type="button"
                        onClick={handleCopy}
                        style={{ background: 'none', border: 'none', color: copied ? '#34d399' : '#94a3b8', cursor: 'pointer', padding: '3px' }}
                        title="Copy password"
                      >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '3px' }}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.76rem', fontWeight: '700', color: '#94a3b8', display: 'block', marginBottom: '5px' }}>
                  CONFIRM NEW PASSWORD *
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '0.6rem 0.85rem',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    fontFamily: showPassword ? 'inherit' : 'monospace'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#cbd5e1',
                    padding: '0.55rem 1rem',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    border: 'none',
                    color: '#ffffff',
                    padding: '0.55rem 1.25rem',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    opacity: isSubmitting ? 0.7 : 1,
                    boxShadow: '0 4px 12px rgba(217, 119, 6, 0.3)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Key size={14} />
                  {isSubmitting ? 'Dispatching to VPS...' : 'Update & Sync to VPS'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

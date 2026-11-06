import React, { useState } from 'react';
import { X, Key, Mail, ShieldAlert, CheckCircle2, ArrowRight, Lock, RefreshCw, ShieldCheck } from 'lucide-react';

export default function ForgotPasswordModal({ onClose, onSuccess }) {
  const [step, setStep] = useState(1); // 1: Request OTP, 2: Enter OTP & New Password
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [targetUsername, setTargetUsername] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Handle Step 1: Request OTP
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const res = await fetch('/api/forgot-password/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail })
      });
      const data = await res.json();

      if (data.success) {
        setTargetUsername(data.username);
        setMaskedEmail(data.maskedEmail);
        setStep(2);
        setSuccessMsg(`Security OTP successfully sent to ${data.maskedEmail}!`);
      } else {
        setErrorMsg(data.error || 'Failed to request OTP');
      }
    } catch (err) {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Step 2: Reset Password with OTP
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (newPassword.trim() !== confirmPassword.trim()) {
      setErrorMsg('Passwords do not match!');
      return;
    }

    if (newPassword.trim().length < 12) {
      setErrorMsg('Security Policy: New password must be at least 12 characters long.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/forgot-password/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: targetUsername,
          otpCode: otpCode.trim(),
          newPassword: newPassword.trim()
        })
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMsg('Password updated successfully!');
        setTimeout(() => {
          onSuccess(targetUsername, newPassword.trim());
          onClose();
        }, 1500);
      } else {
        setErrorMsg(data.error || 'Failed to reset password');
      }
    } catch (err) {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <h3 className="modal-title">
            <ShieldCheck size={18} color="#38bdf8" /> Account Password Reset
          </h3>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {errorMsg && (
          <div style={{
            backgroundColor: 'rgba(244, 63, 94, 0.12)',
            color: '#fda4af',
            padding: '0.75rem 0.95rem',
            borderRadius: '8px',
            fontSize: '0.825rem',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <ShieldAlert size={16} /> {errorMsg}
          </div>
        )}

        {successMsg && (
          <div style={{
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            color: '#6ee7b7',
            padding: '0.75rem 0.95rem',
            borderRadius: '8px',
            fontSize: '0.825rem',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <CheckCircle2 size={16} /> {successMsg}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleRequestOtp}>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Enter your registered Account Username ID or Email address. A 6-digit security OTP code will be sent to your verified email inbox.
            </p>

            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Mail size={14} color="#38bdf8" /> Username ID or Email
              </label>
              <input
                type="text"
                className="form-input"
                required
                placeholder="e.g. admin or admin@innovationwebworks.in"
                value={usernameOrEmail}
                onChange={e => setUsernameOrEmail(e.target.value)}
                style={{ backgroundColor: '#070913' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Sending OTP...' : 'Send Security OTP'} <ArrowRight size={16} />
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleResetPassword}>
            <div style={{
              backgroundColor: '#070913',
              border: '1px solid var(--border-color)',
              padding: '0.85rem 1rem',
              borderRadius: '8px',
              marginBottom: '1.25rem',
              fontSize: '0.825rem',
              color: '#cbd5e1'
            }}>
              <div>Account: <strong style={{ color: '#ffffff' }}>{targetUsername}</strong></div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '3px' }}>
                🔒 6-Digit OTP sent to your verified email (<strong>{maskedEmail}</strong>). Please check your inbox or spam folder.
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Key size={14} color="#34d399" /> Enter 6-Digit OTP Code
              </label>
              <input
                type="text"
                className="form-input"
                required
                maxLength={6}
                placeholder="123456"
                value={otpCode}
                onChange={e => setOtpCode(e.target.value)}
                style={{ backgroundColor: '#070913', letterSpacing: '4px', fontWeight: '700', textAlign: 'center', fontSize: '1.1rem' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={14} color="#38bdf8" /> New Password
              </label>
              <input
                type="password"
                className="form-input"
                required
                placeholder="Enter new password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                style={{ backgroundColor: '#070913' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={14} color="#38bdf8" /> Confirm New Password
              </label>
              <input
                type="password"
                className="form-input"
                required
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                style={{ backgroundColor: '#070913' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'center' }}>
              <button type="button" className="btn btn-secondary" style={{ padding: '0.45rem 0.75rem', fontSize: '0.78rem' }} onClick={() => setStep(1)}>
                <RefreshCw size={14} /> Resend OTP
              </button>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Resetting...' : 'Verify OTP & Reset'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

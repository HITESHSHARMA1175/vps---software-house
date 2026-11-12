import React, { useState } from 'react';
import { Eye, EyeOff, User, Key, ArrowRight, ShieldAlert, ShieldCheck, Activity, Cpu } from 'lucide-react';
import ForgotPasswordModal from './ForgotPasswordModal';

export default function LoginScreen({ onLoginSuccess, onOpenCustomerPortal, onBackToLanding }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 2FA Challenge State
  const [step, setStep] = useState('CREDENTIALS'); // 'CREDENTIALS' | '2FA'
  const [preAuthToken, setPreAuthToken] = useState('');
  const [pendingUser, setPendingUser] = useState(null);
  const [totpCode, setTotpCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    const inputUser = username.trim().toLowerCase();
    const inputPass = password.trim();

    let data = null;
    let resOk = false;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: inputUser,
          password: inputPass,
          tabId: `tab-${Date.now()}`
        })
      });

      resOk = res.ok;
      data = await res.json();
    } catch (err) {
      console.error("Backend auth fetch error:", err);
      setErrorMsg('Unable to connect to login server. Please verify your internet connection.');
      setIsLoading(false);
      return;
    }

    setIsLoading(false);

    // If account requires Google Authenticator 2FA
    if (resOk && data?.require2FA) {
      setStep('2FA');
      setPreAuthToken(data.preAuthToken);
      setPendingUser(data.user);
      setTotpCode('');
      setErrorMsg(null);
      return;
    }

    if (resOk && data?.success && data?.employee) {
      try {
        onLoginSuccess(data.employee);
      } catch (callbackErr) {
        console.error("Login success callback error:", callbackErr);
      }
      return;
    }

    if (data?.error?.message) {
      setErrorMsg(data.error.message);
    } else {
      setErrorMsg('Invalid Username ID or Password. Please check credentials and try again.');
    }
  };

  const handleVerify2FA = async (e) => {
    e.preventDefault();
    if (!totpCode || totpCode.trim().length === 0) {
      setErrorMsg(useBackupCode ? 'Please enter your emergency backup code.' : 'Please enter the 6-digit code from Google Authenticator.');
      return;
    }

    setErrorMsg(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/2fa/validate-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          preAuthToken,
          code: totpCode.trim()
        })
      });

      const data = await res.json();
      setIsLoading(false);

      if (res.ok && data?.success && data?.employee) {
        onLoginSuccess(data.employee);
        return;
      }

      setErrorMsg(data?.message || 'Invalid code. Please try again.');
    } catch (err) {
      setIsLoading(false);
      setErrorMsg('Failed to connect to authentication server.');
    }
  };

  const handleBackToLogin = () => {
    setStep('CREDENTIALS');
    setPreAuthToken('');
    setPendingUser(null);
    setTotpCode('');
    setErrorMsg(null);
  };

  const handleForgotPasswordSuccess = (resetUsername, newPass) => {
    setUsername(resetUsername);
    setPassword(newPass);
    setErrorMsg(null);
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#070913',
      backgroundImage: `
        radial-gradient(ellipse at 50% 50%, rgba(56, 189, 248, 0.08) 0%, rgba(99, 102, 241, 0.04) 45%, transparent 75%),
        radial-gradient(ellipse at 15% 10%, rgba(249, 115, 22, 0.05) 0%, transparent 50%)
      `,
      padding: '2rem 1.5rem'
    }}>
      {/* 2026 SaaS Dual-Panel Luxury Glass Card */}
      <div style={{
        maxWidth: '920px',
        width: '100%',
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        backgroundColor: 'rgba(17, 24, 39, 0.85)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '24px',
        overflow: 'hidden',
        boxShadow: '0 30px 80px -20px rgba(0, 0, 0, 0.85), 0 0 40px rgba(56, 189, 248, 0.06)'
      }}>
        {/* Left Side: Datacenter Visual Showcase (5 Cols) */}
        <div style={{
          gridColumn: 'span 5',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '3rem 2.5rem',
          minHeight: '480px',
          overflow: 'hidden',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)'
        }} className="login-card-left">
          {/* Datacenter Hero Background Image */}
          <img
            src="/images/vps_datacenter_hero.jpg"
            alt="Innovation Web Works Datacenter"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.32,
              filter: 'contrast(1.15) brightness(0.85)'
            }}
          />

          {/* Dark Overlay Mask */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'linear-gradient(180deg, rgba(7, 9, 19, 0.88) 0%, rgba(15, 23, 42, 0.96) 100%)',
            zIndex: 1
          }} />

          {/* Content Top */}
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{
              display: 'inline-flex',
              padding: '6px',
              borderRadius: '16px',
              background: 'transparent',
              marginBottom: '1.25rem'
            }}>
              <img
                src="/logo.png"
                alt="Innovation Web Works Logo"
                style={{ height: '70px', objectFit: 'contain', filter: 'drop-shadow(0 6px 18px rgba(56, 189, 248, 0.35))' }}
              />
            </div>

            <h3 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#ffffff', letterSpacing: '-0.025em', lineHeight: 1.25 }}>
              Innovation Web Works
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: '700', marginTop: '4px' }}>
              VPS Infrastructure & Client Operations
            </p>
          </div>

          {/* Content Bottom Feature Pills */}
          <div style={{ position: 'relative', zIndex: 2, marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '0.55rem 0.85rem',
              borderRadius: '10px',
              fontSize: '0.78rem',
              color: '#cbd5e1'
            }}>
              <Activity size={15} color="#34d399" />
              <span>99.99% High-Availability SLA</span>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '0.55rem 0.85rem',
              borderRadius: '10px',
              fontSize: '0.78rem',
              color: '#cbd5e1'
            }}>
              <ShieldCheck size={15} color="#38bdf8" />
              <span>Enterprise 256-Bit TLS Security</span>
            </div>
          </div>
        </div>

        {/* Right Side: Clean Form (7 Cols) */}
        <div style={{
          gridColumn: 'span 7',
          padding: '3rem 2.75rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          backgroundColor: '#0b0f19'
        }} className="login-card-right">
          {step === '2FA' ? (
            <div>
              <div style={{ marginBottom: '1.75rem' }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  color: '#38bdf8',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  marginBottom: '10px'
                }}>
                  <ShieldCheck size={14} /> Two-Factor Verification
                </div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#ffffff', letterSpacing: '-0.03em' }}>
                  Authenticator Security
                </h2>
                <p style={{ fontSize: '0.825rem', color: '#94a3b8', marginTop: '4px', lineHeight: 1.4 }}>
                  Enter the {useBackupCode ? '8-character emergency backup code' : '6-digit code generated by your Google Authenticator app'} for <strong style={{ color: '#ffffff' }}>{pendingUser?.username || username}</strong>:
                </p>
              </div>

              <form onSubmit={handleVerify2FA}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.825rem', color: '#94a3b8', fontWeight: '600', margin: 0 }}>
                        <Key size={14} color="#38bdf8" /> {useBackupCode ? 'Emergency Recovery Code' : '6-Digit TOTP Code'}
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setUseBackupCode(!useBackupCode);
                          setTotpCode('');
                          setErrorMsg(null);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#38bdf8',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          padding: 0,
                          fontWeight: '600'
                        }}
                      >
                        {useBackupCode ? 'Use 6-Digit App Code' : 'Lost phone? Use Backup Code'}
                      </button>
                    </div>

                    <input
                      type="text"
                      className="form-input"
                      required
                      autoFocus
                      placeholder={useBackupCode ? 'e.g. A1B2-C3D4' : '000000'}
                      maxLength={useBackupCode ? 12 : 6}
                      value={totpCode}
                      onChange={e => {
                        const val = useBackupCode ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, '');
                        setTotpCode(val);
                      }}
                      style={{
                        backgroundColor: '#111827',
                        borderColor: 'rgba(56, 189, 248, 0.4)',
                        color: '#ffffff',
                        padding: '0.85rem 1rem',
                        fontSize: useBackupCode ? '1.1rem' : '1.5rem',
                        fontWeight: '800',
                        letterSpacing: useBackupCode ? '0.1em' : '0.25em',
                        textAlign: 'center',
                        borderRadius: '10px',
                        boxShadow: '0 0 20px rgba(56, 189, 248, 0.15)'
                      }}
                    />
                  </div>

                  {errorMsg && (
                    <div style={{
                      backgroundColor: 'rgba(244, 63, 94, 0.12)',
                      color: '#fda4af',
                      padding: '0.8rem 1rem',
                      borderRadius: '10px',
                      fontSize: '0.825rem',
                      border: '1px solid rgba(244, 63, 94, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <ShieldAlert size={16} /> {errorMsg}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading || totpCode.trim().length < (useBackupCode ? 8 : 6)}
                    className="btn btn-primary"
                    style={{
                      width: '100%',
                      justifyContent: 'center',
                      padding: '0.85rem',
                      fontSize: '0.95rem',
                      fontWeight: '700',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      boxShadow: '0 6px 18px rgba(37, 99, 235, 0.4)'
                    }}
                  >
                    {isLoading ? 'Verifying Code...' : 'Verify & Enter Console ➔'}
                  </button>

                  <button
                    type="button"
                    onClick={handleBackToLogin}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      textAlign: 'center',
                      padding: '6px',
                      marginTop: '4px'
                    }}
                  >
                    ← Back to Password Login
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.65rem', fontWeight: '800', color: '#ffffff', letterSpacing: '-0.03em' }}>
                  Welcome Back
                </h2>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '5px' }}>
                  Sign in with your account credentials to access your console.
                </p>
              </div>

              <form onSubmit={handleLogin}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.825rem', color: '#94a3b8', fontWeight: '600' }}>
                      <User size={14} color="#38bdf8" /> Username ID
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      placeholder="Enter your Username ID"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      style={{
                        backgroundColor: '#111827',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        color: '#ffffff',
                        padding: '0.75rem 1rem',
                        fontSize: '0.9rem',
                        borderRadius: '10px',
                        transition: 'all 0.2s ease'
                      }}
                    />
                  </div>

                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.825rem', color: '#94a3b8', fontWeight: '600' }}>
                        <Key size={14} color="#38bdf8" /> Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowForgotModal(true)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#38bdf8',
                          fontSize: '0.78rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          padding: 0,
                          transition: 'color 0.15s ease'
                        }}
                      >
                        Forgot Password?
                      </button>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className="form-input"
                        required
                        placeholder="Enter your Password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        style={{
                          backgroundColor: '#111827',
                          borderColor: 'rgba(255, 255, 255, 0.1)',
                          color: '#ffffff',
                          padding: '0.75rem 2.75rem 0.75rem 1rem',
                          fontSize: '0.9rem',
                          borderRadius: '10px',
                          transition: 'all 0.2s ease'
                        }}
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword(v => !v)}
                        onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px #38bdf8'; }}
                        onBlur={e => { e.currentTarget.style.boxShadow = 'none'; }}
                        style={{
                          position: 'absolute',
                          right: '0.5rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '6px',
                          background: 'none',
                          border: 'none',
                          borderRadius: '6px',
                          color: '#64748b',
                          cursor: 'pointer'
                        }}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {errorMsg && (
                    <div style={{
                      backgroundColor: 'rgba(244, 63, 94, 0.12)',
                      color: '#fda4af',
                      padding: '0.8rem 1rem',
                      borderRadius: '10px',
                      fontSize: '0.825rem',
                      border: '1px solid rgba(244, 63, 94, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <ShieldAlert size={16} /> {errorMsg}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{
                      width: '100%',
                      justifyContent: 'center',
                      padding: '0.85rem',
                      marginTop: '0.5rem',
                      fontSize: '0.95rem',
                      fontWeight: '700',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      boxShadow: '0 6px 18px rgba(37, 99, 235, 0.4)'
                    }}
                  >
                    Sign In to Console <ArrowRight size={16} />
                  </button>

                  {/* Customer Portal Link */}
                  {onOpenCustomerPortal && (
                    <button
                      type="button"
                      onClick={onOpenCustomerPortal}
                      style={{
                        width: '100%',
                        justifyContent: 'center',
                        padding: '0.7rem',
                        marginTop: '0.75rem',
                        fontSize: '0.82rem',
                        fontWeight: '700',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(56, 189, 248, 0.1)',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        color: '#38bdf8',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      🎙️ Customer Helpdesk & Voice Ticket Portal ➔
                    </button>
                  )}

                  {/* Back to Product Overview */}
                  {onBackToLanding && (
                    <button
                      type="button"
                      onClick={onBackToLanding}
                      style={{
                        width: '100%',
                        justifyContent: 'center',
                        padding: '0.65rem',
                        marginTop: '0.5rem',
                        fontSize: '0.8rem',
                        fontWeight: '500',
                        borderRadius: '8px',
                        backgroundColor: 'transparent',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      ← Back to Product Overview
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* Footer Branding */}
          <div style={{
            marginTop: '2rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            fontSize: '0.75rem',
            color: '#64748b',
            textAlign: 'center'
          }}>
            <div style={{ color: '#38bdf8', fontWeight: '700', marginBottom: '2px' }}>
              Designed & Developed by Innovation Web Works
            </div>
            <div style={{ fontSize: '0.7rem', color: '#475569' }}>
              All Rights Reserved • Official Enterprise Platform
            </div>
          </div>
        </div>
      </div>

      {/* Forgot Password OTP Modal */}
      {showForgotModal && (
        <ForgotPasswordModal
          onClose={() => setShowForgotModal(false)}
          onSuccess={handleForgotPasswordSuccess}
        />
      )}
    </div>
  );
}

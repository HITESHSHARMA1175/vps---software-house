import React, { useState } from 'react';
import { useAuth, API_BASE } from '../contexts/AuthContext';
import { revealClientPassword, copyRevealedPassword, MASKED_PASSWORD_TEXT } from '../utils/revealPassword';
import {
  X,
  User,
  Building,
  Mail,
  Calendar,
  Key,
  Shield,
  Zap,
  Server,
  HardDrive,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  MessageCircle
} from 'lucide-react';
import { getDaysRemaining } from './UserTable';

export default function UserProfileModal({
  user,
  servers = [],
  onClose,
  onDirectRemoteConnect
}) {
  const { currentUser, authFetch } = useAuth();
  const [copied, setCopied] = useState(false);

  if (!user) return null;

  const server = servers.find(s => s.id === user.serverId);
  const daysRemaining = getDaysRemaining(user.expiryDate);
  const isExpired = daysRemaining < 0;
  const isDedicated = user.clientType === 'Dedicated';

  const isSuperAdmin = !!currentUser && currentUser.role === 'SUPER_ADMIN';

  // SUPER_ADMIN only: fetch on click, copy, and discard (never kept in state)
  const handleRevealCopy = async () => {
    try {
      await copyRevealedPassword(() => revealClientPassword(authFetch, API_BASE, user.id));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      window.alert(`Reveal failed: ${err.message}`);
    }
  };

  const waMessage = encodeURIComponent(
    `Hello ${user.company},\n\nYour VPS Cloud Subscription (${server ? server.name : 'VPS'}) expires on ${user.expiryDate} (${daysRemaining} days remaining).\n\nThank you,\nInnovation Web Works Operations`
  );

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '640px', padding: '0', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <User size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#ffffff', margin: 0, letterSpacing: '-0.01em' }}>
                {user.company}
              </h3>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
                Account ID: <span style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{user.id}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body Content */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Identity & Account Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '0.85rem',
            backgroundColor: 'rgba(11, 15, 25, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '12px',
            padding: '1rem'
          }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Username ID</div>
              <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#ffffff', marginTop: '2px' }}>{user.username}</div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Contact Email</div>
              <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '2px' }}>{user.customerEmail || 'support@innovationwebworks.in'}</div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>User Password</div>
              <div style={{ fontSize: '0.85rem', color: '#34d399', fontFamily: 'monospace', fontWeight: '700', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {MASKED_PASSWORD_TEXT}
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={handleRevealCopy}
                    title="Reveal and copy password (audited)"
                    style={{ background: 'none', border: '1px solid rgba(52, 211, 153, 0.4)', color: '#34d399', borderRadius: '4px', fontSize: '0.7rem', padding: '1px 6px', cursor: 'pointer' }}
                  >
                    {copied ? 'Copied' : 'Reveal & Copy'}
                  </button>
                )}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Sales Representative</div>
              <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '2px' }}>{user.salesAgent || 'Direct Sales'}</div>
            </div>
          </div>

          {/* Dedicated Assigned VPS Section */}
          <div style={{
            backgroundColor: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '14px',
            padding: '1.2rem',
            position: 'relative'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Server size={17} color="#38bdf8" />
                <strong style={{ fontSize: '0.95rem', color: '#ffffff' }}>Assigned VPS Infrastructure Node</strong>
              </div>
              <span style={{
                backgroundColor: isDedicated ? 'rgba(236, 72, 153, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                color: isDedicated ? '#f472b6' : '#38bdf8',
                border: isDedicated ? '1px solid rgba(236, 72, 153, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)',
                padding: '2px 8px',
                borderRadius: '999px',
                fontSize: '0.72rem',
                fontWeight: '700'
              }}>
                {isDedicated ? '🚀 Dedicated Server' : '🌐 Shared Multi-Tenant VPS'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', fontSize: '0.82rem' }}>
              <div style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)', padding: '0.65rem 0.75rem', borderRadius: '8px' }}>
                <div style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: '700' }}>NODE NAME</div>
                <div style={{ color: '#ffffff', fontWeight: '700', marginTop: '2px' }}>{server ? server.name : 'VPS Node'}</div>
              </div>

              <div style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)', padding: '0.65rem 0.75rem', borderRadius: '8px' }}>
                <div style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: '700' }}>IP ADDRESS & PORT</div>
                <div style={{ color: '#38bdf8', fontFamily: 'monospace', fontWeight: '600', marginTop: '2px' }}>
                  {server ? `${server.ipPort}:443` : '185.196.21.35:443'}
                </div>
              </div>

              <div style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)', padding: '0.65rem 0.75rem', borderRadius: '8px' }}>
                <div style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: '700' }}>ALLOCATED DRIVE</div>
                <div style={{ color: '#34d399', fontWeight: '800', marginTop: '2px' }}>{user.drive || 'Drive D'}</div>
              </div>
            </div>

            {server && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: '#94a3b8' }}>
                Hardware Specs: <span style={{ color: '#cbd5e1' }}>{server.specs}</span>
              </div>
            )}
          </div>

          {/* Subscription Timeline */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'rgba(11, 15, 25, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '12px',
            padding: '0.9rem 1.15rem'
          }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700' }}>REGISTRATION DATE</div>
              <div style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: '600', marginTop: '2px' }}>{user.billDate || '2026-08-15'}</div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '700' }}>SUBSCRIPTION EXPIRY</div>
              <div style={{ fontSize: '0.9rem', color: isExpired ? '#fda4af' : '#ffffff', fontWeight: '800', marginTop: '2px' }}>
                {user.expiryDate} ({isExpired ? `Expired ${Math.abs(daysRemaining)}d ago` : `${daysRemaining} days remaining`})
              </div>
            </div>
          </div>

          {/* Launch Buttons Footer */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <a
              href={`https://wa.me/?text=${waMessage}`}
              target="_blank"
              rel="noreferrer"
              style={{
                backgroundColor: 'rgba(37, 211, 102, 0.15)',
                border: '1px solid rgba(37, 211, 102, 0.4)',
                color: '#25D366',
                padding: '0.55rem 0.95rem',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: '700',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <MessageCircle size={15} /> WhatsApp Reminder
            </a>

            <button
              onClick={() => {
                onClose();
                onDirectRemoteConnect(user, 'USER');
              }}
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none',
                color: '#ffffff',
                padding: '0.55rem 1rem',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)'
              }}
            >
              <Zap size={15} fill="#ffffff" /> Launch User HTML5 Console
            </button>

            <button
              onClick={() => {
                onClose();
                onDirectRemoteConnect(user, 'SUPERCLIENT');
              }}
              style={{
                background: 'linear-gradient(135deg, #d97706, #b45309)',
                border: 'none',
                color: '#ffffff',
                padding: '0.55rem 1rem',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(217, 119, 6, 0.35)'
              }}
            >
              <Shield size={15} fill="#ffffff" /> Launch Superclient Console
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

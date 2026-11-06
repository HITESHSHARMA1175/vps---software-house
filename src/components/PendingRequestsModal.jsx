import React from 'react';
import { X, CheckCircle2, UserCheck, Inbox, Clock, Server, HardDrive, Shield, Mail, Key } from 'lucide-react';

export default function PendingRequestsModal({
  isOpen,
  onClose,
  requests,
  onApproveRequest,
  onRejectRequest
}) {
  if (!isOpen) return null;

  const pendingList = requests.filter(r => r.status === 'PENDING');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '850px' }}>
        <div className="modal-header">
          <div className="modal-title" style={{ color: '#34d399' }}>
            <Inbox size={22} />
            Pending VPS Onboarding Requests Assigned by Sales Team ({pendingList.length})
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        {pendingList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
            <CheckCircle2 size={40} color="#34d399" style={{ margin: '0 auto 0.75rem auto' }} />
            <h3 style={{ fontSize: '1.1rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>No Pending Onboarding Requests</h3>
            <p style={{ fontSize: '0.85rem' }}>All requests assigned by the sales team have been approved & activated!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {pendingList.map(req => (
              <div
                key={req.id}
                className="glass-card"
                style={{
                  padding: '1.25rem',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--primary-border)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.85rem', gap: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span className="badge badge-active" style={{ fontSize: '0.72rem' }}>
                        <Clock size={11} /> Request #{req.id.slice(-6)}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Submitted {req.createdAt}</span>
                    </div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)' }}>
                      {req.company}
                    </h3>
                    <div style={{ fontSize: '0.82rem', color: '#818cf8', fontWeight: '600', marginTop: '2px' }}>
                      Submitted by Salesperson: <strong>{req.salesperson}</strong> → Assigned to: <strong>{req.assignedEmployee}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '0.4rem 0.75rem' }}
                      onClick={() => onRejectRequest(req.id)}
                    >
                      Reject
                    </button>
                    <button
                      className="btn btn-primary"
                      style={{ backgroundColor: '#10b981', borderColor: 'none', fontSize: '0.82rem', padding: '0.45rem 1rem' }}
                      onClick={() => onApproveRequest(req)}
                    >
                      <CheckCircle2 size={15} /> Approve & Create Account
                    </button>
                  </div>
                </div>

                {/* Grid details */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '0.75rem',
                  backgroundColor: 'var(--bg-dark)',
                  padding: '0.85rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.82rem'
                }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Target VPS Node</span>
                    <strong style={{ color: '#ffffff' }}>{req.serverName}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Assigned Drive</span>
                    <strong style={{ color: '#34d399' }}>🟢 {req.drive}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Username ID</span>
                    <strong style={{ color: '#f8fafc' }}>{req.username}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Set Password</span>
                    <strong style={{ color: '#fcd34d' }}>{req.password}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem' }}>Subscription Expiry</span>
                    <strong style={{ color: '#a5b4fc' }}>{req.expiryDate}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import React from 'react';
import { X, RefreshCw, CheckCircle2, XCircle, Clock, ShieldCheck, User } from 'lucide-react';

export default function PendingRenewalsModal({
  isOpen,
  onClose,
  renewalRequests,
  onApproveRenewal,
  onRejectRenewal
}) {
  if (!isOpen) return null;

  const pendingList = renewalRequests.filter(r => r.status === 'PENDING');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '820px' }}>
        <div className="modal-header">
          <div className="modal-title" style={{ color: '#ea580c' }}>
            <RefreshCw size={22} />
            HOD Renewal Approval Queue ({pendingList.length} Pending)
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        {pendingList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
            <CheckCircle2 size={40} color="#10b981" style={{ margin: '0 auto 0.75rem auto', opacity: 0.8 }} />
            <div style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-main)' }}>No Pending Renewal Requests</div>
            <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>All client renewal requests submitted by staff members have been processed.</div>
          </div>
        ) : (
          <div className="table-container" style={{ maxHeight: '420px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client & Company</th>
                  <th>Requested By</th>
                  <th>Current Expiry</th>
                  <th>New Expiry (+1 Yr)</th>
                  <th style={{ textAlign: 'right' }}>HOD Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingList.map(req => (
                  <tr key={req.id}>
                    <td>
                      <div style={{ fontWeight: '700', color: '#f8fafc' }}>{req.company}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{req.username} ({req.drive})</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{req.requestedBy}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{req.requestedAt}</div>
                    </td>
                    <td className="font-mono" style={{ color: '#fda4af', fontWeight: '600' }}>{req.currentExpiry}</td>
                    <td className="font-mono" style={{ color: '#34d399', fontWeight: '800' }}>{req.requestedNewExpiry}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem', backgroundColor: '#10b981', borderColor: '#34d399' }}
                          onClick={() => onApproveRenewal(req)}
                        >
                          <CheckCircle2 size={13} /> Accept & Renew
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                          onClick={() => onRejectRenewal(req.id)}
                        >
                          <XCircle size={13} /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

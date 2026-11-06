import React from 'react';
import { X, Printer, CheckCircle2, ShieldCheck } from 'lucide-react';

export default function ReceiptModal({ isOpen, onClose, user, server }) {
  if (!isOpen || !user) return null;

  const handlePrint = () => {
    window.print();
  };

  const receiptNo = `IW-CERT-${Date.now().toString().slice(-6)}`;
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px', padding: '2rem' }}>
        <div className="modal-header" style={{ border: 'none', marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary" onClick={handlePrint} style={{ backgroundColor: '#ea580c', borderColor: '#f97316' }}>
              <Printer size={16} /> Print / Save PDF Certificate
            </button>
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Printable Official Certificate */}
        <div
          id="printable-receipt"
          style={{
            background: '#ffffff',
            color: '#0f172a',
            borderRadius: '12px',
            padding: '2.5rem',
            border: '2px solid #ea580c',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
            fontFamily: 'Arial, sans-serif'
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #e2e8f0', paddingBottom: '1.25rem', marginBottom: '1.5rem' }}>
            <div>
              <img src="/logo.png" alt="Innovation Web Works Logo" style={{ height: '70px', marginBottom: '4px', objectFit: 'contain' }} />
              <div style={{ fontSize: '0.85rem', color: '#ea580c', fontWeight: '800', letterSpacing: '0.02em' }}>
                Innovation Web Works
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#ea580c', letterSpacing: '0.05em' }}>
                SUBSCRIPTION CERTIFICATE
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569', marginTop: '4px' }}>
                Ref No: <span style={{ fontFamily: 'monospace' }}>{receiptNo}</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                Issued Date: {todayStr}
              </div>
            </div>
          </div>

          {/* Client & Server Info Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem', background: '#fff7ed', padding: '1.25rem', borderRadius: '8px', border: '1px solid #ffedd5' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#9a3412', textTransform: 'uppercase' }}>Client Subscription Info</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0f172a', marginTop: '2px' }}>{user.company}</div>
              <div style={{ fontSize: '0.85rem', color: '#334155' }}>Username: <strong>{user.username}</strong></div>
              {user.customerEmail && <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Email: {user.customerEmail}</div>}
              {user.customerPhone && <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Phone: {user.customerPhone}</div>}
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#9a3412', textTransform: 'uppercase' }}>VPS Resource Allocation</div>
              <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#ea580c', marginTop: '2px' }}>{server ? server.name : 'VPS Server Node'}</div>
              <div style={{ fontSize: '0.85rem', color: '#334155' }}>Allocation Type: <strong>{user.clientType || 'Shared VPS'}</strong></div>
              <div style={{ fontSize: '0.85rem', color: '#334155' }}>Assigned Drive: <strong>{user.drive}</strong></div>
              <div style={{ fontSize: '0.85rem', color: '#334155' }}>Sales Representative: <strong>{user.salesAgent}</strong></div>
            </div>
          </div>

          {/* Subscription Validity Details */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem' }}>
            <thead>
              <tr style={{ background: '#ea580c', color: '#ffffff' }}>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', borderRadius: '4px 0 0 4px', fontSize: '0.85rem' }}>Resource Description</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontSize: '0.85rem' }}>Registration Date</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', borderRadius: '0 4px 4px 0', fontSize: '0.85rem' }}>Valid Until Expiry</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '1rem' }}>
                  <strong>Cloud VPS Remote Desktop Subscription</strong>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Includes multi-user access & automated cloud infrastructure</div>
                </td>
                <td style={{ padding: '1rem', textAlign: 'center', fontSize: '0.85rem', fontWeight: '600' }}>{user.billDate || 'N/A'}</td>
                <td style={{ padding: '1rem', textAlign: 'right', fontSize: '1rem', fontWeight: '700', color: '#16a34a' }}>{user.expiryDate}</td>
              </tr>
            </tbody>
          </table>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '1rem', borderTop: '2px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.8rem', color: '#64748b', maxWidth: '380px' }}>
              <CheckCircle2 size={16} color="#16a34a" style={{ display: 'inline', marginRight: '4px' }} />
              Active Subscription. Designed & Developed by Innovation Web Works.
            </div>

            <div style={{ textAlign: 'center', minWidth: '180px' }}>
              <div style={{ borderBottom: '1px solid #94a3b8', paddingBottom: '0.5rem', marginBottom: '4px', fontWeight: '700', fontStyle: 'italic', color: '#ea580c' }}>
                Innovation Web Works
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>
                Authorized Signature
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { X, Upload, Download, Check, AlertCircle, RefreshCw, FileSpreadsheet } from 'lucide-react';
import { getDaysRemaining } from './UserTable';
import { exportExpiringUsersCSV } from '../utils/exportUtils';

export default function ImportStatusModal({ isOpen, onClose, users, onBulkApplyUpdates }) {
  const [parsedUpdates, setParsedUpdates] = useState([]);
  const [importSummary, setImportSummary] = useState(null);

  if (!isOpen) return null;

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target.result;
        const lines = text.split('\n');

        const updates = [];
        let headerFound = false;

        lines.forEach(line => {
          const cleanLine = line.trim();
          if (!cleanLine || cleanLine.startsWith('SOFTWARE HOUSE') || cleanLine.startsWith('INSTRUCTIONS')) return;

          // Header row detection
          if (cleanLine.includes('Client ID') && cleanLine.includes('Update Status')) {
            headerFound = true;
            return;
          }

          if (headerFound) {
            // Parse CSV fields handling quotes
            const cols = cleanLine.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || cleanLine.split(',');
            const cleanCols = cols.map(c => c.replace(/^"|"$/g, '').trim());

            if (cleanCols.length >= 9) {
              const id = cleanCols[0];
              const username = cleanCols[1];
              const company = cleanCols[2];
              const currentStatus = cleanCols[7];
              const newStatus = cleanCols[8].toUpperCase(); // RENEWED, ACTIVE, EXPIRED

              const existingUser = users.find(u => u.id === id);
              if (existingUser) {
                updates.push({
                  user: existingUser,
                  currentStatus,
                  newStatus,
                  actionNeeded: newStatus === 'RENEW_+1_YEAR' || newStatus === 'ACTIVE' ? 'RENEW_+1_YEAR' : (newStatus === 'EXPIRED' ? 'MARK_EXPIRED' : 'NONE')
                });
              }
            }
          }
        });

        setParsedUpdates(updates);
        setImportSummary({
          total: updates.length,
          renewals: updates.filter(u => u.actionNeeded === 'RENEW_+1_YEAR').length,
          expired: updates.filter(u => u.actionNeeded === 'MARK_EXPIRED').length
        });
      } catch (err) {
        alert("Failed to parse CSV file! Please ensure you upload a valid CSV report.");
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteImport = () => {
    if (parsedUpdates.length === 0) return;
    onBulkApplyUpdates(parsedUpdates);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px' }}>
        <div className="modal-header">
          <div className="modal-title" style={{ color: '#38bdf8' }}>
            <FileSpreadsheet size={22} />
            Bulk Expiry Status Import & Renewal Processor
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div style={{ background: 'rgba(9, 14, 26, 0.8)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '1.25rem' }}>
          <strong style={{ fontSize: '0.9rem', color: '#f8fafc', display: 'block', marginBottom: '6px' }}>
            📥 Upload Edited CSV Report to Auto-Update Subscriptions
          </strong>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            Select the edited CSV file where you updated the <strong>'Update Status'</strong> column to <strong>RENEWED</strong> or <strong>ACTIVE</strong>. Subscriptions marked as RENEWED will automatically extend by +1 Year in the database!
          </p>

          <input
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}
          />
        </div>

        {/* Parsed Updates Table Preview */}
        {parsedUpdates.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <strong style={{ fontSize: '0.9rem', color: '#34d399' }}>
                Found {parsedUpdates.length} Record Updates in CSV ({importSummary.renewals} Subscriptions to Renew +1 Year)
              </strong>
            </div>

            <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem' }}>
              <table className="data-table" style={{ fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th>Company Name</th>
                    <th>Username</th>
                    <th>Current Expiry</th>
                    <th>CSV Status</th>
                    <th>Action To Perform</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedUpdates.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.user.company}</td>
                      <td>{item.user.username}</td>
                      <td>{item.user.expiryDate}</td>
                      <td>
                        <span className="badge badge-drive">{item.newStatus}</span>
                      </td>
                      <td>
                        {item.actionNeeded === 'RENEW_+1_YEAR' && (
                          <span style={{ color: '#34d399', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <RefreshCw size={12} /> Auto-Renew +1 Year (Extend Expiry)
                          </span>
                        )}
                        {item.actionNeeded === 'MARK_EXPIRED' && (
                          <span style={{ color: '#f87171', fontWeight: '700' }}>Mark as Expired</span>
                        )}
                        {item.actionNeeded === 'NONE' && (
                          <span style={{ color: 'var(--text-muted)' }}>No Change</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleExecuteImport}>
              <Check size={16} /> Apply All {importSummary.renewals} Renewals & Update Database
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

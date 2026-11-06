import React, { useState } from 'react';
import { X, History, UserCheck, ShieldCheck, Search, Filter, Download, FileSpreadsheet } from 'lucide-react';

export default function AuditLogModal({ isOpen, onClose, auditLogs = [] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');

  if (!isOpen) return null;

  const filteredLogs = auditLogs.filter(log => {
    if (actionFilter !== 'ALL' && log.action !== actionFilter) {
      return false;
    }

    const searchLower = searchTerm.toLowerCase();
    return (
      (log.operator && log.operator.toLowerCase().includes(searchLower)) ||
      (log.action && log.action.toLowerCase().includes(searchLower)) ||
      (log.target && log.target.toLowerCase().includes(searchLower)) ||
      (log.details && log.details.toLowerCase().includes(searchLower))
    );
  });

  const exportAuditLogsCSV = () => {
    if (filteredLogs.length === 0) {
      alert("No audit logs to export!");
      return;
    }

    const headers = ['Timestamp', 'Operator', 'Role', 'Action Type', 'Target Object', 'Details'];
    const rows = filteredLogs.map(l => [
      `"${l.timestamp || ''}"`,
      `"${l.operator || ''}"`,
      `"${l.role || ''}"`,
      `"${l.action || ''}"`,
      `"${l.target || ''}"`,
      `"${(l.details || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Audit_Logs_Trail_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '920px' }}>
        <div className="modal-header">
          <div className="modal-title" style={{ color: '#38bdf8' }}>
            <History size={22} />
            Master System Audit Trail & History Logs ({filteredLogs.length} Records)
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Permanent, tamper-proof audit trail logging every client addition, drive replacement, subscription renewal, deletion, and remote login performed across the portal.
        </p>

        {/* Toolbar Filter & Export */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <div className="search-box" style={{ flex: 1, minWidth: '240px' }}>
            <Search size={18} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search audit trail by operator, client company, action..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={15} color="var(--text-muted)" />
            <select
              className="select-input"
              style={{ fontWeight: '700', fontSize: '0.825rem' }}
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
            >
              <option value="ALL">🌐 All Actions ({auditLogs.length})</option>
              <option value="CLIENT_REMOVED">🗑️ Client Removed / Replaced</option>
              <option value="CLIENT_ADDED">➕ Client Added / Onboarded</option>
              <option value="CLIENT_UPDATED">✏️ Client Updated</option>
              <option value="SUBSCRIPTION_RENEWED">🔄 Subscription Renewed</option>
              <option value="PORTAL_USER_CREATED">👤 Portal Account Created</option>
              <option value="PORTAL_USER_DELETED">❌ Portal Account Deleted</option>
              <option value="RIGHTS_POLICY_UPDATED">⚙️ Rights Policy Changed</option>
              <option value="VPS_WEB_REMOTE_LOGIN">🌐 Web Remote Console Login</option>
            </select>
          </div>

          <button
            className="btn btn-secondary"
            style={{ fontSize: '0.825rem', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.4)' }}
            onClick={exportAuditLogsCSV}
          >
            <FileSpreadsheet size={15} /> Export Audit Trail (CSV)
          </button>
        </div>

        {/* Audit Log Table */}
        <div className="table-container" style={{ maxHeight: '420px', overflowY: 'auto' }}>
          <table className="data-table" style={{ fontSize: '0.8rem' }}>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Operator (Role)</th>
                <th>Action Type</th>
                <th>Target Object</th>
                <th>Change Details (Before &rarr; After)</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                    No audit log records matching current search filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => {
                  const isDelete = log.action === 'CLIENT_REMOVED' || log.action === 'PORTAL_USER_DELETED';
                  const isAdd = log.action === 'CLIENT_ADDED' || log.action === 'PORTAL_USER_CREATED' || log.action === 'SALES_REQUEST_APPROVED';
                  const isRenew = log.action === 'SUBSCRIPTION_RENEWED' || log.action === 'RENEWAL_APPROVED_BY_HOD';

                  return (
                    <tr key={log.id}>
                      <td className="font-mono" style={{ whiteSpace: 'nowrap', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        {log.timestamp}
                      </td>
                      <td>
                        <div style={{ fontWeight: '700', color: '#f8fafc' }}>{log.operator}</div>
                        <span className="badge" style={{
                          fontSize: '0.65rem',
                          background: log.role === 'SUPER_ADMIN' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(192, 132, 252, 0.2)',
                          color: log.role === 'SUPER_ADMIN' ? '#6ee7b7' : '#c084fc'
                        }}>
                          {log.role === 'SUPER_ADMIN' ? '👑 Admin/HOD' : (log.role === 'SALESPERSON' ? '💼 Sales' : '👤 Staff')}
                        </span>
                      </td>
                      <td>
                        <span className="badge" style={{
                          fontWeight: '700',
                          backgroundColor: isDelete ? 'rgba(244, 63, 94, 0.15)' : (isAdd ? 'rgba(16, 185, 129, 0.15)' : (isRenew ? 'rgba(249, 115, 22, 0.15)' : 'rgba(56, 189, 248, 0.15)')),
                          color: isDelete ? '#fda4af' : (isAdd ? '#6ee7b7' : (isRenew ? '#fdba74' : '#7dd3fc')),
                          border: isDelete ? '1px solid rgba(244, 63, 94, 0.3)' : (isAdd ? '1px solid rgba(16, 185, 129, 0.3)' : (isRenew ? '1px solid rgba(249, 115, 22, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)'))
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ fontWeight: '600', color: '#38bdf8' }}>
                        {log.target}
                      </td>
                      <td style={{ color: 'var(--text-main)', fontSize: '0.78rem' }}>
                        {log.details}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import {
  History,
  Search,
  Filter,
  Shield,
  Download,
  CheckCircle2,
  AlertCircle,
  Database
} from 'lucide-react';

export default function ActivityLogsView({ auditLogs = [] }) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  const filteredLogs = auditLogs.filter(log => {
    const q = search.toLowerCase();
    const matchesSearch = (log.operator || '').toLowerCase().includes(q) ||
      (log.action || '').toLowerCase().includes(q) ||
      (log.target || '').toLowerCase().includes(q) ||
      (log.details || '').toLowerCase().includes(q);

    const matchesRole = roleFilter === 'ALL' || log.role === roleFilter;

    return matchesSearch && matchesRole;
  }).reverse();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#ffffff', letterSpacing: '-0.02em', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={20} color="#38bdf8" /> Enterprise Audit Trail & Activity Logs
          </h2>
          <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '3px 0 0 0' }}>
            Immutable administrative logs capturing user onboarding, renewals, rights modifications, and deletions.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={14} color="#64748b" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search audit trail..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '0.45rem 0.8rem 0.45rem 2rem',
                color: '#ffffff',
                fontSize: '0.82rem',
                outline: 'none'
              }}
            />
          </div>

          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '0.45rem 0.75rem',
              color: '#cbd5e1',
              fontSize: '0.82rem',
              outline: 'none'
            }}
          >
            <option value="ALL">All Roles</option>
            <option value="SUPER_ADMIN">👑 Super Admin</option>
            <option value="EMPLOYEE">👤 Staff Employee</option>
            <option value="SALESPERSON">💼 Sales Rep</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ backgroundColor: 'rgba(15, 23, 42, 0.75)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8', textAlign: 'left' }}>
                <th style={{ padding: '0.85rem 1rem', fontWeight: '700' }}>Timestamp</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: '700' }}>Operator & Role</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: '700' }}>Action Code</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: '700' }}>Target Entity</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: '700' }}>Event Details</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: '700', textAlign: 'right' }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '3.5rem', color: '#64748b' }}>
                    No audit records matching criteria.
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ padding: '0.85rem 1rem', fontFamily: 'monospace', color: '#94a3b8', fontSize: '0.78rem' }}>
                      {log.timestamp}
                    </td>

                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ fontWeight: '700', color: '#ffffff' }}>{log.operator}</div>
                      <span style={{ fontSize: '0.68rem', color: log.role === 'SUPER_ADMIN' ? '#34d399' : '#38bdf8' }}>
                        {log.role}
                      </span>
                    </td>

                    <td style={{ padding: '0.85rem 1rem' }}>
                      <span style={{
                        backgroundColor: 'rgba(56, 189, 248, 0.12)',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        color: '#38bdf8',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: '700'
                      }}>
                        {log.action}
                      </span>
                    </td>

                    <td style={{ padding: '0.85rem 1rem', color: '#cbd5e1', fontWeight: '600' }}>
                      {log.target}
                    </td>

                    <td style={{ padding: '0.85rem 1rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                      {log.details}
                    </td>

                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        backgroundColor: 'rgba(16, 185, 129, 0.12)',
                        color: '#34d399',
                        border: '1px solid rgba(16, 185, 129, 0.3)'
                      }}>
                        ● Success
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Shield,
  Key,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  Mail,
  Clock,
  Radio,
  Power,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';

export default function EmployeesView({
  employees = [],
  currentUser,
  sessions = [],
  onAddEmployee,
  onEditEmployee,
  onToggleStatus,
  onResetPassword,
  onDeleteEmployee,
  onViewEmployeeActivity,
  onTerminateEmployeeSession,
  onReset2FA
}) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const isSuperAdmin = currentUser && (currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'ADMIN');

  const filteredEmployees = employees.filter(emp => {
    const q = search.toLowerCase();
    const matchesSearch = (emp.name || '').toLowerCase().includes(q) ||
      (emp.username || '').toLowerCase().includes(q) ||
      (emp.email || '').toLowerCase().includes(q);

    const matchesRole = roleFilter === 'ALL' || emp.role === roleFilter;
    const matchesStatus = statusFilter === 'ALL' || (emp.status || 'ACTIVE') === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

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
            <Users size={20} color="#38bdf8" /> Employee & Staff Management
          </h2>
          <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '3px 0 0 0' }}>
            Manage staff accounts, assign RBAC access roles, inspect active sessions, and configure login status.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={14} color="#64748b" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search employees..."
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

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
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
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">🟢 Active</option>
            <option value="SUSPENDED">🔴 Suspended</option>
          </select>

          {isSuperAdmin && (
            <button
              onClick={onAddEmployee}
              style={{
                background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)',
                border: 'none',
                color: '#ffffff',
                padding: '0.45rem 0.95rem',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)'
              }}
            >
              <UserPlus size={15} /> Create Employee
            </button>
          )}
        </div>
      </div>

      {/* Employees Data Table */}
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
                <th style={{ padding: '0.85rem 1rem', fontWeight: '700' }}>Employee Name & ID</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: '700' }}>Username / Email</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: '700' }}>System Role</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: '700' }}>Account Status</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: '700' }}>2FA Security</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: '700' }}>Last Login</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: '700' }}>Active Session</th>
                <th style={{ padding: '0.85rem 1rem', fontWeight: '700', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '3.5rem', color: '#64748b' }}>
                    No employee accounts found matching the filter criteria.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map(emp => {
                  const empSessions = (sessions || []).filter(s => s.employee_id === emp.id && s.status === 'ACTIVE');
                  const hasActiveSession = empSessions.length > 0;
                  const isSuspended = emp.status === 'SUSPENDED';

                  return (
                    <tr key={emp.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: '700', color: '#ffffff' }}>{emp.name}</div>
                        <div style={{ fontSize: '0.72rem', color: '#38bdf8', fontFamily: 'monospace' }}>ID: {emp.id}</div>
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: '600', color: '#cbd5e1' }}>{emp.username}</div>
                        <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>{emp.email || 'mannk4811@gmail.com'}</div>
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        {emp.role === 'SUPER_ADMIN' ? (
                          <span style={{ backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '2px 8px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '700' }}>
                            👑 Super Admin
                          </span>
                        ) : emp.role === 'SALESPERSON' ? (
                          <span style={{ backgroundColor: 'rgba(249, 115, 22, 0.15)', color: '#fb923c', border: '1px solid rgba(249, 115, 22, 0.3)', padding: '2px 8px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '700' }}>
                            💼 Sales Rep
                          </span>
                        ) : (
                          <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '2px 8px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '700' }}>
                            👤 Staff Employee
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        {isSuspended ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: '700', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'rgba(244, 63, 94, 0.12)', color: '#fda4af', border: '1px solid rgba(244, 63, 94, 0.3)' }}>
                            🔴 Suspended
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: '700', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                            🟢 Active
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        {emp.two_factor_enabled ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', fontWeight: '700', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                            <ShieldCheck size={12} /> Active
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            Disabled
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.78rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                        {emp.lastLogin || 'Never'}
                      </td>

                      <td style={{ padding: '0.85rem 1rem' }}>
                        {hasActiveSession ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', fontWeight: '700', color: '#34d399' }}>
                            <Radio size={12} className="pulse-icon" /> Online ({empSessions.length})
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            Offline
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        {isSuperAdmin && (
                          <div style={{ display: 'inline-flex', gap: '4px' }}>
                            <button
                              onClick={() => onEditEmployee(emp)}
                              style={{
                                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                color: '#38bdf8',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                cursor: 'pointer'
                              }}
                              title="Edit Employee"
                            >
                              <Edit2 size={13} />
                            </button>

                            <button
                              onClick={() => onResetPassword(emp)}
                              style={{
                                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                color: '#fbbf24',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                cursor: 'pointer'
                              }}
                              title="Reset Password"
                            >
                              <Key size={13} />
                            </button>

                            {emp.two_factor_enabled && onReset2FA && (
                              <button
                                onClick={() => {
                                  if (window.confirm(`Emergency Reset 2FA for ${emp.name} (${emp.username})? This will allow them to login with password only.`)) {
                                    onReset2FA(emp.id);
                                  }
                                }}
                                style={{
                                  backgroundColor: 'rgba(245, 158, 11, 0.12)',
                                  border: '1px solid rgba(245, 158, 11, 0.3)',
                                  color: '#fbbf24',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  cursor: 'pointer'
                                }}
                                title="Reset 2FA (Unlock Account)"
                              >
                                <ShieldAlert size={13} />
                              </button>
                            )}

                            <button
                              onClick={() => onToggleStatus(emp.id, isSuspended ? 'ACTIVE' : 'SUSPENDED')}
                              style={{
                                backgroundColor: isSuspended ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                                border: isSuspended ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(244, 63, 94, 0.3)',
                                color: isSuspended ? '#34d399' : '#fda4af',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                cursor: 'pointer'
                              }}
                              title={isSuspended ? 'Activate Account' : 'Suspend Account'}
                            >
                              <Power size={13} />
                            </button>

                            {emp.username !== 'admin' && (
                              <button
                                onClick={() => onDeleteEmployee(emp.id)}
                                style={{
                                  backgroundColor: 'rgba(244, 63, 94, 0.12)',
                                  border: '1px solid rgba(244, 63, 94, 0.3)',
                                  color: '#fda4af',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  cursor: 'pointer'
                                }}
                                title="Delete Employee"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        )}
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

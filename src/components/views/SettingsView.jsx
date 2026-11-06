import React, { useState } from 'react';
import {
  Settings,
  Users,
  Shield,
  ShieldCheck,
  Database,
  Mail,
  Lock,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  RefreshCw,
  Download,
  Upload
} from 'lucide-react';

export default function SettingsView({
  currentUser,
  portalUsers = [],
  employeePermissions = {},
  salespersonPermissions = {},
  onSaveEmployeePermissions,
  onSaveSalespersonPermissions,
  onOpenPortalUsers,
  onOpenBackup,
  onOpenTwoFactorModal,
  showToast
}) {
  const [empPerms, setEmpPerms] = useState({ ...employeePermissions });
  const [salesPerms, setSalesPerms] = useState({ ...salespersonPermissions });

  const handleSavePolicy = () => {
    if (onSaveEmployeePermissions) onSaveEmployeePermissions(empPerms);
    if (onSaveSalespersonPermissions) onSaveSalespersonPermissions(salesPerms);
    if (showToast) showToast('Access rights & security policy saved successfully! 🔒');
  };

  const toggleEmp = (key) => {
    setEmpPerms(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSales = (key) => {
    setSalesPerms(prev => ({ ...prev, [key]: !prev[key] }));
  };

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
            <Settings size={20} color="#c084fc" /> System Settings & Operations Policy
          </h2>
          <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '3px 0 0 0' }}>
            Configure portal access roles, employee rights permissions matrix, and database backup persistence.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={onOpenPortalUsers}
            style={{
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: '#38bdf8',
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Users size={14} /> Manage Portal Accounts
          </button>

          <button
            onClick={onOpenBackup}
            style={{
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#34d399',
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Database size={14} /> Database Backup / Restore
          </button>
        </div>
      </div>

      {/* 2FA Security Overview Card */}
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        borderRadius: '16px',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        background: 'linear-gradient(90deg, rgba(15, 23, 42, 0.7) 0%, rgba(30, 41, 59, 0.4) 100%)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            backgroundColor: currentUser?.two_factor_enabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
            border: `1px solid ${currentUser?.two_factor_enabled ? 'rgba(16, 185, 129, 0.35)' : 'rgba(56, 189, 248, 0.35)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            {currentUser?.two_factor_enabled ? (
              <ShieldCheck size={22} color="#10b981" />
            ) : (
              <Shield size={22} color="#38bdf8" />
            )}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '0.975rem', fontWeight: '800', color: '#ffffff' }}>
                Google Authenticator Two-Factor Authentication (2FA)
              </h3>
              <span style={{
                fontSize: '0.7rem',
                fontWeight: '800',
                padding: '2px 8px',
                borderRadius: '12px',
                backgroundColor: currentUser?.two_factor_enabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.15)',
                color: currentUser?.two_factor_enabled ? '#34d399' : '#fbbf24',
                border: `1px solid ${currentUser?.two_factor_enabled ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.3)'}`
              }}>
                {currentUser?.two_factor_enabled ? 'PROTECTED (ACTIVE)' : 'RECOMMENDED (OFF)'}
              </span>
            </div>
            <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
              {currentUser?.two_factor_enabled
                ? 'Your account is secured with dynamic 6-digit TOTP codes and emergency recovery keys.'
                : 'Protect your VPS portal against password theft by requiring a Google Authenticator code at sign-in.'}
            </p>
          </div>
        </div>

        <button
          onClick={onOpenTwoFactorModal}
          style={{
            backgroundColor: currentUser?.two_factor_enabled ? 'rgba(16, 185, 129, 0.15)' : '#0284c7',
            border: `1px solid ${currentUser?.two_factor_enabled ? 'rgba(16, 185, 129, 0.35)' : 'rgba(56, 189, 248, 0.5)'}`,
            color: currentUser?.two_factor_enabled ? '#34d399' : '#ffffff',
            padding: '0.55rem 1.1rem',
            borderRadius: '10px',
            fontSize: '0.825rem',
            fontWeight: '700',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: currentUser?.two_factor_enabled ? 'none' : '0 4px 12px rgba(2, 132, 199, 0.35)'
          }}
        >
          {currentUser?.two_factor_enabled ? (
            <>
              <ShieldCheck size={15} /> Manage 2FA Settings
            </>
          ) : (
            <>
              <Shield size={15} /> Enable Google Authenticator ➔
            </>
          )}
        </button>
      </div>

      {/* Grid: Rights Policy Matrix & Portal Users Preview */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: '1.25rem'
      }}>
        {/* Staff Employee Policy */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '1.4rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={18} color="#38bdf8" />
              <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#ffffff', margin: 0 }}>
                Staff Employee Permissions
              </h3>
            </div>
            <span style={{ fontSize: '0.7rem', color: '#38bdf8', fontWeight: '700', backgroundColor: 'rgba(56, 189, 248, 0.15)', padding: '2px 8px', borderRadius: '999px' }}>
              ROLE: EMPLOYEE
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.84rem', color: '#cbd5e1', cursor: 'pointer', backgroundColor: 'rgba(15, 23, 42, 0.5)', padding: '0.65rem 0.85rem', borderRadius: '8px' }}>
              <span>Can Add Client Subscriptions</span>
              <input type="checkbox" checked={empPerms.canAddClient} onChange={() => toggleEmp('canAddClient')} />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.84rem', color: '#cbd5e1', cursor: 'pointer', backgroundColor: 'rgba(15, 23, 42, 0.5)', padding: '0.65rem 0.85rem', borderRadius: '8px' }}>
              <span>Can Edit Client Information</span>
              <input type="checkbox" checked={empPerms.canEditClient} onChange={() => toggleEmp('canEditClient')} />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.84rem', color: '#cbd5e1', cursor: 'pointer', backgroundColor: 'rgba(15, 23, 42, 0.5)', padding: '0.65rem 0.85rem', borderRadius: '8px' }}>
              <span>Can Delete Clients</span>
              <input type="checkbox" checked={empPerms.canDeleteClient} onChange={() => toggleEmp('canDeleteClient')} />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.84rem', color: '#cbd5e1', cursor: 'pointer', backgroundColor: 'rgba(15, 23, 42, 0.5)', padding: '0.65rem 0.85rem', borderRadius: '8px' }}>
              <span>Can 1-Click Renew Clients (+1 Year)</span>
              <input type="checkbox" checked={empPerms.canRenewClient} onChange={() => toggleEmp('canRenewClient')} />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.84rem', color: '#cbd5e1', cursor: 'pointer', backgroundColor: 'rgba(15, 23, 42, 0.5)', padding: '0.65rem 0.85rem', borderRadius: '8px' }}>
              <span>Can Export CSV & Excel Files</span>
              <input type="checkbox" checked={empPerms.canExport} onChange={() => toggleEmp('canExport')} />
            </label>
          </div>
        </div>

        {/* Salesperson Policy */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '1.4rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={18} color="#f97316" />
              <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#ffffff', margin: 0 }}>
                Sales Representative Policy
              </h3>
            </div>
            <span style={{ fontSize: '0.7rem', color: '#f97316', fontWeight: '700', backgroundColor: 'rgba(249, 115, 22, 0.15)', padding: '2px 8px', borderRadius: '999px' }}>
              ROLE: SALESPERSON
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.84rem', color: '#cbd5e1', cursor: 'pointer', backgroundColor: 'rgba(15, 23, 42, 0.5)', padding: '0.65rem 0.85rem', borderRadius: '8px' }}>
              <span>Can Request New Client Onboard</span>
              <input type="checkbox" checked={salesPerms.canAddClient} onChange={() => toggleSales('canAddClient')} />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.84rem', color: '#cbd5e1', cursor: 'pointer', backgroundColor: 'rgba(15, 23, 42, 0.5)', padding: '0.65rem 0.85rem', borderRadius: '8px' }}>
              <span>Can View Assigned Clients</span>
              <input type="checkbox" checked={true} disabled />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.84rem', color: '#cbd5e1', cursor: 'pointer', backgroundColor: 'rgba(15, 23, 42, 0.5)', padding: '0.65rem 0.85rem', borderRadius: '8px' }}>
              <span>Can Delete Clients</span>
              <input type="checkbox" checked={salesPerms.canDeleteClient} onChange={() => toggleSales('canDeleteClient')} />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.84rem', color: '#cbd5e1', cursor: 'pointer', backgroundColor: 'rgba(15, 23, 42, 0.5)', padding: '0.65rem 0.85rem', borderRadius: '8px' }}>
              <span>Can Export Customer Lists</span>
              <input type="checkbox" checked={salesPerms.canExport} onChange={() => toggleSales('canExport')} />
            </label>
          </div>
        </div>
      </div>

      {/* Save Policy Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleSavePolicy}
          style={{
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#ffffff',
            padding: '0.65rem 1.4rem',
            borderRadius: '10px',
            fontSize: '0.85rem',
            fontWeight: '700',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)'
          }}
        >
          Save Rights & Policy Changes
        </button>
      </div>
    </div>
  );
}

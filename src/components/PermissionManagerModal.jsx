import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, Lock, Check, ToggleLeft, ToggleRight, Sparkles, User, Settings, Users, Zap, Briefcase } from 'lucide-react';

export default function PermissionManagerModal({
  isOpen,
  onClose,
  portalUsers = [],
  employeePermissions,
  onUpdatePermissions,
  onUpdateUserPermissions,
  onUpdateGroupPermissions
}) {
  const [selectedTarget, setSelectedTarget] = useState('ROLE_SALESPERSON'); // Default to Salesperson Group Target
  const [currentRights, setCurrentRights] = useState({
    canExport: false,
    canAddClient: true,
    canEditClient: true,
    canDeleteClient: false,
    canRenewClient: true,
    canEditServer: false,
    canSuperLogin: true,
    canApproveRequests: false
  });

  useEffect(() => {
    if (selectedTarget === 'GLOBAL') {
      setCurrentRights(employeePermissions);
    } else if (selectedTarget === 'ROLE_SALESPERSON') {
      const firstSales = portalUsers.find(u => u.role === 'SALESPERSON');
      setCurrentRights(firstSales?.customPermissions || {
        canExport: false,
        canAddClient: true,
        canEditClient: true,
        canDeleteClient: false,
        canRenewClient: true,
        canEditServer: false,
        canSuperLogin: true,
        canApproveRequests: false
      });
    } else if (selectedTarget === 'ROLE_EMPLOYEE') {
      const firstEmp = portalUsers.find(u => u.role === 'EMPLOYEE');
      setCurrentRights(firstEmp?.customPermissions || employeePermissions);
    } else if (selectedTarget === 'ROLE_SUPER_ADMIN') {
      const firstAdmin = portalUsers.find(u => u.role === 'SUPER_ADMIN');
      setCurrentRights(firstAdmin?.customPermissions || {
        canExport: true,
        canAddClient: true,
        canEditClient: true,
        canDeleteClient: true,
        canRenewClient: true,
        canEditServer: true,
        canSuperLogin: true,
        canApproveRequests: true
      });
    } else {
      const u = portalUsers.find(user => user.id === selectedTarget);
      if (u) {
        const uRights = u.customPermissions || {
          canExport: u.role === 'SUPER_ADMIN',
          canAddClient: true,
          canEditClient: true,
          canDeleteClient: u.role === 'SUPER_ADMIN',
          canRenewClient: true,
          canEditServer: u.role === 'SUPER_ADMIN',
          canSuperLogin: true,
          canApproveRequests: u.role !== 'SALESPERSON'
        };
        setCurrentRights(uRights);
      }
    }
  }, [selectedTarget, employeePermissions, portalUsers]);

  if (!isOpen) return null;

  const togglePermission = (key) => {
    const updated = {
      ...currentRights,
      [key]: !currentRights[key]
    };
    setCurrentRights(updated);

    if (selectedTarget === 'ROLE_SALESPERSON' || selectedTarget === 'ROLE_EMPLOYEE' || selectedTarget === 'ROLE_SUPER_ADMIN' || selectedTarget === 'GLOBAL') {
      if (onUpdateGroupPermissions) {
        onUpdateGroupPermissions(selectedTarget, updated);
      } else {
        onUpdatePermissions(updated);
      }
    } else if (onUpdateUserPermissions) {
      onUpdateUserPermissions(selectedTarget, updated);
    }
  };

  const permissionsList = [
    { key: 'canExport', title: 'Export Excel & CSV Reports', desc: 'Allows users in target group to download full client & server Excel sheets' },
    { key: 'canAddClient', title: 'Add New Clients', desc: 'Allows users in target group to onboard new clients and assign drives' },
    { key: 'canEditClient', title: 'Edit Client Subscriptions', desc: 'Allows users in target group to update company names, dates, and drives' },
    { key: 'canDeleteClient', title: 'Delete / Remove Clients', desc: 'Allows users in target group to delete clients and free up drive space' },
    { key: 'canRenewClient', title: 'Direct Subscription Renewal (+1 Year)', desc: 'Allows users in target group to directly submit or extend client subscriptions' },
    { key: 'canEditServer', title: 'Add & Edit VPS Server Nodes', desc: 'Allows users in target group to add or reconfigure VPS servers' },
    { key: 'canSuperLogin', title: 'Superclient Admin 1-Click Remote Login', desc: 'Allows users in target group to access Superclient Admin credentials' },
    { key: 'canApproveRequests', title: 'Approve Sales Onboarding Requests', desc: 'Allows users in target group to approve and activate sales tickets' }
  ];

  const selectedUserObj = portalUsers.find(u => u.id === selectedTarget);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px' }}>
        <div className="modal-header">
          <div className="modal-title" style={{ color: '#c084fc' }}>
            <ShieldCheck size={22} />
            HOD Granular Group & Role Rights Policy Manager
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Target Selector Dropdown (Role Groups + Specific Users) */}
        <div className="glass-card" style={{ padding: '1rem', marginBottom: '1.25rem', backgroundColor: 'var(--bg-surface-elevated)', border: '1px solid #c084fc' }}>
          <label className="form-label" style={{ color: '#c084fc', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
            <Users size={18} /> Select Target Role Group or Specific User to Assign Rights:
          </label>
          <select
            className="form-input"
            style={{ fontWeight: '700', fontSize: '0.95rem', borderColor: 'rgba(192, 132, 252, 0.4)', backgroundColor: 'var(--bg-surface)' }}
            value={selectedTarget}
            onChange={e => setSelectedTarget(e.target.value)}
          >
            <optgroup label="👥 Role Group Targets (Bulk Assign Rights)">
              <option value="ROLE_SALESPERSON">💼 ALL Sales Representatives (Group Target)</option>
              <option value="ROLE_EMPLOYEE">👤 ALL Staff Employees (Group Target)</option>
              <option value="ROLE_SUPER_ADMIN">👑 ALL Super Admins (Group Target)</option>
              <option value="GLOBAL">🌐 Default Global Rights (Standard Staff)</option>
            </optgroup>

            <optgroup label="👤 Specific Individual Users">
              {portalUsers.map(u => (
                <option key={u.id} value={u.id}>
                  👤 {u.name} ({u.username}) — Role: {u.role}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <div className="glass-card" style={{ padding: '0.75rem 1rem', marginBottom: '1rem', background: 'rgba(192, 132, 252, 0.1)', border: '1px solid rgba(192, 132, 252, 0.3)', color: '#e9d5ff', fontSize: '0.825rem', fontWeight: '600' }}>
          {selectedTarget === 'ROLE_SALESPERSON' && '💼 Currently customizing rights for ALL Sales Representatives. Any right toggled below instantly applies to ALL Sales Representatives!'}
          {selectedTarget === 'ROLE_EMPLOYEE' && '👤 Currently customizing rights for ALL Staff Employees. Any right toggled below instantly applies to ALL Staff Employees!'}
          {selectedTarget === 'ROLE_SUPER_ADMIN' && '👑 Currently customizing rights for ALL Super Admins.'}
          {selectedTarget === 'GLOBAL' && '🌐 Currently customizing default global rights for standard Staff Employees.'}
          {selectedTarget !== 'ROLE_SALESPERSON' && selectedTarget !== 'ROLE_EMPLOYEE' && selectedTarget !== 'ROLE_SUPER_ADMIN' && selectedTarget !== 'GLOBAL' && `👤 Currently customizing rights specifically for user "${selectedUserObj ? selectedUserObj.name : ''}" (${selectedUserObj ? selectedUserObj.username : ''}).`}
        </div>

        {/* Granular Rights Toggle List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem', maxHeight: '350px', overflowY: 'auto' }}>
          {permissionsList.map(item => {
            const isEnabled = !!currentRights[item.key];
            return (
              <div
                key={item.key}
                className="glass-card"
                style={{
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  justify: 'space-between',
                  alignItems: 'center',
                  border: isEnabled ? '1px solid rgba(192, 132, 252, 0.5)' : '1px solid var(--border-color)',
                  background: isEnabled ? 'rgba(192, 132, 252, 0.08)' : 'rgba(9, 14, 26, 0.8)'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '700', color: isEnabled ? '#ffffff' : 'var(--text-muted)' }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                    {item.desc}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => togglePermission(item.key)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: isEnabled ? '#c084fc' : 'var(--text-dim)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.85rem',
                    fontWeight: '700'
                  }}
                >
                  {isEnabled ? (
                    <>
                      <ToggleRight size={30} color="#c084fc" />
                      <span style={{ color: '#c084fc' }}>ALLOWED</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft size={30} color="#64748b" />
                      <span style={{ color: '#64748b' }}>DENIED</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" style={{ backgroundColor: '#c084fc', borderColor: '#a855f7' }} onClick={onClose}>
            <Check size={16} /> Save Rights Policy
          </button>
        </div>
      </div>
    </div>
  );
}

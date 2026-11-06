import React, { useState } from 'react';
import { X, UserPlus, Shield, User, Key, Trash2, Edit2, CheckCircle2, ShieldCheck, Mail, Briefcase, Plus, RefreshCw } from 'lucide-react';

export default function PortalUsersModal({
  isOpen,
  onClose,
  portalUsers,
  onAddPortalUser,
  onEditPortalUser,
  onDeletePortalUser
}) {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    username: '',
    password: '',
    role: 'EMPLOYEE',
    email: ''
  });

  const [isEditing, setIsEditing] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.username || !formData.password || !formData.name) {
      alert("Please fill name, username, and password!");
      return;
    }

    if (isEditing) {
      onEditPortalUser(formData);
    } else {
      const newUser = {
        ...formData,
        id: `puser-${Date.now()}`
      };
      onAddPortalUser(newUser);
    }

    setFormData({ id: '', name: '', username: '', password: '', role: 'EMPLOYEE', email: '' });
    setIsEditing(false);
  };

  const handleStartEdit = (user) => {
    setFormData(user);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setFormData({ id: '', name: '', username: '', password: '', role: 'EMPLOYEE', email: '' });
    setIsEditing(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '880px' }}>
        <div className="modal-header">
          <div className="modal-title" style={{ color: '#ea580c' }}>
            <ShieldCheck size={22} />
            Super Admin Portal User & Staff Accounts Manager (Role Switcher)
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Add/Edit User Form Card */}
        <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1.5rem', backgroundColor: 'var(--bg-surface-elevated)' }}>
          <strong style={{ fontSize: '0.95rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '1rem' }}>
            <UserPlus size={16} color="#ea580c" />
            {isEditing ? `Edit Website User: ${formData.name}` : 'Add New Website User / Staff Account'}
          </strong>

          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="e.g. Vikram Sharma"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Username (Login ID) *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="e.g. vikram_admin"
                  value={formData.username}
                  onChange={e => setFormData({ ...formData, username: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Login Password *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="Set account password"
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Portal Access Role *</label>
                <select
                  className="form-input"
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value })}
                >
                  <option value="SUPER_ADMIN">👑 Super Admin / HOD (Full Rights)</option>
                  <option value="EMPLOYEE">👤 Staff Employee (Client Ops)</option>
                  <option value="SALESPERSON">💼 Sales Representative (Submit Requests)</option>
                </select>
              </div>

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Email Address (For Notifications)</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="vikram@innovationwebworks.com"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              {isEditing && (
                <button type="button" className="btn btn-secondary" onClick={handleCancelEdit}>
                  Cancel Edit
                </button>
              )}
              <button type="submit" className="btn btn-primary" style={{ backgroundColor: '#ea580c', borderColor: '#f97316' }}>
                <Plus size={15} />
                {isEditing ? 'Save User Changes' : 'Create Website Account'}
              </button>
            </div>
          </form>
        </div>

        {/* Website Registered Users Table */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
              Registered Website Accounts & Quick Role Switcher ({portalUsers.length})
            </strong>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              ⚡ Change any user's role anytime using the dropdown below!
            </span>
          </div>

          <div className="table-container" style={{ maxHeight: '300px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Full Name</th>
                  <th>Username ID</th>
                  <th>Password</th>
                  <th>Quick Change Access Role</th>
                  <th>Email</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {portalUsers.map(user => {
                  const isAdmin = user.role === 'SUPER_ADMIN';
                  const isSales = user.role === 'SALESPERSON';

                  return (
                    <tr key={user.id}>
                      <td style={{ fontWeight: '700', color: '#f8fafc' }}>{user.name}</td>
                      <td className="font-mono">{user.username}</td>
                      <td className="font-mono" style={{ color: '#f59e0b', fontWeight: '700' }}>{user.password}</td>
                      <td>
                        {/* 1-Click Role Switcher Dropdown */}
                        <select
                          className="select-input"
                          style={{
                            padding: '3px 8px',
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            borderColor: isAdmin ? '#10b981' : (isSales ? '#ea580c' : '#c084fc'),
                            backgroundColor: 'var(--bg-surface-elevated)',
                            color: isAdmin ? '#6ee7b7' : (isSales ? '#fdba74' : '#e9d5ff')
                          }}
                          value={user.role}
                          onChange={(e) => {
                            const newRole = e.target.value;
                            onEditPortalUser({ ...user, role: newRole });
                          }}
                        >
                          <option value="SUPER_ADMIN">👑 Super Admin / HOD</option>
                          <option value="EMPLOYEE">👤 Staff Employee</option>
                          <option value="SALESPERSON">💼 Sales Representative</option>
                        </select>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{user.email || 'N/A'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.25rem' }}>
                          <button className="action-btn" title="Edit User Details" onClick={() => handleStartEdit(user)}>
                            <Edit2 size={14} />
                          </button>
                          {portalUsers.length > 1 && (
                            <button className="action-btn danger" title="Delete User" onClick={() => onDeletePortalUser(user.id)}>
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

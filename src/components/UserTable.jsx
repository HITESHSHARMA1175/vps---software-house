import React, { useState } from 'react';
import { Search, Filter, Calendar, Edit2, Trash2, RefreshCw, AlertTriangle, AlertCircle, CheckCircle, Mail, Send, Download, FileText, FileSpreadsheet, Upload, Lock, Unlock, Zap, Copy, Check, Key, Shield, Users } from 'lucide-react';
import ActionsDropdown from './ui/ActionsDropdown';
import { useAuth, API_BASE } from '../contexts/AuthContext';
import { revealClientPassword, revealServerPassword, copyRevealedPassword, MASKED_PASSWORD_TEXT } from '../utils/revealPassword';
import { exportExpiringUsersCSV, exportServerUserExcel, exportServerUserWithPasswords } from '../utils/exportUtils';

export function getDaysRemaining(expiryDateStr) {
  if (!expiryDateStr) return 999;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const parts = String(expiryDateStr).trim().split(/[-/]/);
  let expiry;
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      expiry = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    } else {
      // DD-MM-YYYY
      expiry = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
  } else {
    expiry = new Date(expiryDateStr);
  }

  if (isNaN(expiry.getTime())) return 999;

  const diffTime = expiry.getTime() - today.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

export function getExpiryCategory(expiryDateStr) {
  const days = getDaysRemaining(expiryDateStr);
  if (days < 0) return 'EXPIRED';
  if (days >= 0 && days <= 9) return 'URGENT';
  if (days >= 10 && days <= 15) return 'EXPIRING_SOON';
  return 'ACTIVE';
}

export default function UserTable({
  currentUser,
  users,
  servers,
  salesAgents,
  selectedServerId,
  onEditUser,
  onDeleteUser,
  onRenewUser,
  onBulkRenew,
  onBulkDelete,
  onGenerateReceipt,
  onOpenImportStatusModal,
  onDirectRemoteConnect,
  onChangePassword,
  onToggleUserStatus
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [allocationFilter, setAllocationFilter] = useState('ALL');
  const [agentFilter, setAgentFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('EXPIRY_ASC');

  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [copiedKey, setCopiedKey] = useState(null);

  const canExport = currentUser && currentUser.permissions && currentUser.permissions.canExport;
  const isSuperAdmin = !!currentUser && currentUser.role === 'SUPER_ADMIN';
  const [isExportingPw, setIsExportingPw] = useState(false);

  const handleExportWithPasswords = async () => {
    const scope = selectedServerId && selectedServerId !== 'ALL' ? 'the selected server' : 'ALL servers';
    const ok = window.confirm(
      `Export client passwords for ${scope}?\n\nThe file will contain plaintext passwords. This action is recorded in the audit log. Store the file securely and delete it after use.`
    );
    if (!ok) return; // cancelled: nothing is sent
    setIsExportingPw(true);
    try {
      await exportServerUserWithPasswords(selectedServerId);
    } catch (err) {
      window.alert(`Export with passwords failed: ${err.message}`);
    } finally {
      setIsExportingPw(false);
    }
  };
  const canEditClient = !currentUser || !currentUser.permissions || currentUser.permissions.canEditClient !== false;
  const canDeleteClient = !currentUser || !currentUser.permissions || currentUser.permissions.canDeleteClient !== false;
  const canRenewClient = !currentUser || !currentUser.permissions || currentUser.permissions.canRenewClient !== false;

  const { authFetch } = useAuth();

  // SUPER_ADMIN only: fetch the password on click, copy it, and discard it (never kept in state)
  const revealAndCopy = async (fetcher, key) => {
    try {
      await copyRevealedPassword(fetcher);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      window.alert(`Reveal failed: ${err.message}`);
    }
  };

  // Filter users based on search, filters, and Salesperson isolation
  let filteredUsers = users.filter(user => {
    // If logged in as Salesperson, ONLY show clients brought/sold by this Salesperson!
    if (currentUser && (currentUser.role === 'SALESPERSON' || (currentUser.permissions && currentUser.permissions.isSalesperson))) {
      const agentLower = (user.salesAgent || '').toLowerCase();
      const userLower = (currentUser.username || '').toLowerCase();

      const matchesSalesperson = agentLower === userLower ||
                                 agentLower.includes(userLower) ||
                                 userLower.includes(agentLower) ||
                                 (userLower.includes('rahul') && agentLower.includes('rahul'));

      if (!matchesSalesperson) return false;
    }

    if (selectedServerId !== 'ALL' && user.serverId !== selectedServerId) {
      return false;
    }

    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      user.username.toLowerCase().includes(searchLower) ||
      user.company.toLowerCase().includes(searchLower) ||
      user.salesAgent.toLowerCase().includes(searchLower) ||
      user.drive.toLowerCase().includes(searchLower);

    if (!matchesSearch) return false;

    if (allocationFilter === 'SHARED' && user.clientType === 'Dedicated') return false;
    if (allocationFilter === 'DEDICATED' && user.clientType !== 'Dedicated') return false;

    const cat = getExpiryCategory(user.expiryDate);
    if (statusFilter === 'EXPIRING_10_15' && cat !== 'EXPIRING_SOON') return false;
    if (statusFilter === 'URGENT' && cat !== 'URGENT') return false;
    if (statusFilter === 'EXPIRED' && cat !== 'EXPIRED') return false;
    if (statusFilter === 'ACTIVE' && cat !== 'ACTIVE') return false;

    if (agentFilter !== 'ALL' && user.salesAgent !== agentFilter) return false;

    return true;
  });

  // Sort filtered users
  // Dynamic Column Sorting
  const handleSort = (field) => {
    if (sortBy === `${field}_ASC`) {
      setSortBy(`${field}_DESC`);
    } else {
      setSortBy(`${field}_ASC`);
    }
  };

  const renderSortIndicator = (field) => {
    if (sortBy === `${field}_ASC`) return <span style={{ color: 'var(--accent-sky)', marginLeft: '4px', fontWeight: '800' }}>↑</span>;
    if (sortBy === `${field}_DESC`) return <span style={{ color: 'var(--accent-sky)', marginLeft: '4px', fontWeight: '800' }}>↓</span>;
    return <span style={{ color: 'rgba(255, 255, 255, 0.2)', marginLeft: '4px', fontSize: '10px' }}>↕</span>;
  };

  filteredUsers.sort((a, b) => {
    if (sortBy === 'EXPIRY_ASC') {
      return (a.expiryDate || '').localeCompare(b.expiryDate || '');
    }
    if (sortBy === 'EXPIRY_DESC') {
      return (b.expiryDate || '').localeCompare(a.expiryDate || '');
    }
    if (sortBy === 'COMPANY_ASC') {
      return (a.company || '').localeCompare(b.company || '');
    }
    if (sortBy === 'COMPANY_DESC') {
      return (b.company || '').localeCompare(a.company || '');
    }
    if (sortBy === 'USERNAME_ASC') {
      return (a.username || '').localeCompare(b.username || '');
    }
    if (sortBy === 'USERNAME_DESC') {
      return (b.username || '').localeCompare(a.username || '');
    }
    if (sortBy === 'STATUS_ASC') {
      return (a.status || '').localeCompare(b.status || '');
    }
    if (sortBy === 'STATUS_DESC') {
      return (b.status || '').localeCompare(a.status || '');
    }
    if (sortBy === 'DRIVE_ASC') {
      return (a.drive || '').localeCompare(b.drive || '');
    }
    if (sortBy === 'DRIVE_DESC') {
      return (b.drive || '').localeCompare(a.drive || '');
    }
    if (sortBy === 'REG_ASC') {
      return (a.registrationDate || '').localeCompare(b.registrationDate || '');
    }
    if (sortBy === 'REG_DESC') {
      return (b.registrationDate || '').localeCompare(a.registrationDate || '');
    }
    if (sortBy === 'AGENT_ASC') {
      return (a.salesAgent || '').localeCompare(b.salesAgent || '');
    }
    if (sortBy === 'AGENT_DESC') {
      return (b.salesAgent || '').localeCompare(a.salesAgent || '');
    }
    return 0;
  });

  // Multi-select handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedUserIds(filteredUsers.map(u => u.id));
    } else {
      setSelectedUserIds([]);
    }
  };

  const handleToggleSelectUser = (id) => {
    setSelectedUserIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const isAllSelected = filteredUsers.length > 0 && selectedUserIds.length === filteredUsers.length;

  return (
    <div className="table-section">
      {/* Controls & Search */}
      <div className="controls-bar">
        <div className="search-box">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search company, username, agent..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-group">
          {canExport ? (
            <>
              <button
                className="btn btn-warning"
                onClick={() => exportExpiringUsersCSV(users, servers)}
                title="Export CSV of Expiring Clients to edit and update status in Excel"
              >
                <Download size={15} /> Export Expiring CSV
              </button>

              <button
                className="btn btn-secondary"
                style={{ background: 'rgba(192, 132, 252, 0.2)', color: '#c084fc', border: '1px solid rgba(192, 132, 252, 0.4)' }}
                onClick={onOpenImportStatusModal}
                title="Upload edited CSV to auto-update subscription statuses & renew"
              >
                <Upload size={15} /> Import Status CSV
              </button>

              <button
                className="btn btn-primary"
                onClick={() => exportServerUserExcel(servers, users, selectedServerId)}
                title="Export Server & Client Excel Sheet grouped by Server"
              >
                <FileSpreadsheet size={15} /> Export Server Excel
              </button>

              {isSuperAdmin && (
                <button
                  className="btn btn-secondary"
                  style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.4)' }}
                  onClick={handleExportWithPasswords}
                  disabled={isExportingPw}
                  title="Super Admin only: export clients including passwords (audited)"
                >
                  <Key size={15} /> {isExportingPw ? 'Exporting...' : 'Export with passwords'}
                </button>
              )}
            </>
          ) : (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(9, 14, 26, 0.8)', padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <Lock size={12} color="#f59e0b" /> Excel Exports Reserved for Super Admin / HOD
            </div>
          )}

          <select
            className="select-input"
            value={allocationFilter}
            onChange={(e) => setAllocationFilter(e.target.value)}
            style={{ fontWeight: '600', borderColor: allocationFilter !== 'ALL' ? '#c084fc' : undefined }}
          >
            <option value="ALL">All Server Allocations</option>
            <option value="SHARED">Shared Clients Only</option>
            <option value="DEDICATED">Dedicated Clients Only</option>
          </select>

          <select
            className="select-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Expiry Statuses</option>
            <option value="EXPIRING_10_15">Expiring Soon (10-15 Days)</option>
            <option value="URGENT">Urgent Expiry (&lt; 10 Days)</option>
            <option value="EXPIRED">Expired Accounts</option>
            <option value="ACTIVE">Active Accounts</option>
          </select>

          <select
            className="select-input"
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
          >
            <option value="ALL">All Sales Agents</option>
            {salesAgents.map(agent => (
              <option key={agent} value={agent}>{agent}</option>
            ))}
          </select>

          <select
            className="select-input"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="EXPIRY_ASC">Sort: Expiry (Soonest First)</option>
            <option value="EXPIRY_DESC">Sort: Expiry (Furthest First)</option>
            <option value="COMPANY_ASC">Sort: Company Name (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Bulk Action Toolbar when items checked */}
      {selectedUserIds.length > 0 && (
        <div style={{
          display: 'flex',
          justify: 'space-between',
          alignItems: 'center',
          background: 'rgba(59, 130, 246, 0.12)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: 'var(--radius-md)',
          padding: '0.65rem 1rem',
          marginBottom: '1rem',
          color: '#f8fafc'
        }}>
          <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>
            {selectedUserIds.length} Client(s) Selected
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {canRenewClient && (
              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                onClick={() => onBulkRenew(selectedUserIds)}
              >
                <RefreshCw size={14} /> Bulk Renew (+1 Year)
              </button>
            )}
            {canDeleteClient && (
              <button
                className="btn btn-danger"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                onClick={() => {
                  onBulkDelete(selectedUserIds);
                  setSelectedUserIds([]);
                }}
              >
                <Trash2 size={14} /> Delete Selected
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="table-wrapper">
        <div className="table-container">
          <table className="table-modern data-table">
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  aria-label="Select all table items"
                  checked={isAllSelected}
                  onChange={handleSelectAll}
                  style={{ cursor: 'pointer', transform: 'scale(1.1)' }}
                />
              </th>
              <th onClick={() => handleSort('USERNAME')} style={{ cursor: 'pointer', userSelect: 'none' }} title="Click to sort by Username">
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  Username &amp; Passwords {renderSortIndicator('USERNAME')}
                </div>
              </th>
              <th onClick={() => handleSort('COMPANY')} style={{ cursor: 'pointer', userSelect: 'none' }} title="Click to sort by Company Name">
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  Company Name {renderSortIndicator('COMPANY')}
                </div>
              </th>
              <th onClick={() => handleSort('STATUS')} style={{ cursor: 'pointer', userSelect: 'none' }} title="Click to sort by User Status">
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  User Status {renderSortIndicator('STATUS')}
                </div>
              </th>
              <th onClick={() => handleSort('DRIVE')} style={{ cursor: 'pointer', userSelect: 'none' }} title="Click to sort by Drive Onboard">
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  Drive Onboard {renderSortIndicator('DRIVE')}
                </div>
              </th>
              <th onClick={() => handleSort('REG')} style={{ cursor: 'pointer', userSelect: 'none' }} title="Click to sort by Registration Date">
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  Registration Date {renderSortIndicator('REG')}
                </div>
              </th>
              <th onClick={() => handleSort('EXPIRY')} style={{ cursor: 'pointer', userSelect: 'none' }} title="Click to sort by Renewal Expiry">
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  Renewal Expiry {renderSortIndicator('EXPIRY')}
                </div>
              </th>
              <th onClick={() => handleSort('AGENT')} style={{ cursor: 'pointer', userSelect: 'none' }} title="Click to sort by Sales Agent">
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  Sales Agent {renderSortIndicator('AGENT')}
                </div>
              </th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                    <Users size={32} color="var(--text-muted)" style={{ opacity: 0.5 }} />
                    <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-secondary)' }}>No clients match your filters</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Try adjusting the search or filter options above.</div>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setSearchTerm(''); setStatusFilter('ALL'); setAllocationFilter('ALL'); setAgentFilter('ALL'); }}>
                      Clear Filters
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              filteredUsers.map(user => {
                const server = servers.find(s => s.id === user.serverId);
                const daysRemaining = getDaysRemaining(user.expiryDate);
                const cat = getExpiryCategory(user.expiryDate);
                const isDedicated = user.clientType === 'Dedicated';
                const isChecked = selectedUserIds.includes(user.id);

                const waMessage = encodeURIComponent(
                  `Hello ${user.company},\n\nYour VPS Cloud Subscription (${server ? server.name : 'VPS'}) expires on ${user.expiryDate} (${daysRemaining} days remaining).\n\nThank you,\nInnovation Web Works Operations`
                );

                return (
                  <tr key={user.id} style={{ background: isChecked ? 'rgba(234, 88, 12, 0.15)' : undefined }}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleSelectUser(user.id)}
                        style={{ cursor: 'pointer', transform: 'scale(1.1)' }}
                      />
                    </td>
                    <td>
                      <div style={{ fontWeight: '700', color: '#f8fafc', fontSize: '0.9rem', marginBottom: '4px' }}>
                        {user.username}
                      </div>

                      {/* Password Quick Copy Badges */}
                      {!isSuperAdmin ? (
                        <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }} title="Passwords are visible to Super Admin only">
                          Password: {MASKED_PASSWORD_TEXT}
                        </div>
                      ) : (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          title="Reveal and copy user password (audited)"
                          style={{
                            background: copiedKey === `user-${user.id}` ? 'rgba(16, 185, 129, 0.3)' : 'rgba(52, 211, 153, 0.15)',
                            border: '1px solid rgba(52, 211, 153, 0.4)',
                            color: copiedKey === `user-${user.id}` ? '#6ee7b7' : '#34d399',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}
                          onClick={() => revealAndCopy(() => revealClientPassword(authFetch, API_BASE, user.id), `user-${user.id}`)}
                        >
                          {copiedKey === `user-${user.id}` ? <Check size={11} /> : <Key size={11} />}
                          Reveal User Pass
                        </button>

                        {server && (
                        <button
                          type="button"
                          title="Reveal and copy super admin password (audited)"
                          style={{
                            background: copiedKey === `super-${user.id}` ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.15)',
                            border: '1px solid rgba(245, 158, 11, 0.4)',
                            color: copiedKey === `super-${user.id}` ? '#fcd34d' : '#f59e0b',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}
                          onClick={() => revealAndCopy(() => revealServerPassword(authFetch, API_BASE, server.id), `super-${user.id}`)}
                        >
                          {copiedKey === `super-${user.id}` ? <Check size={11} /> : <Shield size={11} />}
                          Reveal Super Pass
                        </button>
                        )}
                      </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: '600' }}>{user.company}</span>
                        {(user.status === 'DISABLED' || user.status === 'Disabled') && (
                          <span style={{
                            fontSize: '11px',
                            fontWeight: '800',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(244, 63, 94, 0.2)',
                            color: '#fda4af',
                            border: '1px solid rgba(244, 63, 94, 0.4)'
                          }}>
                            LOCKED
                          </span>
                        )}
                      </div>
                      {user.customerEmail && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Mail size={11} /> {user.customerEmail}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="badge" style={{
                        background: isDedicated ? 'rgba(236, 72, 153, 0.2)' : 'rgba(249, 115, 22, 0.2)',
                        color: isDedicated ? '#f472b6' : '#fdba74',
                        border: isDedicated ? '1px solid rgba(236, 72, 153, 0.4)' : '1px solid rgba(249, 115, 22, 0.4)',
                      }}>
                        {isDedicated ? '🚀 Dedicated' : '👥 Shared'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: '600', fontSize: '0.8rem' }}>{server ? server.name : 'Unknown VPS'}</div>
                      <span className="badge badge-drive">{user.drive}</span>
                    </td>
                    <td className="font-mono">{user.billDate || 'N/A'}</td>
                    <td className="font-mono" style={{ fontWeight: '600' }}>
                      <div>{user.expiryDate}</div>
                      <div style={{ marginTop: '2px' }}>
                        {cat === 'EXPIRED' && (
                          <span className="badge badge-expired" style={{ fontSize: '0.7rem' }}>
                            <AlertCircle size={10} /> Expired ({Math.abs(daysRemaining)}d ago)
                          </span>
                        )}
                        {cat === 'URGENT' && (
                          <span className="badge badge-urgent" style={{ fontSize: '0.7rem' }}>
                            <AlertTriangle size={10} /> {daysRemaining} Days Left
                          </span>
                        )}
                        {cat === 'EXPIRING_SOON' && (
                          <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                            <AlertTriangle size={10} /> {daysRemaining} Days Left
                          </span>
                        )}
                        {cat === 'ACTIVE' && (
                          <span className="badge badge-active" style={{ fontSize: '0.7rem' }}>
                            <CheckCircle size={10} /> Active ({daysRemaining}d)
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{user.salesAgent}</div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.25rem', flexWrap: 'nowrap' }}>
                        {/* 1-Click User Login */}
                        <button
                          className="btn btn-success btn-xs"
                          title="Direct 1-Click User Remote Login"
                          aria-label={`Remote login as user ${user.username}`}
                          onClick={() => onDirectRemoteConnect(user, 'USER')}
                        >
                          <Zap size={11} /> User
                        </button>

                        {/* 1-Click Superclient Remote Login */}
                        <button
                          className="btn btn-warning btn-xs"
                          title="Direct 1-Click Superclient Remote Login"
                          aria-label={`Remote login as superclient for ${user.company}`}
                          onClick={() => onDirectRemoteConnect(user, 'SUPERCLIENT')}
                        >
                          <Shield size={11} /> Super
                        </button>

                        {/* Quick Delete / Remove Button */}
                        {canDeleteClient && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Are you sure you want to delete client "${user.company}" (${user.username})?`)) {
                                onDeleteUser(user.id);
                              }
                            }}
                            className="btn btn-ghost btn-xs"
                            title={`Quick Remove / Delete client ${user.company}`}
                            aria-label={`Delete client ${user.company}`}
                            style={{
                              padding: '3px 6px',
                              color: 'var(--accent-rose)',
                              height: '22px',
                              borderRadius: 'var(--radius-sm)'
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}

                        {/* More Actions Dropdown */}
                        <ActionsDropdown
                          ariaLabel={`More actions for ${user.company}`}
                          items={[
                            {
                              id: 'password',
                              label: 'Change VPS Password',
                              icon: Key,
                              onClick: () => onChangePassword && onChangePassword(user)
                            },
                            {
                              id: 'status',
                              label: (user.status === 'DISABLED' || user.status === 'Disabled')
                                ? 'Enable VPS Account'
                                : 'Lock / Disable Account',
                              icon: (user.status === 'DISABLED' || user.status === 'Disabled') ? Unlock : Lock,
                              onClick: () => onToggleUserStatus && onToggleUserStatus(user, (user.status === 'DISABLED' || user.status === 'Disabled') ? 'ACTIVE' : 'DISABLED')
                            },
                            {
                              id: 'receipt',
                              label: 'Subscription Slip',
                              icon: FileText,
                              onClick: () => onGenerateReceipt(user)
                            },
                            user.customerPhone && {
                              id: 'whatsapp',
                              label: 'WhatsApp Reminder',
                              icon: Send,
                              onClick: () => window.open(`https://wa.me/${user.customerPhone.replace(/[^0-9]/g, '')}?text=${waMessage}`, '_blank')
                            },
                            canRenewClient && {
                              id: 'renew',
                              label: 'Renew +1 Year',
                              icon: RefreshCw,
                              onClick: () => onRenewUser(user.id)
                            },
                            canEditClient && {
                              id: 'edit',
                              label: 'Edit Client',
                              icon: Edit2,
                              onClick: () => onEditUser(user)
                            },
                            canDeleteClient && { divider: true },
                            canDeleteClient && {
                              id: 'delete',
                              label: 'Delete Client',
                              icon: Trash2,
                              danger: true,
                              onClick: () => onDeleteUser(user.id)
                            }
                          ].filter(Boolean)}
                        />
                      </div>
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

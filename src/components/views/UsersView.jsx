import React, { useState, useMemo } from 'react';
import {
  Users,
  Server,
  Clock,
  Search,
  Filter,
  Download,
  Upload,
  Plus,
  Zap,
  Shield,
  Key,
  Check,
  Mail,
  Edit2,
  Trash2,
  RefreshCw,
  Eye,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MessageCircle,
  FileSpreadsheet,
  Ticket,
  Lock,
  Unlock,
  FolderSync
} from 'lucide-react';
import { getDaysRemaining, getExpiryCategory } from '../UserTable';
import { downloadVpsSubscriptionTemplate } from '../../utils/exportUtils';
import ActionsDropdown from '../ui/ActionsDropdown';
import MigrateClientModal from '../MigrateClientModal';
import { useAuth, API_BASE } from '../../contexts/AuthContext';
import { revealClientPassword, revealServerPassword, copyRevealedPassword, MASKED_PASSWORD_TEXT } from '../../utils/revealPassword';

const EMPTY_ARRAY = [];

export default function UsersView({
  users = EMPTY_ARRAY,
  servers = EMPTY_ARRAY,
  telemetryData = {},
  salesAgents = EMPTY_ARRAY,
  currentUser,
  employeePermissions,
  onAddUser,
  onEditUser,
  onDeleteUser,
  onRenewUser,
  onBulkRenew,
  onBulkDelete,
  onDirectRemoteConnect,
  onViewUserProfile,
  onOpenImportStatusModal,
  onOpenBulkSharedImport,
  onRaiseTicket,
  onOpenOfflineVpsModal,
  onChangePassword,
  onToggleUserStatus,
  exportExpiringUsersCSV,
  exportServerUserExcel
}) {
  const [search, setSearch] = useState('');
  const [serverFilter, setServerFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [allocationFilter, setAllocationFilter] = useState('ALL');
  const [agentFilter, setAgentFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('EXPIRY_ASC');
  const [migratingUser, setMigratingUser] = useState(null);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Selection
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [copiedKey, setCopiedKey] = useState(null);

  const isSuperAdmin = currentUser && currentUser.role === 'SUPER_ADMIN';
  const isSalesperson = currentUser && currentUser.role === 'SALESPERSON';

  const canAddClient = isSuperAdmin || (employeePermissions && employeePermissions.canAddClient);
  const canEditClient = isSuperAdmin || (employeePermissions && employeePermissions.canEditClient);
  const canDeleteClient = isSuperAdmin || (employeePermissions && employeePermissions.canDeleteClient);
  const canRenewClient = isSuperAdmin || (employeePermissions && employeePermissions.canRenewClient);
  const canExport = isSuperAdmin || (employeePermissions && employeePermissions.canExport);

  const { authFetch } = useAuth();

  // SUPER_ADMIN only: fetch the password on click, copy it, and discard it (never kept in state)
  const revealAndCopy = async (fetcher, keyName) => {
    try {
      await copyRevealedPassword(fetcher);
      setCopiedKey(keyName);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch (err) {
      window.alert(`Reveal failed: ${err.message}`);
    }
  };

  // Filtered & Sorted Users
  const filteredUsers = useMemo(() => {
    let result = [...users];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(u =>
        (u.username || '').toLowerCase().includes(q) ||
        (u.company || '').toLowerCase().includes(q) ||
        (u.drive || '').toLowerCase().includes(q) ||
        (u.customerEmail || '').toLowerCase().includes(q) ||
        (u.salesAgent || '').toLowerCase().includes(q)
      );
    }

    if (serverFilter !== 'ALL') {
      result = result.filter(u => u.serverId === serverFilter);
    }

    if (allocationFilter === 'SHARED') {
      result = result.filter(u => u.clientType !== 'Dedicated');
    } else if (allocationFilter === 'DEDICATED') {
      result = result.filter(u => u.clientType === 'Dedicated');
    }

    if (statusFilter !== 'ALL') {
      result = result.filter(u => {
        const cat = getExpiryCategory(u.expiryDate);
        if (statusFilter === 'EXPIRING_10_15') return cat === 'EXPIRING_SOON';
        if (statusFilter === 'URGENT') return cat === 'URGENT';
        if (statusFilter === 'EXPIRED') return cat === 'EXPIRED';
        if (statusFilter === 'ACTIVE') return cat === 'ACTIVE';
        return true;
      });
    }

    if (agentFilter !== 'ALL') {
      result = result.filter(u => u.salesAgent === agentFilter);
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'EXPIRY_ASC') {
        return new Date(a.expiryDate) - new Date(b.expiryDate);
      }
      if (sortBy === 'EXPIRY_DESC') {
        return new Date(b.expiryDate) - new Date(a.expiryDate);
      }
      if (sortBy === 'COMPANY_ASC') {
        return (a.company || '').localeCompare(b.company || '');
      }
      return 0;
    });

    return result;
  }, [users, search, serverFilter, statusFilter, allocationFilter, agentFilter, sortBy]);

  // Paginated Slices
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage) || 1;
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedUserIds(paginatedUsers.map(u => u.id));
    } else {
      setSelectedUserIds([]);
    }
  };

  const handleToggleSelectUser = (id) => {
    setSelectedUserIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const selectedSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);

  const subscriptionMetrics = useMemo(() => {
    const active = users.filter(user => getExpiryCategory(user.expiryDate) === 'ACTIVE').length;
    const expiring = users.filter(user => {
      const days = getDaysRemaining(user.expiryDate);
      return days >= 0 && days <= 30;
    }).length;
    const unreachable = servers.filter(server => {
      const ip = server.ipPort ? server.ipPort.split(':')[0] : '';
      const telemetry = telemetryData[server.id] || telemetryData[server.ipPort] || telemetryData[server.name] || (ip && telemetryData[ip]);
      return !!server && !(telemetry?.lastPingTimestamp && Date.now() - telemetry.lastPingTimestamp < 3 * 60 * 1000);
    }).length;
    return { active, expiring, unreachable };
  }, [users, servers, telemetryData]);

  const getServerConnectivity = (server) => {
    if (!server) return { label: 'Unknown', tone: 'neutral' };
    const ip = server.ipPort ? server.ipPort.split(':')[0] : '';
    const telemetry = telemetryData[server.id] || telemetryData[server.ipPort] || telemetryData[server.name] || (ip && telemetryData[ip]);
    if (!telemetry?.lastPingTimestamp) return { label: 'Not yet connected', tone: 'neutral' };
    return Date.now() - telemetry.lastPingTimestamp < 3 * 60 * 1000
      ? { label: 'Online', tone: 'emerald' }
      : { label: 'Offline', tone: 'rose' };
  };

  return (
    <div className="product-view companies-view client-subscriptions-view" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <header className="subscriptions-page-heading">
        <div>
          <span>CLIENTS &amp; SUBSCRIPTIONS</span>
          <h1>Client Subscriptions <b>{users.length} Clients</b></h1>
          <p>Manage company access, workspace allocation, renewals and remote Tally sign-in.</p>
        </div>
        {subscriptionMetrics.unreachable > 0 && (
          <div className="subscriptions-node-alert"><Server size={19} /><div><strong>{subscriptionMetrics.unreachable} VPS node{subscriptionMetrics.unreachable === 1 ? '' : 's'} offline</strong><small>Unreachable nodes: {servers.filter(server => getServerConnectivity(server).label !== 'Online').map(server => server.name || server.ipPort).join(', ')}</small></div><button type="button" className="btn btn-secondary btn-xs" onClick={onOpenOfflineVpsModal}>View details <ExternalLink size={12} /></button></div>
        )}
      </header>

      <section className="subscriptions-kpi-grid" aria-label="Subscription summary">
        <div className="subscriptions-kpi"><span className="subscriptions-kpi-icon blue"><Users size={20} /></span><div><strong>{users.length}</strong><label>Total Clients</label><small>{users.length ? 'Current subscriptions' : 'No subscriptions configured'}</small></div></div>
        <div className="subscriptions-kpi"><span className="subscriptions-kpi-icon green"><Check size={20} /></span><div><strong>{subscriptionMetrics.active}</strong><label>Active Subscriptions</label><small>{users.length ? `${Math.round((subscriptionMetrics.active / users.length) * 100)}% of total` : 'No data yet'}</small></div></div>
        <div className="subscriptions-kpi"><span className="subscriptions-kpi-icon red"><Server size={20} /></span><div><strong>{subscriptionMetrics.unreachable}</strong><label>Unreachable Nodes</label><small>{subscriptionMetrics.unreachable ? 'Needs attention' : 'No nodes offline'}</small></div></div>
        <div className="subscriptions-kpi"><span className="subscriptions-kpi-icon amber"><Clock size={20} /></span><div><strong>{subscriptionMetrics.expiring}</strong><label>Expiring in 30 Days</label><small>{subscriptionMetrics.expiring ? 'Review renewals' : 'No renewals due'}</small></div></div>
      </section>
      {/* Single compact control bar — page title belongs above, not duplicated here. */}
      <section className="surface-card subscriptions-toolbar">
        <div className="subscriptions-toolbar-actions">
            {canExport && (
              <>
                <button
                  onClick={() => exportExpiringUsersCSV(users, servers)}
                  className="btn btn-secondary btn-sm"
                  style={{ color: 'var(--accent-amber)' }}
                >
                  <Download size={13} /> Expiring CSV
                </button>

                <button
                  onClick={onOpenBulkSharedImport || onOpenImportStatusModal}
                  className="btn btn-secondary btn-sm"
                  style={{ color: 'var(--accent-purple)' }}
                >
                  <Upload size={13} /> Import Excel
                </button>

                <button
                  onClick={() => exportServerUserExcel(servers, users, 'ALL')}
                  className="btn btn-secondary btn-sm"
                  style={{ color: 'var(--accent-sky)' }}
                >
                  <FileSpreadsheet size={13} /> Excel
                </button>

                <button
                  onClick={downloadVpsSubscriptionTemplate}
                  className="btn btn-secondary btn-sm"
                  title="Download the simple VPS subscription upload template"
                >
                  <Download size={13} /> Download import template
                </button>

              </>
            )}

            {canAddClient && !isSalesperson && (
              <button
                onClick={onAddUser}
                className="btn btn-primary btn-sm"
              >
                <Plus size={13} /> Add Tally company
              </button>
            )}
        </div>

        <div className="subscriptions-toolbar-filters">
          <div className="subscriptions-search">
            <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search company, user, workspace..."
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
              className="input"
              style={{ paddingLeft: '30px' }}
            />
          </div>

          <select
            value={serverFilter}
            onChange={e => { setServerFilter(e.target.value); setCurrentPage(1); }}
            className="select subscriptions-select subscriptions-select-node"
          >
            <option value="ALL">All VPS Nodes ({servers.length})</option>
            {servers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="select subscriptions-select"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="EXPIRING_10_15">Expiring (10–15d)</option>
            <option value="URGENT">Urgent (&lt;10d)</option>
            <option value="EXPIRED">Expired</option>
          </select>

          <select
            value={allocationFilter}
            onChange={e => { setAllocationFilter(e.target.value); setCurrentPage(1); }}
            className="select subscriptions-select"
          >
            <option value="ALL">All Types</option>
            <option value="SHARED">Shared Only</option>
            <option value="DEDICATED">Dedicated Only</option>
          </select>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="select subscriptions-select subscriptions-select-sort"
          >
            <option value="EXPIRY_ASC">Sort: Expiry (Asc)</option>
            <option value="EXPIRY_DESC">Sort: Expiry (Desc)</option>
            <option value="COMPANY_ASC">Sort: Company (A-Z)</option>
          </select>
        </div>
      </section>

      {/* Bulk Action Toolbar */}
      {selectedUserIds.length > 0 && (
        <div style={{
          backgroundColor: 'var(--primary-subtle)',
          border: '1px solid var(--primary-border)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          animation: 'fadeIn 0.15s ease-out'
        }}>
          <div style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '13px' }}>
            ⚡ {selectedUserIds.length} User(s) Selected
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {canRenewClient && (
              <button
                onClick={() => onBulkRenew(selectedUserIds)}
                className="btn btn-secondary btn-xs"
                style={{ color: 'var(--accent-sky)', borderColor: 'var(--accent-sky-border)' }}
              >
                <RefreshCw size={12} /> Bulk Renew (+1 Yr)
              </button>
            )}
            {canDeleteClient && (
              <button
                onClick={() => {
                  onBulkDelete(selectedUserIds);
                  setSelectedUserIds([]);
                }}
                className="btn btn-danger btn-xs"
              >
                <Trash2 size={12} /> Delete Selected
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main High-Density Users Data Table */}
      <div className="table-wrapper" style={{ minHeight: '260px' }}>
        <div className="table-container" style={{ minHeight: '220px' }}>
          <table className="table-modern">
            <thead>
              <tr>
                <th style={{ width: '36px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    aria-label="Select all clients on this page"
                    checked={paginatedUsers.length > 0 && selectedUserIds.length === paginatedUsers.length}
                    onChange={handleSelectAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th>Client User &amp; Keys</th>
                <th>Company</th>
                <th>VPS &amp; Drive</th>
                <th>Status</th>
                <th>VPS Status</th>
                <th>Expiry</th>
                <th>Sales Rep</th>
                <th style={{ textAlign: 'right' }}>Remote Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
                    No client subscriptions matching the filters found.
                  </td>
                </tr>
              ) : (
                paginatedUsers.map(user => {
                  const server = servers.find(s => s.id === user.serverId);
                  const daysRemaining = getDaysRemaining(user.expiryDate);
                  const cat = getExpiryCategory(user.expiryDate);
                  const isDedicated = user.clientType === 'Dedicated';
                  const isChecked = selectedSet.has(user.id);
                  const connectivity = getServerConnectivity(server);

                  const waMessage = encodeURIComponent(
                    `Hello ${user.company},\n\nYour VPS Cloud Subscription (${server ? server.name : 'VPS'}) expires on ${user.expiryDate} (${daysRemaining} days remaining).\n\nThank you,\nInnovation Web Works Operations`
                  );

                  return (
                    <tr
                      key={user.id}
                      style={{
                        backgroundColor: isChecked ? 'rgba(59, 130, 246, 0.08)' : undefined
                      }}
                    >
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelectUser(user.id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>

                      {/* User & Passwords */}
                      <td>
                        <div className="font-mono" style={{ fontWeight: '700', color: 'var(--text-primary)', marginBottom: '3px' }}>
                          {user.username}
                        </div>
                        {isSuperAdmin ? (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              title="Reveal and copy user password (audited)"
                              onClick={() => revealAndCopy(() => revealClientPassword(authFetch, API_BASE, user.id), `user-${user.id}`)}
                              className="btn btn-ghost btn-xs"
                              style={{ padding: '2px 5px', fontSize: '10px', color: 'var(--accent-emerald)', height: '18px' }}
                            >
                              {copiedKey === `user-${user.id}` ? <Check size={10} /> : <Key size={10} />}
                              Reveal User Pass
                            </button>

                            {server && (
                              <button
                                type="button"
                                title="Reveal and copy super admin password (audited)"
                                onClick={() => revealAndCopy(() => revealServerPassword(authFetch, API_BASE, server.id), `super-${user.id}`)}
                                className="btn btn-ghost btn-xs"
                                style={{ padding: '2px 5px', fontSize: '10px', color: 'var(--accent-amber)', height: '18px' }}
                              >
                                {copiedKey === `super-${user.id}` ? <Check size={10} /> : <Shield size={10} />}
                                Reveal Super Pass
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="font-mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }} title="Passwords are visible to Super Admin only">
                            Password: {MASKED_PASSWORD_TEXT}
                          </div>
                        )}
                      </td>

                      {/* Company Name */}
                      <td>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{user.company}</div>
                        {user.customerEmail && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '1px' }}>
                            <Mail size={10} /> {user.customerEmail}
                          </div>
                        )}
                      </td>

                      {/* VPS & Drive */}
                      <td>
                        <div style={{ fontWeight: '600', color: 'var(--primary)' }}>
                          {server ? server.name : 'VPS Node'}
                        </div>
                        <div style={{ display: 'flex', gap: '4px', marginTop: '2px', flexWrap: 'wrap' }}>
                          <span className={`badge ${isDedicated ? 'badge-purple' : 'badge-blue'}`} style={{ fontSize: '9.5px', padding: '1px 4px' }}>
                            {isDedicated ? 'Dedicated' : 'Shared'}
                          </span>
                          <span className="badge badge-drive" style={{ fontSize: '9.5px', padding: '1px 4px' }}>
                            {user.drive}
                          </span>
                          {user.tallyVersion && (
                            <span className="badge badge-amber" style={{ fontSize: '9.5px', padding: '1px 4px' }} title={`Tally Version: ${user.tallyVersion}`}>
                              ⚡ {user.tallyVersion}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td>
                        {(user.status === 'Disabled' || user.status === 'DISABLED' || user.status === 'Suspended' || user.isDisabled) ? (
                          <span className="badge badge-rose" style={{ fontWeight: '800' }}>
                            🔒 LOCKED
                          </span>
                        ) : (
                          <>
                            {cat === 'EXPIRED' && (
                              <span className="badge badge-rose">
                                Expired ({Math.abs(daysRemaining)}d ago)
                              </span>
                            )}
                            {cat === 'URGENT' && (
                              <span className="badge badge-rose">
                                Urgent ({daysRemaining}d)
                              </span>
                            )}
                            {cat === 'EXPIRING_SOON' && (
                              <span className="badge badge-amber">
                                Expiring ({daysRemaining}d)
                              </span>
                            )}
                            {cat === 'ACTIVE' && (
                              <span className="badge badge-emerald">
                                Active ({daysRemaining}d)
                              </span>
                            )}
                          </>
                        )}
                      </td>

                      <td>
                        <span className={`badge badge-${connectivity.tone}`} style={{ whiteSpace: 'nowrap' }}>
                          <i className="subscription-status-dot" /> {connectivity.label}
                        </span>
                      </td>

                      {/* Expiry Date */}
                      <td className="font-mono" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                        {user.expiryDate}
                      </td>

                      {/* Sales Rep */}
                      <td style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                        {user.salesAgent || 'Direct'}
                      </td>

                      {/* Remote Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                          {/* User Login */}
                          <button
                            onClick={() => onDirectRemoteConnect(user, 'USER')}
                            className="btn btn-success btn-xs"
                            title="1-Click Direct User Remote Login"
                            aria-label={`Remote login as user ${user.username}`}
                          >
                            <Zap size={10} /> User
                          </button>

                          {/* Super Login */}
                          <button
                            onClick={() => onDirectRemoteConnect(user, 'SUPERCLIENT')}
                            className="btn btn-warning btn-xs"
                            title="1-Click Superclient Remote Login"
                            aria-label={`Remote login as superclient for ${user.company}`}
                          >
                            <Shield size={10} /> Super
                          </button>

                          {/* Quick Delete / Remove Button */}
                          {canDeleteClient && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to delete client subscription "${user.company}" (${user.username})?`)) {
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
                                id: 'profile',
                                label: 'View Profile',
                                icon: Eye,
                                onClick: () => onViewUserProfile(user)
                              },
                              canEditClient && {
                                id: 'edit',
                                label: 'Edit Client Specs',
                                icon: Edit2,
                                onClick: () => onEditUser(user)
                              },
                              canEditClient && {
                                id: 'password',
                                label: 'Change VPS Password',
                                icon: Key,
                                onClick: () => onChangePassword && onChangePassword(user)
                              },
                              canEditClient && {
                                id: 'migrate',
                                label: 'Migrate to Other VPS',
                                icon: FolderSync,
                                onClick: () => setMigratingUser(user)
                              },
                              canEditClient && {
                                id: 'status',
                                label: (user.status === 'Disabled' || user.status === 'DISABLED' || user.status === 'Suspended' || user.isDisabled)
                                  ? 'Unlock Account'
                                  : 'Lock / Disable Account',
                                icon: (user.status === 'Disabled' || user.status === 'DISABLED' || user.status === 'Suspended' || user.isDisabled) ? Unlock : Lock,
                                onClick: () => {
                                  const isDis = user.status === 'Disabled' || user.status === 'DISABLED' || user.status === 'Suspended' || user.isDisabled;
                                  onToggleUserStatus && onToggleUserStatus(user, isDis ? 'Active' : 'Disabled');
                                }
                              },
                              { divider: true },
                              {
                                id: 'ticket',
                                label: 'Raise Support Ticket',
                                icon: Ticket,
                                onClick: () => onRaiseTicket && onRaiseTicket(user)
                              },
                              {
                                id: 'whatsapp',
                                label: 'WhatsApp Reminder',
                                icon: MessageCircle,
                                onClick: () => window.open(`https://wa.me/?text=${waMessage}`, '_blank')
                              },
                              canRenewClient && {
                                id: 'renew',
                                label: 'Extend +1 Year',
                                icon: RefreshCw,
                                onClick: () => onRenewUser(user.id)
                              },
                              canDeleteClient && { divider: true },
                              canDeleteClient && {
                                id: 'delete',
                                label: 'Delete Subscription',
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

        {/* Pagination Footer */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          fontSize: '11.5px',
          color: 'var(--text-muted)'
        }}>
          <div>
            Showing <strong style={{ color: 'var(--text-primary)' }}>{filteredUsers.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</strong> to <strong style={{ color: 'var(--text-primary)' }}>{Math.min(currentPage * itemsPerPage, filteredUsers.length)}</strong> of <strong style={{ color: 'var(--text-primary)' }}>{filteredUsers.length}</strong> subscriptions
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="btn btn-secondary btn-xs"
            >
              <ChevronLeft size={13} />
            </button>

            <span className="font-mono">Page {currentPage} of {totalPages || 1}</span>

            <button
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="btn btn-secondary btn-xs"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {migratingUser && (
        <MigrateClientModal
          isOpen={!!migratingUser}
          client={migratingUser}
          servers={servers}
          onClose={() => setMigratingUser(null)}
          onMigrationSuccess={() => {
            setMigratingUser(null);
          }}
        />
      )}
    </div>
  );
}

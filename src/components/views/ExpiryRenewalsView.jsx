import React, { useState, useMemo } from 'react';
import {
  Clock,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Download,
  Upload,
  MessageCircle,
  Zap,
  Search,
  Check
} from 'lucide-react';
import { getDaysRemaining, getExpiryCategory } from '../UserTable';

const EMPTY_ARRAY = [];

export default function ExpiryRenewalsView({
  users = EMPTY_ARRAY,
  servers = EMPTY_ARRAY,
  currentUser,
  employeePermissions,
  onRenewUser,
  onBulkRenew,
  onDirectRemoteConnect,
  onOpenImportStatusModal,
  exportExpiringUsersCSV
}) {
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  const isSuperAdmin = currentUser && currentUser.role === 'SUPER_ADMIN';
  const canRenew = isSuperAdmin || (employeePermissions && employeePermissions.canRenewClient);
  const canExport = isSuperAdmin || (employeePermissions && employeePermissions.canExport);

  // Grouped users
  const expiredList = users.filter(u => getDaysRemaining(u.expiryDate) < 0);
  const urgentList = users.filter(u => {
    const d = getDaysRemaining(u.expiryDate);
    return d >= 0 && d < 10;
  });
  const expiringSoonList = users.filter(u => {
    const d = getDaysRemaining(u.expiryDate);
    return d >= 10 && d <= 15;
  });
  const activeList = users.filter(u => getDaysRemaining(u.expiryDate) > 15);

  const getFilteredList = () => {
    let list = [];
    if (activeCategory === 'EXPIRED') list = expiredList;
    else if (activeCategory === 'URGENT') list = urgentList;
    else if (activeCategory === 'EXPIRING_SOON') list = expiringSoonList;
    else if (activeCategory === 'ACTIVE') list = activeList;
    else list = users;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        (u.company || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.drive || '').toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  };

  const displayList = getFilteredList();

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(displayList.map(u => u.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggle = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  return (
    <div className="product-view renewals-view" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Header */}
      <div className="surface-card" style={{
        padding: '14px 18px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={18} color="var(--accent-amber)" /> Renewal desk
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
            Keep Tally workspace access active with clear renewal queues and reminders.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          {canExport && (
            <>
              <button
                onClick={() => exportExpiringUsersCSV(users, servers)}
                className="btn btn-secondary btn-sm"
                style={{ color: 'var(--accent-amber)' }}
              >
                <Download size={13} /> Export CSV
              </button>

              <button
                onClick={onOpenImportStatusModal}
                className="btn btn-secondary btn-sm"
                style={{ color: 'var(--accent-purple)' }}
              >
                <Upload size={13} /> Import Status CSV
              </button>
            </>
          )}
        </div>
      </div>

      {/* 4 Categorized Bento Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px'
      }}>
        {/* Expired */}
        <div
          onClick={() => setActiveCategory('EXPIRED')}
          className="surface-card"
          style={{
            backgroundColor: activeCategory === 'EXPIRED' ? 'var(--accent-rose-bg)' : 'var(--bg-surface)',
            border: activeCategory === 'EXPIRED' ? '1px solid var(--accent-rose)' : '1px solid var(--border-default)',
            borderLeft: '3px solid var(--accent-rose)',
            padding: '14px 16px',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-rose)', textTransform: 'uppercase' }}>🔴 EXPIRED</span>
            <AlertCircle size={15} color="var(--accent-rose)" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)', margin: '4px 0 2px 0', lineHeight: 1.1 }}>
            {expiredList.length}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Accounts terminated</div>
        </div>

        {/* Urgent (<10 Days) */}
        <div
          onClick={() => setActiveCategory('URGENT')}
          className="surface-card"
          style={{
            backgroundColor: activeCategory === 'URGENT' ? 'var(--accent-rose-bg)' : 'var(--bg-surface)',
            border: activeCategory === 'URGENT' ? '1px solid var(--accent-rose)' : '1px solid var(--border-default)',
            borderLeft: '3px solid var(--accent-rose)',
            padding: '14px 16px',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-rose)', textTransform: 'uppercase' }}>🟠 URGENT (&lt;10d)</span>
            <AlertTriangle size={15} color="var(--accent-rose)" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)', margin: '4px 0 2px 0', lineHeight: 1.1 }}>
            {urgentList.length}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Expiring this week</div>
        </div>

        {/* Expiring Soon (10-15 Days) */}
        <div
          onClick={() => setActiveCategory('EXPIRING_SOON')}
          className="surface-card"
          style={{
            backgroundColor: activeCategory === 'EXPIRING_SOON' ? 'var(--accent-amber-bg)' : 'var(--bg-surface)',
            border: activeCategory === 'EXPIRING_SOON' ? '1px solid var(--accent-amber)' : '1px solid var(--border-default)',
            borderLeft: '3px solid var(--accent-amber)',
            padding: '14px 16px',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-amber)', textTransform: 'uppercase' }}>🟡 EXPIRING SOON</span>
            <Clock size={15} color="var(--accent-amber)" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)', margin: '4px 0 2px 0', lineHeight: 1.1 }}>
            {expiringSoonList.length}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>10–15 Days Remaining</div>
        </div>

        {/* Active (>15 Days) */}
        <div
          onClick={() => setActiveCategory('ACTIVE')}
          className="surface-card"
          style={{
            backgroundColor: activeCategory === 'ACTIVE' ? 'var(--accent-emerald-bg)' : 'var(--bg-surface)',
            border: activeCategory === 'ACTIVE' ? '1px solid var(--accent-emerald)' : '1px solid var(--border-default)',
            borderLeft: '3px solid var(--accent-emerald)',
            padding: '14px 16px',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-emerald)', textTransform: 'uppercase' }}>🟢 ACTIVE</span>
            <CheckCircle2 size={15} color="var(--accent-emerald)" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)', margin: '4px 0 2px 0', lineHeight: 1.1 }}>
            {activeList.length}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Long-term validity</div>
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedIds.length > 0 && (
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
            ⚡ {selectedIds.length} User(s) Selected for Renewal
          </div>
          {canRenew && (
            <button
              onClick={() => {
                onBulkRenew(selectedIds);
                setSelectedIds([]);
              }}
              className="btn btn-primary btn-xs"
            >
              <RefreshCw size={12} /> Bulk Extend +1 Year
            </button>
          )}
        </div>
      )}

      {/* Search & Filter Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '400px' }}>
          <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search subscriptions by company, username, drive..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input"
            style={{ height: '34px', paddingLeft: '32px', fontSize: '12px', width: '100%' }}
          />
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Showing <strong>{displayList.length}</strong> subscription{displayList.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Renewal Queue Data Table */}
      <div className="table-wrapper">
        <div className="table-container">
          <table className="table-modern">
            <thead>
              <tr>
                <th style={{ width: '36px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    aria-label="Select all renewal queue subscriptions"
                    checked={displayList.length > 0 && selectedIds.length === displayList.length}
                    onChange={handleSelectAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th>Company Name &amp; User</th>
                <th>Assigned VPS Node</th>
                <th>Expiry Date</th>
                <th>Status Indicator</th>
                <th style={{ textAlign: 'right' }}>Renewal Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayList.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    No subscriptions found in this category.
                  </td>
                </tr>
              ) : (
                displayList.map(user => {
                  const server = servers.find(s => s.id === user.serverId);
                  const days = getDaysRemaining(user.expiryDate);
                  const cat = getExpiryCategory(user.expiryDate);
                  const isChecked = selectedSet.has(user.id);

                  const waMessage = encodeURIComponent(
                    `Hello ${user.company},\n\nYour VPS Cloud Subscription (${server ? server.name : 'VPS'}) expires on ${user.expiryDate} (${days} days remaining).\n\nThank you,\nInnovation Web Works Operations`
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
                          onChange={() => handleToggle(user.id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>

                      <td>
                        <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{user.company}</div>
                        <div className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                          User ID: {user.username}
                        </div>
                      </td>

                      <td>
                        <div style={{ fontWeight: '600', color: 'var(--accent-sky)' }}>{server ? server.name : 'VPS'}</div>
                        <span className="badge badge-drive" style={{ fontSize: '9.5px', marginTop: '2px' }}>{user.drive}</span>
                      </td>

                      <td className="font-mono" style={{ fontWeight: '600', color: 'var(--text-secondary)', fontSize: '11.5px' }}>
                        {user.expiryDate}
                      </td>

                      <td>
                        {cat === 'EXPIRED' && (
                          <span className="badge badge-rose">
                            ● Expired ({Math.abs(days)}d ago)
                          </span>
                        )}
                        {cat === 'URGENT' && (
                          <span className="badge badge-rose">
                            ● Urgent ({days}d left)
                          </span>
                        )}
                        {cat === 'EXPIRING_SOON' && (
                          <span className="badge badge-amber">
                            ● Expiring ({days}d left)
                          </span>
                        )}
                        {cat === 'ACTIVE' && (
                          <span className="badge badge-emerald">
                            ● Active ({days}d left)
                          </span>
                        )}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '5px' }}>
                          <a
                            href={`https://wa.me/?text=${waMessage}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary btn-xs"
                            style={{ color: '#25D366' }}
                            title="Send WhatsApp Notification"
                          >
                            <MessageCircle size={11} /> WhatsApp
                          </a>

                          {canRenew && (
                            <button
                              onClick={() => onRenewUser(user.id)}
                              className="btn btn-primary btn-xs"
                              title="Extend subscription by 1 year"
                            >
                              <RefreshCw size={11} /> Extend +1 Yr
                            </button>
                          )}
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

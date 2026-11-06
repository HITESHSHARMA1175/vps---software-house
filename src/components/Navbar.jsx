import React from 'react';
import { UserPlus, Bell, Mail, Plus, Sparkles, Database, History, LogOut, ShieldCheck, Settings, Inbox, Send, Briefcase, Users, RefreshCw, Layers } from 'lucide-react';

export default function Navbar({
  currentUser,
  employeePermissions,
  expiringCount,
  pendingRequestsCount = 0,
  pendingRenewalsCount = 0,
  onOpenAlerts,
  onOpenMasterMail,
  onOpenAddServer,
  onOpenAddUser,
  onOpenQuickOnboard,
  onOpenBackup,
  onOpenAuditLogs,
  onOpenPermissions,
  onOpenSalespersonRequest,
  onOpenPendingRequests,
  onOpenPendingRenewals,
  onOpenPortalUsers,
  onLogout
}) {
  const isSuperAdmin = currentUser && currentUser.role === 'SUPER_ADMIN';
  const isSalesperson = currentUser && currentUser.role === 'SALESPERSON';

  // Check permissions for employee or admin
  const canAddClient = isSuperAdmin || (employeePermissions && employeePermissions.canAddClient);
  const canEditServer = isSuperAdmin || (employeePermissions && employeePermissions.canEditServer);

  return (
    <header className="navbar" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.75rem 1.5rem',
      backgroundColor: 'rgba(11, 15, 25, 0.95)',
      backdropFilter: 'blur(16px)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      marginBottom: '1.5rem',
      borderRadius: '16px'
    }}>
      {/* Brand Info */}
      <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ height: '54px', padding: '2px', display: 'flex', alignItems: 'center' }}>
          <img
            src="/logo.png"
            alt="Innovation Web Works Official Logo"
            style={{ height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(56, 189, 248, 0.25))' }}
          />
        </div>
        <div>
          <h1 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#ffffff', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.2 }}>
            Innovation Web Works
          </h1>
          <p style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
            Infrastructure Operations Portal
          </p>
        </div>
      </div>

      {/* Nav Actions Group */}
      <div className="nav-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        {/* User Profile Pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: isSuperAdmin ? 'rgba(56, 189, 248, 0.1)' : (isSalesperson ? 'rgba(249, 115, 22, 0.1)' : 'rgba(168, 85, 247, 0.1)'),
          border: isSuperAdmin ? '1px solid rgba(56, 189, 248, 0.3)' : (isSalesperson ? '1px solid rgba(249, 115, 22, 0.3)' : '1px solid rgba(168, 85, 247, 0.3)'),
          padding: '0.35rem 0.75rem',
          borderRadius: '10px',
          marginRight: '0.25rem'
        }}>
          <ShieldCheck size={16} color={isSuperAdmin ? '#38bdf8' : (isSalesperson ? '#f97316' : '#c084fc')} />
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#ffffff', lineHeight: 1.1 }}>
              {currentUser ? currentUser.username : 'User'}
            </div>
            <div style={{ fontSize: '0.68rem', color: isSuperAdmin ? '#93c5fd' : (isSalesperson ? '#fdba74' : '#e9d5ff'), fontWeight: '700' }}>
              {isSuperAdmin ? '👑 Super Admin / HOD' : (isSalesperson ? '💼 Sales Rep' : '👤 Staff Employee')}
            </div>
          </div>
        </div>

        {/* HOD Pending Renewals Queue Badge */}
        {isSuperAdmin && (
          <button
            className="btn btn-secondary"
            style={{
              borderColor: pendingRenewalsCount > 0 ? '#f59e0b' : undefined,
              color: pendingRenewalsCount > 0 ? '#f59e0b' : undefined,
              fontSize: '0.8rem',
              padding: '0.45rem 0.8rem'
            }}
            onClick={onOpenPendingRenewals}
          >
            <RefreshCw size={15} />
            Renewals Queue
            {pendingRenewalsCount > 0 && (
              <span className="pulse-badge" style={{ backgroundColor: '#f59e0b' }}>
                {pendingRenewalsCount}
              </span>
            )}
          </button>
        )}

        {/* Salesperson Request */}
        {isSalesperson && (
          <button
            className="btn btn-primary"
            style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
            onClick={onOpenSalespersonRequest}
          >
            <Send size={15} />
            Request VPS User
          </button>
        )}

        {/* Pending Requests Queue Badge */}
        {!isSalesperson && (
          <button
            className="btn btn-secondary"
            style={{
              borderColor: pendingRequestsCount > 0 ? '#34d399' : undefined,
              color: pendingRequestsCount > 0 ? '#34d399' : undefined,
              fontSize: '0.8rem',
              padding: '0.45rem 0.8rem'
            }}
            onClick={onOpenPendingRequests}
          >
            <Inbox size={15} />
            Onboard Queue
            {pendingRequestsCount > 0 && (
              <span className="pulse-badge" style={{ backgroundColor: '#10b981' }}>
                {pendingRequestsCount}
              </span>
            )}
          </button>
        )}

        {/* Quick Onboard Primary Action */}
        {!isSalesperson && (
          <button
            className="btn btn-primary"
            style={{
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              fontSize: '0.82rem',
              padding: '0.45rem 0.9rem',
              fontWeight: '700'
            }}
            onClick={onOpenQuickOnboard}
          >
            <Sparkles size={15} />
            Quick Onboard
          </button>
        )}

        {canEditServer && !isSalesperson && (
          <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.45rem 0.8rem' }} onClick={onOpenAddServer}>
            <Plus size={15} />
            Add Server
          </button>
        )}

        {canAddClient && !isSalesperson && (
          <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.45rem 0.8rem' }} onClick={onOpenAddUser}>
            <UserPlus size={15} />
            Add Client
          </button>
        )}

        {!isSalesperson && (
          <button className="btn btn-warning btn-alert-pulse" style={{ fontSize: '0.8rem', padding: '0.45rem 0.8rem' }} onClick={onOpenAlerts}>
            <Bell size={15} />
            Alerts
            {expiringCount > 0 && (
              <span className="pulse-badge">{expiringCount}</span>
            )}
          </button>
        )}

        {!isSalesperson && (
          <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.45rem 0.8rem' }} onClick={onOpenMasterMail}>
            <Mail size={15} />
            Mail
          </button>
        )}

        {isSuperAdmin && (
          <button className="btn btn-secondary" style={{ color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)', fontSize: '0.8rem', padding: '0.45rem 0.8rem' }} onClick={onOpenPortalUsers} title="Manage Portal Users">
            <Users size={15} />
            Users
          </button>
        )}

        {isSuperAdmin && (
          <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.45rem 0.8rem' }} onClick={onOpenBackup} title="Backup & Restore Data">
            <Database size={15} />
            Backup
          </button>
        )}

        {isSuperAdmin && (
          <button className="btn btn-secondary" style={{ color: '#c084fc', borderColor: 'rgba(192, 132, 252, 0.3)', fontSize: '0.8rem', padding: '0.45rem 0.8rem' }} onClick={onOpenPermissions} title="HOD Employee Rights Manager">
            <Settings size={15} />
            Policy
          </button>
        )}

        {isSuperAdmin && (
          <button className="btn btn-secondary" style={{ color: '#34d399', borderColor: 'rgba(52, 211, 153, 0.3)', fontSize: '0.8rem', padding: '0.45rem 0.8rem' }} onClick={onOpenAuditLogs} title="View Audit Logs">
            <History size={15} />
            Logs
          </button>
        )}

        <button
          className="btn btn-danger"
          style={{ padding: '0.45rem 0.75rem', borderRadius: '8px' }}
          onClick={onLogout}
          title="Sign Out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}

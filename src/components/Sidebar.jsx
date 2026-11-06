import React from 'react';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Server,
  Network,
  Clock,
  Radio,
  History,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Ticket,
  Activity,
  UserMinus,
  HardDrive,
  Calendar,
  BarChart3,
  UserCog,
  Cpu,
  FolderSync,
  ScreenShare,
  ShieldCheck,
  ShieldAlert,
  X
} from 'lucide-react';

export default function Sidebar({
  activeTab,
  setActiveTab,
  collapsed,
  setCollapsed,
  currentUser,
  pendingRequestsCount = 0,
  pendingRenewalsCount = 0,
  expiringCount = 0,
  openTicketsCount = 0,
  disabledUsersCount = 0,
  storageAlertsCount = 0,
  duplicateEventsCount = 0,
  onOpenTwoFactorModal,
  onLogout,
  mobileMode = false,
  mobileOpen = false,
  onCloseMobileNav
}) {
  const isSuperAdmin = currentUser && (currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'ADMIN');
  const isCompact = collapsed && !mobileMode;

  const handleNavigation = (tabId) => {
    setActiveTab(tabId);
    if (mobileMode) onCloseMobileNav?.();
  };

  const navGroups = [
    {
      title: 'Overview',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }
      ]
    },
    {
      title: 'Clients & Subscriptions',
      items: [
        { id: 'users', label: 'Client Subscriptions', icon: Users },
        {
          id: 'renewals',
          label: 'Renewal Desk',
          icon: Clock,
          badge: expiringCount > 0 ? expiringCount : null,
          badgeVariant: 'amber'
        },
        {
          id: 'disabled-users',
          label: 'Blocked Accounts',
          icon: UserMinus,
          badge: disabledUsersCount > 0 ? disabledUsersCount : null,
          badgeVariant: 'rose'
        },
        { id: 'assignment', label: 'Workspace Allocation', icon: Network }
      ]
    },
    {
      title: 'Infrastructure',
      items: [
        { id: 'vps', label: 'Hosting Nodes', icon: Server },
        { id: 'hardware-specs', label: 'Node Specifications', icon: Cpu },
        { id: 'monitoring', label: 'Service Monitoring', icon: Activity },
        {
          id: 'storage',
          label: 'Workspace Storage',
          icon: HardDrive,
          badge: storageAlertsCount > 0 ? storageAlertsCount : null,
          badgeVariant: 'amber'
        },
        { id: 'server-users', label: 'Server Accounts', icon: UserCog }
      ]
    },
    {
      title: 'Activity & Gateway',
      items: [
        { id: 'sessions', label: 'Live Tally Users', icon: Radio },
        { id: 'daily-activity', label: 'Daily User Activity', icon: Calendar },
        {
          id: 'session-guard',
          label: 'Access Protection',
          icon: ShieldAlert,
          badge: duplicateEventsCount > 0 ? duplicateEventsCount : null,
          badgeVariant: 'rose'
        },
        { id: 'migration', label: 'Workspace Migration', icon: FolderSync },
        { id: 'remote-assist', label: 'Remote Support', icon: ScreenShare }
      ]
    },
    {
      title: 'Management & System',
      items: [
        {
          id: 'tickets',
          label: 'Support Desk',
          icon: Ticket,
          badge: openTicketsCount > 0 ? openTicketsCount : null,
          badgeVariant: 'blue'
        },
        { id: 'employees', label: 'Employees & Access', icon: UserCheck, adminOnly: true },
        { id: 'reports', label: 'VPS Reports & Graphs', icon: BarChart3 },
        { id: 'logs', label: 'Audit Trail', icon: History, adminOnly: true },
        { id: 'settings', label: 'System Settings', icon: Settings, adminOnly: true }
      ]
    }
  ];

  return (
    <aside
      id="operations-navigation"
      className={`sidebar${mobileMode && mobileOpen ? ' sidebar-mobile-open' : ''}`}
      role="navigation"
      aria-label="Portal Operations Navigation"
      aria-hidden={mobileMode && !mobileOpen ? true : undefined}
      style={{
        width: isCompact ? '68px' : '228px',
        height: '100vh',
        maxHeight: '100vh',
        backgroundColor: 'rgba(8, 11, 18, 0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        position: 'sticky',
        top: 0,
        alignSelf: 'flex-start',
        zIndex: 100,
        flexShrink: 0
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          padding: isCompact ? '12px 8px' : '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCompact ? 'center' : 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
          height: '56px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <img
              src="/logo.png"
              alt="Innovation Web Works"
              width="auto"
              onError={e => { e.currentTarget.style.display = 'none'; }}
              style={{
                height: '28px',
                objectFit: 'contain'
              }}
            />
            <span style={{
              position: 'absolute',
              bottom: '-2px',
              right: '-2px',
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: 'none'
            }} />
          </div>
          {!isCompact && (
            <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
              <div style={{ fontSize: '13px', fontWeight: '800', color: '#ffffff', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                INNOVATION <span style={{ fontSize: '9px', fontWeight: '800', padding: '1px 5px', borderRadius: '2px', background: '#b88a48', color: '#181511' }}>VPS</span>
              </div>
              <div style={{ fontSize: '10.5px', color: '#94a3b8', fontWeight: '500' }}>
                Fleet Operations Console
              </div>
            </div>
          )}
        </div>

        <button
          className="sidebar-collapse-toggle"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={isCompact ? 'Expand sidebar navigation' : 'Collapse sidebar navigation'}
          aria-expanded={!isCompact}
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '5px',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'var(--text-primary)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--text-muted)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
          }}
          title={isCompact ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCompact ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {mobileMode && (
          <button
            type="button"
            className="sidebar-mobile-close"
            onClick={onCloseMobileNav}
            aria-label="Close navigation menu"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Navigation List Organized by Functional Categories */}
      <div style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }}>
        {navGroups.map((group, groupIdx) => {
          const visibleItems = group.items.filter(item => !(item.adminOnly && !isSuperAdmin));
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: isCompact ? '4px' : '6px' }}>
              {!isCompact ? (
                <div style={{
                  fontSize: '11px',
                  fontWeight: '800',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  padding: groupIdx === 0 ? '2px 10px 4px' : '8px 10px 4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  {group.title}
                </div>
              ) : groupIdx > 0 ? (
                <div style={{
                  height: '1px',
                  backgroundColor: 'rgba(255, 255, 255, 0.07)',
                  margin: '4px 8px'
                }} />
              ) : null}

              {visibleItems.map(item => {
                const isActive = activeTab === item.id;
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigation(item.id)}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    className={isCompact ? "sidebar-btn-collapsed" : ""}
                    data-tooltip={isCompact ? `${item.label}${item.badge ? ` (${item.badge})` : ''}` : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: isCompact ? 'center' : 'space-between',
                      padding: isCompact ? '9px 0' : '9px 12px',
                      borderRadius: 'var(--radius-md)',
                      background: isActive ? 'linear-gradient(90deg, rgba(59, 130, 246, 0.18) 0%, rgba(99, 102, 241, 0.08) 100%)' : 'transparent',
                      color: isActive ? '#ffffff' : 'var(--text-secondary)',
                      border: '1px solid',
                      borderColor: isActive ? 'rgba(59, 130, 246, 0.35)' : 'transparent',
                      borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent',
                      boxShadow: isActive ? '0 0 16px -2px rgba(59, 130, 246, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)' : 'none',
                      cursor: 'pointer',
                      fontWeight: isActive ? '700' : '500',
                      fontSize: '12.5px',
                      width: '100%',
                      transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                      position: 'relative'
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.color = '#ffffff';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative' }}>
                      <Icon
                        size={16}
                        color={isActive ? '#60a5fa' : 'var(--text-muted)'}
                        style={isActive ? { filter: 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.5))' } : {}}
                      />
                      {!isCompact && <span>{item.label}</span>}
                      {isCompact && item.badge && (
                        <span
                          style={{
                            position: 'absolute',
                            top: '-3px',
                            right: '-4px',
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            backgroundColor: item.badgeVariant === 'rose' ? '#f43f5e' : (item.badgeVariant === 'amber' ? '#f59e0b' : '#3b82f6'),
                            boxShadow: '0 0 6px rgba(0, 0, 0, 0.6)'
                          }}
                        />
                      )}
                    </div>

                    {!isCompact && item.badge && (
                      <span
                        className={`badge badge-${item.badgeVariant || 'blue'}`}
                        style={{ fontSize: '10px', padding: '1px 6px', fontWeight: '800' }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer Profile & Sign Out */}
      <div
        style={{
          padding: '10px 12px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#0B1220',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: isCompact ? 'center' : 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: '#12365d',
                border: '1px solid rgba(96, 165, 250, 0.38)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#93c5fd',
                fontWeight: '700',
                fontSize: '12px',
                flexShrink: 0
              }}
            >
              {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'A'}
            </div>

            {!isCompact && (
              <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#f8fafc', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                  {currentUser?.name || 'Administrator'}
                </div>
                <div style={{ fontSize: '10.5px', color: '#94a3b8', fontWeight: '500' }}>
                  {currentUser?.role === 'SUPER_ADMIN' ? 'Super Admin' : (currentUser?.role === 'SALESPERSON' ? 'Sales Rep' : 'Staff Employee')}
                </div>
              </div>
            )}
          </div>

          {/* Quick 2FA Status & Trigger */}
          {onOpenTwoFactorModal && (
            <button
              onClick={onOpenTwoFactorModal}
              title={currentUser?.two_factor_enabled ? 'Google Authenticator 2FA: Active' : 'Enable Google Authenticator 2FA'}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '6px',
                color: currentUser?.two_factor_enabled ? '#10b981' : '#f59e0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease'
              }}
            >
              {currentUser?.two_factor_enabled ? (
                <ShieldCheck size={16} />
              ) : (
                <ShieldAlert size={16} />
              )}
            </button>
          )}
        </div>

        <button
          onClick={onLogout}
          aria-label="Sign Out"
          className="btn btn-secondary btn-sm"
          style={{
            width: '100%',
            justifyContent: isCompact ? 'center' : 'flex-start',
            color: '#dbeafe',
            backgroundColor: 'rgba(255, 255, 255, 0.055)',
            borderColor: 'rgba(148, 163, 184, 0.23)'
          }}
          title="Sign out of active session"
        >
          <LogOut size={13} />
          {!isCompact && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Plus,
  UserPlus,
  Sparkles,
  Bell,
  Mail,
  RefreshCw,
  Inbox,
  ShieldCheck,
  Send,
  SlidersHorizontal,
  Server,
  User,
  Shield,
  Zap,
  HardDrive,
  ArrowRight,
  X,
  Menu
} from 'lucide-react';
import { getDaysRemaining } from './UserTable';

export default function TopNavbar({
  searchTerm,
  setSearchTerm,
  servers = [],
  users = [],
  currentUser,
  employeePermissions,
  expiringCount = 0,
  pendingRequestsCount = 0,
  pendingRenewalsCount = 0,
  onOpenQuickOnboard,
  onOpenAddUser,
  onOpenAddServer,
  onOpenAlerts,
  onOpenMasterMail,
  onOpenPendingRequests,
  onOpenPendingRenewals,
  onOpenSalespersonRequest,
  onDirectRemoteConnect,
  onViewUserProfile,
  onNavigateToTab,
  isMobileNavOpen = false,
  onToggleMobileNav
}) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchContainerRef = useRef(null);
  const searchInputRef = useRef(null);

  const isSuperAdmin = currentUser && currentUser.role === 'SUPER_ADMIN';
  const isSalesperson = currentUser && currentUser.role === 'SALESPERSON';

  const canAddClient = isSuperAdmin || (employeePermissions && employeePermissions.canAddClient);
  const canEditServer = isSuperAdmin || (employeePermissions && employeePermissions.canEditServer);

  // Keyboard shortcut Ctrl+K / Cmd+K and Escape
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close search dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter servers & users dynamically
  const q = (searchTerm || '').trim().toLowerCase();

  const matchedServers = q
    ? servers.filter(s =>
        (s.ipPort || '').toLowerCase().includes(q) ||
        (s.name || '').toLowerCase().includes(q) ||
        (s.specs || '').toLowerCase().includes(q) ||
        (s.httpUrl || '').toLowerCase().includes(q) ||
        (s.httpsUrl || '').toLowerCase().includes(q)
      )
    : [];

  const matchedUsers = q
    ? users.filter(u =>
        (u.company || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.drive || '').toLowerCase().includes(q) ||
        (u.customerPhone || '').toLowerCase().includes(q) ||
        (u.customerEmail || '').toLowerCase().includes(q)
      )
    : [];

  const totalMatches = matchedServers.length + matchedUsers.length;

  const handleServerSuperLogin = (server) => {
    setIsSearchOpen(false);
    const dummyUser = {
      id: `srv-super-${server.id}`,
      serverId: server.id,
      company: server.name,
      username: server.superClientUser || 'Superclient',
      password: '', // never sent to the browser; SUPER_ADMIN reveals it on demand via the backend
      isServerAccount: true,
      drive: 'Master Node',
      expiryDate: '2099-12-31'
    };
    if (onDirectRemoteConnect) {
      onDirectRemoteConnect(dummyUser, 'SUPERCLIENT');
    }
  };

  const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
  const kbShortcut = isMac ? '⌘K' : 'Ctrl+K';

  return (
    <header
      className="top-navbar"
      role="banner"
      aria-label="Top Operations Navigation"
      style={{
        height: '56px',
        backgroundColor: 'rgba(8, 11, 18, 0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        position: 'sticky',
        top: 0,
        zIndex: 90
      }}
    >
      {onToggleMobileNav && (
        <button
          type="button"
          className="top-navbar-menu"
          onClick={onToggleMobileNav}
          aria-label={isMobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isMobileNavOpen}
          aria-controls="operations-navigation"
        >
          {isMobileNavOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      )}

      {/* Global Search Input with Rich Live Dropdown */}
      <div className="top-navbar-search" ref={searchContainerRef} style={{ position: 'relative', width: '100%', maxWidth: '460px' }}>
        <Search
          size={14}
          color={q ? "#38bdf8" : "#64748b"}
          style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', zIndex: 2, pointerEvents: 'none' }}
        />
        <input
          ref={searchInputRef}
          type="text"
          placeholder={`Search company, node, Tally user... (${kbShortcut})`}
          value={searchTerm}
          onChange={e => {
            setSearchTerm(e.target.value);
            setIsSearchOpen(true);
          }}
          onFocus={() => setIsSearchOpen(true)}
          aria-label="Search hosting nodes, Tally companies, users, and workspaces"
          className="input"
          style={{
            height: '34px',
            paddingLeft: '34px',
            paddingRight: '64px',
            fontSize: '12px',
            borderRadius: '9999px',
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            border: `1px solid ${isSearchOpen && q ? 'rgba(56, 189, 248, 0.5)' : 'rgba(255, 255, 255, 0.08)'}`,
            boxShadow: isSearchOpen && q ? '0 0 16px rgba(56, 189, 248, 0.2)' : 'none'
          }}
        />
        {/* Shortcut pill */}
        <div className="top-navbar-shortcut" style={{
          position: 'absolute',
          right: '10px',
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '10px',
          fontFamily: 'var(--font-mono)',
          color: '#94a3b8',
          backgroundColor: 'rgba(255, 255, 255, 0.06)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '2px 7px',
          borderRadius: '9999px',
          pointerEvents: 'none',
          fontWeight: '600'
        }}>
          {kbShortcut}
        </div>

        {/* Live Search Modal Popover */}
        {isSearchOpen && q && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              width: '100%',
              minWidth: 'min(460px, calc(100vw - 32px))',
              maxWidth: '92vw',
              backgroundColor: 'var(--bg-surface-raised)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-xl)',
              maxHeight: '440px',
              overflowY: 'auto',
              padding: '12px',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              animation: 'modalPop 0.15s ease-out'
            }}
          >
            {totalMatches === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <Search size={20} color="var(--text-muted)" style={{ opacity: 0.6 }} />
                <span>No VPS nodes or clients found matching <strong style={{ color: 'var(--text-primary)' }}>"{searchTerm}"</strong></span>
              </div>
            ) : (
              <>
                {/* 1. MATCHED VPS SERVER NODES & IP SEARCH */}
                {matchedServers.length > 0 && (
                  <div>
                    <div style={{
                      fontSize: '11px',
                      fontWeight: '700',
                      color: 'var(--accent-emerald)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      padding: '2px 4px 6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <Server size={13} /> VPS Server Nodes ({matchedServers.length})
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {matchedServers.map(server => (
                        <div
                          key={server.id}
                          style={{
                            backgroundColor: 'var(--bg-surface-inset)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-md)',
                            padding: '8px 12px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '10px',
                            transition: 'all 0.12s ease'
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '13px' }}>
                                {server.name}
                              </span>
                              <span className="badge badge-blue font-mono" style={{ fontSize: '10px', padding: '1px 5px' }}>
                                {server.ipPort.includes(':') ? server.ipPort : `${server.ipPort}:443`}
                              </span>
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              Specs: {server.specs || 'Standard Node'} • {server.serverType || 'Shared VPS'}
                            </div>
                          </div>

                          <button
                            onClick={() => handleServerSuperLogin(server)}
                            disabled={!isSuperAdmin}
                            className="btn btn-warning btn-xs"
                            title={isSuperAdmin ? `Direct Superclient Admin Login for ${server.ipPort}` : 'Super Admin only'}
                          >
                            <Shield size={11} /> Superclient
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. MATCHED CLIENTS / USERS */}
                {matchedUsers.length > 0 && (
                  <div>
                    <div style={{
                      fontSize: '11px',
                      fontWeight: '700',
                      color: 'var(--accent-sky)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      padding: '2px 4px 6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <User size={13} /> Clients & Subscriptions ({matchedUsers.length})
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {matchedUsers.slice(0, 6).map(user => {
                        const srv = servers.find(s => s.id === user.serverId);
                        const days = getDaysRemaining(user.expiryDate);

                        return (
                          <div
                            key={user.id}
                            style={{
                              backgroundColor: 'var(--bg-surface-inset)',
                              border: '1px solid var(--border-default)',
                              borderRadius: 'var(--radius-md)',
                              padding: '8px 12px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '10px'
                            }}
                          >
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '12.5px' }}>
                                  {user.company}
                                </span>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  ({user.username})
                                </span>
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Node: <strong style={{ color: 'var(--accent-sky)' }}>{srv ? srv.name : 'VPS'}</strong> • {user.drive} • Expiry: {user.expiryDate} ({days}d)
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: '5px' }}>
                              <button
                                onClick={() => {
                                  setIsSearchOpen(false);
                                  if (onViewUserProfile) onViewUserProfile(user);
                                }}
                                className="btn btn-secondary btn-xs"
                              >
                                Profile
                              </button>

                              <button
                                onClick={() => {
                                  setIsSearchOpen(false);
                                  if (onDirectRemoteConnect) onDirectRemoteConnect(user, 'USER');
                                }}
                                className="btn btn-success btn-xs"
                              >
                                <Zap size={11} /> Login
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons & Quick Triggers */}
      <div className="top-navbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Salesperson Request */}
        {isSalesperson && (
          <button
            className="btn btn-primary btn-sm nav-primary-action nav-sales-action"
            onClick={onOpenSalespersonRequest}
          >
            <Send size={13} /> Request VPS User
          </button>
        )}

        {/* Pending Requests Queue Badge */}
        {pendingRequestsCount > 0 && (
          <button
            className="btn btn-sm nav-utility-action"
            style={{
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              borderColor: 'rgba(56, 189, 248, 0.3)',
              color: 'var(--accent-sky)'
            }}
            onClick={onOpenPendingRequests}
            title="Pending Onboard Requests"
          >
            <Inbox size={13} />
            <span>Onboard</span>
            <span
              style={{
                backgroundColor: 'var(--accent-sky)',
                color: '#080b11',
                padding: '1px 6px',
                borderRadius: '999px',
                fontSize: '10px',
                fontWeight: '800'
              }}
            >
              {pendingRequestsCount}
            </span>
          </button>
        )}

        {/* Pending Renewals Queue Badge */}
        {pendingRenewalsCount > 0 && (
          <button
            className="btn btn-sm nav-utility-action"
            style={{
              backgroundColor: 'var(--accent-amber-bg)',
              borderColor: 'var(--accent-amber-border)',
              color: 'var(--accent-amber)'
            }}
            onClick={onOpenPendingRenewals}
            title="Pending Renewals"
          >
            <RefreshCw size={13} />
            <span>Renewals</span>
            <span
              style={{
                backgroundColor: 'var(--accent-amber)',
                color: '#080b11',
                padding: '1px 6px',
                borderRadius: '999px',
                fontSize: '10px',
                fontWeight: '800'
              }}
            >
              {pendingRenewalsCount}
            </span>
          </button>
        )}

        {/* Expiry Alerts Button - Ghost Pill */}
        <button
          className="btn btn-sm nav-utility-action"
          style={{
            backgroundColor: expiringCount > 0 ? 'var(--accent-rose-bg)' : 'transparent',
            borderColor: expiringCount > 0 ? 'var(--accent-rose-border)' : 'var(--border-default)',
            color: expiringCount > 0 ? 'var(--accent-rose)' : 'var(--text-secondary)'
          }}
          onClick={onOpenAlerts}
          aria-label={expiringCount > 0 ? `${expiringCount} expiring subscriptions — view alerts` : 'Subscription expiry alerts'}
          title="Subscription Expiry Alerts"
        >
          <Bell size={14} />
          {expiringCount > 0 && (
            <span
              style={{
                backgroundColor: 'var(--accent-rose)',
                color: '#ffffff',
                padding: '1px 6px',
                borderRadius: '999px',
                fontSize: '10px',
                fontWeight: '800'
              }}
            >
              {expiringCount}
            </span>
          )}
        </button>

        {/* Master Email Button - Ghost Icon Button */}
        <button
          className="btn btn-sm nav-utility-action"
          style={{
            backgroundColor: 'transparent',
            borderColor: 'var(--border-default)',
            color: 'var(--text-secondary)'
          }}
          onClick={onOpenMasterMail}
          title="Master Email Dispatch"
        >
          <Mail size={14} />
          <span style={{ fontSize: '12px' }}>Mail</span>
        </button>

        <div className="nav-utility-divider" role="separator" aria-orientation="vertical" style={{ height: '20px', width: '1px', backgroundColor: 'var(--border-default)', margin: '0 4px' }} />

        {/* Add Client Button (Secondary) */}
        {canAddClient && (
          <button
            className="btn btn-secondary btn-sm nav-secondary-action"
            onClick={onOpenAddUser}
          >
            <UserPlus size={13} /> Add Client
          </button>
        )}

        {/* Add Server Node Button (Secondary) */}
        {canEditServer && (
          <button
            className="btn btn-secondary btn-sm nav-secondary-action"
            onClick={onOpenAddServer}
          >
            <Plus size={13} /> Add VPS
          </button>
        )}

        {/* Quick Onboard CTA (Primary) */}
        {canAddClient && (
          <button
            className="btn btn-primary btn-sm nav-primary-action nav-quick-onboard"
            onClick={onOpenQuickOnboard}
            style={{ fontWeight: '700', boxShadow: '0 2px 10px rgba(59, 130, 246, 0.35)' }}
          >
            <Sparkles size={13} /> <span className="nav-primary-label">Quick Onboard</span>
          </button>
        )}
      </div>
    </header>
  );
}

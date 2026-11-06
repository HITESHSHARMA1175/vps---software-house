import React, { useState, useEffect, useMemo, useCallback } from 'react';
import LoginScreen from './components/LoginScreen';
import Sidebar from './components/Sidebar';
import TopNavbar from './components/TopNavbar';
import DashboardView from './components/views/DashboardView';
import UsersView from './components/views/UsersView';
import EmployeesView from './components/views/EmployeesView';
import VpsView from './components/views/VpsView';
import AssignmentView from './components/views/AssignmentView';
import ExpiryRenewalsView from './components/views/ExpiryRenewalsView';
import SessionsView from './components/views/SessionsView';
import ActivityLogsView from './components/views/ActivityLogsView';
import SettingsView from './components/views/SettingsView';
import TicketsView from './components/views/TicketsView';
import MonitoringView from './components/views/MonitoringView';
import DisabledUsersView from './components/views/DisabledUsersView';
import StorageHealthView from './components/views/StorageHealthView';
import DailyActivityView from './components/views/DailyActivityView';
import VpsReportsView from './components/views/VpsReportsView';
import ServerUsersView from './components/views/ServerUsersView';
import HardwareSpecsView from './components/views/HardwareSpecsView';
import MigrationHubView from './components/views/MigrationHubView';
import RemoteAssistView from './components/views/RemoteAssistView';
import SessionSecurityView from './components/views/SessionSecurityView';

import EmployeeModal from './components/EmployeeModal';
import ResetPasswordModal from './components/ResetPasswordModal';
import UserProfileModal from './components/UserProfileModal';
import ExpiryAlertModal from './components/ExpiryAlertModal';
import MasterMailModal from './components/MasterMailModal';
import AddServerModal from './components/AddServerModal';
import AddUserModal from './components/AddUserModal';
import EditServerModal from './components/EditServerModal';
import QuickOnboardModal from './components/QuickOnboardModal';
import ReceiptModal from './components/ReceiptModal';
import BackupModal from './components/BackupModal';
import ImportStatusModal from './components/ImportStatusModal';
import AuditLogModal from './components/AuditLogModal';
import PermissionManagerModal from './components/PermissionManagerModal';
import WebRemoteConsoleModal from './components/WebRemoteConsoleModal';
import SalespersonRequestModal from './components/SalespersonRequestModal';
import PendingRequestsModal from './components/PendingRequestsModal';
import PendingRenewalsModal from './components/PendingRenewalsModal';
import PortalUsersModal from './components/PortalUsersModal';
import TicketModal from './components/TicketModal';
import CustomerPortal from './components/CustomerPortal';
import InnovationLanding from './components/landing/InnovationLanding';
import OfflineVpsWarningModal from './components/OfflineVpsWarningModal';
import ChangeClientPasswordModal from './components/ChangeClientPasswordModal';
import TwoFactorSetupModal from './components/TwoFactorSetupModal';
import BulkSharedVpsImportModal from './components/BulkSharedVpsImportModal';

import { exportExpiringUsersCSV, exportServerUserExcel } from './utils/exportUtils';
import { getDaysRemaining } from './components/UserTable';
import { CheckCircle2, ShieldCheck, Loader2, AlertTriangle, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth, API_BASE } from './hooks/useAuth';
import { useToast } from './hooks/useToast';
import { useNavigation } from './hooks/useNavigation';
import { useServers } from './hooks/useServers';
import { useUsers } from './hooks/useUsers';

export default function App() {
  const [isPublicPortal, setIsPublicPortal] = useState(() => {
    const p = (window.location.pathname || '').toLowerCase();
    const q = (window.location.search || '').toLowerCase();
    return p.startsWith('/portal') || p.startsWith('/support') || q.includes('portal=1');
  });

  useEffect(() => {
    const handlePopState = () => {
      const p = (window.location.pathname || '').toLowerCase();
      const q = (window.location.search || '').toLowerCase();
      setIsPublicPortal(p.startsWith('/portal') || p.startsWith('/support') || q.includes('portal=1'));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const {
    currentUser,
    setCurrentUser,
    isAuthChecking,
    authFetch,
    login,
    logout,
    employeePermissions,
    setEmployeePermissions,
    salespersonPermissions,
    setSalespersonPermissions
  } = useAuth();

  const { showToast } = useToast();

  const {
    activeTab,
    setActiveTab,
    reportsTargetServerId,
    setReportsTargetServerId,
    serverUsersTargetServerId,
    setServerUsersTargetServerId,
    hardwareSpecsTargetServerId,
    navigateToReports,
    navigateToServerUsers,
    navigateToHardwareSpecs
  } = useNavigation();

  const {
    servers,
    setServers,
    telemetryData,
    setTelemetryData,
    hardwareHistory,
    fetchHardwareHistory,
    offlineServersList,
    refreshTelemetry,
    addServer,
    editServer,
    deleteServer,
    fetchTelemetry,
    forceLogoffSession
  } = useServers();

  const {
    users,
    setUsers,
    requests,
    setRequests,
    renewalRequests,
    setRenewalRequests,
    tickets,
    setTickets,
    employees,
    setEmployees,
    employeeSessions,
    setEmployeeSessions,
    auditLogs,
    setAuditLogs,
    addAuditLog,
    fetchAppData,
    expiringIn15DaysCount,
    pendingRequestsList,
    pendingRenewalsList,
    saveUser,
    bulkImportSharedUsers,
    deleteUser,
    renewUser,
    bulkRenewUsers,
    bulkDeleteUsers,
    toggleUserStatus,
    changeClientPassword
  } = useUsers();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
  });
  const [globalSearch, setGlobalSearch] = useState('');

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 900px)');
    const syncViewport = () => setIsMobileViewport(mediaQuery.matches);
    syncViewport();

    mediaQuery.addEventListener?.('change', syncViewport);
    return () => mediaQuery.removeEventListener?.('change', syncViewport);
  }, []);

  useEffect(() => {
    if (!isMobileViewport) {
      setIsMobileNavOpen(false);
    }
  }, [isMobileViewport]);

  useEffect(() => {
    if (!isMobileNavOpen) return undefined;

    const handleEscape = (event) => {
      if (event.key === 'Escape') setIsMobileNavOpen(false);
    };

    document.body.classList.add('mobile-nav-active');
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.classList.remove('mobile-nav-active');
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isMobileNavOpen]);

  // Modals
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [resetPasswordEmployee, setResetPasswordEmployee] = useState(null);
  const [profileUser, setProfileUser] = useState(null);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [isMasterMailModalOpen, setIsMasterMailModalOpen] = useState(false);
  const [isAddServerModalOpen, setIsAddServerModalOpen] = useState(false);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isQuickOnboardOpen, setIsQuickOnboardOpen] = useState(false);
  const [editingServer, setEditingServer] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [receiptUser, setReceiptUser] = useState(null);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isImportStatusModalOpen, setIsImportStatusModalOpen] = useState(false);
  const [isBulkSharedImportOpen, setIsBulkSharedImportOpen] = useState(false);
  const [isAuditLogModalOpen, setIsAuditLogModalOpen] = useState(false);
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const [isSalespersonRequestOpen, setIsSalespersonRequestOpen] = useState(false);
  const [isPendingRequestsOpen, setIsPendingRequestsOpen] = useState(false);
  const [isPendingRenewalsOpen, setIsPendingRenewalsOpen] = useState(false);
  const [isPortalUsersModalOpen, setIsPortalUsersModalOpen] = useState(false);
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticketInitialClient, setTicketInitialClient] = useState(null);
  const [isOfflineVpsModalOpen, setIsOfflineVpsModalOpen] = useState(false);
  const [isTwoFactorModalOpen, setIsTwoFactorModalOpen] = useState(false);
  const [hasShownOfflineModalThisSession, setHasShownOfflineModalThisSession] = useState(() => {
    return sessionStorage.getItem('offline_vps_warned') === '1';
  });

  // TSplus HTML5 Remote Desktop Modal State
  const [webRemoteUser, setWebRemoteUser] = useState(null);
  const [webRemoteLoginMode, setWebRemoteLoginMode] = useState('USER');
  const [passwordChangeClient, setPasswordChangeClient] = useState(null);
  const [duplicateEventsCount, setDuplicateEventsCount] = useState(0);

  // Poll duplicate login events count for Sidebar badge
  useEffect(() => {
    if (!currentUser) return;
    let isMounted = true;
    const fetchDupStats = async () => {
      try {
        const res = await authFetch(`${API_BASE}/duplicate-logins`);
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data?.stats) {
            setDuplicateEventsCount(data.stats.todayLoggedOff || 0);
          }
        }
      } catch (e) {}
    };
    fetchDupStats();
    const interval = setInterval(fetchDupStats, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentUser, authFetch]);



  // AUTO-POPUP CRITICAL WARNING ON LOGIN IF ANY VPS IS OFFLINE
  useEffect(() => {
    if (!currentUser || servers.length === 0) return;
    if (offlineServersList.length > 0 && !hasShownOfflineModalThisSession) {
      setIsOfflineVpsModalOpen(true);
      setHasShownOfflineModalThisSession(true);
      sessionStorage.setItem('offline_vps_warned', '1');
    }
  }, [currentUser, servers.length, offlineServersList.length, hasShownOfflineModalThisSession]);

  // Real Server-Side Logout Handler via HttpOnly Cookie Invalidation
  const handleLogout = async () => {
    setIsMobileNavOpen(false);
    await logout();
    setHasShownOfflineModalThisSession(false);
  };

  // Employee Management Handlers
  const handleSaveEmployee = async (empData) => {
    try {
      if (editingEmployee) {
        const res = await authFetch(`${API_BASE}/employees/${editingEmployee.id}`, {
          method: 'PUT',
          body: JSON.stringify(empData)
        });
        if (res.ok) {
          showToast(`Employee "${empData.name}" updated!`);
          await fetchAppData();
        }
      } else {
        const res = await authFetch(`${API_BASE}/employees`, {
          method: 'POST',
          body: JSON.stringify(empData)
        });
        if (res.ok) {
          showToast(`Employee "${empData.name}" created! 🎉`);
          await fetchAppData();
        }
      }
    } catch (e) {}
    setIsEmployeeModalOpen(false);
    setEditingEmployee(null);
  };

  const handleToggleEmployeeStatus = async (empId, newStatus) => {
    try {
      const res = await authFetch(`${API_BASE}/employees/${empId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        showToast(`Employee status updated to ${newStatus}!`);
        await fetchAppData();
      }
    } catch (e) {}
  };

  const handleResetEmployeePasswordSubmit = async (empId, newPassword) => {
    try {
      const res = await authFetch(`${API_BASE}/employees/${empId}/reset-password`, {
        method: 'PUT',
        body: JSON.stringify({ newPassword })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Password successfully reset! 🔒`);
        setResetPasswordEmployee(null);
        await fetchAppData();
      } else {
        showToast(data.error || 'Failed to reset password.', 'error');
      }
    } catch (e) {
      showToast('Network error while resetting password.', 'error');
    }
  };

  const handleDeleteEmployee = async (empId) => {
    if (window.confirm('Are you sure you want to permanently delete this employee account?')) {
      try {
        const res = await authFetch(`${API_BASE}/employees/${empId}`, {
          method: 'DELETE'
        });
        if (res.ok) {
          showToast(`Employee deleted.`);
          await fetchAppData();
        } else {
          showToast('Failed to delete employee.', 'error');
        }
      } catch (e) {
        showToast('Network error deleting employee.', 'error');
      }
    }
  };

  const handleResetEmployee2FA = async (empId) => {
    try {
      const res = await authFetch(`${API_BASE}/employees/${empId}/reset-2fa`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || '2FA has been reset successfully! 🛡️');
        await fetchAppData();
      } else {
        showToast(data.message || 'Failed to reset 2FA.', 'error');
      }
    } catch (e) {
      showToast('Network error resetting 2FA.', 'error');
    }
  };

  const handleTerminateEmployeeSession = async (sessId) => {
    try {
      const res = await authFetch(`${API_BASE}/sessions/${sessId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast(`Session ${sessId} terminated immediately.`);
        await fetchAppData();
      } else {
        showToast('Failed to terminate session.', 'error');
      }
    } catch (e) {
      showToast('Network error terminating session.', 'error');
    }
  };

  const salesAgentsList = employees.filter(e => e.role === 'SALESPERSON').map(e => e.name);

  // Remote password change push to VPS
  const handleChangeClientPasswordSubmit = async (userId, newPassword) => {
    return await changeClientPassword(userId, newPassword);
  };

  const handleClosePasswordChangeModal = useCallback(() => {
    setPasswordChangeClient(null);
  }, []);

  // Remote enable / disable toggle push to VPS
  const handleToggleUserStatus = async (user, requestedStatus) => {
    const isDisabling = (requestedStatus || '').toLowerCase() === 'disabled';
    const actionWord = isDisabling ? 'DISABLE & LOCK' : 'ENABLE & UNLOCK';
    if (!window.confirm(`Are you sure you want to ${actionWord} client "${user.company}" (${user.username}) on Windows VPS?`)) {
      return;
    }
    await toggleUserStatus(user, requestedStatus);
  };

  // Remote session logoff push to VPS
  const handleForceLogoffSession = async (serverId, sessionId, username) => {
    await forceLogoffSession(serverId, sessionId, username);
  };

  const handleNavigateToReports = (serverId) => {
    navigateToReports(serverId);
  };

  const handleNavigateToServerUsers = (serverId) => {
    navigateToServerUsers(serverId);
  };

  // Direct TSplus Remote Connection Launcher
  const handleDirectRemoteConnect = (user, loginMode = 'USER') => {
    setWebRemoteUser(user);
    setWebRemoteLoginMode(loginMode);
    addAuditLog('REMOTE_LOGIN', user.company, `Launched ${loginMode} Remote Desktop Console for ${user.username}`);
  };

  // Server Actions
  const handleAddServer = async (newServer) => {
    try {
      await addServer(newServer);
    } catch (e) {}
  };

  const handleEditServer = async (updatedServer) => {
    try {
      await editServer(updatedServer);
      setEditingServer(null);
    } catch (e) {}
  };

  const handleDeleteServer = async (serverId) => {
    const target = servers.find(s => s.id === serverId);
    if (window.confirm(`Are you sure you want to delete server "${target?.name}"?`)) {
      try {
        await deleteServer(serverId);
      } catch (e) {}
    }
  };

  // User Actions
  const handleSaveUser = async (userObj) => {
    try {
      await saveUser(userObj, !!(editingUser && editingUser.id));
      setIsAddUserModalOpen(false);
      setEditingUser(null);
    } catch (e) {}
  };

  const handleDeleteUser = async (userId) => {
    const target = users.find(u => u.id === userId);
    if (window.confirm(`Delete client "${target?.company}" (${target?.username})?`)) {
      try {
        await deleteUser(userId);
      } catch (e) {}
    }
  };

  const handleRenewUser = async (userId) => {
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return;
    const currentExp = new Date(targetUser.expiryDate);
    currentExp.setFullYear(currentExp.getFullYear() + 1);
    const requestedNewExpiry = currentExp.toISOString().split('T')[0];
    try {
      await renewUser(userId, requestedNewExpiry);
    } catch (e) {}
  };

  const handleBulkRenewUsers = async (userIds) => {
    await bulkRenewUsers(userIds);
  };

  const handleBulkDeleteUsers = async (userIds) => {
    if (window.confirm(`Are you sure you want to delete ${userIds.length} selected clients?`)) {
      await bulkDeleteUsers(userIds);
    }
  };

  const handleSelectDriveForNewUser = (serverId, emptyDriveName) => {
    const serverObj = servers.find(s => s.id === serverId);
    const isDedi = serverObj && serverObj.serverType === "Dedicated Server";

    setEditingUser({
      serverId,
      drive: emptyDriveName,
      clientType: isDedi ? 'Dedicated' : 'Shared',
      username: '',
      company: '',
      billDate: new Date().toISOString().split('T')[0],
      expiryDate: '2027-08-15',
      salesAgent: salesAgentsList[0] || 'Sales Representative - Rahul'
    });

    setIsAddUserModalOpen(true);
  };

  const handleSaveTicket = async (ticketObj) => {
    try {
      const res = await authFetch(`${API_BASE}/tickets`, {
        method: 'POST',
        body: JSON.stringify(ticketObj)
      });
      const data = await res.json();
      if (data.success && data.ticket) {
        setTickets(prev => [data.ticket, ...prev]);
        showToast(`Ticket ${data.ticket.id} created & auto-notification dispatched! 🎫`);
      }
      await fetchAppData();
    } catch (e) {}
    setIsTicketModalOpen(false);
    setTicketInitialClient(null);
  };

  const handleUpdateTicket = async (ticketId, updates) => {
    try {
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, ...updates } : t));
      if (updates.status === 'RESOLVED') {
        showToast(`Ticket ${ticketId} resolved & confirmation email sent! ✅`);
      } else {
        showToast(`Ticket ${ticketId} updated.`);
      }
      await authFetch(`${API_BASE}/tickets/${ticketId}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      await fetchAppData();
    } catch (e) {}
  };

  const handleDeleteTicket = async (ticketId) => {
    try {
      setTickets(prev => prev.filter(t => t.id !== ticketId));
      showToast(`Ticket ${ticketId} deleted.`);
      await authFetch(`${API_BASE}/tickets/${ticketId}`, {
        method: 'DELETE'
      });
      await fetchAppData();
    } catch (e) {}
  };

  const handleRestoreData = async (newServers, newUsers) => {
    setServers(newServers);
    setUsers(newUsers);
    showToast(`Database backup successfully restored! 💾`);
    addAuditLog('DATABASE_RESTORED', 'Master Database', `Restored ${newServers.length} servers and ${newUsers.length} clients from backup`);

    for (const s of newServers) {
      try {
        await authFetch(`${API_BASE}/servers`, {
          method: 'POST',
          body: JSON.stringify(s)
        });
      } catch (e) {}
    }
    for (const u of newUsers) {
      try {
        await authFetch(`${API_BASE}/users`, {
          method: 'POST',
          body: JSON.stringify(u)
        });
      } catch (e) {}
    }
    await fetchAppData();
  };

  const handleBulkApplyCSVUpdates = async (updatedList) => {
    const updatedUsers = users.map(existing => {
      const match = updatedList.find(u => u.id === existing.id);
      if (match) {
        return {
          ...existing,
          expiryDate: match.expiryDate || existing.expiryDate,
          company: match.company || existing.company
        };
      }
      return existing;
    });

    setUsers(updatedUsers);
    showToast(`CSV bulk updates applied successfully! 📁`);
    addAuditLog('CSV_BULK_UPDATE', 'Clients Database', `Imported status CSV updates for ${updatedList.length} clients`);
    setIsImportStatusModalOpen(false);

    for (const item of updatedList) {
      try {
        await authFetch(`${API_BASE}/users/${item.id}`, {
          method: 'PUT',
          body: JSON.stringify(item)
        });
      } catch (e) {}
    }
    await fetchAppData();
  };

  const storageAlertsCount = React.useMemo(() => {
    let count = 0;
    servers.forEach(s => {
      const sIpPure = s.ipPort ? s.ipPort.split(':')[0] : '';
      const tData = telemetryData[s.id] || telemetryData[s.ipPort] || telemetryData[s.name] || (sIpPure && telemetryData[sIpPure]) || null;
      if (tData && Array.isArray(tData.disks)) {
        tData.disks.forEach(d => {
          const drive = (d.driveLetter || d.drive || 'C:').toUpperCase().trim();
          const freeGB = parseFloat(d.freeGB) || 0;
          const totalGB = parseFloat(d.totalGB) || 0;
          const freePercent = totalGB > 0 ? (freeGB / totalGB) * 100 : 100;
          const isSystemDrive = (drive === 'C:' || drive === 'C');
          
          if (isSystemDrive) {
            if (freeGB < 5.0 && freePercent < 15) count++;
          } else {
            if (freeGB < 1.0 && freePercent < 15) count++;
          }
        });
      }
    });
    return count;
  }, [servers, telemetryData]);

  // If in Public Customer Portal mode
  if (isPublicPortal) {
    return (
      <CustomerPortal
        onSwitchToStaffLogin={() => {
          setIsPublicPortal(false);
          window.history.pushState({}, '', '/');
        }}
      />
    );
  }

  // If tab was previously authenticated, show sleek session restore
  if (isAuthChecking && sessionStorage.getItem('vps_tab_alive') === '1') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#070913', color: 'var(--text-muted)', fontSize: '13px' }}>
        <Loader2 className="animate-spin" size={22} style={{ marginRight: '10px', color: 'var(--accent-emerald)' }} />
        <span>Restoring active session...</span>
      </div>
    );
  }

  // If not logged in: Directly show LoginScreen (Landing page bypassed)
  if (!currentUser) {
    return (
      <LoginScreen
        onLoginSuccess={(employeeObj) => {
          login(employeeObj);
          setHasShownOfflineModalThisSession(false);
        }}
        onOpenCustomerPortal={() => {
          setIsPublicPortal(true);
          window.history.pushState({}, '', '/portal');
        }}
      />
    );
  }

  const totalDisabledAccountsCount = servers.flatMap(s => {
    const tData = telemetryData[s.id] || telemetryData[s.ipPort] || null;
    const agentDisabledNames = (tData && Array.isArray(tData.disabledServerUsers)) ? tData.disabledServerUsers : [];
    const subDisabled = users.filter(u => u.serverId === s.id && (u.status === 'Disabled' || u.status === 'Suspended' || u.status === 'Inactive' || u.status === 'Expired'));
    return [...agentDisabledNames, ...subDisabled];
  }).length;

  return (
    <div className="app-shell" style={{ display: 'flex', minHeight: '100vh', width: '100%', backgroundColor: 'transparent' }}>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      {/* 1. FIXED CLEAN SIDEBAR */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        currentUser={currentUser}
        pendingRequestsCount={pendingRequestsList.length}
        pendingRenewalsCount={pendingRenewalsList.length}
        expiringCount={expiringIn15DaysCount}
        openTicketsCount={tickets.filter(t => t.status === 'OPEN').length}
        disabledUsersCount={totalDisabledAccountsCount}
        storageAlertsCount={storageAlertsCount}
        duplicateEventsCount={duplicateEventsCount}
        onOpenTwoFactorModal={() => setIsTwoFactorModalOpen(true)}
        onLogout={handleLogout}
        mobileMode={isMobileViewport}
        mobileOpen={isMobileNavOpen}
        onCloseMobileNav={() => setIsMobileNavOpen(false)}
      />

      {isMobileNavOpen && (
        <button
          type="button"
          className="app-mobile-nav-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setIsMobileNavOpen(false)}
        />
      )}

      {/* 2. MAIN CONTENT AREA */}
      <div className="app-main-shell" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowX: 'hidden' }}>
        {/* Top Navbar with Global Search */}
        <TopNavbar
          searchTerm={globalSearch}
          setSearchTerm={setGlobalSearch}
          servers={servers}
          users={users}
          currentUser={currentUser}
          employeePermissions={employeePermissions}
          expiringCount={expiringIn15DaysCount}
          pendingRequestsCount={pendingRequestsList.length}
          pendingRenewalsCount={pendingRenewalsList.length}
          onOpenQuickOnboard={() => setIsQuickOnboardOpen(true)}
          onOpenAddUser={() => {
            setEditingUser(null);
            setIsAddUserModalOpen(true);
          }}
          onOpenAddServer={() => setIsAddServerModalOpen(true)}
          onOpenAlerts={() => setIsAlertModalOpen(true)}
          onOpenMasterMail={() => setIsMasterMailModalOpen(true)}
          onOpenPendingRequests={() => setIsPendingRequestsOpen(true)}
          onOpenPendingRenewals={() => setIsPendingRenewalsOpen(true)}
          onOpenSalespersonRequest={() => setIsSalespersonRequestOpen(true)}
          onDirectRemoteConnect={handleDirectRemoteConnect}
          onViewUserProfile={(u) => setProfileUser(u)}
          onNavigateToTab={(tab) => setActiveTab(tab)}
          isMobileNavOpen={isMobileNavOpen}
          onToggleMobileNav={() => setIsMobileNavOpen(prev => !prev)}
        />

        {/* PERSISTENT OFFLINE VPS WARNING BANNER */}
        {offlineServersList.length > 0 && activeTab !== 'users' && (
          <div className="offline-status-banner" style={{
            margin: '1.25rem 1.75rem 0',
            padding: '12px 20px',
            borderRadius: 'var(--radius-xl)',
            backgroundColor: 'var(--accent-rose-bg)',
            border: '1px solid var(--accent-rose-border)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '14px',
            boxShadow: '0 4px 20px rgba(244, 63, 94, 0.15)',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: 'var(--accent-rose-bg)',
                color: 'var(--accent-rose)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <AlertTriangle size={20} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13.5px', fontWeight: '800', color: 'var(--accent-rose)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ATTENTION: {offlineServersList.length} VPS NODE{offlineServersList.length > 1 ? 'S' : ''} OFFLINE
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#f8dfe1', color: '#8f3339', border: '1px solid var(--accent-rose-border)' }}>
                    Telemetry Stream Inactive
                  </span>
                </div>
                <div style={{ fontSize: '12.5px', color: '#684f52', marginTop: '2px', flexWrap: 'wrap', lineHeight: '1.5' }}>
                  Unreachable nodes: <strong>{offlineServersList.map(s => s.name || s.ipPort).join(', ')}</strong> � Real-time monitoring &amp; daily logins paused.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
              <button
                onClick={fetchTelemetry}
                className="btn btn-secondary"
                style={{ fontSize: '12px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                title="Retry Telemetry Ping"
              >
                <RefreshCw size={14} /> Sync Telemetry
              </button>
              <button
                onClick={() => setIsOfflineVpsModalOpen(true)}
                className="btn btn-primary"
                style={{
                  fontSize: '12px',
                  padding: '6px 16px',
                  backgroundColor: 'var(--accent-rose)',
                  borderColor: 'var(--accent-rose)',
                  color: '#fff',
                  fontWeight: '800',
                  boxShadow: '0 0 14px rgba(244, 63, 94, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <AlertTriangle size={14} />
                Inspect Offline Nodes ({offlineServersList.length})
              </button>
            </div>
          </div>
        )}

        {/* View Switcher Container */}
        <main id="main-content" className="app-main-content" style={{ flex: 1, padding: 'clamp(12px, 4vw, 28px) clamp(12px, 4vw, 28px) 3.5rem' }}>
          {activeTab === 'dashboard' && (
            <DashboardView
              servers={servers}
              users={users}
              telemetryData={telemetryData}
              auditLogs={auditLogs}
              onNavigateToUsers={() => setActiveTab('users')}
              onNavigateToVps={() => setActiveTab('vps')}
              onNavigateToRenewals={() => setActiveTab('renewals')}
              onNavigateToStorage={() => setActiveTab('storage')}
              onNavigateToDisabledUsers={() => setActiveTab('disabled-users')}
              onNavigateToSessions={() => setActiveTab('sessions')}
              onNavigateToDailyActivity={() => setActiveTab('daily-activity')}
              onDirectRemoteConnect={handleDirectRemoteConnect}
              onRenewUser={handleRenewUser}
              onQuickOnboard={() => setIsQuickOnboardOpen(true)}
            />
          )}

          {activeTab === 'users' && (
            <UsersView
              users={users}
              servers={servers}
              telemetryData={telemetryData}
              salesAgents={salesAgentsList}
              currentUser={currentUser}
              employeePermissions={employeePermissions}
              onAddUser={() => {
                setEditingUser(null);
                setIsAddUserModalOpen(true);
              }}
              onEditUser={(user) => {
                setEditingUser(user);
                setIsAddUserModalOpen(true);
              }}
              onDeleteUser={handleDeleteUser}
              onRenewUser={handleRenewUser}
              onBulkRenew={handleBulkRenewUsers}
              onBulkDelete={handleBulkDeleteUsers}
              onDirectRemoteConnect={handleDirectRemoteConnect}
              onViewUserProfile={(user) => setProfileUser(user)}
              onOpenImportStatusModal={() => setIsImportStatusModalOpen(true)}
              onOpenBulkSharedImport={() => setIsBulkSharedImportOpen(true)}
              onChangePassword={(user) => setPasswordChangeClient(user)}
              onToggleUserStatus={handleToggleUserStatus}
              onRaiseTicket={(user) => {
                setTicketInitialClient(user);
                setIsTicketModalOpen(true);
              }}
              onOpenOfflineVpsModal={() => setIsOfflineVpsModalOpen(true)}
              exportExpiringUsersCSV={exportExpiringUsersCSV}
              exportServerUserExcel={exportServerUserExcel}
            />
          )}

          {activeTab === 'tickets' && (
            <TicketsView
              tickets={tickets}
              servers={servers}
              users={users}
              employees={employees}
              currentUser={currentUser}
              onOpenRaiseTicket={(user) => {
                setTicketInitialClient(user);
                setIsTicketModalOpen(true);
              }}
              onUpdateTicket={handleUpdateTicket}
              onDeleteTicket={handleDeleteTicket}
              onDirectRemoteConnect={handleDirectRemoteConnect}
            />
          )}

          {activeTab === 'employees' && (
            <EmployeesView
              employees={employees}
              currentUser={currentUser}
              sessions={employeeSessions}
              onAddEmployee={() => {
                setEditingEmployee(null);
                setIsEmployeeModalOpen(true);
              }}
              onEditEmployee={(emp) => {
                setEditingEmployee(emp);
                setIsEmployeeModalOpen(true);
              }}
              onToggleStatus={handleToggleEmployeeStatus}
              onResetPassword={(emp) => setResetPasswordEmployee(emp)}
              onDeleteEmployee={handleDeleteEmployee}
              onViewEmployeeActivity={(emp) => {
                setActiveTab('logs');
              }}
              onTerminateEmployeeSession={handleTerminateEmployeeSession}
              onReset2FA={handleResetEmployee2FA}
            />
          )}

          {activeTab === 'vps' && (
            <VpsView
              servers={servers}
              users={users}
              telemetryData={telemetryData}
              hardwareHistory={hardwareHistory}
              onFetchHardwareHistory={fetchHardwareHistory}
              currentUser={currentUser}
              employeePermissions={employeePermissions}
              onAddServer={() => setIsAddServerModalOpen(true)}
              onEditServer={(srv) => setEditingServer(srv)}
              onDeleteServer={handleDeleteServer}
              onDirectRemoteConnect={handleDirectRemoteConnect}
              onNavigateToAssignment={() => setActiveTab('assignment')}
              onNavigateToReports={handleNavigateToReports}
              onNavigateToServerUsers={handleNavigateToServerUsers}
              onNavigateToHardwareSpecs={navigateToHardwareSpecs}
              onRefreshTelemetry={fetchTelemetry}
            />
          )}

          {activeTab === 'hardware-specs' && (
            <HardwareSpecsView
              servers={servers}
              telemetryData={telemetryData}
              hardwareHistory={hardwareHistory}
              initialServerId={hardwareSpecsTargetServerId}
              onRefreshTelemetry={fetchTelemetry}
              onFetchHardwareHistory={fetchHardwareHistory}
              onDirectRemoteConnect={handleDirectRemoteConnect}
              onNavigateToVps={() => setActiveTab('vps')}
            />
          )}

          {activeTab === 'server-users' && (
            <ServerUsersView
              servers={servers}
              users={users}
              telemetryData={telemetryData}
              initialServerId={serverUsersTargetServerId}
              onDirectRemoteConnect={handleDirectRemoteConnect}
              onRefreshTelemetry={fetchTelemetry}
              onForceLogoffSession={handleForceLogoffSession}
            />
          )}

          {activeTab === 'monitoring' && (
            <MonitoringView
              servers={servers}
              users={users}
              telemetryData={telemetryData}
              onDirectRemoteConnect={handleDirectRemoteConnect}
              onRefreshTelemetry={fetchTelemetry}
              onForceLogoffSession={handleForceLogoffSession}
              onNavigateToReports={handleNavigateToReports}
              onNavigateToServerUsers={handleNavigateToServerUsers}
            />
          )}

          {activeTab === 'reports' && (
            <VpsReportsView
              servers={servers}
              users={users}
              telemetryData={telemetryData}
              initialServerId={reportsTargetServerId}
              onDirectRemoteConnect={handleDirectRemoteConnect}
              onForceLogoffSession={handleForceLogoffSession}
              onRefreshTelemetry={fetchTelemetry}
            />
          )}

          {activeTab === 'daily-activity' && (
            <DailyActivityView
              servers={servers}
              users={users}
              telemetryData={telemetryData}
              onDirectRemoteConnect={handleDirectRemoteConnect}
              onRefreshTelemetry={fetchTelemetry}
            />
          )}

          {activeTab === 'disabled-users' && (
            <DisabledUsersView
              servers={servers}
              users={users}
              telemetryData={telemetryData}
              onDirectRemoteConnect={handleDirectRemoteConnect}
              onRefreshTelemetry={fetchTelemetry}
              onToggleUserStatus={handleToggleUserStatus}
              onChangePassword={(user) => setPasswordChangeClient(user)}
            />
          )}

          {activeTab === 'storage' && (
            <StorageHealthView
              servers={servers}
              telemetryData={telemetryData}
              onDirectRemoteConnect={handleDirectRemoteConnect}
              onRefreshTelemetry={fetchTelemetry}
            />
          )}

          {activeTab === 'migration' && (
            <MigrationHubView
              users={users}
              servers={servers}
              onRefreshUsers={fetchAppData}
              onRefreshTelemetry={fetchTelemetry}
            />
          )}

          {activeTab === 'remote-assist' && (
            <RemoteAssistView
              users={users}
              servers={servers}
              telemetryData={telemetryData}
              onDirectRemoteConnect={handleDirectRemoteConnect}
              onForceLogoffSession={handleForceLogoffSession}
              onRefreshTelemetry={fetchTelemetry}
            />
          )}

          {activeTab === 'assignment' && (
            <AssignmentView
              servers={servers}
              users={users}
              onSelectDriveForNewUser={handleSelectDriveForNewUser}
              onViewUserProfile={(user) => setProfileUser(user)}
              onDirectRemoteConnect={handleDirectRemoteConnect}
            />
          )}

          {activeTab === 'renewals' && (
            <ExpiryRenewalsView
              users={users}
              servers={servers}
              currentUser={currentUser}
              employeePermissions={employeePermissions}
              onRenewUser={handleRenewUser}
              onBulkRenew={handleBulkRenewUsers}
              onDirectRemoteConnect={handleDirectRemoteConnect}
              onOpenImportStatusModal={() => setIsImportStatusModalOpen(true)}
              exportExpiringUsersCSV={exportExpiringUsersCSV}
            />
          )}

          {activeTab === 'sessions' && (
            <SessionsView
              employeeSessions={employeeSessions}
              users={users}
              servers={servers}
              telemetryData={telemetryData}
              currentUser={currentUser}
              onTerminateEmployeeSession={handleTerminateEmployeeSession}
              onForceLogoffSession={handleForceLogoffSession}
              onDirectRemoteConnect={handleDirectRemoteConnect}
              onChangePassword={(user) => setPasswordChangeClient(user)}
              onToggleUserStatus={handleToggleUserStatus}
              showToast={showToast}
            />
          )}

          {activeTab === 'session-guard' && (
            <SessionSecurityView
              servers={servers}
              users={users}
              currentUser={currentUser}
            />
          )}

          {activeTab === 'logs' && (
            <ActivityLogsView auditLogs={auditLogs} />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              currentUser={currentUser}
              portalUsers={employees}
              employeePermissions={employeePermissions}
              salespersonPermissions={salespersonPermissions}
              onSaveEmployeePermissions={setEmployeePermissions}
              onSaveSalespersonPermissions={setSalespersonPermissions}
              onOpenPortalUsers={() => setActiveTab('employees')}
              onOpenBackup={() => setIsBackupModalOpen(true)}
              onOpenTwoFactorModal={() => setIsTwoFactorModalOpen(true)}
              showToast={showToast}
            />
          )}
        </main>

        {/* Clean Footer */}
        <footer style={{
          padding: '1rem 1.75rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.78rem',
          color: '#64748b',
          backgroundColor: 'rgba(11, 15, 25, 0.6)'
        }}>
          <div>
            Enterprise Operations Platform • <strong style={{ color: '#38bdf8' }}>Innovation Web Works</strong>
          </div>
          <div>
            Official TLS 443 Enforced • All Rights Reserved
          </div>
        </footer>
      </div>



      {/* MODALS */}
      <EmployeeModal
        isOpen={isEmployeeModalOpen}
        onClose={() => {
          setIsEmployeeModalOpen(false);
          setEditingEmployee(null);
        }}
        initialEmployee={editingEmployee}
        onSaveEmployee={handleSaveEmployee}
      />

      <ResetPasswordModal
        isOpen={!!resetPasswordEmployee}
        onClose={() => setResetPasswordEmployee(null)}
        employee={resetPasswordEmployee}
        onResetPassword={handleResetEmployeePasswordSubmit}
      />

      {profileUser && (
        <UserProfileModal
          user={profileUser}
          servers={servers}
          onClose={() => setProfileUser(null)}
          onDirectRemoteConnect={handleDirectRemoteConnect}
        />
      )}

      <PendingRenewalsModal
        isOpen={isPendingRenewalsOpen}
        onClose={() => setIsPendingRenewalsOpen(false)}
        renewalRequests={renewalRequests}
        onApproveRenewal={async (reqId) => {
          setRenewalRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'APPROVED' } : r));
          showToast(`Renewal approved!`);
          try {
            await authFetch(`${API_BASE}/renewals/${reqId}`, {
              method: 'PUT',
              body: JSON.stringify({ status: 'APPROVED' })
            });
            await fetchAppData();
          } catch (e) {}
        }}
        onRejectRenewal={async (reqId) => {
          setRenewalRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'REJECTED' } : r));
          showToast(`Renewal request rejected.`);
          try {
            await authFetch(`${API_BASE}/renewals/${reqId}`, {
              method: 'PUT',
              body: JSON.stringify({ status: 'REJECTED' })
            });
            await fetchAppData();
          } catch (e) {}
        }}
      />

      <SalespersonRequestModal
        isOpen={isSalespersonRequestOpen}
        onClose={() => setIsSalespersonRequestOpen(false)}
        servers={servers}
        users={users}
        salesAgents={salesAgentsList}
        currentUser={currentUser}
        onSubmitRequest={async (newReq) => {
          setRequests(prev => [...prev, newReq]);
          showToast(`Request submitted to Staff for Drive allocation.`);
          try {
            await authFetch(`${API_BASE}/requests`, {
              method: 'POST',
              body: JSON.stringify(newReq)
            });
            await fetchAppData();
          } catch (e) {}
        }}
      />

      <PendingRequestsModal
        isOpen={isPendingRequestsOpen}
        onClose={() => setIsPendingRequestsOpen(false)}
        requests={requests}
        onApproveRequest={async (requestObj) => {
          const newUser = {
            id: `user-${Date.now()}`,
            serverId: requestObj.serverId,
            drive: requestObj.drive,
            clientType: requestObj.clientType || 'Shared',
            username: requestObj.username,
            password: requestObj.password || 'Pass#123',
            company: requestObj.company,
            billDate: new Date().toISOString().split('T')[0],
            expiryDate: requestObj.expiryDate,
            salesAgent: requestObj.salesAgent,
            customerEmail: requestObj.customerEmail || ''
          };
          setUsers(prev => [...prev, newUser]);
          setRequests(prev => prev.map(r => r.id === requestObj.id ? { ...r, status: 'APPROVED' } : r));
          showToast(`Client approved & created! 🎉`);
          try {
            await authFetch(`${API_BASE}/users`, {
              method: 'POST',
              body: JSON.stringify(newUser)
            });
            await authFetch(`${API_BASE}/requests/${requestObj.id}`, {
              method: 'PUT',
              body: JSON.stringify({ status: 'APPROVED' })
            });
            await fetchAppData();
          } catch (e) {}
        }}
        onRejectRequest={async (reqId) => {
          setRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'REJECTED' } : r));
          showToast(`Request rejected.`);
          try {
            await authFetch(`${API_BASE}/requests/${reqId}`, {
              method: 'PUT',
              body: JSON.stringify({ status: 'REJECTED' })
            });
            await fetchAppData();
          } catch (e) {}
        }}
      />

      <QuickOnboardModal
        isOpen={isQuickOnboardOpen}
        onClose={() => setIsQuickOnboardOpen(false)}
        servers={servers}
        users={users}
        onSelectDriveForNewUser={handleSelectDriveForNewUser}
      />

      <ExpiryAlertModal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        users={users}
        servers={servers}
      />

      <MasterMailModal
        isOpen={isMasterMailModalOpen}
        onClose={() => setIsMasterMailModalOpen(false)}
        users={users}
        servers={servers}
      />

      <AddServerModal
        isOpen={isAddServerModalOpen}
        onClose={() => setIsAddServerModalOpen(false)}
        onAddServer={handleAddServer}
      />

      {editingServer && (
        <EditServerModal
          isOpen={!!editingServer}
          onClose={() => setEditingServer(null)}
          server={editingServer}
          onSaveServer={handleEditServer}
        />
      )}

      <AddUserModal
        isOpen={isAddUserModalOpen}
        onClose={() => {
          setIsAddUserModalOpen(false);
          setEditingUser(null);
        }}
        onSaveUser={handleSaveUser}
        servers={servers}
        salesAgents={salesAgentsList}
        initialUser={editingUser}
        allUsers={users}
      />

      {receiptUser && (
        <ReceiptModal
          isOpen={!!receiptUser}
          onClose={() => setReceiptUser(null)}
          user={receiptUser}
          server={servers.find(s => s.id === receiptUser.serverId)}
        />
      )}

      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        servers={servers}
        users={users}
        onRestoreData={handleRestoreData}
      />

      <ImportStatusModal
        isOpen={isImportStatusModalOpen}
        onClose={() => setIsImportStatusModalOpen(false)}
        users={users}
        onBulkApplyUpdates={handleBulkApplyCSVUpdates}
      />

      <BulkSharedVpsImportModal
        isOpen={isBulkSharedImportOpen}
        onClose={() => setIsBulkSharedImportOpen(false)}
        servers={servers}
        users={users}
        onImport={bulkImportSharedUsers}
      />

      <AuditLogModal
        isOpen={isAuditLogModalOpen}
        onClose={() => setIsAuditLogModalOpen(false)}
        auditLogs={auditLogs}
      />

      {webRemoteUser && (
        <WebRemoteConsoleModal
          isOpen={!!webRemoteUser}
          onClose={() => setWebRemoteUser(null)}
          user={webRemoteUser}
          server={servers.find(s => s.id === webRemoteUser.serverId)}
          loginMode={webRemoteLoginMode}
        />
      )}

      <TicketModal
        isOpen={isTicketModalOpen}
        onClose={() => {
          setIsTicketModalOpen(false);
          setTicketInitialClient(null);
        }}
        onSaveTicket={handleSaveTicket}
        initialClient={ticketInitialClient}
        servers={servers}
        users={users}
        employees={employees}
        currentUser={currentUser}
      />

      {/* CRITICAL OFFLINE VPS WARNING MODAL */}
      <OfflineVpsWarningModal
        isOpen={isOfflineVpsModalOpen}
        onClose={() => setIsOfflineVpsModalOpen(false)}
        offlineServers={offlineServersList}
        onRefreshTelemetry={fetchTelemetry}
        onNavigateToVps={() => setActiveTab('vps')}
        onDirectRemoteConnect={handleDirectRemoteConnect}
      />

      {/* 24. Remote Windows VPS Password Change Modal */}
      <ChangeClientPasswordModal
        isOpen={!!passwordChangeClient}
        onClose={handleClosePasswordChangeModal}
        user={passwordChangeClient}
        server={servers.find(s => s.id === passwordChangeClient?.serverId || s.ipPort === passwordChangeClient?.serverId)}
        onSubmitPassword={handleChangeClientPasswordSubmit}
      />

      {/* 25. Google Authenticator 2FA Setup & Security Modal */}
      <TwoFactorSetupModal
        isOpen={isTwoFactorModalOpen}
        onClose={() => setIsTwoFactorModalOpen(false)}
        currentUser={currentUser}
        onUpdateCurrentUser={(updated) => setCurrentUser(updated)}
        showToast={showToast}
      />
    </div>
  );
}

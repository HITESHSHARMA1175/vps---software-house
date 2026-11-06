import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth, API_BASE } from './AuthContext';
import { useToast } from './ToastContext';
import { getDaysRemaining } from '../components/UserTable';

export const UserContext = createContext(null);

export function UserProvider({ children }) {
  const { currentUser, authFetch } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [renewalRequests, setRenewalRequests] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeeSessions, setEmployeeSessions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  const addAuditLog = useCallback((action, target, details) => {
    const newLog = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      operator: currentUser ? (currentUser.name || currentUser.username) : 'System Admin',
      role: currentUser ? currentUser.role : 'SUPER_ADMIN',
      action,
      target,
      details
    };
    setAuditLogs(prev => [newLog, ...prev]);

    authFetch(`${API_BASE}/audit-logs`, {
      method: 'POST',
      body: JSON.stringify(newLog)
    }).catch(() => {});
  }, [currentUser, authFetch]);

  // Fetch all application collections
  const fetchAppData = useCallback(async () => {
    if (!currentUser) return;
    try {
      const [usrRes, reqRes, renRes, logRes, empRes, sessRes, tktRes] = await Promise.allSettled([
        authFetch(`${API_BASE}/users`).then(r => r.json()),
        authFetch(`${API_BASE}/requests`).then(r => r.json()),
        authFetch(`${API_BASE}/renewals`).then(r => r.json()),
        authFetch(`${API_BASE}/audit-logs`).then(r => r.json()),
        authFetch(`${API_BASE}/employees`).then(r => r.json()),
        authFetch(`${API_BASE}/sessions`).then(r => r.json()),
        authFetch(`${API_BASE}/tickets`).then(r => r.json())
      ]);

      if (usrRes.status === 'fulfilled' && usrRes.value) {
        const val = usrRes.value;
        const list = Array.isArray(val) ? val : (val.users || []);
        if (list.length > 0) setUsers(list);
      }
      if (reqRes.status === 'fulfilled' && reqRes.value) {
        const val = reqRes.value;
        const list = Array.isArray(val) ? val : (val.requests || []);
        setRequests(list);
      }
      if (renRes.status === 'fulfilled' && renRes.value) {
        const val = renRes.value;
        const list = Array.isArray(val) ? val : (val.renewals || []);
        setRenewalRequests(list);
      }
      if (logRes.status === 'fulfilled' && logRes.value) {
        const val = logRes.value;
        const list = Array.isArray(val) ? val : (val.logs || []);
        setAuditLogs(list);
      }
      if (empRes.status === 'fulfilled' && empRes.value) {
        const val = empRes.value;
        const list = Array.isArray(val) ? val : (val.employees || []);
        setEmployees(list);
      }
      if (sessRes.status === 'fulfilled' && sessRes.value) {
        const val = sessRes.value;
        const list = Array.isArray(val) ? val : (val.sessions || []);
        setEmployeeSessions(list);
      }
      if (tktRes.status === 'fulfilled' && tktRes.value) {
        const val = tktRes.value;
        const list = Array.isArray(val) ? val : (val.tickets || []);
        setTickets(list);
      }
    } catch (err) {
      console.warn("fetchAppData error:", err);
    }
  }, [currentUser, authFetch]);

  useEffect(() => {
    if (currentUser) {
      fetchAppData();
      const interval = setInterval(fetchAppData, 30000);
      return () => clearInterval(interval);
    }
  }, [currentUser, fetchAppData]);

  // Derived metrics
  const expiringIn15DaysCount = useMemo(() => {
    return users.filter(u => {
      const days = getDaysRemaining(u.expiryDate);
      return days >= 0 && days <= 15;
    }).length;
  }, [users]);

  const pendingRequestsList = useMemo(() => {
    return requests.filter(r => r.status === 'PENDING');
  }, [requests]);

  const pendingRenewalsList = useMemo(() => {
    return renewalRequests.filter(r => r.status === 'PENDING');
  }, [renewalRequests]);

  // User CRUD Operations
  const saveUser = useCallback(async (userObj, isEditing = false) => {
    if (isEditing && userObj.id) {
      setUsers(prev => prev.map(u => u.id === userObj.id ? { ...userObj } : u));
      showToast(`Client "${userObj.company}" updated!`);
      addAuditLog('USER_UPDATED', userObj.company, `Client details updated (${userObj.username})`);
      try {
        const res = await authFetch(`${API_BASE}/users/${userObj.id}`, {
          method: 'PUT',
          body: JSON.stringify(userObj)
        });
        if (!res.ok) throw new Error('Update failed on server');
        await fetchAppData();
      } catch (e) {
        showToast(`Failed to update client: ${e.message}`, 'error');
        await fetchAppData();
        throw e;
      }
    } else {
      const newUser = { ...userObj, id: userObj.id || `user-${Date.now()}` };
      setUsers(prev => [...prev, newUser]);
      showToast(`Client "${userObj.company}" added! 🎉`);
      addAuditLog('USER_CREATED', userObj.company, `New client onboarded on ${userObj.drive} (${userObj.username})`);
      try {
        const res = await authFetch(`${API_BASE}/users`, {
          method: 'POST',
          body: JSON.stringify(newUser)
        });
        if (!res.ok) throw new Error('Creation failed on server');
        await fetchAppData();
      } catch (e) {
        showToast(`Failed to create client in database: ${e.message}`, 'error');
        await fetchAppData();
        throw e;
      }
    }
  }, [authFetch, fetchAppData, showToast, addAuditLog]);

  const bulkImportSharedUsers = useCallback(async (entries) => {
    const res = await authFetch(`${API_BASE}/users/bulk-import`, {
      method: 'POST',
      body: JSON.stringify({ entries })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.error || 'Bulk import failed on the server.');
    await fetchAppData();
    showToast(`${data.created || 0} subscriptions created, ${data.updated || 0} updated.`);
    addAuditLog('USERS_BULK_IMPORTED', 'Shared VPS subscriptions', `${data.created || 0} created and ${data.updated || 0} updated from upload.`);
    return data;
  }, [authFetch, fetchAppData, showToast, addAuditLog]);

  const deleteUser = useCallback(async (userId) => {
    const target = users.find(u => u.id === userId);
    setUsers(prev => prev.filter(u => u.id !== userId));
    showToast(`Client deleted.`);
    addAuditLog('USER_DELETED', target?.company || userId, `Client subscription deleted`);
    try {
      const res = await authFetch(`${API_BASE}/users/${userId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Deletion failed on server');
      await fetchAppData();
    } catch (e) {
      showToast(`Failed to delete client: ${e.message}`, 'error');
      await fetchAppData();
      throw e;
    }
  }, [users, authFetch, fetchAppData, showToast, addAuditLog]);

  const renewUser = useCallback(async (userId, requestedNewExpiry) => {
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return;

    const newBillDate = new Date().toISOString().split('T')[0];
    const updatedUserObj = {
      ...targetUser,
      billDate: newBillDate,
      expiryDate: requestedNewExpiry
    };

    setUsers(prev => prev.map(u => u.id === userId ? updatedUserObj : u));
    showToast(`Subscription renewed for +1 year! 🎉`);
    addAuditLog('SUBSCRIPTION_RENEWED', targetUser.company, `Renewed subscription (+1 Year). Expiry -> ${requestedNewExpiry}`);

    try {
      const res = await authFetch(`${API_BASE}/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(updatedUserObj)
      });
      if (!res.ok) throw new Error('Renewal failed on server');
      await fetchAppData();
    } catch (e) {
      showToast(`Failed to update subscription in database: ${e.message}`, 'error');
      await fetchAppData();
      throw e;
    }
  }, [users, authFetch, fetchAppData, showToast, addAuditLog]);

  const bulkRenewUsers = useCallback(async (userIds) => {
    const updatedUsers = users.map(u => {
      if (userIds.includes(u.id)) {
        const exp = new Date(u.expiryDate);
        exp.setFullYear(exp.getFullYear() + 1);
        return {
          ...u,
          billDate: new Date().toISOString().split('T')[0],
          expiryDate: exp.toISOString().split('T')[0]
        };
      }
      return u;
    });

    setUsers(updatedUsers);
    showToast(`Successfully renewed ${userIds.length} clients for +1 Year! 🚀`);
    addAuditLog('BULK_RENEWAL', `${userIds.length} Clients`, `Bulk renewal executed for +1 Year`);

    for (const id of userIds) {
      const u = updatedUsers.find(x => x.id === id);
      if (u) {
        try {
          await authFetch(`${API_BASE}/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify(u)
          });
        } catch (e) {
          console.error(`Failed to bulk renew client ${id}:`, e);
        }
      }
    }
    await fetchAppData();
  }, [users, authFetch, fetchAppData, showToast, addAuditLog]);

  const bulkDeleteUsers = useCallback(async (userIds) => {
    setUsers(prev => prev.filter(u => !userIds.includes(u.id)));
    showToast(`Deleted ${userIds.length} clients.`);
    addAuditLog('BULK_DELETE', `${userIds.length} Clients`, `Bulk delete executed`);

    for (const id of userIds) {
      try {
        await authFetch(`${API_BASE}/users/${id}`, { method: 'DELETE' });
      } catch (e) {
        console.error(`Failed to bulk delete client ${id}:`, e);
      }
    }
    await fetchAppData();
  }, [authFetch, fetchAppData, showToast, addAuditLog]);

  const toggleUserStatus = useCallback(async (user, requestedStatus) => {
    const isDisabling = (requestedStatus || '').toLowerCase() === 'disabled';
    const newStatus = isDisabling ? 'Disabled' : 'Active';
    try {
      const res = await authFetch(`${API_BASE}/users/${user.id}/toggle-status`, {
        method: 'POST',
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(data.message || `Account ${newStatus.toLowerCase()} successfully! 🛡️`);
        addAuditLog(isDisabling ? 'CLIENT_ACCOUNT_DISABLED' : 'CLIENT_ACCOUNT_ENABLED', user.company, `Account set to ${newStatus} on VPS (${user.username})`);
        await fetchAppData();
      } else {
        showToast(data.error || 'Failed to toggle account status', 'error');
      }
    } catch (err) {
      showToast(`Error toggling status: ${err.message}`, 'error');
    }
  }, [authFetch, fetchAppData, showToast, addAuditLog]);

  const changeClientPassword = useCallback(async (userId, newPassword) => {
    try {
      const res = await authFetch(`${API_BASE}/users/${userId}/change-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: newPassword.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, password: newPassword.trim() } : u));
        showToast(data.message || 'Password change queued for automated VPS sync! 🔑');
        addAuditLog('CLIENT_PASSWORD_CHANGED', data.username || userId, 'Password updated & queued for automated VPS sync');
        await fetchAppData();
        return data;
      } else {
        const errorMsg = data.error || 'Failed to update password';
        showToast(errorMsg, 'error');
        throw new Error(errorMsg);
      }
    } catch (err) {
      showToast(`Error changing password: ${err.message}`, 'error');
      throw err;
    }
  }, [authFetch, fetchAppData, showToast, addAuditLog]);

  return (
    <UserContext.Provider
      value={{
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
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUsers() {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error('useUsers must be used within a UserProvider');
  }
  return ctx;
}

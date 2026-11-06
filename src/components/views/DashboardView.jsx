import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Server,
  AlertTriangle,
  AlertCircle,
  Activity,
  CheckCircle2,
  ChevronRight,
  Zap,
  Clock,
  MessageCircle,
  RefreshCw,
  UserX,
  Eye,
  X,
  RadioTower,
  HardDrive,
  Cpu,
  Database,
  Calendar,
  Search,
  Filter,
  Download,
  ShieldAlert,
  UserMinus,
  Radio,
  ExternalLink,
  ShieldCheck,
  ArrowUpRight,
  UserCheck,
  Layers,
  Settings,
  Terminal,
  Laptop
} from 'lucide-react';
import { getDaysRemaining } from '../UserTable';

export function getDaysInactive(user) {
  if (!user) return 0;
  const now = Date.now();
  if (user.lastActiveAt) {
    const time = new Date(user.lastActiveAt).getTime();
    if (!isNaN(time)) {
      return Math.max(0, Math.floor((now - time) / (1000 * 60 * 60 * 24)));
    }
  }
  if (user.firstDiscoveredAt) {
    const time = new Date(user.firstDiscoveredAt).getTime();
    if (!isNaN(time)) {
      return Math.max(0, Math.floor((now - time) / (1000 * 60 * 60 * 24)));
    }
  }
  if (user.billDate) {
    const time = new Date(user.billDate).getTime();
    if (!isNaN(time)) {
      return Math.max(0, Math.floor((now - time) / (1000 * 60 * 60 * 24)));
    }
  }
  if (user.createdAt) {
    const time = new Date(user.createdAt).getTime();
    if (!isNaN(time)) {
      return Math.max(0, Math.floor((now - time) / (1000 * 60 * 60 * 24)));
    }
  }
  return 0;
}

export function getElapsedActiveTime(logonTimeStr) {
  if (!logonTimeStr) return '< 1m (Active)';

  let cleanStr = String(logonTimeStr).trim().replace(' ', 'T');
  if (!cleanStr.includes('T')) {
    cleanStr = `${new Date().toISOString().substring(0, 10)}T${logonTimeStr}`;
  }
  if (cleanStr.length === 16) {
    cleanStr += ':00';
  }

  let logonDate = new Date(cleanStr);
  if (isNaN(logonDate.getTime())) {
    logonDate = new Date(logonTimeStr);
  }

  const now = new Date();
  if (isNaN(logonDate.getTime())) {
    return '< 1m (Active)';
  }

  const diffMs = now.getTime() - logonDate.getTime();
  if (diffMs < 0) {
    return '< 1m (Active)';
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m (Active)`;
  }
  if (minutes > 0) {
    return `${minutes}m (Active)`;
  }
  return `< 1m (Active)`;
}

export const formatSessionDuration = getElapsedActiveTime;

export default function DashboardView({
  servers = [],
  users = [],
  telemetryData = {},
  auditLogs = [],
  onNavigateToUsers,
  onNavigateToVps,
  onNavigateToRenewals,
  onNavigateToStorage,
  onNavigateToDisabledUsers,
  onNavigateToSessions,
  onNavigateToDailyActivity,
  onDirectRemoteConnect,
  onRenewUser,
  onQuickOnboard
}) {
  const [selectedServerModalId, setSelectedServerModalId] = useState(null);
  const [activeSessionServerFilter, setActiveSessionServerFilter] = useState('ALL');
  const [activeSessionSearch, setActiveSessionSearch] = useState('');
  const [dashStorageServerFilter, setDashStorageServerFilter] = useState('ALL');
  const [dashStorageTabMode, setDashStorageTabMode] = useState('ALERTS_ONLY');
  const [activeUsersModalServerId, setActiveUsersModalServerId] = useState(null);
  const [hardwareTab, setHardwareTab] = useState('RAM'); // 'RAM' or 'STORAGE'

  const [ticker, setTicker] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTicker(t => t + 1);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Collect all live active sessions across all VPS nodes (Strict Deduplication)
  const allActiveSessionsList = useMemo(() => {
    const items = [];
    const seenUserServerPairs = new Set();

    servers.forEach(s => {
      const sIpPure = s.ipPort ? s.ipPort.split(':')[0] : '';
      const tData = telemetryData[s.id] || telemetryData[s.ipPort] || telemetryData[s.name] || (sIpPure && telemetryData[sIpPure]) || null;
      if (tData && Array.isArray(tData.activeUsersList)) {
        const sRef = s.id || s.ipPort || s.name || 'vps';
        tData.activeUsersList.forEach(u => {
          const uName = typeof u === 'string' ? u : (u.username || 'Active User');
          const uLower = (uName || '').toLowerCase().trim();
          const pairKey = `${sRef}::${uLower}`;
          if (uLower && !seenUserServerPairs.has(pairKey)) {
            seenUserServerPairs.add(pairKey);
            const matched = users.find(usr => 
              (usr.username || '').toLowerCase() === uLower && 
              (usr.serverId === s.id || usr.serverIp === s.ipPort || usr.vpsIp === s.ipPort || (s.ipPort && usr.serverIp && s.ipPort.split(':')[0] === usr.serverIp.split(':')[0]))
            );
            items.push({
              id: `act-${s.id}-${uLower}`,
              username: uName,
              company: matched ? matched.company : uName,
              serverId: s.id,
              serverName: s.name,
              serverIp: s.ipPort || s.name,
              sessionId: typeof u === 'object' && u.sessionId ? u.sessionId : 'Active',
              state: typeof u === 'object' && u.state ? u.state : 'Active',
              idleTime: typeof u === 'object' && u.idleTime ? u.idleTime : '0m',
              logonTime: typeof u === 'object' && u.logonTime ? u.logonTime : 'Live',
              userObj: matched || { username: uName, company: uName, serverId: s.id }
            });
          }
        });
      }
    });

    Object.keys(telemetryData || {}).forEach(tKey => {
      const tData = telemetryData[tKey];
      if (tData && Array.isArray(tData.activeUsersList) && tData.activeUsersList.length > 0) {
        const matchedServer = servers.find(s => s.id === tKey || s.ipPort === tKey || s.name === tKey || (s.ipPort && s.ipPort.split(':')[0] === tKey));
        const sRef = matchedServer ? matchedServer.id : tKey;
        tData.activeUsersList.forEach(u => {
          const uName = typeof u === 'string' ? u : (u.username || 'Active User');
          const uLower = (uName || '').toLowerCase().trim();
          const pairKey = `${sRef}::${uLower}`;
          if (uLower && !seenUserServerPairs.has(pairKey)) {
            seenUserServerPairs.add(pairKey);
            const matched = users.find(usr => 
              (usr.username || '').toLowerCase() === uLower && 
              (usr.serverId === sRef || usr.serverIp === (matchedServer?.ipPort || tKey) || usr.vpsIp === (matchedServer?.ipPort || tKey) || (matchedServer?.ipPort && usr.serverIp && matchedServer.ipPort.split(':')[0] === usr.serverIp.split(':')[0]))
            );
            items.push({
              id: `act-raw-${tKey}-${uLower}`,
              username: uName,
              company: matched ? matched.company : uName,
              serverId: sRef,
              serverName: matchedServer?.name || tKey,
              serverIp: matchedServer?.ipPort || tKey,
              sessionId: typeof u === 'object' && u.sessionId ? u.sessionId : 'Active',
              state: typeof u === 'object' && u.state ? u.state : 'Active',
              idleTime: typeof u === 'object' && u.idleTime ? u.idleTime : '0m',
              logonTime: typeof u === 'object' && u.logonTime ? u.logonTime : 'Live',
              userObj: matched || { username: uName, company: uName, serverId: sRef }
            });
          }
        });
      }
    });

    return items;
  }, [servers, users, telemetryData]);

  // Filtered live active sessions
  const filteredActiveSessions = useMemo(() => {
    return allActiveSessionsList.filter(s => {
      if (activeSessionServerFilter !== 'ALL' && s.serverId !== activeSessionServerFilter) {
        return false;
      }
      if (activeSessionSearch.trim()) {
        const q = activeSessionSearch.toLowerCase();
        const matchUser = (s.username || '').toLowerCase().includes(q);
        const matchComp = (s.company || '').toLowerCase().includes(q);
        const matchServer = (s.serverName || '').toLowerCase().includes(q) || (s.serverIp || '').toLowerCase().includes(q);
        if (!matchUser && !matchComp && !matchServer) return false;
      }
      return true;
    });
  }, [allActiveSessionsList, activeSessionServerFilter, activeSessionSearch]);

  // Live online servers calculation
  const onlineServersList = useMemo(() => {
    return servers.filter(s => {
      const sIpPure = s.ipPort ? s.ipPort.split(':')[0] : '';
      const tData = telemetryData[s.id] || telemetryData[s.ipPort] || telemetryData[s.name] || (sIpPure && telemetryData[sIpPure]) || null;
      return !!(tData && tData.lastPingTimestamp && (Date.now() - tData.lastPingTimestamp < 3 * 60 * 1000));
    });
  }, [servers, telemetryData]);

  const onlineServersCount = onlineServersList.length;
  const offlineServersCount = Math.max(0, servers.length - onlineServersCount);

  // Top RAM servers ranking
  const topRamServersList = useMemo(() => {
    return [...servers].map(s => {
      const sIpPure = s.ipPort ? s.ipPort.split(':')[0] : '';
      const tData = telemetryData[s.id] || telemetryData[s.ipPort] || telemetryData[s.name] || (sIpPure && telemetryData[sIpPure]) || null;
      const ramPercent = tData ? (tData.ramPercent || (tData.ramTotalGB ? Math.round((tData.ramUsedGB / tData.ramTotalGB) * 100) : 0)) : 0;
      const cpuUsage = tData ? (tData.cpuUsage || 0) : 0;
      const isOnline = !!(tData && tData.lastPingTimestamp && (Date.now() - tData.lastPingTimestamp < 3 * 60 * 1000));
      return {
        ...s,
        ramTotalGB: tData ? parseFloat(tData.ramTotalGB || 0).toFixed(1) : '0',
        ramUsedGB: tData ? parseFloat(tData.ramUsedGB || 0).toFixed(1) : '0',
        ramPercent,
        cpuUsage,
        isOnline
      };
    }).sort((a, b) => b.ramPercent - a.ramPercent).slice(0, 10);
  }, [servers, telemetryData]);

  const highRamWarningServers = topRamServersList.filter(s => s.ramPercent >= 85);

  // Storage alerts & multi-drive health
  const allServerDrivesList = useMemo(() => {
    return servers.flatMap(s => {
      const sIpPure = s.ipPort ? s.ipPort.split(':')[0] : '';
      const tData = telemetryData[s.id] || telemetryData[s.ipPort] || telemetryData[s.name] || (sIpPure && telemetryData[sIpPure]) || null;
      if (tData && Array.isArray(tData.disks) && tData.disks.length > 0) {
        return tData.disks.map(d => {
          const drive = (d.driveLetter || d.drive || 'C:').toUpperCase().trim();
          const freeGB = parseFloat(d.freeGB) || 0;
          const totalGB = parseFloat(d.totalGB) || 0;
          const usedGB = Math.max(0, totalGB - freeGB);
          const freePercent = parseFloat(d.freePercent) || (totalGB > 0 ? (freeGB / totalGB) * 100 : 100);
          const usedPercent = totalGB > 0 ? Math.min(100, (usedGB / totalGB) * 100) : 0;
          const isSystemDrive = (drive === 'C:' || drive === 'C');
          const thresholdGB = isSystemDrive ? 5.0 : 0.5;
          
          let isCritical = false;
          let isWarning = false;

          if (isSystemDrive) {
            if (freeGB < 1.5 || freePercent < 5) {
              isCritical = true;
            } else if (freeGB < 5.0 && freePercent < 15) {
              isWarning = true;
            }
          } else {
            if (freeGB < 0.3 || freePercent < 3) {
              isCritical = true;
            } else if (freeGB < 1.0 && freePercent < 15) {
              isWarning = true;
            }
          }

          return {
            serverId: s.id,
            serverName: s.name || s.ipPort,
            ipPort: s.ipPort,
            drive,
            freeGB,
            totalGB,
            usedGB,
            freePercent,
            usedPercent,
            thresholdGB,
            isWarning,
            isCritical,
            severity: isCritical ? 'CRITICAL' : (isWarning ? 'WARNING' : 'HEALTHY')
          };
        });
      }
      return [];
    });
  }, [servers, telemetryData]);

  const storageAlertsList = useMemo(() => {
    return allServerDrivesList.filter(d => d.isWarning || d.isCritical);
  }, [allServerDrivesList]);

  // Disabled / Suspended accounts across nodes
  const disabledUsersList = useMemo(() => {
    return servers.flatMap(s => {
      const sIpPure = s.ipPort ? s.ipPort.split(':')[0] : '';
      const tData = telemetryData[s.id] || telemetryData[s.ipPort] || telemetryData[s.name] || (sIpPure && telemetryData[sIpPure]) || null;
      const rawDisabled = tData?.disabledServerUsers || s.lastKnownDisabledUsers;
      const agentDisabledNames = Array.isArray(rawDisabled)
        ? rawDisabled.map(u => (u || '').toLowerCase())
        : (typeof rawDisabled === 'string' && rawDisabled ? [rawDisabled.toLowerCase()] : []);

      const items = [];

      agentDisabledNames.forEach(uLower => {
        const matched = users.find(usr => 
          (usr.username || '').toLowerCase() === uLower && 
          (usr.serverId === s.id || usr.serverId === s.ipPort || usr.serverId === s.name || (sIpPure && usr.serverId === sIpPure))
        );
        items.push({
          id: `dis-agent-${s.id}-${uLower}`,
          username: matched ? matched.username : uLower,
          company: matched ? matched.company : uLower,
          serverId: s.id,
          serverName: s.name,
          serverIp: s.ipPort || s.name,
          reason: 'Windows Local Account Disabled',
          userObj: matched || { username: uLower, company: uLower, serverId: s.id }
        });
      });

      users.filter(u => 
        u.serverId === s.id || u.serverId === s.ipPort || u.serverId === s.name || (sIpPure && u.serverId === sIpPure)
      ).forEach(u => {
        const uLower = (u.username || '').toLowerCase();
        const statusLower = (u.status || '').toLowerCase();
        const isSuspendedOrDisabled = statusLower === 'disabled' || statusLower === 'suspended' || statusLower === 'inactive' || statusLower === 'expired' || u.isDisabled === true;
        
        if (isSuspendedOrDisabled && !agentDisabledNames.includes(uLower)) {
          items.push({
            id: `dis-db-${s.id}-${uLower}`,
            username: u.username,
            company: u.company || u.username,
            serverId: s.id,
            serverName: s.name,
            serverIp: s.ipPort || s.name,
            reason: `Subscription ${u.status || 'Disabled'}`,
            userObj: u
          });
        }
      });

      return items;
    });
  }, [servers, users, telemetryData]);

  // Daily User Activity state & computation
  const [dailyReportDate, setDailyReportDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [dailyReportUserFilter, setDailyReportUserFilter] = useState('');
  const [dailyReportStatusFilter, setDailyReportStatusFilter] = useState('ALL');
  const [dailyReportServerFilter, setDailyReportServerFilter] = useState('ALL');

  const dailyReportList = useMemo(() => {
    return servers.flatMap(s => {
      if (dailyReportServerFilter !== 'ALL' && s.id !== dailyReportServerFilter) return [];

      const tData = telemetryData[s.id] || telemetryData[s.ipPort] || null;
      const sActiveUsers = (tData && Array.isArray(tData.activeUsersList)) ? tData.activeUsersList : [];
      const sAllUsers = (tData && Array.isArray(tData.allServerUsers)) ? tData.allServerUsers : users.filter(u => u.serverId === s.id).map(u => u.username);

      return sAllUsers.map(uName => {
        const uLower = (uName || '').toLowerCase();
        const matchedClient = users.find(usr => (usr.username || '').toLowerCase() === uLower && usr.serverId === s.id);
        const activeSessObj = sActiveUsers.find(au => (typeof au === 'string' ? au : au.username || '').toLowerCase() === uLower);
        const isActiveNow = !!activeSessObj;
        const activeLogonTime = (typeof activeSessObj === 'object' && activeSessObj.logonTime && activeSessObj.logonTime !== 'Live') ? activeSessObj.logonTime : '09:30 AM';

        if (dailyReportUserFilter && !uLower.includes(dailyReportUserFilter.toLowerCase())) return null;

        const currentStatus = isActiveNow ? 'Active' : 'LoggedOut';
        if (dailyReportStatusFilter !== 'ALL' && currentStatus.toLowerCase() !== dailyReportStatusFilter.toLowerCase()) return null;

        const realDailyItem = (tData && Array.isArray(tData.dailyUserActivity))
          ? tData.dailyUserActivity.find(d => d.username && d.username.toLowerCase() === uLower)
          : null;

        if (isActiveNow) {
          return {
            id: `rpt-${s.id}-${uLower}`,
            serverId: s.id,
            serverName: s.name,
            username: uName,
            company: matchedClient ? matchedClient.company : uName,
            firstLogin: (realDailyItem && realDailyItem.firstLogin) ? realDailyItem.firstLogin : activeLogonTime,
            lastLogout: '● Currently Active',
            sessionCount: (realDailyItem && realDailyItem.sessionCount) ? realDailyItem.sessionCount : 1,
            totalUsageFormatted: getElapsedActiveTime(activeLogonTime),
            currentStatus: 'Active'
          };
        }

        if (realDailyItem) {
          return {
            id: `rpt-${s.id}-${uLower}`,
            serverId: s.id,
            serverName: s.name,
            username: uName,
            company: matchedClient ? matchedClient.company : uName,
            firstLogin: realDailyItem.firstLogin || 'No Logins Today',
            lastLogout: realDailyItem.lastLogout || 'N/A',
            sessionCount: realDailyItem.sessionCount || 0,
            totalUsageFormatted: realDailyItem.totalUsageFormatted || '0m',
            currentStatus: 'LoggedOut'
          };
        }

        return {
          id: `rpt-${s.id}-${uLower}`,
          serverId: s.id,
          serverName: s.name,
          username: uName,
          company: matchedClient ? matchedClient.company : uName,
          firstLogin: 'No Logins Today',
          lastLogout: 'N/A',
          sessionCount: 0,
          totalUsageFormatted: '0m',
          currentStatus: 'LoggedOut'
        };
      }).filter(Boolean);
    });
  }, [servers, telemetryData, users, dailyReportServerFilter, dailyReportUserFilter, dailyReportStatusFilter]);

  const totalUsers = users.length;
  const totalServers = servers.length;
  const isFleetUnconfigured = totalServers === 0;
  const sharedCount = users.filter(u => u.clientType !== 'Dedicated').length;
  const dedicatedCount = users.filter(u => u.clientType === 'Dedicated').length;

  const expiringSoonUsers = useMemo(() => {
    return users.filter(u => {
      const d = getDaysRemaining(u.expiryDate);
      return d >= 0 && d <= 15;
    });
  }, [users]);

  const expiredUsers = useMemo(() => {
    return users.filter(u => getDaysRemaining(u.expiryDate) < 0);
  }, [users]);

  // Consolidate Critical Alerts count across all dimensions
  const criticalAlertsTotal = useMemo(() => {
    const offlineNodes = offlineServersCount;
    const highRamNodes = highRamWarningServers.length;
    const critStorage = storageAlertsList.filter(d => d.isCritical).length;
    const expiredCount = expiredUsers.length;
    return offlineNodes + highRamNodes + critStorage + expiredCount;
  }, [offlineServersCount, highRamWarningServers.length, storageAlertsList, expiredUsers.length]);

  // Inactivity breakdown map for drill-down modal
  const serverInactivityMap = useMemo(() => {
    return servers.map(server => {
      const tData = telemetryData[server.id] || telemetryData[server.ipPort] || null;
      const isLiveAgent = tData && tData.isRealAgent;

      let inactiveUsersList = [];

      if (isLiveAgent && Array.isArray(tData.allServerUsers) && tData.allServerUsers.length > 0) {
        const allPhysical = tData.allServerUsers;
        const activeSessions = (tData.activeUsersList || []).map(u => (typeof u === 'string' ? u : u.username || '').toLowerCase());
        
        allPhysical.forEach(accName => {
          const matched = users.find(u => (u.username || '').toLowerCase() === accName.toLowerCase() && u.serverId === server.id);
          const isActiveNow = activeSessions.includes(accName.toLowerCase());
          const hasActivityToday = isActiveNow || (Array.isArray(tData.dailyUserActivity) && tData.dailyUserActivity.some(d => (d.username || '').toLowerCase() === accName.toLowerCase()));

          const baseObj = matched || {
            id: `live-${accName}`,
            username: accName,
            company: accName,
            serverId: server.id,
            drive: 'Local',
            expiryDate: '2099-12-31'
          };

          const daysInact = getDaysInactive(baseObj);
          if (daysInact >= 7 && !hasActivityToday) {
            inactiveUsersList.push(baseObj);
          }
        });
      } else {
        const sUsers = users.filter(u => u.serverId === server.id);
        inactiveUsersList = sUsers.filter(u => getDaysInactive(u) >= 7);
      }

      return {
        server,
        inactiveUsers: inactiveUsersList,
        inactiveCount: inactiveUsersList.length
      };
    });
  }, [servers, telemetryData, users]);

  const inactiveUsers7Days = useMemo(() => {
    return serverInactivityMap.flatMap(s => s.inactiveUsers);
  }, [serverInactivityMap]);

  const currentModalServerObj = selectedServerModalId === 'ALL'
    ? {
        server: { name: 'All Server Nodes Combined', ipPort: 'Fleet Aggregated' },
        inactiveUsers: inactiveUsers7Days
      }
    : serverInactivityMap.find(s => s.server.id === selectedServerModalId);

  const recentUsers = useMemo(() => [...users].slice(0, 5), [users]);
  const recentLogs = useMemo(() => [...auditLogs].slice(0, 5), [auditLogs]);

  return (
    <div className={`dashboard-view${isFleetUnconfigured ? ' is-unconfigured' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '32px' }}>
      <header className="dashboard-command-header">
        <div>
          <span className="dashboard-eyebrow">Operations overview</span>
          <h1>Command desk</h1>
          <p>Manage your VPS fleet, monitor live sessions, and handle the work that needs attention.</p>
        </div>
        <div className={`dashboard-status-note${criticalAlertsTotal > 0 ? ' has-alerts' : ''}${isFleetUnconfigured ? ' needs-setup' : ''}`}>
          <span className="dashboard-status-dot" />
          <span>{isFleetUnconfigured ? 'Setup required — no VPS nodes configured' : criticalAlertsTotal > 0 ? `${criticalAlertsTotal} items need review` : 'Fleet operating normally'}</span>
          {(criticalAlertsTotal > 0 || isFleetUnconfigured) && <button type="button" onClick={isFleetUnconfigured ? onNavigateToVps : () => document.getElementById('operational-alerts-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>{isFleetUnconfigured ? 'Add VPS' : 'Review alerts'} <ArrowUpRight size={14} /></button>}
        </div>
      </header>
      <section className="dashboard-priority-queue" aria-labelledby="priority-queue-title">
        <div className="dashboard-priority-heading">
          <span className="dashboard-eyebrow">Today’s work</span>
          <h2 id="priority-queue-title">Priority queue</h2>
          <p>Handle these items to keep every Tally workspace available.</p>
        </div>
        <div className="dashboard-priority-items">
          {offlineServersCount > 0 && (
            <button type="button" className="dashboard-priority-item is-critical" onClick={onNavigateToVps}>
              <AlertTriangle size={17} />
              <span><strong>{offlineServersCount} hosting node{offlineServersCount === 1 ? '' : 's'} unreachable</strong><small>Users on these nodes may be unable to work.</small></span>
              <ArrowUpRight size={16} />
            </button>
          )}
          {storageAlertsList.length > 0 && (
            <button type="button" className="dashboard-priority-item is-warning" onClick={onNavigateToStorage}>
              <HardDrive size={17} />
              <span><strong>{storageAlertsList.length} workspace disk warning{storageAlertsList.length === 1 ? '' : 's'}</strong><small>Free up space before Tally data or backups are affected.</small></span>
              <ArrowUpRight size={16} />
            </button>
          )}
          {(expiredUsers.length > 0 || expiringSoonUsers.length > 0) && (
            <button type="button" className="dashboard-priority-item is-neutral" onClick={onNavigateToRenewals}>
              <Clock size={17} />
              <span><strong>{expiredUsers.length + expiringSoonUsers.length} subscription{expiredUsers.length + expiringSoonUsers.length === 1 ? '' : 's'} need review</strong><small>Keep access active and prevent avoidable service interruptions.</small></span>
              <ArrowUpRight size={16} />
            </button>
          )}
          {criticalAlertsTotal === 0 && totalServers === 0 && (
            <button type="button" className="dashboard-priority-clear" onClick={onNavigateToVps}><Server size={18} /><span><strong>Register your first VPS node</strong><small>Add a Windows VPS before monitoring, sessions, or workspaces can be managed.</small></span></button>
          )}
          {criticalAlertsTotal === 0 && totalServers > 0 && (
            <div className="dashboard-priority-clear"><CheckCircle2 size={18} /><span><strong>No urgent work</strong><small>Hosting nodes, storage and subscriptions are in a healthy state.</small></span></div>
          )}
        </div>
      </section>
      {/* =========================================================================
          1. CONSOLIDATED FOUR PRIMARY ENTERPRISE KPI CARDS
          ========================================================================= */}
      <div className="kpi-grid-4 dashboard-kpi-grid">
        {/* KPI 1: Active Sessions */}
        <div
          onClick={() => {
            const el = document.getElementById('live-active-sessions-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          role="button"
          tabIndex={0}
          aria-label="Active Sessions � click to scroll to live sessions table"
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { const el = document.getElementById("live-active-sessions-section"); if (el) el.scrollIntoView({ behavior: "smooth" }); }}}
          className="surface-card surface-card-interactive"
          style={{
            background: 'linear-gradient(180deg, rgba(16, 24, 40, 0.92) 0%, rgba(10, 15, 26, 0.96) 100%)',
            borderColor: allActiveSessionsList.length > 0 ? 'rgba(16, 185, 129, 0.35)' : 'rgba(255, 255, 255, 0.08)',
            borderLeft: '3px solid var(--accent-emerald)',
            boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.08), 0 8px 24px -4px rgba(0, 0, 0, 0.6)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--accent-emerald)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="live-beacon" />
              Live Tally Users
            </span>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              color: 'var(--accent-emerald)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(16, 185, 129, 0.25)'
            }}>
              <RadioTower size={16} />
            </div>
          </div>
          <div style={{ fontSize: '30px', fontWeight: '800', color: '#ffffff', lineHeight: 1.1, letterSpacing: '-0.04em' }}>
            {allActiveSessionsList.length}
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-emerald)', marginLeft: '6px', verticalAlign: 'middle', letterSpacing: '0.04em' }}>
              ONLINE
            </span>
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: '500', marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>TSplus HTML5 &amp; RDP</span>
            <span style={{ color: 'var(--accent-emerald)', fontWeight: '600' }}>Live Stream &rarr;</span>
          </div>
        </div>

        {/* KPI 2: Online VPS Nodes */}
        <div
          onClick={onNavigateToVps}
          role="button"
          tabIndex={0}
          aria-label="Online VPS Nodes � navigate to VPS fleet view"
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onNavigateToVps?.(); }}
          className="surface-card surface-card-interactive"
          style={{
            background: 'linear-gradient(180deg, rgba(16, 24, 40, 0.92) 0%, rgba(10, 15, 26, 0.96) 100%)',
            borderColor: 'rgba(56, 189, 248, 0.25)',
            borderLeft: '3px solid var(--accent-sky)',
            boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.08), 0 8px 24px -4px rgba(0, 0, 0, 0.6)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--accent-sky)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Hosting Nodes
            </span>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              color: 'var(--accent-sky)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(56, 189, 248, 0.25)'
            }}>
              <Server size={16} />
            </div>
          </div>
          <div style={{ fontSize: '30px', fontWeight: '800', color: '#ffffff', lineHeight: 1.1, letterSpacing: '-0.04em' }}>
            {onlineServersCount}
            <span style={{ fontSize: '13.5px', fontWeight: '600', color: 'var(--text-muted)', marginLeft: '6px' }}>
              / {totalServers} Nodes
            </span>
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: '500', marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: isFleetUnconfigured ? 'var(--accent-amber)' : offlineServersCount === 0 ? 'var(--accent-emerald)' : 'var(--accent-amber)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {isFleetUnconfigured ? <AlertCircle size={12} /> : <CheckCircle2 size={12} />} {isFleetUnconfigured ? 'Not configured' : offlineServersCount === 0 ? '100% Reachable' : `${offlineServersCount} Node(s) Offline`}
            </span>
            <span style={{ color: 'var(--accent-sky)', fontWeight: '600' }}>Fleet &rarr;</span>
          </div>
        </div>

        {/* KPI 3: Registered Clients */}
        <div
          onClick={onNavigateToUsers}
          role="button"
          tabIndex={0}
          aria-label="Registered Clients � navigate to client subscriptions"
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onNavigateToUsers?.(); }}
          className="surface-card surface-card-interactive"
          style={{
            background: 'linear-gradient(180deg, rgba(16, 24, 40, 0.92) 0%, rgba(10, 15, 26, 0.96) 100%)',
            borderColor: 'rgba(59, 130, 246, 0.25)',
            borderLeft: '3px solid var(--accent-blue)',
            boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.08), 0 8px 24px -4px rgba(0, 0, 0, 0.6)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--accent-blue)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Tally Workspaces
            </span>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(59, 130, 246, 0.12)',
              color: 'var(--accent-blue)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(59, 130, 246, 0.25)'
            }}>
              <Users size={16} />
            </div>
          </div>
          <div style={{ fontSize: '30px', fontWeight: '800', color: '#ffffff', lineHeight: 1.1, letterSpacing: '-0.04em' }}>
            {totalUsers}
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: '600', marginLeft: '6px' }}>
              Clients
            </span>
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: '500', marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{sharedCount} Shared • {dedicatedCount} Dedicated</span>
            <span style={{ color: 'var(--accent-blue)', fontWeight: '600' }}>Manage &rarr;</span>
          </div>
        </div>

        {/* KPI 4: Critical Alerts */}
        <div
          onClick={() => {
            const el = document.getElementById('operational-alerts-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          role="button"
          tabIndex={0}
          aria-label="Critical Alerts � scroll to operational alerts section"
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { const el = document.getElementById("operational-alerts-section"); if (el) el.scrollIntoView({ behavior: "smooth" }); }}}
          className="surface-card surface-card-interactive"
          style={{
            background: 'linear-gradient(180deg, rgba(16, 24, 40, 0.92) 0%, rgba(10, 15, 26, 0.96) 100%)',
            borderColor: criticalAlertsTotal > 0 ? 'rgba(244, 63, 94, 0.35)' : 'rgba(16, 185, 129, 0.25)',
            borderLeft: criticalAlertsTotal > 0 ? '3px solid var(--accent-rose)' : '3px solid var(--accent-emerald)',
            boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.08), 0 8px 24px -4px rgba(0, 0, 0, 0.6)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{
              fontSize: '11px',
              color: criticalAlertsTotal > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.06em'
            }}>
              Needs Action
            </span>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: criticalAlertsTotal > 0 ? 'rgba(244, 63, 94, 0.12)' : 'rgba(16, 185, 129, 0.12)',
              color: criticalAlertsTotal > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `1px solid ${criticalAlertsTotal > 0 ? 'rgba(244, 63, 94, 0.25)' : 'rgba(16, 185, 129, 0.25)'}`
            }}>
              <AlertTriangle size={16} />
            </div>
          </div>
          <div style={{
            fontSize: '30px',
            fontWeight: '800',
            color: criticalAlertsTotal > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)',
            lineHeight: 1.1,
            letterSpacing: '-0.04em'
          }}>
            {criticalAlertsTotal}
            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', marginLeft: '6px', letterSpacing: '0.04em' }}>
              {totalServers === 0 ? 'SETUP' : criticalAlertsTotal === 0 ? 'ALL CLEAR' : 'WARNINGS'}
            </span>
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: '500', marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {criticalAlertsTotal === 0 ? 'Zero active warnings' : `${expiredUsers.length} Expired • ${storageAlertsList.length} Disk • ${highRamWarningServers.length} RAM`}
            </span>
            <span style={{ color: criticalAlertsTotal > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)', flexShrink: 0, marginLeft: '6px', fontWeight: '600' }}>Inspect &rarr;</span>
          </div>
        </div>
      </div>

      {totalServers === 0 && (
        <div className="dashboard-setup-row">
        <section className="vps-onboarding-panel" aria-labelledby="vps-onboarding-title">
          <div className="vps-onboarding-copy">
            <span className="dashboard-eyebrow">Fleet setup</span>
            <h2 id="vps-onboarding-title">Start by registering your first VPS node</h2>
            <p>Add your Windows VPS infrastructure to begin monitoring node health, remote sessions, storage, and client workspaces from one place.</p>
            <div className="vps-onboarding-actions">
              <button type="button" className="btn btn-primary" onClick={onNavigateToVps}><Server size={16} /> Add VPS</button>
              {onQuickOnboard && <button type="button" className="btn btn-secondary" onClick={onQuickOnboard}>View setup guide <ArrowUpRight size={15} /></button>}
            </div>
          </div>
          <ol className="vps-onboarding-steps" aria-label="VPS setup steps">
            <li><span>1</span><div><strong>Register VPS node</strong><small>Add your server details and secure access.</small></div></li>
            <li><span>2</span><div><strong>Enable monitoring</strong><small>Install the agent to report live health.</small></div></li>
            <li><span>3</span><div><strong>Allocate workspaces</strong><small>Assign Tally users after the node is ready.</small></div></li>
          </ol>
        </section>
        <aside className="setup-action-centre" aria-labelledby="setup-action-title">
          <header><div><Layers size={17} /><h2 id="setup-action-title">Action Centre</h2></div><span>0 of 4 completed</span></header>
          <div className="setup-action-list">
            <div className="setup-action-item"><span className="setup-action-pip" /><Server size={15} /><div><strong>Register your first VPS node</strong><small>Add a Windows server to start monitoring.</small></div><button type="button" className="btn btn-primary btn-xs" onClick={onNavigateToVps}>Add VPS</button></div>
            <div className="setup-action-item"><span className="setup-action-pip" /><Activity size={15} /><div><strong>Install monitoring agent</strong><small>Enable health, sessions and storage metrics.</small></div>{onQuickOnboard && <button type="button" className="btn btn-secondary btn-xs" onClick={onQuickOnboard}>View Guide</button>}</div>
            <div className="setup-action-item"><span className="setup-action-pip" /><Users size={15} /><div><strong>Allocate client workspaces</strong><small>Assign Tally users and configure access.</small></div><button type="button" className="btn btn-secondary btn-xs" onClick={onNavigateToUsers}>Manage</button></div>
            <div className="setup-action-item"><span className="setup-action-pip" /><Settings size={15} /><div><strong>Review system settings</strong><small>Configure alerts and notification preferences.</small></div></div>
          </div>
        </aside>
        </div>
      )}

      {/* =========================================================================
          2. REAL-TIME ACTIVE SESSIONS & CRITICAL ALERT COMMAND CENTER (BENTO GRID)
          ========================================================================= */}
      <div className="dashboard-grid dashboard-grid-primary" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: '16px'
      }}>
        {/* Left Column (8 cols): Real-Time Active Sessions */}
        <div style={{ gridColumn: 'span 8' }} className="bento-col-8">
          <div id="live-active-sessions-section" className="surface-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '18px 20px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '14px',
              paddingBottom: '12px',
              borderBottom: '1px solid var(--border-subtle)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  color: 'var(--accent-emerald)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(16, 185, 129, 0.25)'
                }}>
                  <RadioTower size={17} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ fontSize: '15.5px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.025em' }}>
                      Real-Time Active Sessions
                    </h3>
                    <span className="badge badge-emerald" style={{ fontSize: '10.5px' }}>
                      ● {filteredActiveSessions.length} Connected
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '3px 0 0 0', fontWeight: '500' }}>
                    Live active connections to TSplus HTML5 &amp; RDP across Windows VPS nodes.
                  </p>
                </div>
              </div>

              {/* Controls: Search + Node Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', width: '180px' }}>
                  <Search size={13} color="var(--text-muted)" style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    placeholder="Search active users..."
                    value={activeSessionSearch}
                    onChange={e => setActiveSessionSearch(e.target.value)}
                    className="input"
                    style={{ height: '30px', paddingLeft: '28px', fontSize: '11.5px' }}
                  />
                </div>

                <select
                  value={activeSessionServerFilter}
                  onChange={e => setActiveSessionServerFilter(e.target.value)}
                  className="select"
                  style={{ height: '30px', fontSize: '11.5px', width: 'auto', minWidth: '150px' }}
                >
                  <option value="ALL">All Nodes ({allActiveSessionsList.length})</option>
                  {servers.map(srv => {
                    const count = allActiveSessionsList.filter(s => s.serverId === srv.id).length;
                    return (
                      <option key={srv.id} value={srv.id}>
                        {srv.name} ({count})
                      </option>
                    );
                  })}
                </select>

                {onNavigateToSessions && (
                  <button
                    onClick={onNavigateToSessions}
                    className="btn btn-secondary btn-xs font-mono"
                    style={{ height: '30px', padding: '0 10px', fontSize: '11px' }}
                  >
                    Gateways &rarr;
                  </button>
                )}
              </div>
            </div>

            {/* Live Sessions Table */}
            <div className="table-wrapper" style={{ flex: 1, maxHeight: '420px', overflowY: 'auto' }}>
              <div className="table-container">
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th scope="col">Active User &amp; Client</th>
                      <th scope="col">Assigned Company</th>
                      <th scope="col">Target VPS Node &amp; IP</th>
                      <th scope="col">Session State</th>
                      <th scope="col">Connected Duration</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Remote Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActiveSessions.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', padding: '44px 20px', color: 'var(--text-muted)' }}>
                          <div style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: 'var(--radius-lg)',
                            backgroundColor: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid var(--border-default)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 10px',
                            color: 'var(--text-muted)'
                          }}>
                            <RadioTower size={20} style={{ opacity: 0.6 }} />
                          </div>
                          <div style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                            {totalServers === 0 ? 'No monitoring data available' : 'No Active User Sessions'}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', maxWidth: '380px', margin: '0 auto' }}>
                            {activeSessionSearch || activeSessionServerFilter !== 'ALL'
                              ? 'No active connections match the current search or server filter criteria.'
                              : totalServers === 0
                                ? 'Register a VPS node and enable monitoring to receive live session data.'
                                : 'All clients and remote users are currently disconnected across the VPS fleet.'}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredActiveSessions.map(sess => {
                        const dur = getElapsedActiveTime(sess.logonTime || sess.connectedSince);

                        return (
                          <tr key={sess.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="live-beacon" />
                                <div>
                                  <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '12.5px' }}>
                                    {sess.username || sess.userName || 'Active User'}
                                  </div>
                                  <div className="font-mono" style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                                    Session #{sess.sessionId || 'Active'}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span style={{ fontWeight: '600', color: 'var(--text-secondary)', fontSize: '12px' }}>
                                {sess.company}
                              </span>
                            </td>
                            <td>
                              <div>
                                <span className="font-mono" style={{ fontSize: '12px', fontWeight: '600', color: 'var(--accent-sky)' }}>
                                  {sess.serverName}
                                </span>
                                <div className="font-mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                  {sess.serverIp}
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="badge badge-emerald" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                                Active
                              </span>
                            </td>
                            <td>
                              <span className="font-mono" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                                {dur}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                onClick={() => onDirectRemoteConnect(sess.userObj, 'USER')}
                                className="btn btn-secondary btn-xs font-mono"
                                style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--accent-emerald)', borderColor: 'rgba(16, 185, 129, 0.35)' }}
                                title="1-Click Direct Remote Login"
                              >
                                <Zap size={11} /> Connect
                              </button>
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
        </div>

        {/* Right Column (4 cols): Operational Alert Command Center */}
        <div style={{ gridColumn: 'span 4' }} className="bento-col-4">
          <div id="operational-alerts-section" className="surface-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={16} color={isFleetUnconfigured ? "var(--accent-amber)" : criticalAlertsTotal > 0 ? "var(--accent-rose)" : "var(--accent-emerald)"} />
                <h3 style={{ fontSize: '15.5px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                  {isFleetUnconfigured ? 'Action Centre' : 'Alert Center'}
                </h3>
              </div>
              <span className={`badge ${isFleetUnconfigured ? 'badge-amber' : criticalAlertsTotal > 0 ? 'badge-rose' : 'badge-emerald'}`} style={{ fontSize: '10.5px' }}>
                {isFleetUnconfigured ? '0 of 4 completed' : criticalAlertsTotal === 0 ? 'All Clear' : `${criticalAlertsTotal} Active`}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto', maxHeight: '420px' }}>
              {isFleetUnconfigured ? (
                <div className="setup-action-list">
                  <div className="setup-action-item"><span className="setup-action-pip" /><Server size={15} /><div><strong>Register your first VPS node</strong><small>Add a Windows server to start monitoring.</small></div><button type="button" className="btn btn-primary btn-xs" onClick={onNavigateToVps}>Add VPS</button></div>
                  <div className="setup-action-item"><span className="setup-action-pip" /><Activity size={15} /><div><strong>Install monitoring agent</strong><small>Enable health, sessions and storage metrics.</small></div>{onQuickOnboard && <button type="button" className="btn btn-secondary btn-xs" onClick={onQuickOnboard}>View Guide</button>}</div>
                  <div className="setup-action-item"><span className="setup-action-pip" /><Users size={15} /><div><strong>Allocate client workspaces</strong><small>Assign Tally users and configure access.</small></div><button type="button" className="btn btn-secondary btn-xs" onClick={onNavigateToUsers}>Manage</button></div>
                  <div className="setup-action-item"><span className="setup-action-pip" /><Settings size={15} /><div><strong>Review system settings</strong><small>Configure alerts and notification preferences.</small></div></div>
                </div>
              ) : criticalAlertsTotal === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', color: 'var(--accent-emerald)' }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid rgba(16, 185, 129, 0.25)'
                  }}>
                    <CheckCircle2 size={24} color="var(--accent-emerald)" />
                  </div>
                  <div style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)' }}>
                    {isFleetUnconfigured ? 'Monitoring is not configured yet' : 'All Fleet Systems Healthy'}
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: '240px' }}>
                    {isFleetUnconfigured ? 'Add your first VPS node before the fleet can report infrastructure health or alerts.' : 'Zero offline server nodes, zero storage warnings, and all client subscriptions are active.'}
                  </div>
                </div>
              ) : (
                <>
                  {/* Offline Nodes Alert */}
                  {offlineServersCount > 0 && (
                    <div style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'rgba(244, 63, 94, 0.08)',
                      border: '1px solid rgba(244, 63, 94, 0.3)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-rose)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Server size={13} /> {offlineServersCount} VPS Node(s) Offline
                        </span>
                        {onNavigateToVps && (
                          <button onClick={onNavigateToVps} className="btn btn-ghost btn-xs font-mono" style={{ fontSize: '10.5px', color: 'var(--accent-rose)', padding: '1px 6px' }}>
                            Inspect &rarr;
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Nodes unreachable via live agent telemetry heartbeat.
                      </div>
                    </div>
                  )}

                  {/* Storage Critical Alert */}
                  {storageAlertsList.length > 0 && (
                    <div style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <HardDrive size={13} /> {storageAlertsList.length} Storage Warning(s)
                        </span>
                        {onNavigateToStorage && (
                          <button onClick={onNavigateToStorage} className="btn btn-ghost btn-xs font-mono" style={{ fontSize: '10.5px', color: 'var(--accent-amber)', padding: '1px 6px' }}>
                            View &rarr;
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {storageAlertsList.slice(0, 2).map(s => `${s.serverName} (${s.drive}: ${s.freeGB.toFixed(1)}GB)`).join(', ')}
                      </div>
                    </div>
                  )}

                  {/* Expired Clients Alert */}
                  {expiredUsers.length > 0 && (
                    <div style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'rgba(244, 63, 94, 0.08)',
                      border: '1px solid rgba(244, 63, 94, 0.3)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-rose)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Users size={13} /> {expiredUsers.length} Expired Account(s)
                        </span>
                        {onNavigateToRenewals && (
                          <button onClick={onNavigateToRenewals} className="btn btn-ghost btn-xs font-mono" style={{ fontSize: '10.5px', color: 'var(--accent-rose)', padding: '1px 6px' }}>
                            Renew &rarr;
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Users past subscription validity period awaiting renewal.
                      </div>
                    </div>
                  )}

                  {/* High RAM Warning Servers */}
                  {highRamWarningServers.length > 0 && (
                    <div style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'rgba(168, 85, 247, 0.08)',
                      border: '1px solid rgba(168, 85, 247, 0.3)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Cpu size={13} /> {highRamWarningServers.length} High Memory Node(s)
                        </span>
                        <button onClick={() => setHardwareTab('RAM')} className="btn btn-ghost btn-xs font-mono" style={{ fontSize: '10.5px', color: 'var(--accent-purple)', padding: '1px 6px' }}>
                          Inspect &rarr;
                        </button>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {highRamWarningServers.slice(0, 2).map(s => `${s.name}: ${s.ramPercent}% RAM`).join(', ')}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          3. FLEET NODES HEALTH & RESOURCE UTILIZATION MATRIX
          ========================================================================= */}
      <div className="dashboard-grid dashboard-grid-fleet" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: '16px'
      }}>
        {/* Left Column (7 cols): Server Nodes Live Health */}
        <div style={{ gridColumn: 'span 7' }} className="bento-col-7">
          <div className="surface-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '14px', padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Server size={16} color="var(--accent-sky)" />
                <h3 style={{ fontSize: '15.5px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                  VPS Server Fleet Health &amp; Nodes
                </h3>
                <span className="badge badge-neutral" style={{ fontSize: '10.5px' }}>
                  {servers.length} Nodes
                </span>
              </div>
              <button
                onClick={onNavigateToVps}
                className="btn btn-ghost btn-sm font-mono"
                style={{ fontSize: '11px', color: 'var(--accent-sky)', padding: '2px 8px' }}
              >
                Fleet Details &rarr;
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto', maxHeight: '420px' }}>
              <div className="fleet-health-metrics" aria-label="Fleet health summary">
                <span><i className="metric-dot total" /> <strong>{totalServers}</strong><small>Total Nodes</small></span>
                <span><i className="metric-dot online" /> <strong>{onlineServersCount}</strong><small>Online</small></span>
                <span><i className="metric-dot offline" /> <strong>{offlineServersCount}</strong><small>Offline</small></span>
                <span><i className="metric-dot maintenance" /> <strong>0</strong><small>Maintenance</small></span>
              </div>
              {isFleetUnconfigured ? (
                <div className="fleet-health-empty">
                  <Server size={22} />
                  <strong>No VPS nodes configured yet</strong>
                  <small>Add your first VPS node to view server health, resource usage and availability.</small>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={onNavigateToVps}><Server size={13} /> Add VPS Node</button>
                </div>
              ) : servers.map(server => {
                const sIpPure = server.ipPort ? server.ipPort.split(':')[0] : '';
                const tele = telemetryData[server.id] || telemetryData[server.ipPort] || telemetryData[server.name] || (sIpPure && telemetryData[sIpPure]) || null;
                const isOnline = !!(tele && tele.lastPingTimestamp && (Date.now() - tele.lastPingTimestamp < 3 * 60 * 1000));
                const cpuUsage = tele ? tele.cpuUsage || 0 : 0;
                const ramPercent = tele ? (tele.ramPercent || (tele.ramTotalGB ? Math.round((tele.ramUsedGB / tele.ramTotalGB) * 100) : 0)) : 0;
                const serverUsers = users.filter(u => u.serverId === server.id);
                const limit = server.totalUsersLimit || 10;
                const pct = Math.min(100, Math.round((serverUsers.length / limit) * 100));
                const activeOnServer = allActiveSessionsList.filter(s => s.serverId === server.id).length;

                return (
                  <div
                    key={server.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-surface-inset)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          className={`status-pip ${isOnline ? 'status-pip-emerald' : 'status-pip-rose'}`}
                          title={isOnline ? 'Node Online' : 'Node Offline'}
                        />
                        <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                          {server.name}
                        </strong>
                        <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {server.ipPort}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className={`badge ${isOnline ? 'badge-emerald' : 'badge-rose'}`} style={{ fontSize: '10px' }}>
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                        <button
                          onClick={() => setActiveUsersModalServerId(server.id)}
                          className="btn btn-secondary btn-xs font-mono"
                          style={{ fontSize: '10.5px', padding: '2px 7px', color: 'var(--accent-sky)' }}
                          title="View Active Users on this node"
                        >
                          <Users size={11} /> {activeOnServer} Live
                        </button>
                      </div>
                    </div>

                    {/* Telemetry Metrics Strip */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '11px' }}>
                      <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: '700' }}>CPU Load</div>
                        <div style={{
                          fontWeight: '800',
                          color: isOnline ? (cpuUsage > 80 ? 'var(--accent-rose)' : (cpuUsage > 60 ? 'var(--accent-amber)' : 'var(--accent-emerald)')) : 'var(--text-dim)'
                        }}>
                          {isOnline ? `${cpuUsage}%` : '--'}
                        </div>
                      </div>

                      <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: '700' }}>RAM Usage</div>
                        <div style={{
                          fontWeight: '800',
                          color: isOnline ? (ramPercent > 85 ? 'var(--accent-rose)' : (ramPercent > 70 ? 'var(--accent-amber)' : 'var(--accent-sky)')) : 'var(--text-dim)'
                        }}>
                          {isOnline ? `${ramPercent}% (${parseFloat(tele?.ramUsedGB || 0).toFixed(1)} GB)` : '--'}
                        </div>
                      </div>

                      <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: '700' }}>Capacity</div>
                        <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                          {serverUsers.length} / {limit} ({pct}%)
                        </div>
                      </div>
                    </div>

                    {/* User Capacity Progress Bar */}
                    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="User capacity" style={{ height: '4px', width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${pct}%`,
                        backgroundColor: pct > 85 ? 'var(--accent-rose)' : (pct > 65 ? 'var(--accent-amber)' : 'var(--primary)'),
                        borderRadius: '2px',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Resource Alerts & Top Utilization */}
        <div style={{ gridColumn: 'span 5' }} className="bento-col-5">
          <div className="surface-card reference-sessions-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RadioTower size={16} color="var(--accent-emerald)" />
                <h3 style={{ fontSize: '15.5px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>Real-Time Active Sessions</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className="badge badge-emerald" style={{ fontSize: '10px' }}>● {allActiveSessionsList.length} Connected</span>
                {onNavigateToSessions && <button onClick={onNavigateToSessions} className="btn btn-ghost btn-xs" style={{ color: 'var(--primary)', padding: 0 }}>View All →</button>}
              </div>
            </div>
            <div className="table-wrapper reference-sessions-table">
              <table className="table-modern">
                <thead><tr><th>User &amp; Client</th><th>Assigned Company</th><th>Node &amp; IP</th><th>Session State</th><th>Duration</th><th>Actions</th></tr></thead>
                <tbody>
                  {allActiveSessionsList.length === 0 ? (
                    <tr><td colSpan="6"><div className="reference-session-empty"><RadioTower size={23} /><strong>No active user sessions</strong><small>{isFleetUnconfigured ? 'Register a VPS node and enable monitoring to see live session data across all clients and workspaces.' : 'No connected TSplus HTML5 or RDP sessions are currently reported.'}</small></div></td></tr>
                  ) : allActiveSessionsList.slice(0, 4).map(session => (
                    <tr key={session.id}><td><strong>{session.username}</strong></td><td>{session.company}</td><td><span className="font-mono">{session.serverName}</span></td><td><span className="badge badge-emerald">Active</span></td><td className="font-mono">{getElapsedActiveTime(session.logonTime)}</td><td>{onDirectRemoteConnect && <button onClick={() => onDirectRemoteConnect(session.userObj, 'USER')} className="btn btn-secondary btn-xs">Connect</button>}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {false && (
          <div className="surface-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '14px', padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Cpu size={16} color="var(--accent-purple)" />
                <h3 style={{ fontSize: '15.5px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                  Resource Constraints &amp; Headroom
                </h3>
              </div>

              {/* Toggle Tabs */}
              <div style={{ display: 'flex', gap: '3px', backgroundColor: 'var(--bg-surface-inset)', padding: '2px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <button
                  onClick={() => setHardwareTab('RAM')}
                  className={`btn btn-xs ${hardwareTab === 'RAM' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: '10.5px', padding: '2px 8px' }}
                >
                  RAM Load
                </button>
                <button
                  onClick={() => setHardwareTab('STORAGE')}
                  className={`btn btn-xs ${hardwareTab === 'STORAGE' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: '10.5px', padding: '2px 8px' }}
                >
                  Disk Storage ({storageAlertsList.length})
                </button>
              </div>
            </div>

            {/* Content: RAM View */}
            {hardwareTab === 'RAM' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto', maxHeight: '420px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Server nodes ranked by memory usage percentage. Threshold: &gt; 85%.
                </div>
                {topRamServersList.slice(0, 5).map((srv, idx) => {
                  const isHigh = srv.ramPercent >= 85;
                  const isCrit = srv.ramPercent >= 90;
                  const barColor = isCrit ? 'var(--accent-rose)' : (isHigh ? 'var(--accent-amber)' : 'var(--primary)');

                  return (
                    <div
                      key={srv.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--bg-surface-inset)',
                        border: `1px solid ${isHigh ? (isCrit ? 'rgba(244, 63, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)') : 'var(--border-subtle)'}`
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '10.5px', fontWeight: '800', color: 'var(--text-muted)' }}>#{idx + 1}</span>
                          <span style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--text-primary)' }}>{srv.name}</span>
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: '800', color: barColor }}>
                          {srv.ramPercent}% RAM
                        </span>
                      </div>

                      <div style={{ height: '5px', width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.06)', borderRadius: '2px', overflow: 'hidden', margin: '4px 0' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, srv.ramPercent)}%`, backgroundColor: barColor, borderRadius: '2px' }} />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--text-muted)' }}>
                        <span>Used: {srv.ramUsedGB} / {srv.ramTotalGB} GB</span>
                        <span>{srv.isOnline ? 'Online' : 'Offline'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Content: STORAGE View */}
            {hardwareTab === 'STORAGE' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto', maxHeight: '420px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
                  <span>Volumes requiring attention (Free space &lt; 15% or &lt; 5GB).</span>
                  {onNavigateToStorage && (
                    <button
                      onClick={onNavigateToStorage}
                      className="btn btn-ghost btn-xs font-mono"
                      style={{ fontSize: '10.5px', color: 'var(--accent-amber)', padding: 0 }}
                    >
                      All Disks &rarr;
                    </button>
                  )}
                </div>

                {storageAlertsList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--accent-emerald)', fontSize: '12.5px' }}>
                    <CheckCircle2 size={24} style={{ display: 'block', margin: '0 auto 8px' }} />
                    All server storage volumes meet health thresholds!
                  </div>
                ) : (
                  storageAlertsList.slice(0, 5).map((d, idx) => {
                    const barColor = d.isCritical ? 'var(--accent-rose)' : 'var(--accent-amber)';

                    return (
                      <div
                        key={idx}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-md)',
                          backgroundColor: 'var(--bg-surface-inset)',
                          border: `1px solid ${d.isCritical ? 'rgba(244, 63, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>
                            {d.serverName} ({d.drive})
                          </span>
                          <span className={`badge ${d.isCritical ? 'badge-rose' : 'badge-amber'}`} style={{ fontSize: '10px' }}>
                            {d.freeGB.toFixed(1)} GB Free
                          </span>
                        </div>

                        <div style={{ height: '5px', width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.06)', borderRadius: '2px', overflow: 'hidden', margin: '4px 0' }}>
                          <div style={{ height: '100%', width: `${Math.min(100, d.usedPercent)}%`, backgroundColor: barColor, borderRadius: '2px' }} />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--text-muted)' }}>
                          <span>Used: {d.usedGB.toFixed(1)} / {d.totalGB} GB</span>
                          <span style={{ color: barColor, fontWeight: '700' }}>{d.severity}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          4. LIFECYCLE ALERTS & SECURITY (2-COLUMN BENTO GRID)
          ========================================================================= */}
      <div id="subscription-lifecycle-section" className="dashboard-grid dashboard-secondary-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gap: '16px'
      }}>
        {/* Left Column (6 cols): Subscription Expiry Watchlist */}
        <div style={{ gridColumn: 'span 3' }} className="bento-col-6">
          <div className="surface-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={16} color="var(--accent-amber)" />
                <h3 style={{ fontSize: '15.5px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                  Subscription Expiry Watchlist
                </h3>
              </div>
              <button
                onClick={onNavigateToRenewals}
                className="btn btn-ghost btn-sm font-mono"
                style={{ fontSize: '11px', color: 'var(--accent-amber)', padding: '2px 8px' }}
              >
                All Renewals &rarr;
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto', maxHeight: '340px' }}>
              {expiringSoonUsers.length === 0 && expiredUsers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--accent-emerald)', fontSize: '12.5px' }}>
                  <CheckCircle2 size={24} style={{ display: 'block', margin: '0 auto 8px' }} />
                  {users.length === 0 ? 'No subscriptions configured.' : 'No accounts expiring in the next 15 days.'}
                </div>
              ) : (
                [...expiredUsers, ...expiringSoonUsers].slice(0, 5).map(user => {
                  const days = getDaysRemaining(user.expiryDate);
                  const isExpired = days < 0;
                  const server = servers.find(s => s.id === user.serverId);

                  const waMessage = encodeURIComponent(
                    `Hello ${user.company},\n\nYour VPS Cloud Subscription (${server ? server.name : 'VPS'}) expires on ${user.expiryDate} (${days} days remaining).\n\nThank you,\nInnovation Web Works Operations`
                  );

                  return (
                    <div
                      key={user.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--bg-surface-inset)',
                        border: `1px solid ${isExpired ? 'rgba(244, 63, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '12.5px' }}>
                          {user.company} <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: '500' }}>({user.username})</span>
                        </div>
                        <div style={{ fontSize: '11px', color: isExpired ? 'var(--accent-rose)' : 'var(--accent-amber)', marginTop: '2px' }}>
                          {isExpired ? `Expired ${Math.abs(days)} days ago` : `Expires in ${days} days (${user.expiryDate})`}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <a
                          href={`https://wa.me/${(user.customerPhone || "").replace(/[^0-9]/g, "")}?text=${waMessage}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary btn-xs"
                          style={{ color: 'var(--accent-emerald)', textDecoration: 'none', padding: '3px 8px', fontSize: '10.5px' }}
                          title="WhatsApp Renewal Reminder"
                        >
                          <MessageCircle size={11} /> WA
                        </a>
                        <button
                          onClick={() => onRenewUser(user.id)}
                          className="btn btn-primary btn-xs font-mono"
                          style={{ padding: '3px 8px', fontSize: '10.5px' }}
                          title="Extend +1 Year"
                        >
                          <RefreshCw size={11} /> +1 Yr
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column (6 cols): Disabled & Suspended Accounts */}
        <div style={{ gridColumn: 'span 3' }} className="bento-col-6">
          <div className="surface-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserMinus size={16} color="var(--accent-rose)" />
                <h3 style={{ fontSize: '15.5px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                  Disabled &amp; Suspended Accounts
                </h3>
              </div>
              {onNavigateToDisabledUsers && (
                <button
                  onClick={onNavigateToDisabledUsers}
                  className="btn btn-ghost btn-sm font-mono"
                  style={{ fontSize: '11px', color: 'var(--accent-rose)', padding: '2px 8px' }}
                >
                  Manage ({disabledUsersList.length}) &rarr;
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto', maxHeight: '340px' }}>
              {disabledUsersList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--accent-emerald)', fontSize: '12.5px' }}>
                  <CheckCircle2 size={24} style={{ display: 'block', margin: '0 auto 8px' }} />
                  Zero disabled or locked accounts across all VPS server nodes.
                </div>
              ) : (
                disabledUsersList.slice(0, 5).map(acc => (
                  <div
                    key={acc.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-surface-inset)',
                      border: '1px solid rgba(244, 63, 94, 0.25)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '700', color: 'var(--accent-rose)', fontSize: '12.5px' }}>
                        {acc.username}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {acc.company} • <span className="font-mono">{acc.serverName}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="badge badge-rose" style={{ fontSize: '10px' }}>
                        Locked
                      </span>
                      {onNavigateToDisabledUsers && (
                        <button
                          onClick={onNavigateToDisabledUsers}
                          className="btn btn-secondary btn-xs font-mono"
                          style={{ padding: '3px 8px', fontSize: '10.5px' }}
                        >
                          Inspect
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      {/* =========================================================================
          5. DAILY USER ACTIVITY & AUDIT TRAIL (COMPACT FOUR-CARD GRID)
          ========================================================================= */}
        {/* Left Column (7 cols): Daily Activity Tracker */}
        <div style={{ gridColumn: 'span 3' }} className="bento-col-7">
          <div className="surface-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={16} color="var(--primary)" />
                <h3 style={{ fontSize: '15.5px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                  Daily User Activity Tracker
                </h3>
              </div>

              {onNavigateToDailyActivity && (
                <button
                  onClick={onNavigateToDailyActivity}
                  className="btn btn-ghost btn-sm font-mono"
                  style={{ fontSize: '11px', color: 'var(--primary)', padding: '2px 8px' }}
                >
                  Full Report &rarr;
                </button>
              )}
            </div>

            {/* Quick Filters */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="date"
                value={dailyReportDate}
                onChange={e => setDailyReportDate(e.target.value)}
                className="input"
                style={{ height: '28px', width: 'auto', fontSize: '11px', padding: '0 8px' }}
              />

              <div style={{ position: 'relative', flex: 1, minWidth: '140px' }}>
                <Search size={12} color="var(--text-muted)" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  placeholder="Filter username..."
                  value={dailyReportUserFilter}
                  onChange={e => setDailyReportUserFilter(e.target.value)}
                  className="input"
                  style={{ height: '28px', paddingLeft: '24px', fontSize: '11px' }}
                />
              </div>

              <select
                value={dailyReportServerFilter}
                onChange={e => setDailyReportServerFilter(e.target.value)}
                className="select"
                style={{ height: '28px', width: 'auto', fontSize: '11px', padding: '0 8px' }}
              >
                <option value="ALL">All Nodes</option>
                {servers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Table */}
            <div className="table-wrapper" style={{ maxHeight: '280px', overflowY: 'auto' }}>
              <table className="table-modern">
                <thead>
                  <tr>
                    <th scope="col">User</th>
                    <th scope="col">Node</th>
                    <th scope="col">First In</th>
                    <th scope="col">Last Out</th>
                    <th scope="col">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyReportList.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                        No activity records for this date/filter.
                      </td>
                    </tr>
                  ) : (
                    dailyReportList.slice(0, 6).map(item => (
                      <tr key={item.id}>
                        <td>
                          <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{item.username}</div>
                          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{item.company}</div>
                        </td>
                        <td className="font-mono" style={{ fontSize: '11px' }}>{item.serverName}</td>
                        <td className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{item.firstLogin}</td>
                        <td className="font-mono" style={{ fontSize: '11px', color: item.currentStatus === 'Active' ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                          {item.lastLogout}
                        </td>
                        <td className="font-mono" style={{ fontSize: '11px', fontWeight: '600' }}>{item.totalUsageFormatted}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Live Audit Trail */}
        <div style={{ gridColumn: 'span 3' }} className="bento-col-5">
          <div className="surface-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={16} color="var(--accent-purple)" />
                <h3 style={{ fontSize: '15.5px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                  Recent Audit Trail
                </h3>
              </div>
              <span className="badge badge-emerald" style={{ fontSize: '10px' }}>● Live</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto', maxHeight: '310px' }}>
              {recentLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                  No recent audit logs available.
                </div>
              ) : (
                recentLogs.map(log => (
                  <div
                    key={log.id}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--bg-surface-inset)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px' }}>
                      <span style={{ color: 'var(--primary)', fontWeight: '700' }}>{log.operator || 'System'}</span>
                      <span className="font-mono" style={{ color: 'var(--text-muted)' }}>
                        {log.timestamp ? log.timestamp.split(' ')[1] || log.timestamp : 'Recent'}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '11.5px' }}>
                      {log.details || log.action}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          6. MODALS: PRESERVED DRILL-DOWN MODALS
          ========================================================================= */}

      {/* Inactive Users Drill-down Modal */}
      {selectedServerModalId && currentModalServerObj && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            width: '100%',
            maxWidth: '780px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'var(--bg-surface-inset)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--accent-amber-bg)', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserX size={16} />
                </div>
                <div>
                  <h3 style={{ fontSize: '14.5px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                    Inactive Subscriptions: {currentModalServerObj.server.name}
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }} className="font-mono">
                    {currentModalServerObj.server.ipPort} • {currentModalServerObj.inactiveUsers.length} Users Inactive (7+ Days)
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedServerModalId(null)}
                className="btn btn-ghost btn-sm"
                style={{ padding: '4px', borderRadius: '50%' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
              {currentModalServerObj.inactiveUsers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--accent-emerald)', fontSize: '13px' }}>
                  <CheckCircle2 size={32} style={{ marginBottom: '8px', display: 'block', margin: '0 auto 8px' }} />
                  <div>All subscriptions on this node have logged in within the past 7 days.</div>
                </div>
              ) : (
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th scope="col">User / Client</th>
                      <th scope="col">Company</th>
                      <th scope="col">VPS &amp; Drive</th>
                      <th scope="col">Inactivity</th>
                      <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentModalServerObj.inactiveUsers.map(user => {
                      const daysInactive = getDaysInactive(user);
                      const s = servers.find(item => item.id === user.serverId) || currentModalServerObj.server;
                      const waPhone = user.customerPhone ? user.customerPhone.replace(/[^0-9]/g, '') : '';
                      const waMessage = encodeURIComponent(
                        `Hello ${user.company},\n\nWe noticed your VPS Account (${user.username}) on server ${s.name} has not registered activity for ${daysInactive} days.\n\nNeed any help connecting?\nInnovation Web Works Support`
                      );

                      return (
                        <tr key={user.id}>
                          <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{user.username}</td>
                          <td style={{ color: 'var(--text-secondary)' }}>{user.company}</td>
                          <td className="font-mono" style={{ fontSize: '11px' }}>
                            <span style={{ color: 'var(--primary)' }}>{s.name}</span> • <span>{user.drive}</span>
                          </td>
                          <td>
                            <span className="badge badge-amber" style={{ fontSize: '10.5px' }}>
                              {daysInactive} Days Inactive
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <a
                                href={`https://wa.me/${waPhone || ''}?text=${waMessage}`}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-secondary btn-xs"
                                style={{ color: 'var(--accent-emerald)', textDecoration: 'none', padding: '3px 8px', fontSize: '11px' }}
                              >
                                <MessageCircle size={11} /> Remind
                              </a>
                              <button
                                onClick={() => {
                                  setSelectedServerModalId(null);
                                  onDirectRemoteConnect(user, 'USER');
                                }}
                                className="btn btn-secondary btn-xs font-mono"
                                style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--accent-emerald)' }}
                              >
                                <Zap size={11} /> Connect
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--bg-surface-inset)'
            }}>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                Showing {currentModalServerObj.inactiveUsers.length} inactive account(s)
              </span>
              <button
                onClick={() => setSelectedServerModalId(null)}
                className="btn btn-secondary btn-sm"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Users on Node Modal */}
      {activeUsersModalServerId && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            borderRadius: 'var(--radius-lg)',
            width: '100%',
            maxWidth: '780px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'rgba(16, 185, 129, 0.05)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--accent-emerald-bg)', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <RadioTower size={17} />
                </div>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Active Sessions — {servers.find(s => s.id === activeUsersModalServerId)?.name || activeUsersModalServerId}
                  </h3>
                  <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                    Live TSplus / RDP sessions currently active on this VPS node.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveUsersModalServerId(null)}
                className="btn btn-ghost btn-sm"
                style={{ padding: '4px', borderRadius: '50%' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              {(() => {
                const srvActiveUsers = allActiveSessionsList.filter(s => s.serverId === activeUsersModalServerId);

                if (srvActiveUsers.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px' }}>
                      No active user sessions currently logged in on this VPS node.
                    </div>
                  );
                }

                return (
                  <table className="table-modern">
                    <thead>
                      <tr>
                        <th scope="col">Active User</th>
                        <th scope="col">Company</th>
                        <th scope="col">VPS Node &amp; IP</th>
                        <th scope="col">Session Status</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {srvActiveUsers.map(sess => (
                        <tr key={sess.id}>
                          <td style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-emerald)', display: 'inline-block' }} />
                              {sess.username}
                            </div>
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>{sess.company}</td>
                          <td className="font-mono" style={{ fontSize: '11px' }}>
                            <span style={{ color: 'var(--primary)' }}>{sess.serverName}</span> • <span>{sess.serverIp}</span>
                          </td>
                          <td>
                            <span className="badge badge-emerald" style={{ fontSize: '10.5px' }}>
                              ● Active
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              onClick={() => {
                                setActiveUsersModalServerId(null);
                                onDirectRemoteConnect(sess.userObj, 'USER');
                              }}
                              className="btn btn-secondary btn-xs font-mono"
                              style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--accent-emerald)', borderColor: 'rgba(16, 185, 129, 0.4)' }}
                            >
                              <Zap size={11} /> Connect
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--bg-surface-inset)'
            }}>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                Showing live active logins for this server node
              </span>
              <button
                onClick={() => setActiveUsersModalServerId(null)}
                className="btn btn-secondary btn-sm"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

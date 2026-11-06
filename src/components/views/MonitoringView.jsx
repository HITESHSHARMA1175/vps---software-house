import React, { useState, useEffect, useMemo } from 'react';
import {
  Server,
  Activity,
  HardDrive,
  Radio,
  AlertTriangle,
  Search,
  RefreshCw,
  ExternalLink,
  LayoutGrid,
  List,
  LogOut,
  PauseCircle,
  BarChart3,
  UserCog,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Cpu,
  CheckCircle2,
  ShieldCheck,
  ArrowUpDown,
  SlidersHorizontal,
  Layers
} from 'lucide-react';

export default function MonitoringView({
  servers = [],
  users = [],
  telemetryData = {},
  onDirectRemoteConnect,
  onRefreshTelemetry,
  onForceLogoffSession,
  onNavigateToReports,
  onNavigateToServerUsers
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL', 'ONLINE', 'ALERTS', 'DISK_ALERTS'
  const [sortBy, setSortBy] = useState('ALERTS_FIRST'); // 'ALERTS_FIRST', 'CPU_DESC', 'RAM_DESC', 'STORAGE_DESC', 'SESSIONS_DESC', 'NAME_ASC'
  const [viewMode, setViewMode] = useState('RACK'); // 'RACK' (High-density rows for 100+ servers), 'GRID' (Modular cards), 'TABLE' (Dense table)
  const [expandedRows, setExpandedRows] = useState({});
  const [expandedDisks, setExpandedDisks] = useState({});
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  const toggleRowExpanded = (serverId) => {
    setExpandedRows(prev => ({ ...prev, [serverId]: !prev[serverId] }));
  };

  const toggleDisksExpanded = (serverId) => {
    setExpandedDisks(prev => ({ ...prev, [serverId]: !prev[serverId] }));
  };

  const [ticker, setTicker] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTicker(t => t + 1);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // AGGREGATE COMPREHENSIVE SERVER-WISE TELEMETRY DATA
  const serverWiseList = useMemo(() => {
    return servers.map(s => {
      const sIpPure = s.ipPort ? s.ipPort.split(':')[0] : '';
      const tData = telemetryData[s.id] || telemetryData[s.ipPort] || telemetryData[s.name] || (sIpPure && telemetryData[sIpPure]) || null;
      
      const lastPingMs = tData?.lastPingTimestamp || 0;
      const secondsAgo = lastPingMs ? Math.max(0, Math.floor((Date.now() - lastPingMs) / 1000)) : 999;
      const isOnline = !!(tData && lastPingMs && secondsAgo < 180);
      
      let pingText = 'Offline';
      if (isOnline) {
        pingText = secondsAgo < 60 ? `${secondsAgo}s ago` : `${Math.floor(secondsAgo / 60)}m ago`;
      }

      const ramTotalGB = tData ? parseFloat(tData.ramTotalGB || 0) : 0;
      const ramUsedGB = tData ? parseFloat(tData.ramUsedGB || 0) : 0;
      const ramPercent = tData ? (tData.ramPercent || (ramTotalGB > 0 ? Math.round((ramUsedGB / ramTotalGB) * 100) : 0)) : 0;
      const cpuUsage = tData ? parseFloat(tData.cpuUsage || 0) : 0;

      // Disks for this server
      let totalStorageGB = 0;
      let totalFreeStorageGB = 0;

      const disks = (tData && Array.isArray(tData.disks) ? tData.disks : []).map(d => {
        const drive = (d.driveLetter || d.drive || 'C:').toUpperCase().trim();
        const freeGB = parseFloat(d.freeGB) || 0;
        const totalGB = parseFloat(d.totalGB) || 0;
        const usedGB = Math.max(0, totalGB - freeGB);
        const freePercent = totalGB > 0 ? (freeGB / totalGB) * 100 : 100;
        const usedPercent = totalGB > 0 ? Math.min(100, Math.round((usedGB / totalGB) * 100)) : 0;
        
        totalStorageGB += totalGB;
        totalFreeStorageGB += freeGB;

        const isSystemDrive = drive === 'C:' || drive === 'C';
        const isWarning = isSystemDrive ? (freeGB < 5.0 && freePercent < 15) : (freeGB < 1.0 && freePercent < 15);
        const isCritical = isSystemDrive ? (freeGB < 1.5 && freePercent < 5) : (freeGB < 0.3 && freePercent < 3);

        return {
          drive,
          freeGB,
          totalGB,
          usedGB,
          freePercent,
          usedPercent,
          isSystemDrive,
          isWarning: isWarning && !isCritical,
          isCritical,
          severity: isCritical ? 'CRITICAL' : (isWarning ? 'WARNING' : 'HEALTHY')
        };
      });

      const totalUsedStorageGB = Math.max(0, totalStorageGB - totalFreeStorageGB);
      const totalStorageUsedPercent = totalStorageGB > 0 ? Math.min(100, Math.round((totalUsedStorageGB / totalStorageGB) * 100)) : 0;

      const warningDisks = disks.filter(d => d.isWarning);
      const criticalDisks = disks.filter(d => d.isCritical);
      const alertDisks = disks.filter(d => d.isCritical || d.isWarning);
      const systemDisk = disks.find(d => d.isSystemDrive);
      const healthyClientDisks = disks.filter(d => !d.isCritical && !d.isWarning && !d.isSystemDrive);
      const diskAlertsCount = alertDisks.length;

      // Real Sessions (Active + Disconnected) from Windows VPS Telemetry
      const detailedSess = tData && Array.isArray(tData.detailedSessions) ? tData.detailedSessions : [];
      const activeSessions = [];
      const disconnectedSessions = [];

      if (detailedSess.length > 0) {
        detailedSess.forEach((sess, idx) => {
          const uName = sess.username || 'User';
          const uLower = uName.toLowerCase().trim();
          const matchedUser = users.find(usr => (usr.username || '').toLowerCase() === uLower && (usr.serverId === s.id || usr.serverId === s.ipPort));
          const sessObj = {
            id: `sess-${s.id}-${uLower}-${idx}`,
            username: uName,
            company: matchedUser ? matchedUser.company : uName,
            sessionId: sess.sessionId || '1',
            sessionName: sess.sessionName || (sess.state === 'Disconnected' ? 'Disconnected' : 'RDP'),
            state: sess.state || 'Active',
            idleTime: sess.idleTime || 'none',
            logonTime: sess.logonTime || 'Live',
            serverId: s.id,
            serverName: s.name,
            userObj: matchedUser || { username: uName, company: uName, serverId: s.id }
          };

          if (sessObj.state === 'Disconnected') {
            disconnectedSessions.push(sessObj);
          } else {
            activeSessions.push(sessObj);
          }
        });
      } else if (tData && Array.isArray(tData.activeUsersList)) {
        tData.activeUsersList.forEach((u, idx) => {
          const uName = typeof u === 'string' ? u : (u.username || 'Active User');
          const uLower = uName.toLowerCase().trim();
          const matchedUser = users.find(usr => (usr.username || '').toLowerCase() === uLower && (usr.serverId === s.id || usr.serverId === s.ipPort));
          activeSessions.push({
            id: `sess-${s.id}-${uLower}-${idx}`,
            username: uName,
            company: matchedUser ? matchedUser.company : uName,
            sessionId: 'Active',
            sessionName: 'RDP',
            state: 'Active',
            idleTime: 'none',
            logonTime: 'Live',
            serverId: s.id,
            serverName: s.name,
            userObj: matchedUser || { username: uName, company: uName, serverId: s.id }
          });
        });
      }

      if (disconnectedSessions.length === 0 && tData && Array.isArray(tData.disconnectedUsersList)) {
        tData.disconnectedUsersList.forEach((u, idx) => {
          const uName = typeof u === 'string' ? u : (u.username || 'Disc User');
          const uLower = uName.toLowerCase().trim();
          const matchedUser = users.find(usr => (usr.username || '').toLowerCase() === uLower && (usr.serverId === s.id || usr.serverId === s.ipPort));
          disconnectedSessions.push({
            id: `sess-disc-${s.id}-${uLower}-${idx}`,
            username: uName,
            company: matchedUser ? matchedUser.company : uName,
            sessionId: 'Disc',
            sessionName: 'Disconnected',
            state: 'Disconnected',
            idleTime: 'none',
            logonTime: 'Live',
            serverId: s.id,
            serverName: s.name,
            userObj: matchedUser || { username: uName, company: uName, serverId: s.id }
          });
        });
      }

      // Physical local accounts from server telemetry or deduplicated subscription list
      const physicalUsersList = tData && Array.isArray(tData.allServerUsers) ? tData.allServerUsers : [];
      const assignedSubscriptions = users.filter(u => u.serverId === s.id || u.serverId === s.ipPort || u.serverIp === s.ipPort);
      const uniqueAssignedSet = new Set();
      assignedSubscriptions.forEach(u => {
        if (u.username) uniqueAssignedSet.add(u.username.toLowerCase().trim());
      });

      const totalAccountCount = physicalUsersList.length > 0 ? physicalUsersList.length : uniqueAssignedSet.size;

      return {
        ...s,
        isOnline,
        pingText,
        secondsAgo,
        ramTotalGB,
        ramUsedGB,
        ramPercent,
        cpuUsage,
        disks,
        totalStorageGB,
        totalFreeStorageGB,
        totalUsedStorageGB,
        totalStorageUsedPercent,
        warningDisks,
        criticalDisks,
        alertDisks,
        systemDisk,
        healthyClientDisks,
        diskAlertsCount,
        activeSessions,
        disconnectedSessions,
        activeCount: activeSessions.length,
        disconnectedCount: disconnectedSessions.length,
        assignedCount: totalAccountCount,
        hasAlert: ramPercent >= 85 || cpuUsage >= 85 || diskAlertsCount > 0 || !isOnline
      };
    });
  }, [servers, users, telemetryData]);

  // FLEET STATS SUMMARY
  const fleetSummary = useMemo(() => {
    const totalNodes = serverWiseList.length;
    const onlineNodes = serverWiseList.filter(s => s.isOnline).length;
    const alertNodes = serverWiseList.filter(s => s.hasAlert).length;
    const diskAlertNodes = serverWiseList.filter(s => s.diskAlertsCount > 0).length;
    const totalActiveSessions = serverWiseList.reduce((acc, s) => acc + s.activeCount, 0);
    const totalDisconnectedSessions = serverWiseList.reduce((acc, s) => acc + s.disconnectedCount, 0);

    return { totalNodes, onlineNodes, alertNodes, diskAlertNodes, totalActiveSessions, totalDisconnectedSessions };
  }, [serverWiseList]);

  // ALL ALERTING NODES (FOR TOP INCIDENT TRIAGE HUB)
  const alertingServers = useMemo(() => {
    return serverWiseList.filter(s => s.hasAlert);
  }, [serverWiseList]);

  // FILTERED LIST BASED ON SEARCH & STATUS
  const filteredServerList = useMemo(() => {
    return serverWiseList.filter(s => {
      // Status Filter
      if (statusFilter === 'ONLINE' && !s.isOnline) return false;
      if (statusFilter === 'ALERTS' && !s.hasAlert) return false;
      if (statusFilter === 'DISK_ALERTS' && s.diskAlertsCount === 0) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (s.name || '').toLowerCase().includes(q);
        const matchIp = (s.ipPort || '').toLowerCase().includes(q);
        const matchUser = s.activeSessions.some(u => (u.username || '').toLowerCase().includes(q) || (u.company || '').toLowerCase().includes(q));
        const matchDisk = s.disks.some(d => d.drive.toLowerCase().includes(q));
        if (!matchName && !matchIp && !matchUser && !matchDisk) return false;
      }

      return true;
    });
  }, [serverWiseList, statusFilter, searchQuery]);

  // SORTED LIST
  const sortedServerList = useMemo(() => {
    const list = [...filteredServerList];
    list.sort((a, b) => {
      if (sortBy === 'ALERTS_FIRST') {
        if (a.hasAlert && !b.hasAlert) return -1;
        if (!a.hasAlert && b.hasAlert) return 1;
        if (a.diskAlertsCount !== b.diskAlertsCount) return b.diskAlertsCount - a.diskAlertsCount;
        return (b.cpuUsage + b.ramPercent) - (a.cpuUsage + a.ramPercent);
      }
      if (sortBy === 'CPU_DESC') return b.cpuUsage - a.cpuUsage;
      if (sortBy === 'RAM_DESC') return b.ramPercent - a.ramPercent;
      if (sortBy === 'STORAGE_DESC') return b.totalStorageUsedPercent - a.totalStorageUsedPercent;
      if (sortBy === 'SESSIONS_DESC') return (b.activeCount + b.disconnectedCount) - (a.activeCount + a.disconnectedCount);
      if (sortBy === 'NAME_ASC') return (a.name || '').localeCompare(b.name || '');
      return 0;
    });
    return list;
  }, [filteredServerList, sortBy]);

  // PAGINATION
  const totalPages = Math.max(1, Math.ceil(sortedServerList.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedServers = useMemo(() => {
    if (pageSize >= 999) return sortedServerList;
    const start = (safeCurrentPage - 1) * pageSize;
    return sortedServerList.slice(start, start + pageSize);
  }, [sortedServerList, safeCurrentPage, pageSize]);

  return (
    <div className="product-view monitoring-view" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. EXECUTIVE COMMAND HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 12px #10b981' }} />
            <h2 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
              Hosting node monitoring
            </h2>
          </div>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: 0, marginTop: '4px' }}>
            Live hosting telemetry and incident triage for every Tally workspace node.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {onRefreshTelemetry && (
            <button
              onClick={onRefreshTelemetry}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '11.5px', gap: '6px', height: '34px' }}
            >
              <RefreshCw size={13} />
              Sync Fleet Telemetry
            </button>
          )}

          {/* VIEW SWITCHER: RACK ROWS / MODULAR CARDS / DENSE TABLE */}
          <div style={{ display: 'flex', backgroundColor: 'rgba(0,0,0,0.3)', padding: '2px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', height: '34px' }}>
            <button
              onClick={() => setViewMode('RACK')}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-xs)',
                border: 'none',
                backgroundColor: viewMode === 'RACK' ? 'var(--primary)' : 'transparent',
                color: viewMode === 'RACK' ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11.5px',
                fontWeight: '600'
              }}
              title="High-Density Expandable Rows (Recommended for 100-150 servers)"
            >
              <Layers size={13} />
              Rack Rows
            </button>
            <button
              onClick={() => setViewMode('GRID')}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-xs)',
                border: 'none',
                backgroundColor: viewMode === 'GRID' ? 'var(--primary)' : 'transparent',
                color: viewMode === 'GRID' ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11.5px',
                fontWeight: '600'
              }}
              title="Modular 2-Column Telemetry Cards"
            >
              <LayoutGrid size={13} />
              Server Cards
            </button>
            <button
              onClick={() => setViewMode('TABLE')}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-xs)',
                border: 'none',
                backgroundColor: viewMode === 'TABLE' ? 'var(--primary)' : 'transparent',
                color: viewMode === 'TABLE' ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11.5px',
                fontWeight: '600'
              }}
              title="Compact Tabular Overview"
            >
              <List size={13} />
              Dense Table
            </button>
          </div>
        </div>
      </div>

      {/* 2. FLEET METRIC OVERVIEW CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
        <div className="surface-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Server size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Total VPS Fleet</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>
              {fleetSummary.totalNodes} <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Nodes</span>
            </div>
          </div>
        </div>

        <div className="surface-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Online Nodes</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--accent-emerald)', marginTop: '2px' }}>
              {fleetSummary.onlineNodes} <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>/ {fleetSummary.totalNodes} Live</span>
            </div>
          </div>
        </div>

        <div className="surface-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: fleetSummary.alertNodes > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)', color: fleetSummary.alertNodes > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Alerting Nodes</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: fleetSummary.alertNodes > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)', marginTop: '2px' }}>
              {fleetSummary.alertNodes} <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Need Attention</span>
            </div>
          </div>
        </div>

        <div className="surface-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Radio size={22} color="#34d399" />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Active RDP Sessions</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#34d399', marginTop: '2px' }}>
              {fleetSummary.totalActiveSessions} <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Online</span>
            </div>
          </div>
        </div>

        <div className="surface-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PauseCircle size={22} color="#fbbf24" />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Disconnected Sessions</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#fbbf24', marginTop: '2px' }}>
              {fleetSummary.totalDisconnectedSessions} <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>In RAM</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. TOP INCIDENT TRIAGE HUB ("SERVERS NEEDING ATTENTION") */}
      {alertingServers.length > 0 ? (
        <div
          className="surface-card"
          style={{
            padding: '16px 20px',
            backgroundColor: 'rgba(239, 68, 68, 0.04)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 4px 20px rgba(239, 68, 68, 0.08)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>🚨</span>
              <h3 style={{ fontSize: '14px', fontWeight: '800', color: 'var(--accent-rose)', margin: 0, letterSpacing: '-0.01em' }}>
                Incident Triage Hub — {alertingServers.length} VPS {alertingServers.length === 1 ? 'Node Needs' : 'Nodes Need'} Immediate Attention
              </h3>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Spotting critical disk capacities, elevated memory load (&gt;85%), or lost heartbeats
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '10px' }}>
            {alertingServers.map(srv => {
              const isOffline = !srv.isOnline;
              const hasHighRam = srv.ramPercent >= 85;
              const hasHighCpu = srv.cpuUsage >= 85;
              const hasDiskAlert = srv.diskAlertsCount > 0;

              return (
                <div
                  key={`triage-${srv.id}`}
                  style={{
                    backgroundColor: 'rgba(20, 20, 26, 0.85)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    transition: 'border-color 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-primary)' }}>{srv.name}</div>
                      <div className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{srv.ipPort}</div>
                    </div>
                    {onDirectRemoteConnect && (
                      <button
                        onClick={() => onDirectRemoteConnect({ serverId: srv.id, ipPort: srv.ipPort }, 'SERVER')}
                        className="btn btn-ghost btn-sm font-mono"
                        style={{ fontSize: '10px', color: 'var(--accent-blue)', padding: '2px 6px', gap: '4px' }}
                        title="Direct Remote Desktop Connect"
                      >
                        <ExternalLink size={10} /> RDP
                      </button>
                    )}
                  </div>

                  {/* ALERT PILLS */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {isOffline && (
                      <span className="badge badge-danger" style={{ fontSize: '10px', padding: '2px 6px' }}>
                        🔴 Heartbeat Lost ({srv.pingText})
                      </span>
                    )}
                    {hasDiskAlert && srv.alertDisks.map((d, dIdx) => (
                      <span
                        key={dIdx}
                        className={d.isCritical ? 'badge badge-danger' : 'badge badge-amber'}
                        style={{ fontSize: '10px', padding: '2px 6px' }}
                      >
                        {d.isCritical ? '🚨' : '⚠️'} {d.drive} {d.freeGB.toFixed(1)}GB free ({d.freePercent.toFixed(0)}%)
                      </span>
                    ))}
                    {hasHighRam && (
                      <span className="badge badge-danger" style={{ fontSize: '10px', padding: '2px 6px' }}>
                        🧠 RAM {srv.ramPercent}% ({srv.ramUsedGB.toFixed(1)}GB)
                      </span>
                    )}
                    {hasHighCpu && (
                      <span className="badge badge-amber" style={{ fontSize: '10px', padding: '2px 6px' }}>
                        ⚡ CPU {srv.cpuUsage}%
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                      Sessions: <strong style={{ color: '#34d399' }}>{srv.activeCount} Live</strong>, <strong style={{ color: '#fbbf24' }}>{srv.disconnectedCount} Disc</strong>
                    </span>
                    <button
                      onClick={() => {
                        setViewMode('RACK');
                        setExpandedRows(prev => ({ ...prev, [srv.id]: true }));
                      }}
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '10px', color: '#c084fc', padding: '1px 6px' }}
                    >
                      Inspect in Rack →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          className="surface-card"
          style={{
            padding: '12px 18px',
            backgroundColor: 'rgba(16, 185, 129, 0.04)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <ShieldCheck size={18} color="var(--accent-emerald)" />
          <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', fontWeight: '600' }}>
            Fleet Telemetry Optimal: All {fleetSummary.totalNodes} VPS Nodes Operating Within Normal Thresholds
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
            Zero storage or memory capacity breaches detected across fleet.
          </span>
        </div>
      )}

      {/* 4. FLEET CONTROL TOOLBAR (SEARCH, STATUS, SORT, PAGE SIZE) */}
      <div className="surface-card" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search 100+ servers by Name, IP Address, Connected User, or Disk..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="form-input"
            style={{ paddingLeft: '34px', fontSize: '12px', height: '34px', width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => { setStatusFilter('ALL'); setCurrentPage(1); }}
            className={`btn btn-sm ${statusFilter === 'ALL' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '11px', padding: '4px 10px', height: '32px' }}
          >
            🌐 All ({serverWiseList.length})
          </button>

          <button
            onClick={() => { setStatusFilter('ONLINE'); setCurrentPage(1); }}
            className={`btn btn-sm ${statusFilter === 'ONLINE' ? 'btn-success' : 'btn-ghost'}`}
            style={{ fontSize: '11px', padding: '4px 10px', height: '32px', color: statusFilter === 'ONLINE' ? '#fff' : 'var(--accent-emerald)' }}
          >
            🟢 Online ({fleetSummary.onlineNodes})
          </button>

          <button
            onClick={() => { setStatusFilter('ALERTS'); setCurrentPage(1); }}
            className={`btn btn-sm ${statusFilter === 'ALERTS' ? 'btn-danger' : 'btn-ghost'}`}
            style={{ fontSize: '11px', padding: '4px 10px', height: '32px', color: statusFilter === 'ALERTS' ? '#fff' : 'var(--accent-rose)' }}
          >
            🚨 Alerts ({fleetSummary.alertNodes})
          </button>

          <button
            onClick={() => { setStatusFilter('DISK_ALERTS'); setCurrentPage(1); }}
            className={`btn btn-sm ${statusFilter === 'DISK_ALERTS' ? 'btn-warning' : 'btn-ghost'}`}
            style={{ fontSize: '11px', padding: '4px 10px', height: '32px', color: statusFilter === 'DISK_ALERTS' ? '#fff' : '#fbbf24' }}
          >
            💾 Low Disk ({fleetSummary.diskAlertNodes})
          </button>

          {/* QUICK SORT SELECTOR */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
            <ArrowUpDown size={12} style={{ color: 'var(--text-muted)' }} />
            <select
              value={sortBy}
              onChange={e => { setSortBy(e.target.value); setCurrentPage(1); }}
              className="form-input"
              style={{ fontSize: '11px', height: '32px', padding: '0 8px', borderRadius: 'var(--radius-xs)' }}
              title="Sort Fleet By"
            >
              <option value="ALERTS_FIRST">🚨 Critical Alerts First</option>
              <option value="CPU_DESC">⚡ Highest CPU Load</option>
              <option value="RAM_DESC">🧠 Highest Memory Usage</option>
              <option value="STORAGE_DESC">💾 Most Storage Used</option>
              <option value="SESSIONS_DESC">👥 Most Active Sessions</option>
              <option value="NAME_ASC">🔤 Server Name (A-Z)</option>
            </select>
          </div>

          {/* PAGE SIZE SELECTOR */}
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
            className="form-input"
            style={{ fontSize: '11px', height: '32px', padding: '0 8px', borderRadius: 'var(--radius-xs)' }}
            title="Page Size"
          >
            <option value="25">25 per page</option>
            <option value="50">50 per page</option>
            <option value="100">100 per page</option>
            <option value="999">Show All</option>
          </select>
        </div>
      </div>

      {/* 5. MAIN FLEET CONTENT: 3 VIEWS (RACK / GRID / TABLE) */}

      {/* VIEW A: HIGH-DENSITY EXPANDABLE RACK ROWS (DEFAULT FOR 100-150 SERVERS) */}
      {viewMode === 'RACK' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* RACK TABLE HEADER STRIP */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(200px, 1.8fr) 110px 140px minmax(200px, 2fr) 130px 180px',
              padding: '8px 16px',
              fontSize: '11px',
              fontWeight: '700',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              borderBottom: '1px solid var(--border-subtle)',
              alignItems: 'center'
            }}
          >
            <div>VPS Node &amp; Host</div>
            <div>CPU Load</div>
            <div>Memory (RAM)</div>
            <div>Storage Snapshot</div>
            <div>Sessions</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {paginatedServers.length === 0 ? (
            <div className="surface-card" style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Activity size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
              <strong style={{ color: 'var(--text-primary)', fontSize: '14px' }}>No VPS Nodes Found</strong>
              <p style={{ fontSize: '12px', margin: '4px 0 0' }}>No servers match your current search query or filter selection.</p>
            </div>
          ) : (
            paginatedServers.map(srv => {
              const isExpanded = !!expandedRows[srv.id];
              const ramColor = srv.ramPercent >= 90 ? 'var(--accent-rose)' : (srv.ramPercent >= 75 ? 'var(--accent-amber)' : 'var(--accent-emerald)');
              const cpuColor = srv.cpuUsage >= 80 ? 'var(--accent-rose)' : (srv.cpuUsage >= 50 ? 'var(--accent-amber)' : 'var(--accent-sky)');

              return (
                <div key={srv.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  {/* COMPACT 52PX RACK STRIP */}
                  <div
                    onClick={() => toggleRowExpanded(srv.id)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(200px, 1.8fr) 110px 140px minmax(200px, 2fr) 130px 180px',
                      alignItems: 'center',
                      padding: '10px 16px',
                      backgroundColor: srv.hasAlert
                        ? (isExpanded ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.03)')
                        : (isExpanded ? 'rgba(255, 255, 255, 0.05)' : 'var(--bg-surface)'),
                      border: srv.hasAlert ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid var(--border-subtle)',
                      borderRadius: isExpanded ? 'var(--radius-md) var(--radius-md) 0 0' : 'var(--radius-md)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      gap: '12px'
                    }}
                  >
                    {/* HOST ID & STATUS */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </div>
                      <div
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: srv.isOnline ? '#10b981' : '#ef4444',
                          boxShadow: srv.isOnline ? '0 0 8px #10b981' : 'none',
                          flexShrink: 0
                        }}
                        title={srv.isOnline ? `Online (${srv.pingText})` : `Offline (${srv.pingText})`}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {srv.name}
                        </div>
                        <div className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {srv.ipPort}
                        </div>
                      </div>
                    </div>

                    {/* MINI CPU */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', marginBottom: '3px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>CPU</span>
                        <span className="font-mono" style={{ fontWeight: '700', color: cpuColor }}>{srv.cpuUsage}%</span>
                      </div>
                      <div style={{ width: '100%', height: '5px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, srv.cpuUsage)}%`, height: '100%', backgroundColor: cpuColor }} />
                      </div>
                    </div>

                    {/* MINI RAM */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', marginBottom: '3px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>RAM</span>
                        <span className="font-mono" style={{ fontWeight: '700', color: ramColor }}>{srv.ramPercent}%</span>
                      </div>
                      <div style={{ width: '100%', height: '5px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, srv.ramPercent)}%`, height: '100%', backgroundColor: ramColor }} />
                      </div>
                    </div>

                    {/* STORAGE SNAPSHOT PILLS */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', overflow: 'hidden' }}>
                      {srv.diskAlertsCount > 0 ? (
                        srv.alertDisks.slice(0, 2).map((d, dIdx) => (
                          <span
                            key={dIdx}
                            className={d.isCritical ? 'badge badge-danger' : 'badge badge-amber'}
                            style={{ fontSize: '10px', padding: '2px 6px', fontWeight: '700' }}
                          >
                            {d.isCritical ? '🚨' : '⚠️'} {d.drive} {d.freeGB.toFixed(1)}GB free
                          </span>
                        ))
                      ) : (
                        <>
                          {srv.systemDisk && (
                            <span className="badge badge-subtle" style={{ fontSize: '10px', padding: '2px 6px' }}>
                              C: {srv.systemDisk.freeGB.toFixed(0)}GB free ({srv.systemDisk.freePercent.toFixed(0)}%)
                            </span>
                          )}
                          {srv.healthyClientDisks.length > 0 && (
                            <span className="badge badge-emerald" style={{ fontSize: '10px', padding: '2px 6px' }}>
                              +{srv.healthyClientDisks.length} Vols Safe
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {/* SESSIONS COUNT */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span className="badge badge-emerald" style={{ fontSize: '10px', padding: '2px 6px' }}>
                        ● {srv.activeCount} Live
                      </span>
                      {srv.disconnectedCount > 0 && (
                        <span className="badge badge-amber" style={{ fontSize: '10px', padding: '2px 6px' }}>
                          ⏸ {srv.disconnectedCount} Disc
                        </span>
                      )}
                    </div>

                    {/* QUICK ACTION BUTTONS (CLICK DOES NOT TOGGLE ROW) */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                      {onNavigateToReports && (
                        <button
                          onClick={() => onNavigateToReports(srv.id)}
                          className="btn btn-ghost btn-sm font-mono"
                          style={{ fontSize: '10.5px', color: '#c084fc', padding: '3px 6px' }}
                          title="View Historical Performance Graphs & Reports"
                        >
                          <BarChart3 size={12} />
                        </button>
                      )}
                      {onNavigateToServerUsers && (
                        <button
                          onClick={() => onNavigateToServerUsers(srv.id)}
                          className="btn btn-ghost btn-sm font-mono"
                          style={{ fontSize: '10.5px', color: '#818cf8', padding: '3px 6px' }}
                          title="Manage Windows OS Users"
                        >
                          <UserCog size={12} />
                        </button>
                      )}
                      {onDirectRemoteConnect && (
                        <button
                          onClick={() => onDirectRemoteConnect({ serverId: srv.id, ipPort: srv.ipPort }, 'SERVER')}
                          className="btn btn-secondary btn-sm font-mono"
                          style={{ fontSize: '10.5px', color: 'var(--accent-blue)', padding: '3px 8px', gap: '4px' }}
                          title="Direct Remote Desktop Connect"
                        >
                          <ExternalLink size={11} /> RDP
                        </button>
                      )}
                      <button
                        onClick={() => toggleRowExpanded(srv.id)}
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '10.5px', color: 'var(--text-muted)', padding: '3px 6px' }}
                        title={isExpanded ? 'Collapse Drawer' : 'Expand Details'}
                      >
                        {isExpanded ? 'Less' : 'Details'}
                      </button>
                    </div>
                  </div>

                  {/* ACCORDION INLINE DETAIL DRAWER */}
                  {isExpanded && (
                    <div
                      style={{
                        backgroundColor: 'rgba(15, 17, 23, 0.95)',
                        border: srv.hasAlert ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid var(--border-subtle)',
                        borderTop: 'none',
                        borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                        padding: '16px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px',
                        boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.4)'
                      }}
                    >
                      {/* DRAWER TOP META ROW */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', borderBottom: '1px solid rgba(255,255,255,0.06)', pb: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                          <span>Host: <strong style={{ color: 'var(--text-primary)' }}>{srv.name}</strong> ({srv.ipPort})</span>
                          <span>Heartbeat: <strong style={{ color: srv.isOnline ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>{srv.pingText}</strong></span>
                          <span>Assigned Accounts: <strong style={{ color: 'var(--text-primary)' }}>{srv.assignedCount}</strong></span>
                          <span>Memory Allocated: <strong style={{ color: 'var(--text-primary)' }}>{srv.ramUsedGB.toFixed(1)} GB / {srv.ramTotalGB.toFixed(0)} GB</strong></span>
                          <span>Total Storage: <strong style={{ color: 'var(--text-primary)' }}>{srv.totalUsedStorageGB.toFixed(1)} GB used of {srv.totalStorageGB.toFixed(1)} GB ({srv.totalStorageUsedPercent}%)</strong></span>
                        </div>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          {onNavigateToReports && (
                            <button
                              onClick={() => onNavigateToReports(srv.id)}
                              className="btn btn-ghost btn-sm font-mono"
                              style={{ fontSize: '11px', color: '#c084fc', gap: '4px' }}
                            >
                              <BarChart3 size={12} /> Graphs &amp; Analytics
                            </button>
                          )}
                          {onNavigateToServerUsers && (
                            <button
                              onClick={() => onNavigateToServerUsers(srv.id)}
                              className="btn btn-ghost btn-sm font-mono"
                              style={{ fontSize: '11px', color: '#818cf8', gap: '4px' }}
                            >
                              <UserCog size={12} /> OS User Accounts
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 2-COLUMN GRID: DISK VOLUMES vs ACTIVE RDP SESSIONS */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
                        
                        {/* LEFT: DISK VOLUMES DETAILED RACK */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <HardDrive size={13} color="var(--accent-blue)" />
                              <span>Disk Volumes ({srv.disks.length})</span>
                            </div>
                            {srv.diskAlertsCount > 0 && (
                              <span style={{ color: 'var(--accent-rose)', fontWeight: '700' }}>
                                🚨 {srv.diskAlertsCount} Volume{srv.diskAlertsCount > 1 ? 's' : ''} Need Space!
                              </span>
                            )}
                          </div>

                          {srv.disks.length === 0 ? (
                            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px 0' }}>
                              No drive telemetry reported by host agent.
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {/* 1. ALERT DRIVES */}
                              {srv.alertDisks.map((d, dIdx) => (
                                <div
                                  key={`alert-d-${dIdx}`}
                                  style={{
                                    padding: '8px 10px',
                                    borderRadius: 'var(--radius-xs)',
                                    backgroundColor: d.isCritical ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                                    border: `1px solid ${d.isCritical ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ fontSize: '12px' }}>{d.isCritical ? '🚨' : '⚠️'}</span>
                                      <strong style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>{d.drive}</strong>
                                      {d.isSystemDrive && <span className="badge badge-subtle" style={{ fontSize: '9px' }}>SYSTEM</span>}
                                      <span className={d.isCritical ? 'badge badge-danger' : 'badge badge-amber'} style={{ fontSize: '9.5px' }}>
                                        {d.severity}
                                      </span>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                      <span style={{ fontSize: '12px', fontWeight: '800', color: d.isCritical ? 'var(--accent-rose)' : '#fbbf24' }}>
                                        {d.freeGB.toFixed(1)} GB Free
                                      </span>
                                      <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                                        ({d.freePercent.toFixed(0)}% available)
                                      </span>
                                    </div>
                                  </div>

                                  <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{ width: `${d.usedPercent}%`, height: '100%', backgroundColor: d.isCritical ? 'var(--accent-rose)' : '#fbbf24' }} />
                                  </div>
                                </div>
                              ))}

                              {/* 2. SYSTEM C: DRIVE (IF NOT ALERTING) */}
                              {srv.systemDisk && !srv.systemDisk.isCritical && !srv.systemDisk.isWarning && (
                                <div
                                  style={{
                                    padding: '8px 10px',
                                    borderRadius: 'var(--radius-xs)',
                                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                    border: '1px solid var(--border-subtle)'
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <strong style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{srv.systemDisk.drive}</strong>
                                      <span className="badge badge-subtle" style={{ fontSize: '9px' }}>SYSTEM OS</span>
                                      <span className="badge badge-emerald" style={{ fontSize: '9px' }}>HEALTHY</span>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                      <span style={{ fontSize: '11.5px', fontWeight: '700', color: 'var(--text-primary)' }}>
                                        {srv.systemDisk.freeGB.toFixed(1)} GB Free
                                      </span>
                                      <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginLeft: '6px' }}>
                                        / {srv.systemDisk.totalGB.toFixed(0)} GB ({srv.systemDisk.freePercent.toFixed(0)}% available)
                                      </span>
                                    </div>
                                  </div>
                                  <div style={{ width: '100%', height: '5px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{ width: `${srv.systemDisk.usedPercent}%`, height: '100%', backgroundColor: 'var(--accent-blue)' }} />
                                  </div>
                                </div>
                              )}

                              {/* 3. HEALTHY CLIENT VOLUMES */}
                              {srv.healthyClientDisks.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <button
                                    onClick={() => toggleDisksExpanded(srv.id)}
                                    className="btn btn-ghost btn-sm"
                                    style={{ fontSize: '10.5px', padding: '4px 6px', color: 'var(--text-muted)', justifyContent: 'space-between', width: '100%' }}
                                  >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <CheckCircle2 size={12} color="var(--accent-emerald)" />
                                      {srv.healthyClientDisks.length} Other Client Volumes (All Normal)
                                    </span>
                                    {expandedDisks[srv.id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                  </button>

                                  {expandedDisks[srv.id] && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '6px', padding: '6px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-xs)' }}>
                                      {srv.healthyClientDisks.map((d, hIdx) => (
                                        <div
                                          key={hIdx}
                                          style={{
                                            padding: '4px 8px',
                                            borderRadius: 'var(--radius-xs)',
                                            backgroundColor: 'rgba(16, 185, 129, 0.05)',
                                            border: '1px solid rgba(16, 185, 129, 0.15)'
                                          }}
                                        >
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <strong style={{ fontSize: '11px', color: 'var(--text-primary)' }}>{d.drive}</strong>
                                            <span style={{ fontSize: '9px', color: 'var(--accent-emerald)', fontWeight: '700' }}>
                                              {d.freePercent.toFixed(0)}%
                                            </span>
                                          </div>
                                          <div style={{ fontSize: '9.5px', color: 'var(--text-muted)' }}>
                                            {d.freeGB.toFixed(1)} GB free
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* RIGHT: ACTIVE & DISCONNECTED SESSIONS LIST WITH KICK & RDP */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Radio size={13} color="var(--accent-purple)" />
                              <span>Live Windows Sessions ({srv.activeSessions.length + srv.disconnectedSessions.length})</span>
                            </div>
                            <div style={{ display: 'flex', gap: '6px', fontSize: '10px' }}>
                              <span style={{ color: '#34d399', fontWeight: '700' }}>● {srv.activeSessions.length} Online</span>
                              <span style={{ color: '#fbbf24', fontWeight: '700' }}>⏸ {srv.disconnectedSessions.length} Disc</span>
                            </div>
                          </div>

                          {srv.activeSessions.length === 0 && srv.disconnectedSessions.length === 0 ? (
                            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px 0' }}>
                              No active or disconnected RDP sessions currently logged into this VPS node.
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '180px', overflowY: 'auto' }}>
                              {[...srv.activeSessions, ...srv.disconnectedSessions].map(sess => {
                                const isOnline = sess.state === 'Active';
                                return (
                                  <div
                                    key={sess.id}
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      padding: '6px 10px',
                                      backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.05)' : 'rgba(245, 158, 11, 0.05)',
                                      borderRadius: 'var(--radius-xs)',
                                      border: `1px solid ${isOnline ? 'rgba(16, 185, 129, 0.18)' : 'rgba(245, 158, 11, 0.18)'}`
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                      <div style={{
                                        width: '20px',
                                        height: '20px',
                                        borderRadius: '50%',
                                        backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                                        color: isOnline ? '#34d399' : '#fbbf24',
                                        fontSize: '9.5px',
                                        fontWeight: '800',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0
                                      }}>
                                        {(sess.username || 'U')[0].toUpperCase()}
                                      </div>
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                          <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {sess.username}
                                          </span>
                                          <span style={{ fontSize: '10px', color: isOnline ? '#34d399' : '#fbbf24', fontWeight: '600' }}>
                                            ({isOnline ? 'Active' : 'Disc'})
                                          </span>
                                        </div>
                                        {sess.company && sess.company !== sess.username && (
                                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {sess.company}
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                      {onForceLogoffSession && sess.sessionId && (
                                        <button
                                          onClick={() => {
                                            if (window.confirm(`Force log off user "${sess.username}" (Session ID ${sess.sessionId}) on ${srv.name}?`)) {
                                              onForceLogoffSession(srv.id, sess.sessionId, sess.username);
                                            }
                                          }}
                                          className="btn btn-ghost btn-sm font-mono"
                                          title={`Force Logoff Session ${sess.sessionId}`}
                                          style={{ fontSize: '10px', color: 'var(--accent-rose)', padding: '2px 6px', gap: '3px' }}
                                        >
                                          <LogOut size={10} /> Kick
                                        </button>
                                      )}
                                      {onDirectRemoteConnect && isOnline && (
                                        <button
                                          onClick={() => onDirectRemoteConnect(sess.userObj, 'USER')}
                                          className="btn btn-ghost btn-sm font-mono"
                                          style={{ fontSize: '10px', color: 'var(--accent-blue)', padding: '2px 6px', gap: '3px' }}
                                        >
                                          <ExternalLink size={10} /> RDP
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* VIEW B: MODULAR SERVER CARDS (PAGINATED 2-COLUMN CARDS) */}
      {viewMode === 'GRID' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '16px' }}>
          {paginatedServers.map(srv => {
            const ramColor = srv.ramPercent >= 90 ? 'var(--accent-rose)' : (srv.ramPercent >= 75 ? 'var(--accent-amber)' : 'var(--accent-emerald)');
            const cpuColor = srv.cpuUsage >= 80 ? 'var(--accent-rose)' : (srv.cpuUsage >= 50 ? 'var(--accent-amber)' : 'var(--accent-sky)');

            return (
              <div
                key={srv.id}
                className="surface-card"
                style={{
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  border: srv.hasAlert ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-subtle)',
                  backgroundColor: srv.hasAlert ? 'rgba(239, 68, 68, 0.02)' : 'var(--bg-surface)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: srv.hasAlert ? '0 4px 20px rgba(239, 68, 68, 0.08)' : '0 4px 14px rgba(0,0,0,0.2)'
                }}
              >
                {/* 1. SERVER HEADER */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: srv.isOnline ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                      border: `1px solid ${srv.isOnline ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                      color: srv.isOnline ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Server size={20} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {srv.name}
                        </h3>
                        {srv.diskAlertsCount > 0 && (
                          <span className="badge badge-danger" style={{ fontSize: '10px', padding: '1px 6px' }}>
                            🚨 {srv.diskAlertsCount} Low Disk
                          </span>
                        )}
                      </div>
                      <div className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {srv.ipPort}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {srv.isOnline ? (
                      <span className="badge badge-emerald" style={{ fontSize: '11px' }}>
                        ● Live ({srv.pingText})
                      </span>
                    ) : (
                      <span className="badge badge-danger" style={{ fontSize: '11px' }}>
                        ● Offline
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. RAM & CPU PROGRESS BARS */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', backgroundColor: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Activity size={12} /> RAM
                      </span>
                      <strong className="font-mono" style={{ color: ramColor }}>
                        {srv.ramPercent}% ({srv.ramUsedGB.toFixed(1)}G)
                      </strong>
                    </div>
                    <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, srv.ramPercent)}%`, height: '100%', backgroundColor: ramColor }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Cpu size={12} /> CPU
                      </span>
                      <strong className="font-mono" style={{ color: cpuColor }}>
                        {srv.cpuUsage}%
                      </strong>
                    </div>
                    <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, srv.cpuUsage)}%`, height: '100%', backgroundColor: cpuColor }} />
                    </div>
                  </div>
                </div>

                {/* 3. DISK VOLUMES SECTION */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <HardDrive size={13} color="var(--accent-blue)" />
                      <span>Drive Volumes ({srv.disks.length})</span>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Total: {srv.totalUsedStorageGB.toFixed(0)}/{srv.totalStorageGB.toFixed(0)} GB
                    </span>
                  </div>

                  {srv.disks.length === 0 ? (
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0' }}>
                      No drive telemetry reported.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {srv.alertDisks.map((d, dIdx) => (
                        <div
                          key={`grid-d-${dIdx}`}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 'var(--radius-xs)',
                            backgroundColor: d.isCritical ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                            border: `1px solid ${d.isCritical ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{d.isCritical ? '🚨' : '⚠️'}</span>
                              <strong style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{d.drive}</strong>
                              <span className={d.isCritical ? 'badge badge-danger' : 'badge badge-amber'} style={{ fontSize: '9px' }}>
                                {d.severity}
                              </span>
                            </div>
                            <span style={{ fontSize: '11.5px', fontWeight: '700', color: d.isCritical ? 'var(--accent-rose)' : '#fbbf24' }}>
                              {d.freeGB.toFixed(1)} GB Free ({d.freePercent.toFixed(0)}%)
                            </span>
                          </div>
                        </div>
                      ))}

                      {srv.systemDisk && !srv.systemDisk.isCritical && !srv.systemDisk.isWarning && (
                        <div style={{ padding: '6px 10px', borderRadius: 'var(--radius-xs)', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <strong style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{srv.systemDisk.drive}</strong>
                              <span className="badge badge-subtle" style={{ fontSize: '9px' }}>SYSTEM</span>
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {srv.systemDisk.freeGB.toFixed(1)} GB Free ({srv.systemDisk.freePercent.toFixed(0)}%)
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 4. ACTIVE SESSIONS LIST */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Radio size={13} color="var(--accent-purple)" />
                      <span>VPS Sessions ({srv.activeSessions.length + srv.disconnectedSessions.length})</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', fontSize: '10px' }}>
                      <span style={{ color: '#34d399', fontWeight: '700' }}>● {srv.activeSessions.length} Online</span>
                      <span style={{ color: '#fbbf24', fontWeight: '700' }}>⏸ {srv.disconnectedSessions.length} Disc</span>
                    </div>
                  </div>

                  {srv.activeSessions.length === 0 && srv.disconnectedSessions.length === 0 ? (
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '6px 0' }}>
                      No active or disconnected RDP sessions.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '110px', overflowY: 'auto' }}>
                      {[...srv.activeSessions, ...srv.disconnectedSessions].map(sess => {
                        const isOnline = sess.state === 'Active';
                        return (
                          <div
                            key={sess.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '5px 8px',
                              backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.05)' : 'rgba(245, 158, 11, 0.05)',
                              borderRadius: 'var(--radius-xs)',
                              border: `1px solid ${isOnline ? 'rgba(16, 185, 129, 0.18)' : 'rgba(245, 158, 11, 0.18)'}`
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                              <span style={{ fontSize: '11.5px', fontWeight: '700', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {sess.username}
                              </span>
                              <span style={{ fontSize: '9.5px', color: isOnline ? '#34d399' : '#fbbf24' }}>
                                ({isOnline ? 'Live' : 'Disc'})
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {onForceLogoffSession && sess.sessionId && (
                                <button
                                  onClick={() => {
                                    if (window.confirm(`Force log off user "${sess.username}" on ${srv.name}?`)) {
                                      onForceLogoffSession(srv.id, sess.sessionId, sess.username);
                                    }
                                  }}
                                  className="btn btn-ghost btn-sm font-mono"
                                  style={{ fontSize: '9.5px', color: 'var(--accent-rose)', padding: '2px 5px' }}
                                >
                                  Kick
                                </button>
                              )}
                              {onDirectRemoteConnect && isOnline && (
                                <button
                                  onClick={() => onDirectRemoteConnect(sess.userObj, 'USER')}
                                  className="btn btn-ghost btn-sm font-mono"
                                  style={{ fontSize: '9.5px', color: 'var(--accent-blue)', padding: '2px 5px' }}
                                >
                                  RDP
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 5. FOOTER QUICK ACTIONS */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px', marginTop: 'auto' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Accounts: <strong style={{ color: 'var(--text-primary)' }}>{srv.assignedCount}</strong>
                  </span>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    {onNavigateToReports && (
                      <button
                        onClick={() => onNavigateToReports(srv.id)}
                        className="btn btn-ghost btn-sm font-mono"
                        style={{ fontSize: '11px', gap: '4px', padding: '4px 8px', color: '#c084fc' }}
                      >
                        <BarChart3 size={12} /> Graphs
                      </button>
                    )}
                    {onNavigateToServerUsers && (
                      <button
                        onClick={() => onNavigateToServerUsers(srv.id)}
                        className="btn btn-ghost btn-sm font-mono"
                        style={{ fontSize: '11px', gap: '4px', padding: '4px 8px', color: '#818cf8' }}
                      >
                        <UserCog size={12} /> OS Users
                      </button>
                    )}
                    {onDirectRemoteConnect && (
                      <button
                        onClick={() => onDirectRemoteConnect({ serverId: srv.id, ipPort: srv.ipPort }, 'SERVER')}
                        className="btn btn-secondary btn-sm font-mono"
                        style={{ fontSize: '11px', gap: '4px', padding: '4px 10px' }}
                      >
                        <ExternalLink size={12} /> Connect RDP
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW C: DENSE TABULAR OVERVIEW */}
      {viewMode === 'TABLE' && (
        <div className="table-wrapper">
          <div className="table-container">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>VPS Node &amp; IP</th>
                  <th>Ping Status</th>
                  <th>RAM Usage</th>
                  <th>CPU Load</th>
                  <th>Disk Drives Telemetry</th>
                  <th>VPS Sessions</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedServers.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
                      <Activity size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                      <strong style={{ color: 'var(--text-primary)', fontSize: '14px' }}>No VPS Nodes Matching Filters</strong>
                      <p style={{ fontSize: '12px', margin: '4px 0 0' }}>No server nodes match the current filter selection or search query.</p>
                    </td>
                  </tr>
                ) : (
                  paginatedServers.map(srv => {
                    const ramColor = srv.ramPercent >= 90 ? 'var(--accent-rose)' : (srv.ramPercent >= 75 ? 'var(--accent-amber)' : 'var(--accent-emerald)');

                    return (
                      <tr key={srv.id}>
                        <td style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                          <div>{srv.name}</div>
                          <div className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{srv.ipPort}</div>
                        </td>
                        <td>
                          {srv.isOnline ? (
                            <span className="badge badge-emerald" style={{ fontSize: '10.5px' }}>
                              ● Live ({srv.pingText})
                            </span>
                          ) : (
                            <span className="badge badge-danger" style={{ fontSize: '10.5px' }}>
                              ● Offline
                            </span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                              <strong className="font-mono" style={{ color: ramColor }}>{srv.ramPercent}%</strong>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{srv.ramUsedGB.toFixed(1)}GB / {srv.ramTotalGB.toFixed(0)}GB</span>
                            </div>
                            <div style={{ width: '80px', height: '4px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(100, srv.ramPercent)}%`, height: '100%', backgroundColor: ramColor }} />
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="font-mono" style={{ fontSize: '11.5px', fontWeight: '700' }}>
                            {srv.cpuUsage}%
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {srv.alertDisks.map((d, dIdx) => (
                              <span key={dIdx} className={d.isCritical ? 'badge badge-danger' : 'badge badge-amber'} style={{ fontSize: '10px' }}>
                                {d.isCritical ? '🚨' : '⚠️'} {d.drive} {d.freeGB.toFixed(1)}GB free
                              </span>
                            ))}
                            {srv.systemDisk && (
                              <span className="badge badge-subtle" style={{ fontSize: '10px' }}>
                                {srv.systemDisk.drive} {srv.systemDisk.freeGB.toFixed(1)}GB free
                              </span>
                            )}
                            {srv.healthyClientDisks.length > 0 && (
                              <span className="badge badge-emerald" style={{ fontSize: '10px', opacity: 0.9 }}>
                                +{srv.healthyClientDisks.length} Healthy Volumes
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <span className="badge badge-emerald" style={{ fontSize: '10px' }}>
                              ● {srv.activeCount} Online
                            </span>
                            {srv.disconnectedCount > 0 && (
                              <span className="badge badge-amber" style={{ fontSize: '10px' }}>
                                ⏸ {srv.disconnectedCount} Disc
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                            {onNavigateToReports && (
                              <button
                                onClick={() => onNavigateToReports(srv.id)}
                                className="btn btn-ghost btn-sm font-mono"
                                style={{ fontSize: '10.5px', color: '#c084fc', gap: '4px' }}
                                title="View Historical Performance Graphs & Reports"
                              >
                                <BarChart3 size={12} /> Graphs
                              </button>
                            )}
                            {onNavigateToServerUsers && (
                              <button
                                onClick={() => onNavigateToServerUsers(srv.id)}
                                className="btn btn-ghost btn-sm font-mono"
                                style={{ fontSize: '10.5px', color: '#818cf8', gap: '4px' }}
                                title="Manage Windows OS Users"
                              >
                                <UserCog size={12} /> OS Users
                              </button>
                            )}
                            {onDirectRemoteConnect && (
                              <button
                                onClick={() => onDirectRemoteConnect({ serverId: srv.id, ipPort: srv.ipPort }, 'SERVER')}
                                className="btn btn-ghost btn-sm font-mono"
                                style={{ fontSize: '10.5px', color: 'var(--accent-blue)', gap: '4px' }}
                              >
                                <ExternalLink size={12} /> Connect RDP
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
      )}

      {/* 6. FLEET PAGINATION BAR (CRITICAL FOR 100-150 SERVERS) */}
      {sortedServerList.length > 0 && (
        <div
          className="surface-card"
          style={{
            padding: '12px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            marginTop: '6px'
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Showing{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {pageSize >= 999 ? 1 : Math.min((safeCurrentPage - 1) * pageSize + 1, sortedServerList.length)}
            </strong>
            {' '}-{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {pageSize >= 999 ? sortedServerList.length : Math.min(safeCurrentPage * pageSize, sortedServerList.length)}
            </strong>
            {' '}of{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{sortedServerList.length}</strong> VPS Nodes
            {statusFilter !== 'ALL' && <span style={{ marginLeft: '6px' }}>({statusFilter} filter applied)</span>}
          </div>

          {pageSize < 999 && totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '11.5px', height: '32px', gap: '4px', opacity: safeCurrentPage <= 1 ? 0.4 : 1 }}
              >
                <ChevronLeft size={14} /> Previous
              </button>

              <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', padding: '0 8px' }}>
                Page {safeCurrentPage} of {totalPages}
              </div>

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage >= totalPages}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '11.5px', height: '32px', gap: '4px', opacity: safeCurrentPage >= totalPages ? 0.4 : 1 }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

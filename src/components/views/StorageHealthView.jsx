import React, { useState, useMemo } from 'react';
import {
  HardDrive,
  Server,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Search,
  Activity,
  Database,
  ShieldAlert,
  RefreshCw,
  Copy,
  Check,
  Radio,
  ExternalLink,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Sparkles,
  Layers,
  PlusCircle,
  Cpu,
  Info,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import InitializeDiskModal from '../InitializeDiskModal';

export default function StorageHealthView({
  servers = [],
  telemetryData = {},
  onDirectRemoteConnect,
  onRefreshTelemetry
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedServerFilter, setSelectedServerFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL', 'ALERTS_ONLY', 'CRITICAL_ONLY', 'HEALTHY_ONLY'
  const [driveTypeFilter, setDriveTypeFilter] = useState('ALL'); // 'ALL', 'SYSTEM_C', 'DATA_DRIVES'
  const [viewStyle, setViewStyle] = useState('GRID'); // 'GRID' or 'TABLE'
  const [copiedKey, setCopiedKey] = useState(null);

  // Modal State for Disk Initialization & Provisioning
  const [isInitModalOpen, setIsInitModalOpen] = useState(false);
  const [initTargetServerId, setInitTargetServerId] = useState(null);
  const [initTargetDiskNumber, setInitTargetDiskNumber] = useState(null);
  const [initModalMode, setInitModalMode] = useState('create');
  const [initTargetDriveLetter, setInitTargetDriveLetter] = useState(null);
  const [provisionSuccessMsg, setProvisionSuccessMsg] = useState(null);
  const [lockingDrives, setLockingDrives] = useState({});
  const [optimizingServer, setOptimizingServer] = useState(false);

  const handleOptimizeServer = async () => {
    const target = selectedServerFilter !== 'ALL' ? servers.find(s => s.id === selectedServerFilter) : servers[0];
    if (!target) return;
    if (!window.confirm(`Run full system auto-optimization on ${target.name}?\n\n• Force clean stale disconnected sessions (>24h)\n• Purge %TEMP% and junk error dumps\n• Execute SSD ReTrim on all volumes`)) return;

    setOptimizingServer(true);
    try {
      const res = await fetch(`/api/servers/${target.id}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        alert(`⚡ Optimization job queued for ${target.name}!\nThe VPS agent is performing session cleanup, temp purging, and SSD TRIM.`);
        if (onRefreshTelemetry) onRefreshTelemetry();
      } else {
        alert(`Error: ${data.error || 'Failed to dispatch optimization job'}`);
      }
    } catch (e) {
      alert(`Network error: ${e.message}`);
    } finally {
      setOptimizingServer(false);
    }
  };

  const allProcessAlerts = useMemo(() => {
    return servers.flatMap(s => {
      const tData = telemetryData[s.id] || telemetryData[s.ipPort] || null;
      const alerts = (tData && Array.isArray(tData.processAlerts)) ? tData.processAlerts : (Array.isArray(s.processAlerts) ? s.processAlerts : []);
      return alerts.map(a => ({ ...a, serverName: s.name || s.ipPort }));
    });
  }, [servers, telemetryData]);

  // Compute all physical disks across all servers
  const allPhysicalDisksList = useMemo(() => {
    return servers.flatMap(s => {
      const sIpPure = s.ipPort ? s.ipPort.split(':')[0] : '';
      const tData = telemetryData[s.id] || telemetryData[s.ipPort] || telemetryData[s.name] || (sIpPure && telemetryData[sIpPure]) || null;
      const rawPhys = (tData && Array.isArray(tData.physicalDisks) && tData.physicalDisks.length > 0)
        ? tData.physicalDisks
        : (Array.isArray(s.physicalDisks) ? s.physicalDisks : []);

      return rawPhys.map(d => ({
        ...d,
        serverId: s.id,
        serverName: s.name || s.ipPort,
        serverIp: s.ipPort
      }));
    });
  }, [servers, telemetryData]);

  // Filtered physical disks
  const filteredPhysicalDisks = useMemo(() => {
    return allPhysicalDisksList.filter(d => {
      if (selectedServerFilter !== 'ALL') {
        if (d.serverId !== selectedServerFilter && d.serverIp !== selectedServerFilter && d.serverName !== selectedServerFilter) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchServer = (d.serverName || '').toLowerCase().includes(q);
        const matchIp = (d.serverIp || '').toLowerCase().includes(q);
        const matchName = (d.friendlyName || '').toLowerCase().includes(q);
        const matchDisk = `disk ${d.diskNumber}`.includes(q);
        if (!matchServer && !matchIp && !matchName && !matchDisk) return false;
      }
      return true;
    });
  }, [allPhysicalDisksList, selectedServerFilter, searchQuery]);

  // Physical storage aggregate metrics
  const physicalMetrics = useMemo(() => {
    const totalDisks = allPhysicalDisksList.length;
    const totalPhysicalGB = allPhysicalDisksList.reduce((acc, d) => acc + (parseFloat(d.totalGB) || 0), 0);
    const totalAllocatedGB = allPhysicalDisksList.reduce((acc, d) => acc + (parseFloat(d.allocatedGB) || 0), 0);
    const totalUnallocatedGB = allPhysicalDisksList.reduce((acc, d) => acc + (parseFloat(d.unallocatedGB) || 0), 0);
    const offlineCount = allPhysicalDisksList.filter(d => d.isOffline).length;
    const rawCount = allPhysicalDisksList.filter(d => d.partitionStyle === 'RAW' || d.operationalStatus === 'Uninitialized').length;

    return {
      totalDisks,
      totalPhysicalGB,
      totalAllocatedGB,
      totalUnallocatedGB,
      offlineCount,
      rawCount
    };
  }, [allPhysicalDisksList]);

  // Compute all formatted logical volumes across all server telemetry payloads
  const allServerDrivesList = useMemo(() => {
    return servers.flatMap(s => {
      const sIpPure = s.ipPort ? s.ipPort.split(':')[0] : '';
      const tData = telemetryData[s.id] || telemetryData[s.ipPort] || telemetryData[s.name] || (sIpPure && telemetryData[sIpPure]) || null;
      
      if (tData && Array.isArray(tData.disks) && tData.disks.length > 0) {
        return tData.disks.map((d, index) => {
          const drive = (d.driveLetter || d.drive || `Drive ${index}`).toUpperCase().trim();
          const freeGB = parseFloat(d.freeGB) || 0;
          const totalGB = parseFloat(d.totalGB) || 0;
          const usedGB = Math.max(0, totalGB - freeGB);
          const freePercent = totalGB > 0 ? (freeGB / totalGB) * 100 : 100;
          const usedPercent = totalGB > 0 ? Math.min(100, (usedGB / totalGB) * 100) : 0;
          const isSystemDrive = (drive === 'C:' || drive === 'C');
          const thresholdGB = isSystemDrive ? 5.0 : 0.5;
          
          let isCritical = false;
          let isWarning = false;

          if (isSystemDrive) {
            if (freeGB < 1.5 && freePercent < 5) {
              isCritical = true;
            } else if (freeGB < 5.0 && freePercent < 15) {
              isWarning = true;
            }
          } else {
            if (freeGB < 0.3 && freePercent < 3) {
              isCritical = true;
            } else if (freeGB < 1.0 && freePercent < 15) {
              isWarning = true;
            }
          }

          return {
            id: `${s.id}-${drive}-${index}`,
            serverId: s.id,
            serverName: s.name || s.ipPort,
            ipPort: s.ipPort,
            drive,
            format: d.format || d.fileSystem || 'NTFS',
            freeGB,
            totalGB,
            usedGB,
            freePercent,
            usedPercent,
            isSystemDrive,
            thresholdGB,
            isWarning,
            isCritical,
            severity: isCritical ? 'CRITICAL' : (isWarning ? 'WARNING' : 'HEALTHY'),
            lastPing: tData.lastPing || 'Just now',
            isOnline: tData.status === 'ONLINE'
          };
        });
      }
      return [];
    });
  }, [servers, telemetryData]);

  // Aggregate Stats
  const storageStats = useMemo(() => {
    const totalDrives = allServerDrivesList.length;
    const criticalCount = allServerDrivesList.filter(d => d.isCritical).length;
    const warningCount = allServerDrivesList.filter(d => d.isWarning && !d.isCritical).length;
    const healthyCount = allServerDrivesList.filter(d => !d.isWarning && !d.isCritical).length;

    const fleetTotalGB = allServerDrivesList.reduce((acc, d) => acc + d.totalGB, 0);
    const fleetUsedGB = allServerDrivesList.reduce((acc, d) => acc + d.usedGB, 0);
    const fleetFreeGB = allServerDrivesList.reduce((acc, d) => acc + d.freeGB, 0);
    const fleetFreePercent = fleetTotalGB > 0 ? (fleetFreeGB / fleetTotalGB) * 100 : 0;

    return {
      totalDrives,
      criticalCount,
      warningCount,
      healthyCount,
      totalAlerts: criticalCount + warningCount,
      fleetTotalGB,
      fleetUsedGB,
      fleetFreeGB,
      fleetFreePercent
    };
  }, [allServerDrivesList]);

  // Filtered List
  const filteredDrives = useMemo(() => {
    return allServerDrivesList.filter(item => {
      // 1. Server Filter
      if (selectedServerFilter !== 'ALL') {
        if (item.serverId !== selectedServerFilter && item.ipPort !== selectedServerFilter && item.serverName !== selectedServerFilter) {
          return false;
        }
      }

      // 2. Status Filter
      if (statusFilter === 'ALERTS_ONLY') {
        if (!item.isWarning && !item.isCritical) return false;
      } else if (statusFilter === 'CRITICAL_ONLY') {
        if (!item.isCritical) return false;
      } else if (statusFilter === 'HEALTHY_ONLY') {
        if (item.isWarning || item.isCritical) return false;
      }

      // 3. Drive Type Filter
      if (driveTypeFilter === 'SYSTEM_C') {
        if (!item.isSystemDrive) return false;
      } else if (driveTypeFilter === 'DATA_DRIVES') {
        if (item.isSystemDrive) return false;
      }

      // 4. Text Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchServer = item.serverName.toLowerCase().includes(q);
        const matchIp = item.ipPort.toLowerCase().includes(q);
        const matchDrive = item.drive.toLowerCase().includes(q);
        const matchSeverity = item.severity.toLowerCase().includes(q);
        if (!matchServer && !matchIp && !matchDrive && !matchSeverity) return false;
      }

      return true;
    });
  }, [allServerDrivesList, selectedServerFilter, statusFilter, driveTypeFilter, searchQuery]);

  const handleOpenInitModal = (srvId = null, diskNum = null, mode = 'create', driveLetter = null) => {
    setInitTargetServerId(srvId);
    setInitTargetDiskNumber(diskNum);
    setInitModalMode(mode);
    setInitTargetDriveLetter(driveLetter);
    setIsInitModalOpen(true);
  };

  const handleLockdownDrive = async (serverId, driveLetter) => {
    const key = `${serverId}-${driveLetter}`;
    try {
      setLockingDrives(prev => ({ ...prev, [key]: true }));
      const res = await fetch(`/api/servers/${encodeURIComponent(serverId)}/lockdown-drive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ driveLetter })
      });
      const data = await res.json();
      if (data.success) {
        setProvisionSuccessMsg(`🛡️ Zero-Trust security isolation job dispatched for Drive ${driveLetter}:. Users & Everyone groups are being removed from root.`);
        if (onRefreshTelemetry) setTimeout(onRefreshTelemetry, 2500);
      } else {
        alert(data.error || 'Failed to dispatch lockdown');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setLockingDrives(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleProvisionSuccess = (details) => {
    const actionText = details.action === 'EXTEND' 
      ? `Drive ${details.driveLetter}: on server successfully extended using unallocated space!`
      : `Disk ${details.diskNumber} on server successfully initialized as Drive ${details.driveLetter}:!`;
    setProvisionSuccessMsg(`${actionText} Refreshing telemetry...`);
    if (onRefreshTelemetry) {
      setTimeout(onRefreshTelemetry, 1500);
      setTimeout(onRefreshTelemetry, 5000);
    }
    setTimeout(() => setProvisionSuccessMsg(null), 8000);
  };

  return (
    <div className="product-view storage-view" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* SUCCESS BANNER */}
      {provisionSuccessMsg && (
        <div style={{
          padding: '12px 18px',
          borderRadius: '10px',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          color: '#34d399',
          fontSize: '13px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <CheckCircle2 size={18} />
          <span>{provisionSuccessMsg}</span>
        </div>
      )}

      {/* PAGE HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <HardDrive size={24} color="var(--accent-amber)" />
            Workspace storage health
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: 0, marginTop: '4px' }}>
            Protect Tally data and backups with live capacity, allocation and disk health checks.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* INITIALIZE DISK BUTTON */}
          <button
            onClick={() => handleOpenInitModal()}
            className="btn btn-primary btn-sm"
            style={{
              fontSize: '11.5px',
              gap: '6px',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)'
            }}
          >
            <PlusCircle size={14} />
            Initialize Attached Disk
          </button>

          {onRefreshTelemetry && (
            <button
              onClick={onRefreshTelemetry}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '11.5px', gap: '6px' }}
            >
              <RefreshCw size={13} />
              Sync Telemetry
            </button>
          )}

          <button
            onClick={() => handleOptimizeServer()}
            className="btn btn-secondary btn-sm"
            disabled={optimizingServer}
            style={{ fontSize: '11.5px', gap: '6px', borderColor: 'rgba(56, 189, 248, 0.4)', color: '#38bdf8' }}
            title="Clean disconnected sessions > 24h, purge %TEMP%, and run SSD TRIM"
          >
            {optimizingServer ? <RefreshCw size={13} className="spin" /> : <Sparkles size={13} />}
            {optimizingServer ? 'Optimizing...' : '1-Click Server Cleanup'}
          </button>

          <div style={{ display: 'flex', backgroundColor: 'rgba(0,0,0,0.3)', padding: '2px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <button
              onClick={() => setViewStyle('GRID')}
              style={{
                padding: '4px 8px',
                borderRadius: 'var(--radius-xs)',
                border: 'none',
                backgroundColor: viewStyle === 'GRID' ? 'var(--primary)' : 'transparent',
                color: viewStyle === 'GRID' ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px'
              }}
            >
              <LayoutGrid size={13} />
              Grid
            </button>
            <button
              onClick={() => setViewStyle('TABLE')}
              style={{
                padding: '4px 8px',
                borderRadius: 'var(--radius-xs)',
                border: 'none',
                backgroundColor: viewStyle === 'TABLE' ? 'var(--primary)' : 'transparent',
                color: viewStyle === 'TABLE' ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px'
              }}
            >
              <List size={13} />
              Table
            </button>
          </div>
        </div>
      </div>

      {/* Runaway Process Watchdog Alerts */}
      {allProcessAlerts.length > 0 && (
        <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid #f59e0b', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', color: '#fbbf24', fontSize: '0.85rem' }}>
          <AlertTriangle size={18} />
          <div>
            <strong>⚡ RAM & Runaway Process Watchdog Active:</strong>
            <span style={{ marginLeft: '6px' }}>
              {allProcessAlerts.map((a, i) => `${a.serverName}: ${a.processName} (PID ${a.pid}) using ${a.ramMB}MB - Priority Throttled`).join(' | ')}
            </span>
          </div>
        </div>
      )}

      {/* KPI METRIC CARDS OVERVIEW */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        {/* KPI 1: MONITORED NODES */}
        <div className="surface-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(59, 130, 246, 0.12)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Server size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>VPS Fleet</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>
              {servers.length} <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Nodes</span>
            </div>
          </div>
        </div>

        {/* KPI 2: PHYSICAL DISKS & UNALLOCATED */}
        <div className="surface-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(139, 92, 246, 0.12)', color: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Layers size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Physical Disks</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>
              {physicalMetrics.totalDisks || storageStats.totalDrives} <span style={{ fontSize: '12px', fontWeight: '500', color: physicalMetrics.totalUnallocatedGB > 0 ? '#34d399' : 'var(--text-muted)' }}>
                ({physicalMetrics.totalUnallocatedGB.toFixed(1)} GB Unallocated)
              </span>
            </div>
          </div>
        </div>

        {/* KPI 3: ACTIVE STORAGE ALERTS */}
        <div className="surface-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px', border: storageStats.totalAlerts > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--border-subtle)', backgroundColor: storageStats.totalAlerts > 0 ? 'rgba(239, 68, 68, 0.04)' : 'var(--bg-surface)' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: storageStats.totalAlerts > 0 ? 'rgba(239, 68, 68, 0.15)' : 'var(--accent-emerald-bg)', color: storageStats.totalAlerts > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {storageStats.totalAlerts > 0 ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}
          </div>
          <div>
            <div style={{ fontSize: '11.5px', color: storageStats.totalAlerts > 0 ? 'var(--accent-rose)' : 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Storage Space Alerts</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: storageStats.totalAlerts > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)', marginTop: '2px' }}>
              {storageStats.totalAlerts} <span style={{ fontSize: '11.5px', fontWeight: '600' }}>({storageStats.criticalCount} Critical, {storageStats.warningCount} Warning)</span>
            </div>
          </div>
        </div>

        {/* KPI 4: FLEET DISK CAPACITY */}
        <div className="surface-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(16, 185, 129, 0.12)', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Fleet Free Space</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--accent-emerald)', marginTop: '2px' }}>
              {storageStats.fleetFreeGB.toFixed(1)} GB <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)' }}>({storageStats.fleetFreePercent.toFixed(1)}% Free)</span>
            </div>
          </div>
        </div>
      </div>

      {/* PROMINENT UNALLOCATED SPACE ALERT BANNER */}
      {physicalMetrics.totalUnallocatedGB > 0.5 && (
        <div className="surface-card" style={{
          padding: '14px 20px',
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.14) 0%, rgba(59, 130, 246, 0.08) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          borderRadius: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              backgroundColor: 'rgba(16, 185, 129, 0.2)',
              color: '#34d399',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Sparkles size={22} />
            </div>
            <div>
              <div style={{ fontSize: '14.5px', fontWeight: '800', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Unallocated Storage Detected across Server Fleet</span>
                <span className="badge badge-emerald" style={{ fontSize: '11px', fontWeight: '800' }}>
                  {physicalMetrics.totalUnallocatedGB.toFixed(1)} GB Ready
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                Physical disks have free unallocated space available. You can allocate and mount a new NTFS drive in 1 click without touching existing data.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => handleOpenInitModal(null, null, 'extend')}
              className="btn btn-secondary"
              style={{
                fontSize: '12px',
                fontWeight: '700',
                gap: '6px',
                padding: '8px 14px',
                borderColor: 'rgba(16, 185, 129, 0.4)',
                color: '#34d399'
              }}
            >
              <ArrowRight size={14} />
              Extend Existing Drive
            </button>
            <button
              onClick={() => handleOpenInitModal(null, null, 'create')}
              className="btn btn-primary"
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                color: '#fff',
                fontWeight: '700',
                fontSize: '12.5px',
                gap: '8px',
                padding: '8px 16px'
              }}
            >
              <Sparkles size={15} />
              Create New Drive ({physicalMetrics.totalUnallocatedGB.toFixed(1)} GB)
            </button>
          </div>
        </div>
      )}

      {/* FILTER CONTROL BAR */}
      <div className="surface-card" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          {/* SEARCH INPUT */}
          <div style={{ position: 'relative', minWidth: '240px', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search by server name, IP:Port, or drive (C:, E:, Disk 1)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '34px', fontSize: '12px', height: '34px', width: '100%' }}
            />
          </div>

          {/* SERVER SELECTOR */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: '600', color: 'var(--text-muted)' }}>Server:</span>
            <select
              value={selectedServerFilter}
              onChange={e => setSelectedServerFilter(e.target.value)}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '11.5px', padding: '4px 10px', height: '34px' }}
            >
              <option value="ALL">🌐 All VPS Nodes ({servers.length})</option>
              {servers.map(s => (
                <option key={s.id} value={s.id}>
                  🖥️ {s.name} ({s.ipPort})
                </option>
              ))}
            </select>
          </div>

          {/* DRIVE TYPE FILTER */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: '600', color: 'var(--text-muted)' }}>Type:</span>
            <select
              value={driveTypeFilter}
              onChange={e => setDriveTypeFilter(e.target.value)}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '11.5px', padding: '4px 10px', height: '34px' }}
            >
              <option value="ALL">All Volumes</option>
              <option value="SYSTEM_C">System Drive (C:)</option>
              <option value="DATA_DRIVES">Data Drives (E:, D:, etc.)</option>
            </select>
          </div>
        </div>

        {/* STATUS PILLS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
          <span style={{ fontSize: '11.5px', fontWeight: '600', color: 'var(--text-muted)', marginRight: '4px' }}>Filter Status:</span>
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`btn btn-sm ${statusFilter === 'ALL' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '11px', padding: '3px 10px' }}
          >
            All Volumes ({allServerDrivesList.length})
          </button>
          <button
            onClick={() => setStatusFilter('ALERTS_ONLY')}
            className={`btn btn-sm ${statusFilter === 'ALERTS_ONLY' ? 'btn-warning' : 'btn-ghost'}`}
            style={{ fontSize: '11px', padding: '3px 10px', color: statusFilter === 'ALERTS_ONLY' ? '#fff' : 'var(--accent-amber)' }}
          >
            ⚠️ Low Space Alerts ({storageStats.totalAlerts})
          </button>
          <button
            onClick={() => setStatusFilter('CRITICAL_ONLY')}
            className={`btn btn-sm ${statusFilter === 'CRITICAL_ONLY' ? 'btn-danger' : 'btn-ghost'}`}
            style={{ fontSize: '11px', padding: '3px 10px', color: statusFilter === 'CRITICAL_ONLY' ? '#fff' : 'var(--accent-rose)' }}
          >
            🚨 Critical Space ({storageStats.criticalCount})
          </button>
          <button
            onClick={() => setStatusFilter('HEALTHY_ONLY')}
            className={`btn btn-sm ${statusFilter === 'HEALTHY_ONLY' ? 'btn-success' : 'btn-ghost'}`}
            style={{ fontSize: '11px', padding: '3px 10px', color: statusFilter === 'HEALTHY_ONLY' ? '#fff' : 'var(--accent-emerald)' }}
          >
            ✅ Healthy Volumes ({storageStats.healthyCount})
          </button>
        </div>
      </div>

      {/* SECTION 1: PHYSICAL STORAGE HARDWARE & ATTACHED DISKS */}
      {filteredPhysicalDisks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={18} color="#a78bfa" />
              Physical Disks &amp; Attached Storage Hardware
              <span className="badge badge-subtle font-mono" style={{ fontSize: '11px' }}>
                {filteredPhysicalDisks.length} Physical Disks
              </span>
            </h3>

            {physicalMetrics.totalUnallocatedGB > 0 && (
              <span style={{ fontSize: '12px', color: '#34d399', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Sparkles size={14} />
                {physicalMetrics.totalUnallocatedGB.toFixed(1)} GB Available for Partitioning
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
            {filteredPhysicalDisks.map((d) => {
              const isOsDisk = d.diskNumber === 0;
              const hasUnallocated = (parseFloat(d.unallocatedGB) || 0) > 0.2;
              const isOffline = d.isOffline;
              const isRaw = d.partitionStyle === 'RAW' || d.operationalStatus === 'Uninitialized';
              // Any disk with unallocated space (even Disk 0) or raw/offline can create a drive!
              const canCreateFromUnallocated = hasUnallocated;
              const canInitializeWhole = !isOsDisk && (isOffline || isRaw);
              const canAct = canCreateFromUnallocated || canInitializeWhole;

              return (
                <div
                  key={`${d.serverId}-disk-${d.diskNumber}`}
                  className="surface-card"
                  style={{
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    border: hasUnallocated
                      ? '1px solid rgba(52, 211, 153, 0.4)'
                      : isOffline
                        ? '1px solid rgba(245, 158, 11, 0.4)'
                        : '1px solid var(--border-subtle)',
                    backgroundColor: hasUnallocated
                      ? 'rgba(52, 211, 153, 0.03)'
                      : isOffline
                        ? 'rgba(245, 158, 11, 0.03)'
                        : 'var(--bg-surface)'
                  }}
                >
                  {/* CARD HEADER */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                          {d.serverName}
                        </span>
                        <span className="badge badge-primary font-mono" style={{ fontSize: '11px', fontWeight: '800' }}>
                          Disk {d.diskNumber}
                        </span>
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {d.friendlyName || 'Physical Fixed Disk'} • IP: {d.serverIp}
                      </div>
                    </div>

                    <div>
                      {isOffline ? (
                        <span className="badge badge-amber" style={{ fontSize: '10.5px' }}>
                          Offline
                        </span>
                      ) : isRaw ? (
                        <span className="badge" style={{ backgroundColor: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', fontSize: '10.5px' }}>
                          RAW / Uninitialized
                        </span>
                      ) : (
                        <span className="badge badge-emerald" style={{ fontSize: '10.5px' }}>
                          Online ({d.partitionStyle})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* CAPACITY ALLOCATION BAR */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      <span>Allocated: <strong>{d.allocatedGB} GB</strong></span>
                      <span>Total: <strong>{d.totalGB} GB</strong></span>
                    </div>

                    <div style={{ height: '8px', width: '100%', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                      <div style={{
                        height: '100%',
                        width: `${d.totalGB > 0 ? (d.allocatedGB / d.totalGB) * 100 : 100}%`,
                        backgroundColor: '#3b82f6',
                        transition: 'width 0.4s ease'
                      }} />
                      {hasUnallocated && (
                        <div style={{
                          height: '100%',
                          width: `${d.totalGB > 0 ? (d.unallocatedGB / d.totalGB) * 100 : 0}%`,
                          backgroundColor: '#10b981',
                          transition: 'width 0.4s ease'
                        }} />
                      )}
                    </div>
                  </div>

                  {/* UNALLOCATED HIGHLIGHT BANNER */}
                  {hasUnallocated ? (
                    <div style={{
                      padding: '8px 10px',
                      backgroundColor: 'rgba(16, 185, 129, 0.12)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '11.5px',
                      color: '#34d399'
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: '600' }}>
                        <Sparkles size={14} />
                        Unallocated Space:
                      </span>
                      <strong style={{ fontSize: '12px' }}>{d.unallocatedGB} GB Free</strong>
                    </div>
                  ) : isOffline ? (
                    <div style={{
                      padding: '8px 10px',
                      backgroundColor: 'rgba(245, 158, 11, 0.12)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '11.5px',
                      color: '#fbbf24'
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: '600' }}>
                        <AlertTriangle size={14} />
                        Disk is Offline
                      </span>
                      <span>Requires Online &amp; Partitioning</span>
                    </div>
                  ) : (
                    <div style={{
                      padding: '8px 10px',
                      backgroundColor: 'rgba(0,0,0,0.2)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '11px',
                      color: 'var(--text-muted)'
                    }}>
                      <span>Partition Style: <strong>{d.partitionStyle}</strong></span>
                      <span>Status: <strong style={{ color: 'var(--accent-emerald)' }}>Active</strong></span>
                    </div>
                  )}

                  {/* CARD ACTIONS */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {canCreateFromUnallocated ? (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button
                          onClick={() => handleOpenInitModal(d.serverId, d.diskNumber, 'extend')}
                          className="btn btn-secondary btn-sm"
                          style={{
                            fontSize: '11px',
                            gap: '4px',
                            padding: '4px 8px',
                            borderColor: 'rgba(16, 185, 129, 0.4)',
                            color: '#34d399',
                            fontWeight: '600'
                          }}
                        >
                          <ArrowRight size={12} />
                          Extend Drive
                        </button>
                        <button
                          onClick={() => handleOpenInitModal(d.serverId, d.diskNumber, 'create')}
                          className="btn btn-primary btn-sm"
                          style={{
                            fontSize: '11px',
                            gap: '5px',
                            padding: '4px 10px',
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            border: 'none',
                            color: '#fff',
                            fontWeight: '700',
                            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)'
                          }}
                        >
                          <Sparkles size={12} />
                          Create Drive ({d.unallocatedGB} GB)
                        </button>
                      </div>
                    ) : canInitializeWhole ? (
                      <button
                        onClick={() => handleOpenInitModal(d.serverId, d.diskNumber)}
                        className="btn btn-primary btn-sm"
                        style={{
                          fontSize: '11px',
                          gap: '6px',
                          padding: '4px 10px',
                          background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                          border: 'none',
                          color: '#fff',
                          fontWeight: '700'
                        }}
                      >
                        <PlusCircle size={13} />
                        Initialize &amp; Mount Drive
                      </button>
                    ) : isOsDisk ? (
                      <span style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <ShieldAlert size={12} color="#f87171" />
                        OS System Disk (Fully Allocated)
                      </span>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Fully Allocated ({d.totalGB} GB)
                      </span>
                    )}

                    {onDirectRemoteConnect && (
                      <button
                        onClick={() => onDirectRemoteConnect(d.serverId)}
                        className="btn btn-ghost btn-sm font-mono"
                        style={{ fontSize: '10.5px', gap: '3px', padding: '2px 8px', color: 'var(--accent-blue)' }}
                      >
                        <ExternalLink size={11} /> Connect
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 2: FORMATTED LOGICAL VOLUMES */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <HardDrive size={18} color="var(--accent-amber)" />
          Mounted Logical Volumes &amp; Space Utilization
          <span className="badge badge-subtle font-mono" style={{ fontSize: '11px' }}>
            {filteredDrives.length} Volumes
          </span>
        </h3>

        {/* RENDER GRID OR TABLE VIEW */}
        {filteredDrives.length === 0 ? (
          <div className="surface-card" style={{ textAlign: 'center', padding: '50px 20px' }}>
            <CheckCircle2 size={32} color="var(--accent-emerald)" style={{ margin: '0 auto 12px', display: 'block' }} />
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              No mounted storage volumes found matching filter!
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '6px 0 0' }}>
              All monitored physical server volumes match the selected filter criteria.
            </p>
          </div>
        ) : viewStyle === 'GRID' ? (
          /* GRID CARDS VIEW */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '16px' }}>
            {filteredDrives.map((item) => {
              const barColor = item.isCritical ? '#ef4444' : (item.isWarning ? '#f59e0b' : '#10b981');
              const bgBox = item.isCritical ? 'rgba(239, 68, 68, 0.04)' : (item.isWarning ? 'rgba(245, 158, 11, 0.04)' : 'var(--bg-surface)');
              const borderBox = item.isCritical ? 'rgba(239, 68, 68, 0.35)' : (item.isWarning ? 'rgba(245, 158, 11, 0.35)' : 'var(--border-subtle)');

              return (
                <div key={item.id} className="surface-card" style={{
                  padding: '16px',
                  backgroundColor: bgBox,
                  border: `1px solid ${borderBox}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  position: 'relative'
                }}>
                  {/* CARD HEADER */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                          {item.serverName}
                        </span>
                        <span className="badge badge-subtle" style={{ fontSize: '11px', fontWeight: '800', fontFamily: 'monospace' }}>
                          {item.drive}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>
                        IP: {item.ipPort} • Format: {item.format}
                      </div>
                    </div>

                    <span className={`badge ${item.isCritical ? 'badge-rose' : (item.isWarning ? 'badge-amber' : 'badge-emerald')}`} style={{ fontSize: '10.5px' }}>
                      {item.severity}
                    </span>
                  </div>

                  {/* STORAGE PROGRESS BAR */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      <span>Used: <strong>{item.usedGB.toFixed(1)} GB</strong> ({item.usedPercent.toFixed(1)}%)</span>
                      <span>Total: <strong>{item.totalGB} GB</strong></span>
                    </div>
                    
                    <div style={{ height: '8px', width: '100%', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(100, Math.max(0, item.usedPercent))}%`,
                        backgroundColor: barColor,
                        borderRadius: '4px',
                        transition: 'width 0.4s ease'
                      }} />
                    </div>
                  </div>

                  {/* CAPACITY METRICS SUMMARY */}
                  <div style={{ padding: '8px 10px', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Free Capacity:</span>
                    <span style={{ color: barColor, fontWeight: '700' }}>
                      {item.freeGB.toFixed(1)} GB Free ({item.freePercent.toFixed(1)}%)
                    </span>
                  </div>

                  {/* CARD FOOTER ACTIONS */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>{item.isSystemC ? 'OS System Volume' : 'Dedicated Data Volume'}</span>
                    
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      {!item.isSystemC && (
                        <>
                          <button
                            onClick={() => handleLockdownDrive(item.serverId, item.driveLetter)}
                            disabled={lockingDrives[`${item.serverId}-${item.driveLetter}`]}
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: '10px', gap: '3px', padding: '2px 6px', color: '#10b981' }}
                            title="Purge Users/Everyone from drive root. Enforce Zero-Trust isolation."
                          >
                            <ShieldCheck size={11} /> {lockingDrives[`${item.serverId}-${item.driveLetter}`] ? 'Locking...' : 'Lockdown'}
                          </button>
                          <button
                            onClick={() => handleOpenInitModal(item.serverId, null, 'extend', item.driveLetter)}
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: '10px', gap: '3px', padding: '2px 6px', color: '#38bdf8' }}
                            title="Extend this volume using unallocated space"
                          >
                            <ArrowRight size={11} /> Extend
                          </button>
                        </>
                      )}
                      {onDirectRemoteConnect && (
                        <button
                          onClick={() => onDirectRemoteConnect(item.serverId)}
                          className="btn btn-ghost btn-sm font-mono"
                          style={{ fontSize: '10px', gap: '3px', padding: '2px 6px', color: 'var(--accent-blue)' }}
                        >
                          <ExternalLink size={11} /> RDP
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* DETAILED DATA TABLE VIEW */
          <div className="surface-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>VPS Server Node</th>
                    <th>IP / Port</th>
                    <th>Volume / Drive</th>
                    <th>Storage Health Status</th>
                    <th>Used Capacity</th>
                    <th>Free Space</th>
                    <th>Total Capacity</th>
                    <th style={{ textAlign: 'right' }}>Remote Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrives.map((item) => {
                    const barColor = item.isCritical ? '#ef4444' : (item.isWarning ? '#f59e0b' : '#10b981');

                    return (
                      <tr key={item.id}>
                        <td style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                          {item.serverName}
                        </td>
                        <td className="font-mono" style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                          {item.ipPort}
                        </td>
                        <td>
                          <span className="badge badge-subtle font-mono" style={{ fontWeight: '700' }}>
                            {item.drive} ({item.format})
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${item.isCritical ? 'badge-rose' : (item.isWarning ? 'badge-amber' : 'badge-emerald')}`} style={{ fontSize: '10.5px' }}>
                            {item.severity}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-primary)' }}>
                            {item.usedGB.toFixed(1)} GB ({item.usedPercent.toFixed(1)}%)
                          </div>
                          <div style={{ height: '4px', width: '100px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '2px', overflow: 'hidden', marginTop: '3px' }}>
                            <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, item.usedPercent))}%`, backgroundColor: barColor }} />
                          </div>
                        </td>
                        <td style={{ fontWeight: '700', color: barColor }}>
                          {item.freeGB.toFixed(1)} GB ({item.freePercent.toFixed(1)}%)
                        </td>
                        <td style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                          {item.totalGB} GB
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {onDirectRemoteConnect && (
                            <button
                              onClick={() => onDirectRemoteConnect(item.serverId)}
                              className="btn btn-ghost btn-sm font-mono"
                              style={{ fontSize: '10.5px', gap: '4px', color: 'var(--accent-blue)' }}
                            >
                              <ExternalLink size={12} /> Connect
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* DISK INITIALIZATION & PROVISIONING MODAL */}
      <InitializeDiskModal
        isOpen={isInitModalOpen}
        onClose={() => setIsInitModalOpen(false)}
        servers={servers}
        telemetryData={telemetryData}
        initialServerId={initTargetServerId}
        initialDiskNumber={initTargetDiskNumber}
        initialMode={initModalMode}
        initialDriveLetter={initTargetDriveLetter}
        onSuccess={handleProvisionSuccess}
      />
    </div>
  );
}

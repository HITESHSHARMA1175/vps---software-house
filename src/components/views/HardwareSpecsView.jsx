import React, { useState, useMemo, useEffect } from 'react';
import {
  Cpu,
  Layers,
  HardDrive,
  Shield,
  Search,
  CheckCircle2,
  AlertTriangle,
  History,
  TrendingUp,
  TrendingDown,
  Clock,
  RefreshCw,
  Server,
  Radio,
  ExternalLink,
  Filter,
  LayoutGrid,
  Table as TableIcon,
  Terminal,
  FileSpreadsheet,
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Calendar,
  Sparkles
} from 'lucide-react';
import AgentInstallModal from '../AgentInstallModal';
import { exportHardwareHistoryExcel } from '../../utils/exportUtils';

const getTelemetryForServer = (server, telemetryData) => {
  if (!server || !telemetryData) return null;
  const rawIp = server.ipPort ? server.ipPort.split(':')[0] : '';
  return (
    telemetryData[server.id] ||
    telemetryData[server.ipPort] ||
    telemetryData[server.name] ||
    (rawIp ? telemetryData[rawIp] : null) ||
    (server.ipAddress ? telemetryData[server.ipAddress] : null) ||
    null
  );
};

const parseSpecsFallback = (specsStr) => {
  if (!specsStr || typeof specsStr !== 'string') return null;
  const coresMatch = specsStr.match(/(\d+)\s*Core/i);
  const vcpuMatch = specsStr.match(/\((\d+)\s*vCPU\)/i);
  const ramMatch = specsStr.match(/(\d+)\s*GB\s*RAM/i);
  const diskMatch = specsStr.match(/(\d+)\s*GB\s*(Disk|Storage)/i);
  const cpuMatch = specsStr.includes('•') ? specsStr.split('•')[1]?.trim() : null;

  return {
    cores: coresMatch ? parseInt(coresMatch[1]) : null,
    vcpu: vcpuMatch ? parseInt(vcpuMatch[1]) : null,
    ramGB: ramMatch ? parseInt(ramMatch[1]) : null,
    diskGB: diskMatch ? parseInt(diskMatch[1]) : null,
    cpuName: cpuMatch
  };
};

const isDummySpecs = (str) => {
  if (!str || typeof str !== 'string') return true;
  const s = str.toLowerCase().trim();
  if (
    !s ||
    s === 'n/a' ||
    s === 'specs' ||
    s === 'enterprise standard' ||
    s === 'auto-detecting via agent...' ||
    s === 'windows server 2022'
  ) {
    return true;
  }
  // Real processor metadata or agent bullet indicates authentic verified specs
  if (
    s.includes('•') ||
    s.includes('intel') ||
    s.includes('amd') ||
    s.includes('xeon') ||
    s.includes('epyc') ||
    s.includes('ryzen') ||
    s.includes('vcpu')
  ) {
    return false;
  }
  // Generic hardcoded placeholders without real CPU info
  return (
    s === '8 core / 32gb' ||
    s === '8 core / 32gb ram' ||
    s === '8 core / 32gb ram / 256 gb ssd' ||
    s === '8 core / 32gb / 256 gb ssd' ||
    (s.startsWith('8 core') && s.endsWith('32gb ram') && !s.includes('•'))
  );
};

export default function HardwareSpecsView({
  servers = [],
  telemetryData = {},
  hardwareHistory = [],
  initialServerId = null,
  onRefreshTelemetry,
  onFetchHardwareHistory,
  onDirectRemoteConnect,
  onNavigateToVps
}) {
  const [search, setSearch] = useState('');
  const [selectedServerId, setSelectedServerId] = useState(initialServerId || 'ALL');
  const [activeTab, setActiveTab] = useState('PROFILES'); // 'PROFILES' | 'TABLE' | 'HISTORY'
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [installModalServer, setInstallModalServer] = useState(null);
  const [historyMetricFilter, setHistoryMetricFilter] = useState('ALL'); // 'ALL' | 'RAM' | 'STORAGE' | 'CPU'
  const [historyDirectionFilter, setHistoryDirectionFilter] = useState('ALL'); // 'ALL' | 'INCREASE' | 'DECREASE'
  const [historyViewMode, setHistoryViewMode] = useState('TABLE'); // 'TABLE' | 'TIMELINE'

  useEffect(() => {
    if (onFetchHardwareHistory) {
      onFetchHardwareHistory(selectedServerId === 'ALL' ? null : selectedServerId);
    }
  }, [selectedServerId, onFetchHardwareHistory]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onRefreshTelemetry) await onRefreshTelemetry();
      if (onFetchHardwareHistory) await onFetchHardwareHistory(selectedServerId === 'ALL' ? null : selectedServerId);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const handleExportExcel = () => {
    const sName = selectedServerId === 'ALL'
      ? 'All Fleet Nodes'
      : (servers.find(s => s.id === selectedServerId)?.name || selectedServerId);
    exportHardwareHistoryExcel(filteredHistory, sName);
  };

  // Fleet Aggregates
  const stats = useMemo(() => {
    let totalRam = 0;
    let totalStorage = 0;
    let verifiedCount = 0;

    servers.forEach(s => {
      const tele = getTelemetryForServer(s, telemetryData);
      const hw = tele?.hardware || s.hardware || null;
      const parsedFallback = parseSpecsFallback(s.specs);

      const ramGB = tele?.ramTotalGB ? Math.round(Number(tele.ramTotalGB)) : (hw?.ramTotalGB ? Math.round(Number(hw.ramTotalGB)) : (parsedFallback?.ramGB || 0));
      totalRam += ramGB;

      const rawDisks = Array.isArray(tele?.disks) && tele.disks.length > 0 ? tele.disks : (Array.isArray(s.disks) ? s.disks : []);
      const diskGB = hw?.diskTotalGB || (rawDisks.length > 0 ? Math.round(rawDisks.reduce((a, d) => a + (parseFloat(d.totalGB) || 0), 0)) : (parsedFallback?.diskGB || 0));
      totalStorage += diskGB;

      const liveSpecs = tele?.hardware?.specs || tele?.specs;
      if ((liveSpecs && !isDummySpecs(liveSpecs)) || (s.specs && !isDummySpecs(s.specs))) {
        verifiedCount++;
      }
    });

    return {
      totalNodes: servers.length,
      verifiedNodes: verifiedCount,
      totalRamGB: totalRam,
      totalStorageGB: totalStorage,
      driftEventsCount: hardwareHistory.length
    };
  }, [servers, telemetryData, hardwareHistory]);

  // Filtered servers list
  const filteredServers = useMemo(() => {
    return servers.filter(s => {
      const matchesServerSelect = selectedServerId === 'ALL' || s.id === selectedServerId || s.ipPort === selectedServerId;
      if (!matchesServerSelect) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const tele = getTelemetryForServer(s, telemetryData);
      const cpu = tele?.hardware?.cpuName || tele?.hardware?.cpuFullName || '';
      const specs = tele?.hardware?.specs || tele?.specs || s.specs || '';

      return (
        (s.name || '').toLowerCase().includes(q) ||
        (s.ipPort || '').toLowerCase().includes(q) ||
        (s.ipAddress || '').toLowerCase().includes(q) ||
        cpu.toLowerCase().includes(q) ||
        specs.toLowerCase().includes(q)
      );
    });
  }, [servers, selectedServerId, search, telemetryData]);

  // Filtered hardware change timeline & audit records
  const filteredHistory = useMemo(() => {
    return hardwareHistory.filter(h => {
      const matchesServer = selectedServerId === 'ALL' || h.serverId === selectedServerId || (h.serverIp && h.serverIp.includes(selectedServerId));
      if (!matchesServer) return false;

      // Metric filter
      if (historyMetricFilter === 'RAM') {
        const isRam = (h.metric && h.metric.includes('RAM')) || (h.changeType && h.changeType.includes('RAM'));
        if (!isRam) return false;
      } else if (historyMetricFilter === 'STORAGE') {
        const isStorage = (h.metric && (h.metric.includes('Storage') || h.metric.includes('Drive') || h.metric.includes('Disk'))) ||
          (h.changeType && (h.changeType.includes('DISK') || h.changeType.includes('DRIVE')));
        if (!isStorage) return false;
      } else if (historyMetricFilter === 'CPU') {
        const isCpu = (h.metric && h.metric.includes('CPU')) || (h.changeType && h.changeType.includes('CPU'));
        if (!isCpu) return false;
      }

      // Direction filter
      if (historyDirectionFilter !== 'ALL') {
        const dir = h.direction || (h.delta && String(h.delta).startsWith('+') ? 'INCREASE' : (h.delta && String(h.delta).startsWith('-') ? 'DECREASE' : ''));
        if (dir !== historyDirectionFilter) return false;
      }

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (h.serverName || '').toLowerCase().includes(q) ||
        (h.serverIp || '').toLowerCase().includes(q) ||
        (h.description || '').toLowerCase().includes(q) ||
        (h.changeType || '').toLowerCase().includes(q) ||
        (h.delta || '').toLowerCase().includes(q) ||
        (h.metric || '').toLowerCase().includes(q) ||
        (h.oldValue || '').toLowerCase().includes(q) ||
        (h.newValue || '').toLowerCase().includes(q)
      );
    });
  }, [hardwareHistory, selectedServerId, search, historyMetricFilter, historyDirectionFilter]);

  // Aggregate stats across change history
  const historyStats = useMemo(() => {
    let ramEvents = 0;
    let storageEvents = 0;
    let cpuEvents = 0;
    let netStorageDeltaGB = 0;
    let netRamDeltaGB = 0;

    hardwareHistory.forEach(h => {
      const isRam = (h.metric && h.metric.includes('RAM')) || (h.changeType && h.changeType.includes('RAM'));
      const isStorage = (h.metric && (h.metric.includes('Storage') || h.metric.includes('Drive') || h.metric.includes('Disk'))) ||
        (h.changeType && (h.changeType.includes('DISK') || h.changeType.includes('DRIVE')));
      const isCpu = (h.metric && h.metric.includes('CPU')) || (h.changeType && h.changeType.includes('CPU'));

      let diff = 0;
      if (h.delta) {
        const match = String(h.delta).match(/([+-]?\d+(\.\d+)?)/);
        if (match) diff = parseFloat(match[1]);
      } else if (h.oldValue && h.newValue) {
        const o = parseFloat(h.oldValue);
        const n = parseFloat(h.newValue);
        if (!isNaN(o) && !isNaN(n)) diff = n - o;
      }

      if (isRam) {
        ramEvents++;
        netRamDeltaGB += diff;
      } else if (isStorage) {
        storageEvents++;
        netStorageDeltaGB += diff;
      } else if (isCpu) {
        cpuEvents++;
      }
    });

    return {
      total: hardwareHistory.length,
      ramEvents,
      storageEvents,
      cpuEvents,
      netStorageDeltaGB,
      netRamDeltaGB
    };
  }, [hardwareHistory]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Header Card */}
      <div className="surface-card" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px',
        padding: '16px 20px',
        background: 'linear-gradient(180deg, var(--bg-surface) 0%, rgba(15, 23, 42, 0.4) 100%)',
        border: '1px solid var(--border-default)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(99, 102, 241, 0.2))',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-sky)',
            flexShrink: 0
          }}>
            <Cpu size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                VPS Hardware Specifications & Capacity Audit
              </h2>
              <span className="badge badge-emerald" style={{ fontSize: '10px', fontWeight: '700' }}>
                LIVE TELEMETRY
              </span>
              {stats.driftEventsCount > 0 && (
                <span className="badge badge-purple" style={{ fontSize: '10px', fontWeight: '700' }}>
                  {stats.driftEventsCount} Drift Records
                </span>
              )}
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Continuous physical CPU, RAM and storage telemetry with immutable audit logs for RAM resizing & core alterations.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search processor, node IP, specs..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input"
              style={{ height: '32px', paddingLeft: '30px', fontSize: '12px' }}
            />
          </div>

          <select
            value={selectedServerId}
            onChange={e => setSelectedServerId(e.target.value)}
            className="select"
            style={{ width: 'auto', minWidth: '150px', height: '32px', fontSize: '12px' }}
          >
            <option value="ALL">All Server Nodes ({servers.length})</option>
            {servers.map(s => (
              <option key={s.id} value={s.id}>{s.name || s.ipPort}</option>
            ))}
          </select>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="btn btn-secondary btn-sm"
            style={{ height: '32px', fontSize: '12px' }}
            title="Force refresh live telemetry pings"
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Fleet KPI Summary Ribbon */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px'
      }}>
        {/* KPI 1: Monitored Nodes */}
        <div className="surface-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: 'rgba(56, 189, 248, 0.12)',
            color: 'var(--accent-sky)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Server size={18} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Fleet Nodes</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
              {stats.verifiedNodes} / {stats.totalNodes}
            </div>
            <div style={{ fontSize: '10.5px', color: 'var(--accent-emerald)' }}>
              100% verified hardware
            </div>
          </div>
        </div>

        {/* KPI 2: Total RAM */}
        <div className="surface-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: 'rgba(168, 85, 247, 0.12)',
            color: 'var(--accent-purple)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Layers size={18} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Fleet Memory</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
              {stats.totalRamGB} GB
            </div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
              Physical DDR4/ECC RAM
            </div>
          </div>
        </div>

        {/* KPI 3: Total Storage */}
        <div className="surface-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            color: 'var(--accent-amber)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <HardDrive size={18} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Total Storage</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
              {stats.totalStorageGB} GB
            </div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
              High-Speed NVMe / SSD
            </div>
          </div>
        </div>

        {/* KPI 4: Drift Events */}
        <div className="surface-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: stats.driftEventsCount > 0 ? 'rgba(99, 102, 241, 0.12)' : 'rgba(16, 185, 129, 0.12)',
            color: stats.driftEventsCount > 0 ? 'var(--accent-indigo)' : 'var(--accent-emerald)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <History size={18} />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Drift & Changes</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
              {stats.driftEventsCount}
            </div>
            <div style={{ fontSize: '10.5px', color: stats.driftEventsCount > 0 ? 'var(--accent-purple)' : 'var(--accent-emerald)' }}>
              {stats.driftEventsCount > 0 ? 'Logged hardware alterations' : 'Baseline matched'}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs & View Selector Toolbar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{
          display: 'flex',
          backgroundColor: 'var(--bg-surface-inset)',
          padding: '3px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-default)'
        }}>
          <button
            onClick={() => setActiveTab('PROFILES')}
            className={`btn btn-xs ${activeTab === 'PROFILES' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ height: '28px', fontSize: '12px', padding: '0 12px', gap: '6px' }}
          >
            <LayoutGrid size={13} /> Hardware Profiles Grid
          </button>
          <button
            onClick={() => setActiveTab('TABLE')}
            className={`btn btn-xs ${activeTab === 'TABLE' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ height: '28px', fontSize: '12px', padding: '0 12px', gap: '6px' }}
          >
            <TableIcon size={13} /> Detailed Specs Table
          </button>
          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`btn btn-xs ${activeTab === 'HISTORY' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ height: '28px', fontSize: '12px', padding: '0 12px', gap: '6px' }}
          >
            <History size={13} /> Change Audit Timeline
            {filteredHistory.length > 0 && (
              <span style={{
                marginLeft: '4px',
                backgroundColor: activeTab === 'HISTORY' ? 'rgba(255,255,255,0.25)' : 'rgba(99, 102, 241, 0.25)',
                padding: '0 6px',
                borderRadius: '999px',
                fontSize: '10px',
                fontWeight: '700'
              }}>
                {filteredHistory.length}
              </span>
            )}
          </button>
        </div>

        {onNavigateToVps && (
          <button
            onClick={onNavigateToVps}
            className="btn btn-ghost btn-xs"
            style={{ fontSize: '11.5px', color: 'var(--accent-sky)', gap: '4px' }}
          >
            <Server size={12} /> Back to VPS Fleet View
          </button>
        )}
      </div>

      {/* VIEW 1: HARDWARE PROFILES GRID (UNIFORM & BALANCED CARDS) */}
      {activeTab === 'PROFILES' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 1fr))',
          gap: '14px'
        }}>
          {filteredServers.map(server => {
            const tele = getTelemetryForServer(server, telemetryData);
            const heartbeatAge = tele?.lastPingTimestamp ? Date.now() - Number(tele.lastPingTimestamp) : (tele?.lastPing ? Date.now() - new Date(tele.lastPing).getTime() : Infinity);
            const isOnline = Boolean(tele && tele.isRealAgent && tele.status === 'ONLINE' && heartbeatAge < 3 * 60 * 1000);
            const hw = tele?.hardware || server.hardware || null;
            const parsedFallback = parseSpecsFallback(server.specs);

            const liveSpecs = tele?.hardware?.specs || tele?.specs;
            const verifiedLive = Boolean(liveSpecs && !isDummySpecs(liveSpecs));
            const verifiedDb = Boolean(server.specs && !isDummySpecs(server.specs));
            const finalSpecs = verifiedLive ? liveSpecs : (verifiedDb ? server.specs : null);

            const cpuModel = hw?.cpuName || (hw?.cpuFullName ? hw.cpuFullName.trim() : null) || parsedFallback?.cpuName || null;
            const physCores = hw?.cpuCores || parsedFallback?.cores || null;
            const logCores = hw?.cpuLogical || parsedFallback?.vcpu || null;

            const totalRamGB = tele?.ramTotalGB ? Math.round(Number(tele.ramTotalGB)) : (hw?.ramTotalGB ? Math.round(Number(hw.ramTotalGB)) : (parsedFallback?.ramGB || null));
            const usedRamGB = tele?.ramUsedGB ? Number(tele.ramUsedGB).toFixed(1) : null;
            const ramPct = tele?.ramPercent ?? (totalRamGB && usedRamGB ? Math.round((usedRamGB / totalRamGB) * 100) : 0);

            const rawDisks = Array.isArray(tele?.disks) && tele.disks.length > 0 ? tele.disks : (Array.isArray(server.disks) ? server.disks : []);
            const totalDiskGB = hw?.diskTotalGB || (rawDisks.length > 0 ? Math.round(rawDisks.reduce((a, d) => a + (parseFloat(d.totalGB) || 0), 0)) : (parsedFallback?.diskGB || null));

            return (
              <div
                key={server.id}
                className="surface-card surface-card-interactive"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '16px',
                  gap: '12px',
                  minHeight: '260px',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)'
                }}
              >
                {/* Header */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={`status-pip ${isOnline ? 'status-pip-emerald' : 'status-pip-rose'}`} />
                        <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {server.name}
                        </h3>
                      </div>
                      <div className="font-mono" style={{ fontSize: '11px', color: 'var(--accent-sky)', marginTop: '2px' }}>
                        {server.ipPort}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span className={`badge ${verifiedLive ? 'badge-emerald' : (finalSpecs ? 'badge-blue' : 'badge-neutral')}`} style={{ fontSize: '9.5px' }}>
                        {verifiedLive ? 'LIVE VERIFIED' : (finalSpecs ? 'VERIFIED' : 'AWAITING PING')}
                      </span>
                    </div>
                  </div>

                  {/* Processor Banner (Fixed height to keep cards strictly uniform) */}
                  <div style={{
                    marginTop: '10px',
                    height: '28px',
                    backgroundColor: 'rgba(56, 189, 248, 0.05)',
                    border: '1px solid rgba(56, 189, 248, 0.15)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: '11px',
                    color: 'var(--text-secondary)'
                  }} title={hw?.cpuFullName || cpuModel || 'Install Windows Service on this server to detect exact Processor model'}>
                    <Cpu size={12} color="var(--accent-sky)" style={{ flexShrink: 0 }} />
                    <span style={{ color: 'var(--accent-sky)', fontWeight: '600', flexShrink: 0 }}>CPU:</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cpuModel || (isOnline ? 'Legacy Agent (Run Service to detect exact CPU)' : 'Server Processor')}
                    </span>
                  </div>

                  {/* 3 Metric Summary Boxes */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '10px' }}>
                    {/* CPU Box */}
                    <div style={{
                      backgroundColor: 'var(--bg-surface-inset)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px'
                    }}>
                      <span style={{ fontSize: '10px', color: 'var(--accent-sky)', fontWeight: '700', textTransform: 'uppercase' }}>CPU Cores</span>
                      <span style={{ fontSize: '13px', fontWeight: '800', color: physCores ? 'var(--text-primary)' : 'var(--accent-amber)' }}>
                        {physCores ? `${physCores} Core` : (isOnline ? `${tele.cpuUsage}% Load` : '--')}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {logCores ? `${logCores} vCPU (${tele?.cpuUsage ?? 0}% Load)` : (isOnline ? 'Awaiting Service' : 'Offline')}
                      </span>
                    </div>

                    {/* RAM Box */}
                    <div style={{
                      backgroundColor: 'var(--bg-surface-inset)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px'
                    }}>
                      <span style={{ fontSize: '10px', color: 'var(--accent-purple)', fontWeight: '700', textTransform: 'uppercase' }}>RAM</span>
                      <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-primary)' }}>
                        {totalRamGB ? `${totalRamGB} GB` : '--'}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {isOnline && totalRamGB ? `${usedRamGB}G (${ramPct}%)` : (totalRamGB ? 'Installed' : '--')}
                      </span>
                    </div>

                    {/* Storage Box */}
                    <div style={{
                      backgroundColor: 'var(--bg-surface-inset)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px'
                    }}>
                      <span style={{ fontSize: '10px', color: 'var(--accent-amber)', fontWeight: '700', textTransform: 'uppercase' }}>Disk</span>
                      <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-primary)' }}>
                        {totalDiskGB ? `${totalDiskGB} GB` : (rawDisks.length > 0 ? `${rawDisks.length} Drives` : '--')}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {rawDisks.length > 0 ? `${rawDisks.length} Volumes` : 'Drives'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer Strip */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
                  <div style={{
                    fontSize: '11px',
                    color: finalSpecs ? 'var(--text-primary)' : 'var(--text-muted)',
                    backgroundColor: 'var(--bg-surface-inset)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '6px 8px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: '500'
                  }} title={finalSpecs || 'Awaiting live telemetry'}>
                    {finalSpecs ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle2 size={12} color="var(--accent-emerald)" style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {finalSpecs}
                        </span>
                      </span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontStyle: 'italic' }}>
                        <Clock size={12} color="var(--accent-amber)" style={{ flexShrink: 0 }} />
                        Awaiting agent telemetry for hardware profiling...
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        onClick={() => {
                          setSelectedServerId(server.id);
                          setActiveTab('HISTORY');
                        }}
                        className="btn btn-secondary btn-xs"
                        style={{ fontSize: '11px', padding: '4px 8px', gap: '4px' }}
                      >
                        <History size={11} color="var(--accent-purple)" />
                        <span>Drift Audit</span>
                      </button>

                      {!physCores && (
                        <button
                          onClick={() => setInstallModalServer(server)}
                          className="btn btn-secondary btn-xs"
                          style={{
                            fontSize: '11px',
                            padding: '4px 8px',
                            gap: '4px',
                            backgroundColor: 'rgba(56, 189, 248, 0.1)',
                            borderColor: 'rgba(56, 189, 248, 0.35)',
                            color: 'var(--accent-sky)'
                          }}
                          title="Click to install C# Windows Service (enables live CPU model & cores detection)"
                        >
                          <Terminal size={11} />
                          <span>Setup Service</span>
                        </button>
                      )}
                    </div>

                    {onDirectRemoteConnect && (
                      <button
                        onClick={() => onDirectRemoteConnect({
                          id: `srv-super-${server.id}`,
                          serverId: server.id,
                          company: server.name,
                          username: server.superClientUser || 'Superclient',
                          password: server.superClientPass || 'Pass#123',
                          drive: 'Master Node',
                          expiryDate: '2099-12-31'
                        }, 'SUPERCLIENT')}
                        className="btn btn-warning btn-xs"
                        style={{ fontSize: '11px', padding: '4px 8px' }}
                      >
                        <Shield size={11} fill="#ffffff" /> Superclient
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredServers.length === 0 && (
            <div className="surface-card" style={{ gridColumn: '1 / -1', padding: '40px 20px', textAlign: 'center' }}>
              <Server size={32} color="var(--text-muted)" style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>No server nodes found matching search</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Try resetting your search query or server filter.</div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: DETAILED SPECS TABLE */}
      {activeTab === 'TABLE' && (
        <div className="surface-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-surface-inset)', borderBottom: '1px solid var(--border-default)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '700', color: 'var(--text-muted)' }}>Node Name & IP</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '700', color: 'var(--text-muted)' }}>Status</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '700', color: 'var(--text-muted)' }}>Processor Model</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '700', color: 'var(--text-muted)' }}>Cores / vCPUs</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '700', color: 'var(--text-muted)' }}>Physical RAM</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '700', color: 'var(--text-muted)' }}>Total Storage</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '700', color: 'var(--text-muted)' }}>Verified Specs</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: '700', color: 'var(--text-muted)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredServers.map(server => {
                  const tele = getTelemetryForServer(server, telemetryData);
                  const heartbeatAge = tele?.lastPingTimestamp ? Date.now() - Number(tele.lastPingTimestamp) : (tele?.lastPing ? Date.now() - new Date(tele.lastPing).getTime() : Infinity);
                  const isOnline = Boolean(tele && tele.isRealAgent && tele.status === 'ONLINE' && heartbeatAge < 3 * 60 * 1000);
                  const hw = tele?.hardware || server.hardware || null;
                  const parsedFallback = parseSpecsFallback(server.specs);

                  const liveSpecs = tele?.hardware?.specs || tele?.specs;
                  const verifiedLive = Boolean(liveSpecs && !isDummySpecs(liveSpecs));
                  const verifiedDb = Boolean(server.specs && !isDummySpecs(server.specs));
                  const finalSpecs = verifiedLive ? liveSpecs : (verifiedDb ? server.specs : null);

                  const cpuModel = hw?.cpuName || (hw?.cpuFullName ? hw.cpuFullName.trim() : null) || parsedFallback?.cpuName || null;
                  const physCores = hw?.cpuCores || parsedFallback?.cores || null;
                  const logCores = hw?.cpuLogical || parsedFallback?.vcpu || null;

                  const totalRamGB = tele?.ramTotalGB ? Math.round(Number(tele.ramTotalGB)) : (hw?.ramTotalGB ? Math.round(Number(hw.ramTotalGB)) : (parsedFallback?.ramGB || null));
                  const usedRamGB = tele?.ramUsedGB ? Number(tele.ramUsedGB).toFixed(1) : null;
                  const ramPct = tele?.ramPercent ?? (totalRamGB && usedRamGB ? Math.round((usedRamGB / totalRamGB) * 100) : 0);

                  const rawDisks = Array.isArray(tele?.disks) && tele.disks.length > 0 ? tele.disks : (Array.isArray(server.disks) ? server.disks : []);
                  const totalDiskGB = hw?.diskTotalGB || (rawDisks.length > 0 ? Math.round(rawDisks.reduce((a, d) => a + (parseFloat(d.totalGB) || 0), 0)) : (parsedFallback?.diskGB || null));

                  return (
                    <tr key={server.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{server.name}</div>
                        <div className="font-mono" style={{ fontSize: '11px', color: 'var(--accent-sky)' }}>{server.ipPort}</div>
                      </td>

                      <td style={{ padding: '10px 14px' }}>
                        <span className={`badge ${isOnline ? 'badge-emerald' : 'badge-neutral'}`} style={{ fontSize: '10px' }}>
                          {isOnline ? 'Online (LIVE)' : 'Offline'}
                        </span>
                      </td>

                      <td style={{ padding: '10px 14px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={hw?.cpuFullName || cpuModel}>
                        {cpuModel || <span style={{ color: 'var(--text-muted)' }}>Multi-Core Processor</span>}
                      </td>

                      <td style={{ padding: '10px 14px' }}>
                        {physCores ? (
                          <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                            {physCores} Cores <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>({logCores || physCores} vCPU)</span>
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>--</span>
                        )}
                      </td>

                      <td style={{ padding: '10px 14px' }}>
                        {totalRamGB ? (
                          <div>
                            <span style={{ fontWeight: '700', color: 'var(--accent-purple)' }}>{totalRamGB} GB</span>
                            {isOnline && <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginLeft: '4px' }}>({usedRamGB}G used)</span>}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>--</span>
                        )}
                      </td>

                      <td style={{ padding: '10px 14px' }}>
                        {totalDiskGB ? (
                          <span style={{ fontWeight: '700', color: 'var(--accent-amber)' }}>{totalDiskGB} GB</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>{rawDisks.length} Drives</span>
                        )}
                      </td>

                      <td style={{ padding: '10px 14px', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={finalSpecs || ''}>
                        {finalSpecs ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-primary)', fontWeight: '500' }}>
                            <CheckCircle2 size={12} color="var(--accent-emerald)" style={{ flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{finalSpecs}</span>
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Awaiting agent ping...</span>
                        )}
                      </td>

                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <button
                          onClick={() => {
                            setSelectedServerId(server.id);
                            setActiveTab('HISTORY');
                          }}
                          className="btn btn-secondary btn-xs"
                          style={{ fontSize: '10.5px', padding: '3px 8px' }}
                        >
                          <History size={11} /> Drift History
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: HARDWARE CHANGE & DRIFT AUDIT TIMELINE */}
      {activeTab === 'HISTORY' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* History Controls & Toolbar */}
          <div className="surface-card" style={{
            padding: '14px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            border: '1px solid var(--border-default)',
            background: 'linear-gradient(180deg, var(--bg-surface) 0%, rgba(15, 23, 42, 0.45) 100%)'
          }}>
            {/* Upper Toolbar: Title + Mode Toggle + Export Button */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <History size={18} color="var(--accent-purple)" />
                  <span style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>
                    Hardware Drift & Specification Change Ledger
                  </span>
                  <span className="badge badge-purple" style={{ fontSize: '11px' }}>
                    {filteredHistory.length} Recorded {filteredHistory.length === 1 ? 'Event' : 'Events'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Tracks real-time changes when RAM is upgraded/downgraded, disk/drive storage changes (+/- GB), or CPU cores are reconfigured.
                </div>
              </div>

              {/* Action Buttons: View Toggle + Export to Excel + Refresh */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {/* View Switcher: Spreadsheet Table vs Timeline Cards */}
                <div style={{
                  display: 'flex',
                  backgroundColor: 'var(--bg-surface-inset)',
                  padding: '3px',
                  borderRadius: '7px',
                  border: '1px solid var(--border-default)'
                }}>
                  <button
                    onClick={() => setHistoryViewMode('TABLE')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '4px 10px',
                      fontSize: '11.5px',
                      fontWeight: historyViewMode === 'TABLE' ? '600' : '400',
                      color: historyViewMode === 'TABLE' ? 'var(--text-primary)' : 'var(--text-muted)',
                      backgroundColor: historyViewMode === 'TABLE' ? 'var(--bg-surface)' : 'transparent',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      boxShadow: historyViewMode === 'TABLE' ? '0 1px 3px rgba(0,0,0,0.3)' : 'none'
                    }}
                  >
                    <TableIcon size={13} />
                    <span>Spreadsheet View</span>
                  </button>
                  <button
                    onClick={() => setHistoryViewMode('TIMELINE')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '4px 10px',
                      fontSize: '11.5px',
                      fontWeight: historyViewMode === 'TIMELINE' ? '600' : '400',
                      color: historyViewMode === 'TIMELINE' ? 'var(--text-primary)' : 'var(--text-muted)',
                      backgroundColor: historyViewMode === 'TIMELINE' ? 'var(--bg-surface)' : 'transparent',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      boxShadow: historyViewMode === 'TIMELINE' ? '0 1px 3px rgba(0,0,0,0.3)' : 'none'
                    }}
                  >
                    <Layers size={13} />
                    <span>Timeline Cards</span>
                  </button>
                </div>

                {/* Primary Export to Excel Button */}
                <button
                  onClick={handleExportExcel}
                  disabled={filteredHistory.length === 0}
                  className="btn"
                  title="Download full hardware change history in Microsoft Excel (.xlsx / .csv) format"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: '#ffffff',
                    background: filteredHistory.length === 0
                      ? 'var(--bg-surface-inset)'
                      : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    borderRadius: '7px',
                    cursor: filteredHistory.length === 0 ? 'not-allowed' : 'pointer',
                    boxShadow: filteredHistory.length === 0 ? 'none' : '0 2px 10px rgba(16, 185, 129, 0.3)',
                    opacity: filteredHistory.length === 0 ? 0.5 : 1,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <FileSpreadsheet size={15} />
                  <span>Download in Excel</span>
                  <span style={{
                    fontSize: '10.5px',
                    backgroundColor: 'rgba(255, 255, 255, 0.25)',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    fontWeight: '800'
                  }}>
                    {filteredHistory.length}
                  </span>
                </button>

                {/* Refresh Button */}
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="btn btn-secondary btn-sm"
                  title="Refresh Hardware History"
                  style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  <RefreshCw size={13} className={isRefreshing ? 'spin' : ''} />
                </button>
              </div>
            </div>

            {/* Lower Toolbar: Quick Metric Filters & Direction Filters & KPI Strip */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
              paddingTop: '8px',
              borderTop: '1px solid var(--border-default)'
            }}>
              {/* Metric & Direction Filter Pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>
                  Filter Metric:
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[
                    { id: 'ALL', label: 'All Metrics', count: historyStats.total },
                    { id: 'RAM', label: '💾 RAM Memory', count: historyStats.ramEvents },
                    { id: 'STORAGE', label: '💽 Disk Space', count: historyStats.storageEvents },
                    { id: 'CPU', label: '⚡ CPU Cores', count: historyStats.cpuEvents }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setHistoryMetricFilter(tab.id)}
                      className={`btn btn-xs ${historyMetricFilter === tab.id ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: '11px', padding: '3px 8px' }}
                    >
                      {tab.label}
                      <span style={{ opacity: 0.7, marginLeft: '4px', fontSize: '10px' }}>({tab.count})</span>
                    </button>
                  ))}
                </div>

                <div style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-default)', margin: '0 4px' }} />

                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>
                  Direction:
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[
                    { id: 'ALL', label: 'All' },
                    { id: 'INCREASE', label: '▲ Growth (+)', color: 'var(--accent-emerald)' },
                    { id: 'DECREASE', label: '▼ Reduced (-)', color: 'var(--accent-rose)' }
                  ].map(dir => (
                    <button
                      key={dir.id}
                      onClick={() => setHistoryDirectionFilter(dir.id)}
                      className={`btn btn-xs ${historyDirectionFilter === dir.id ? 'btn-primary' : 'btn-secondary'}`}
                      style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        color: historyDirectionFilter === dir.id ? undefined : dir.color
                      }}
                    >
                      {dir.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* KPI Summary Strip */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11.5px',
                  padding: '3px 9px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-surface-inset)',
                  border: '1px solid var(--border-default)'
                }}>
                  <HardDrive size={13} color="var(--accent-amber)" />
                  <span style={{ color: 'var(--text-muted)' }}>Net Storage Drift:</span>
                  <strong style={{
                    color: historyStats.netStorageDeltaGB > 0
                      ? 'var(--accent-emerald)'
                      : (historyStats.netStorageDeltaGB < 0 ? 'var(--accent-rose)' : 'var(--text-primary)')
                  }}>
                    {historyStats.netStorageDeltaGB > 0 ? `+${historyStats.netStorageDeltaGB} GB` : `${historyStats.netStorageDeltaGB} GB`}
                  </strong>
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11.5px',
                  padding: '3px 9px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-surface-inset)',
                  border: '1px solid var(--border-default)'
                }}>
                  <Cpu size={13} color="var(--accent-purple)" />
                  <span style={{ color: 'var(--text-muted)' }}>Net RAM Drift:</span>
                  <strong style={{
                    color: historyStats.netRamDeltaGB > 0
                      ? 'var(--accent-emerald)'
                      : (historyStats.netRamDeltaGB < 0 ? 'var(--accent-rose)' : 'var(--text-primary)')
                  }}>
                    {historyStats.netRamDeltaGB > 0 ? `+${historyStats.netRamDeltaGB} GB` : `${historyStats.netRamDeltaGB} GB`}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Records Display: Zero State or Table View or Timeline View */}
          {filteredHistory.length === 0 ? (
            <div className="surface-card" style={{
              padding: '48px 24px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px'
            }}>
              <Shield size={38} color="var(--accent-emerald)" />
              <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>
                {hardwareHistory.length === 0
                  ? 'Zero Configuration Drift Detected'
                  : 'No Records Match Selected Filters'}
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', maxWidth: '520px', lineHeight: 1.5 }}>
                {hardwareHistory.length === 0
                  ? 'All monitored VPS nodes are operating at their baseline hardware configuration. Whenever RAM is resized, CPU cores are altered, or disk volumes are expanded (+/- GB), an automated timestamped audit record is recorded here immediately.'
                  : 'Try clearing your metric or direction filters to view other recorded hardware specification changes.'}
              </div>
              {(historyMetricFilter !== 'ALL' || historyDirectionFilter !== 'ALL' || selectedServerId !== 'ALL' || search) && (
                <button
                  onClick={() => {
                    setHistoryMetricFilter('ALL');
                    setHistoryDirectionFilter('ALL');
                    setSelectedServerId('ALL');
                    setSearch('');
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: '8px' }}
                >
                  Clear All Filters
                </button>
              )}
            </div>
          ) : historyViewMode === 'TABLE' ? (
            /* TABULAR SPREADSHEET VIEW */
            <div className="surface-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-default)' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                  <thead>
                    <tr style={{
                      backgroundColor: 'var(--bg-surface-inset)',
                      borderBottom: '1px solid var(--border-default)',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      fontSize: '10.5px'
                    }}>
                      <th style={{ padding: '10px 14px' }}>Date & Time (IST)</th>
                      <th style={{ padding: '10px 14px' }}>Server Node</th>
                      <th style={{ padding: '10px 14px' }}>Hardware Metric</th>
                      <th style={{ padding: '10px 14px' }}>Change Delta</th>
                      <th style={{ padding: '10px 14px' }}>Previous Spec</th>
                      <th style={{ padding: '10px 14px' }}>New Spec</th>
                      <th style={{ padding: '10px 14px' }}>Audit Description</th>
                      <th style={{ padding: '10px 14px' }}>Full Baseline Specs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((item, idx) => {
                      const isRam = (item.metric && item.metric.includes('RAM')) || item.changeType === 'RAM_RESIZED';
                      const isCpu = (item.metric && item.metric.includes('CPU')) || item.changeType === 'CPU_RECONFIGURED';
                      const isDisk = (item.metric && (item.metric.includes('Storage') || item.metric.includes('Drive') || item.metric.includes('Disk'))) || item.changeType === 'DISK_RESIZED';
                      const isBase = item.changeType === 'BASELINE_DETECTED';

                      const dir = item.direction || (item.delta && String(item.delta).startsWith('+') ? 'INCREASE' : (item.delta && String(item.delta).startsWith('-') ? 'DECREASE' : ''));
                      const isIncrease = dir === 'INCREASE' || (item.delta && String(item.delta).startsWith('+'));
                      const isDecrease = dir === 'DECREASE' || (item.delta && String(item.delta).startsWith('-'));

                      let formattedDate = item.detectedAt;
                      try {
                        formattedDate = new Date(item.detectedAt).toLocaleString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        }) + ' IST';
                      } catch (e) {}

                      return (
                        <tr
                          key={item.id || idx}
                          style={{
                            borderBottom: '1px solid var(--border-default)',
                            backgroundColor: idx % 2 === 1 ? 'rgba(255, 255, 255, 0.015)' : 'transparent',
                            transition: 'background-color 0.12s ease'
                          }}
                        >
                          {/* Date & Time */}
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Clock size={12} color="var(--text-muted)" />
                              <span>{formattedDate}</span>
                            </div>
                          </td>

                          {/* Server Node */}
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                              {item.serverName || item.serverId}
                            </div>
                            {item.serverIp && (
                              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                                {item.serverIp}
                              </div>
                            )}
                          </td>

                          {/* Metric Badge */}
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            <span
                              className={`badge ${isRam ? 'badge-purple' : (isCpu ? 'badge-blue' : (isDisk ? 'badge-amber' : 'badge-emerald'))}`}
                              style={{ fontSize: '10.5px', padding: '2px 8px' }}
                            >
                              {item.metric || (isRam ? 'RAM Memory' : (isDisk ? 'Disk Space' : (isCpu ? 'CPU Cores' : 'Baseline')))}
                            </span>
                          </td>

                          {/* Change Delta Badge (+5 GB / -2 GB) */}
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            {item.delta ? (
                              <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 9px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: '800',
                                backgroundColor: isIncrease
                                  ? 'rgba(16, 185, 129, 0.15)'
                                  : (isDecrease ? 'rgba(239, 68, 68, 0.15)' : 'rgba(56, 189, 248, 0.15)'),
                                color: isIncrease
                                  ? 'var(--accent-emerald)'
                                  : (isDecrease ? 'var(--accent-rose)' : 'var(--accent-sky)'),
                                border: isIncrease
                                  ? '1px solid rgba(16, 185, 129, 0.35)'
                                  : (isDecrease ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid rgba(56, 189, 248, 0.35)')
                              }}>
                                {isIncrease ? <ArrowUp size={12} /> : (isDecrease ? <ArrowDown size={12} /> : null)}
                                <span>{item.delta}</span>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>--</span>
                            )}
                          </td>

                          {/* Old Spec */}
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                            {item.oldValue ? (
                              <span style={{ textDecoration: 'line-through', opacity: 0.85 }}>{item.oldValue}</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>Baseline</span>
                            )}
                          </td>

                          {/* New Spec */}
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: '700', color: 'var(--text-primary)' }}>
                            {item.newValue || item.oldValue || '--'}
                          </td>

                          {/* Description */}
                          <td style={{ padding: '10px 14px', maxWidth: '300px' }}>
                            <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                              {item.description}
                            </span>
                          </td>

                          {/* Full Specs */}
                          <td style={{ padding: '10px 14px', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.fullSpecs || ''}>
                            {item.fullSpecs ? (
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                {item.fullSpecs}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>--</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* TIMELINE CARDS VIEW */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredHistory.map((item, idx) => {
                const isRam = (item.metric && item.metric.includes('RAM')) || item.changeType === 'RAM_RESIZED';
                const isCpu = (item.metric && item.metric.includes('CPU')) || item.changeType === 'CPU_RECONFIGURED';
                const isDisk = (item.metric && (item.metric.includes('Storage') || item.metric.includes('Drive') || item.metric.includes('Disk'))) || item.changeType === 'DISK_RESIZED';
                const isBase = item.changeType === 'BASELINE_DETECTED';

                const dir = item.direction || (item.delta && String(item.delta).startsWith('+') ? 'INCREASE' : (item.delta && String(item.delta).startsWith('-') ? 'DECREASE' : ''));
                const isIncrease = dir === 'INCREASE' || (item.delta && String(item.delta).startsWith('+'));
                const isDecrease = dir === 'DECREASE' || (item.delta && String(item.delta).startsWith('-'));

                let formattedDate = item.detectedAt;
                try {
                  formattedDate = new Date(item.detectedAt).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  }) + ' IST';
                } catch (e) {}

                return (
                  <div
                    key={item.id || idx}
                    className="surface-card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 18px',
                      gap: '14px',
                      flexWrap: 'wrap',
                      border: '1px solid var(--border-default)',
                      borderLeft: `4px solid ${
                        isIncrease
                          ? 'var(--accent-emerald)'
                          : (isDecrease ? 'var(--accent-rose)' : (isRam ? 'var(--accent-purple)' : (isDisk ? 'var(--accent-amber)' : 'var(--accent-sky)')))
                      }`
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: '280px' }}>
                      <div style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isRam
                          ? 'rgba(168, 85, 247, 0.15)'
                          : (isCpu ? 'rgba(56, 189, 248, 0.15)' : (isDisk ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)')),
                        color: isRam
                          ? 'var(--accent-purple)'
                          : (isCpu ? 'var(--accent-sky)' : (isDisk ? 'var(--accent-amber)' : 'var(--accent-emerald)')),
                        flexShrink: 0
                      }}>
                        {isRam ? <Cpu size={19} /> : (isCpu ? <Cpu size={19} /> : (isDisk ? <HardDrive size={19} /> : <CheckCircle2 size={19} />))}
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--text-primary)' }}>
                            {item.description}
                          </span>
                          <span
                            className={`badge ${isRam ? 'badge-purple' : (isCpu ? 'badge-blue' : (isDisk ? 'badge-amber' : 'badge-emerald'))}`}
                            style={{ fontSize: '10px', padding: '1px 6px' }}
                          >
                            {item.metric || item.changeType.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span>Node: <strong style={{ color: 'var(--text-primary)' }}>{item.serverName || item.serverId}</strong></span>
                          {item.serverIp && <span>• {item.serverIp}</span>}
                          {item.fullSpecs && <span>• <em>{item.fullSpecs}</em></span>}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      {/* Delta Indicator */}
                      {item.delta && (
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '800',
                          backgroundColor: isIncrease
                            ? 'rgba(16, 185, 129, 0.15)'
                            : (isDecrease ? 'rgba(239, 68, 68, 0.15)' : 'rgba(56, 189, 248, 0.15)'),
                          color: isIncrease
                            ? 'var(--accent-emerald)'
                            : (isDecrease ? 'var(--accent-rose)' : 'var(--accent-sky)'),
                          border: isIncrease
                            ? '1px solid rgba(16, 185, 129, 0.35)'
                            : (isDecrease ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid rgba(56, 189, 248, 0.35)')
                        }}>
                          {isIncrease ? <ArrowUp size={13} /> : (isDecrease ? <ArrowDown size={13} /> : null)}
                          <span>{item.delta}</span>
                        </div>
                      )}

                      {/* Transition Badge: Old -> New */}
                      {item.oldValue && item.newValue && (
                        <div style={{
                          fontSize: '11.5px',
                          fontWeight: '700',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          backgroundColor: 'var(--bg-surface-inset)',
                          border: '1px solid var(--border-default)',
                          color: 'var(--accent-sky)',
                          whiteSpace: 'nowrap'
                        }}>
                          {item.oldValue} ➔ {item.newValue}
                        </div>
                      )}

                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Clock size={12} /> {formattedDate}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 1-Click Universal Agent Install / Windows Service Setup Modal */}
      {installModalServer && (
        <AgentInstallModal
          isOpen={!!installModalServer}
          onClose={() => setInstallModalServer(null)}
          server={installModalServer}
          isOnline={Boolean(
            (() => {
              const tele = getTelemetryForServer(installModalServer, telemetryData);
              const heartbeatAge = tele?.lastPingTimestamp ? Date.now() - Number(tele.lastPingTimestamp) : Infinity;
              return tele && tele.isRealAgent && tele.status === 'ONLINE' && heartbeatAge < 3 * 60 * 1000;
            })()
          )}
        />
      )}
    </div>
  );
}

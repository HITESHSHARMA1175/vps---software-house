import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  HardDrive,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Server,
  Shield,
  SlidersHorizontal,
  Terminal,
  UserCog,
  Users,
  X,
  Edit2,
  Trash2
} from 'lucide-react';
import ServerPerformanceModal from '../ServerPerformanceModal';
import AgentInstallModal from '../AgentInstallModal';
import ActionsDropdown from '../ui/ActionsDropdown';
import AgentKeyRolloutPanel from '../AgentKeyRolloutPanel';
import './VpsView.css';

const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

const isDummySpecs = (str) => {
  if (!str || typeof str !== 'string') return true;
  const value = str.toLowerCase().trim();
  if (
    !value ||
    value === 'n/a' ||
    value === 'specs' ||
    value === 'enterprise standard' ||
    value === 'auto-detecting via agent...' ||
    value === 'windows server 2022'
  ) {
    return true;
  }
  // Real processor metadata or agent bullet indicates authentic verified specs
  if (
    value.includes('•') ||
    value.includes('intel') ||
    value.includes('amd') ||
    value.includes('xeon') ||
    value.includes('epyc') ||
    value.includes('ryzen') ||
    value.includes('vcpu')
  ) {
    return false;
  }
  return (
    value === '8 core / 32gb' ||
    value === '8 core / 32gb ram' ||
    value === '8 core / 32gb ram / 256 gb ssd' ||
    value === '8 core / 32gb / 256 gb ssd' ||
    (value.startsWith('8 core') && value.endsWith('32gb ram') && !value.includes('•'))
  );
};

const getTelemetryForServer = (server, telemetryData) => {
  const rawIp = server.ipPort ? server.ipPort.split(':')[0] : '';
  return telemetryData[server.id]
    || telemetryData[server.ipPort]
    || telemetryData[server.name]
    || (rawIp && telemetryData[rawIp])
    || null;
};

const getDiskSummary = (server, telemetry) => {
  const disks = Array.isArray(telemetry?.disks) && telemetry.disks.length
    ? telemetry.disks
    : (Array.isArray(server.disks) ? server.disks : []);

  if (!disks.length) return { percent: null, freeGB: null, totalGB: null, critical: false };

  const totalGB = disks.reduce((total, disk) => total + (Number(disk.totalGB) || 0), 0);
  const freeGB = disks.reduce((total, disk) => total + (Number(disk.freeGB) || 0), 0);
  const percent = totalGB > 0 ? clampPercent(((totalGB - freeGB) / totalGB) * 100) : null;
  const critical = disks.some((disk) => {
    const total = Number(disk.totalGB) || 0;
    const free = Number(disk.freeGB) || 0;
    const freePercent = total > 0 ? (free / total) * 100 : 100;
    return freePercent < 15;
  });

  return { percent, freeGB, totalGB, critical };
};

const getRelativeHeartbeat = (timestamp) => {
  const time = Number(timestamp);
  if (!time) return 'No heartbeat';

  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

const getMetricTone = (value, warningAt = 70, dangerAt = 85) => {
  if (value === null || value === undefined) return 'muted';
  if (value >= dangerAt) return 'danger';
  if (value >= warningAt) return 'warning';
  return 'good';
};

function MetricBar({ label, value, warningAt, dangerAt, detail }) {
  const hasValue = value !== null && value !== undefined;
  const percent = hasValue ? clampPercent(value) : 0;
  const tone = getMetricTone(percent, warningAt, dangerAt);

  return (
    <div className="vps-metric" aria-label={`${label}: ${hasValue ? `${percent}%` : 'unavailable'}`}>
      <div className="vps-metric-value">
        <span>{hasValue ? `${percent}%` : '—'}</span>
        {detail && <small>{detail}</small>}
      </div>
      <div className="vps-metric-track" aria-hidden="true">
        <span className={`vps-metric-fill is-${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default function VpsView({
  servers = [],
  users = [],
  telemetryData = {},
  hardwareHistory = [],
  onFetchHardwareHistory,
  currentUser,
  employeePermissions,
  onAddServer,
  onEditServer,
  onDeleteServer,
  onDirectRemoteConnect,
  onNavigateToAssignment,
  onNavigateToReports,
  onNavigateToServerUsers,
  onNavigateToHardwareSpecs,
  onRefreshTelemetry
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [expandedServerId, setExpandedServerId] = useState(null);
  const [selectedPerformanceServer, setSelectedPerformanceServer] = useState(null);
  const [agentInstallModalServer, setAgentInstallModalServer] = useState(null);

  const isSuperAdmin = currentUser && currentUser.role === 'SUPER_ADMIN';
  const canEditServer = isSuperAdmin || (employeePermissions && employeePermissions.canEditServer);

  const getDriveStatusForServer = (server) => {
    const serverUsers = users.filter((user) => user.serverId === server.id);
    const driveMap = {};

    (server.availableDrives || []).forEach((drive) => {
      driveMap[drive] = [];
    });

    serverUsers.forEach((user) => {
      if (!user.drive) return;
      if (!driveMap[user.drive]) driveMap[user.drive] = [];
      driveMap[user.drive].push(user);
    });

    const occupiedDrives = Object.keys(driveMap).filter((drive) => driveMap[drive].length > 0);
    const emptyDrives = Object.keys(driveMap).filter((drive) => driveMap[drive].length === 0);
    return { driveMap, occupiedDrives, emptyDrives };
  };

  const fleetNodes = useMemo(() => {
    return servers.map((server) => {
      const telemetry = getTelemetryForServer(server, telemetryData);
      const rawIp = server.ipPort ? server.ipPort.split(':')[0] : '';
      const heartbeatAge = telemetry?.lastPingTimestamp ? Date.now() - Number(telemetry.lastPingTimestamp) : Infinity;
      const isOnline = Boolean(
        telemetry
        && telemetry.isRealAgent
        && telemetry.status === 'ONLINE'
        && heartbeatAge < 3 * 60 * 1000
      );
      const serverUsers = users.filter((user) => user.serverId === server.id);
      const capacity = server.totalUsersLimit || 10;
      const capacityPercent = clampPercent((serverUsers.length / capacity) * 100);
      const cpuPercent = isOnline && telemetry?.cpuUsage !== undefined ? clampPercent(telemetry.cpuUsage) : null;
      const ramPercent = isOnline
        ? clampPercent(telemetry?.ramPercent ?? (telemetry?.ramTotalGB ? (Number(telemetry.ramUsedGB || 0) / Number(telemetry.ramTotalGB)) * 100 : 0))
        : null;
      const disk = getDiskSummary(server, telemetry);
      const warningReasons = [];

      if (!isOnline) warningReasons.push('Telemetry is unavailable');
      if (isOnline && cpuPercent >= 85) warningReasons.push(`CPU at ${cpuPercent}%`);
      if (isOnline && ramPercent >= 85) warningReasons.push(`RAM at ${ramPercent}%`);
      if (isOnline && disk.percent !== null && (disk.percent >= 90 || disk.critical)) warningReasons.push(`Storage at ${disk.percent}%`);
      if (capacityPercent >= 90) warningReasons.push(`Capacity at ${capacityPercent}%`);

      const liveSpecs = telemetry?.hardware?.specs || telemetry?.specs;
      const finalSpecs = liveSpecs && !isDummySpecs(liveSpecs)
        ? liveSpecs
        : (!isDummySpecs(server.specs) ? server.specs : null);

      return {
        server,
        telemetry,
        rawIp,
        isOnline,
        serverUsers,
        capacity,
        capacityPercent,
        cpuPercent,
        ramPercent,
        disk,
        warningReasons,
        finalSpecs
      };
    });
  }, [servers, users, telemetryData]);

  const health = useMemo(() => {
    const online = fleetNodes.filter((node) => node.isOnline).length;
    const offline = fleetNodes.length - online;
    const warning = fleetNodes.filter((node) => node.isOnline && node.warningReasons.length > 0).length;
    return { total: fleetNodes.length, online, offline, warning };
  }, [fleetNodes]);

  const attentionItems = useMemo(() => {
    return fleetNodes
      .filter((node) => node.warningReasons.length > 0)
      .sort((a, b) => {
        if (a.isOnline === b.isOnline) return b.warningReasons.length - a.warningReasons.length;
        return a.isOnline ? 1 : -1;
      });
  }, [fleetNodes]);

  const filteredNodes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return fleetNodes.filter((node) => {
      const { server, isOnline, finalSpecs } = node;
      const matchesSearch = !query || [server.name, server.ipPort, server.serverType, finalSpecs]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
      const matchesType = typeFilter === 'ALL'
        || (typeFilter === 'DEDICATED' && server.serverType === 'Dedicated Server')
        || (typeFilter === 'SHARED' && server.serverType !== 'Dedicated Server');
      const matchesState = stateFilter === 'ALL'
        || (stateFilter === 'ONLINE' && isOnline)
        || (stateFilter === 'OFFLINE' && !isOnline)
        || (stateFilter === 'ATTENTION' && node.warningReasons.length > 0);
      return matchesSearch && matchesType && matchesState;
    });
  }, [fleetNodes, search, stateFilter, typeFilter]);

  const hasFilters = Boolean(search) || typeFilter !== 'ALL' || stateFilter !== 'ALL';
  const clearFilters = () => {
    setSearch('');
    setTypeFilter('ALL');
    setStateFilter('ALL');
  };

  const handleServerSuperLogin = (server) => {
    const nodeAccount = {
      id: `srv-super-${server.id}`,
      serverId: server.id,
      company: server.name,
      username: server.superClientUser || 'Superclient',
      password: '', // never sent to the browser; SUPER_ADMIN reveals it on demand via the backend
      isServerAccount: true,
      drive: 'Master Node',
      expiryDate: '2099-12-31'
    };
    onDirectRemoteConnect?.(nodeAccount, 'SUPERCLIENT');
  };

  const handleOpenHardware = (serverId) => {
    onFetchHardwareHistory?.();
    onNavigateToHardwareSpecs?.(serverId);
  };

  return (
    <div className="vps-fleet-page">
      <header className="vps-fleet-header">
        <div>
          <div className="vps-breadcrumb">Infrastructure <span>/</span> Fleet management</div>
          <h1>VPS Server Fleet</h1>
          <p>Add, monitor and manage every Windows VPS node from one workspace.</p>
        </div>

        <div className="vps-header-actions">
          {onRefreshTelemetry && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onRefreshTelemetry} title="Refresh live telemetry">
              <RefreshCw size={14} /> <span>Refresh</span>
            </button>
          )}
          {onNavigateToHardwareSpecs && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleOpenHardware()}>
              <Cpu size={14} /> <span>Hardware</span>
              {hardwareHistory.length > 0 && <span className="vps-action-count">{hardwareHistory.length}</span>}
            </button>
          )}
          {canEditServer && (
            <button type="button" className="btn btn-primary btn-sm vps-add-node-button" onClick={onAddServer}>
              <Plus size={15} /> Add VPS node
            </button>
          )}
        </div>
      </header>

      <section className="vps-health-strip" aria-label="Fleet health summary">
        <div className="vps-health-title">
          <span className="vps-health-icon"><Server size={19} /></span>
          <div>
            <strong>Fleet health</strong>
            <span>{health.total} registered node{health.total === 1 ? '' : 's'}</span>
          </div>
        </div>

        <div className="vps-health-stats">
          <button type="button" className="vps-health-stat is-online" onClick={() => setStateFilter('ONLINE')}>
            <span className="vps-health-dot" />
            <strong>{health.online}</strong><span>Online</span>
          </button>
          <button type="button" className="vps-health-stat is-warning" onClick={() => setStateFilter('ATTENTION')}>
            <span className="vps-health-dot" />
            <strong>{health.warning}</strong><span>Needs attention</span>
          </button>
          <button type="button" className="vps-health-stat is-offline" onClick={() => setStateFilter('OFFLINE')}>
            <span className="vps-health-dot" />
            <strong>{health.offline}</strong><span>Offline</span>
          </button>
        </div>

        <div className="vps-health-distribution" title={`${health.online} online, ${health.warning} needing attention, ${health.offline} offline`}>
          <span className="vps-distribution-online" style={{ width: `${health.total ? (health.online / health.total) * 100 : 0}%` }} />
          <span className="vps-distribution-warning" style={{ width: `${health.total ? (health.warning / health.total) * 100 : 0}%` }} />
          <span className="vps-distribution-offline" style={{ width: `${health.total ? (health.offline / health.total) * 100 : 0}%` }} />
        </div>
      </section>

      {isSuperAdmin && <AgentKeyRolloutPanel servers={servers} />}

      <div className="vps-fleet-layout">
        <section className="vps-fleet-main" aria-labelledby="fleet-table-title">
          <div className="vps-fleet-toolbar">
            <div className="vps-search-field">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, IP, type or hardware…"
                aria-label="Search VPS fleet"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><X size={14} /></button>
              )}
            </div>

            <div className="vps-filter-controls">
              <SlidersHorizontal size={15} aria-hidden="true" />
              <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)} aria-label="Filter nodes by status">
                <option value="ALL">All states</option>
                <option value="ONLINE">Online</option>
                <option value="ATTENTION">Needs attention</option>
                <option value="OFFLINE">Offline</option>
              </select>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter nodes by server type">
                <option value="ALL">All types</option>
                <option value="SHARED">Shared VPS</option>
                <option value="DEDICATED">Dedicated server</option>
              </select>
              {hasFilters && (
                <button type="button" className="vps-clear-filters" onClick={clearFilters}>Clear</button>
              )}
            </div>
          </div>

          <div className="vps-table-heading">
            <div>
              <h2 id="fleet-table-title">Nodes</h2>
              <p>{filteredNodes.length} of {health.total} node{health.total === 1 ? '' : 's'} shown</p>
            </div>
            <span className="vps-table-live"><Radio size={13} /> Live telemetry</span>
          </div>

          <div className="vps-table-scroll">
            <table className="vps-fleet-table">
              <thead>
                <tr>
                  <th scope="col">VPS node</th>
                  <th scope="col">State</th>
                  <th scope="col">Capacity</th>
                  <th scope="col">CPU</th>
                  <th scope="col">RAM</th>
                  <th scope="col">Storage</th>
                  <th scope="col">Last heartbeat</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredNodes.map((node) => {
                  const { server, telemetry, isOnline, serverUsers, capacity, capacityPercent, cpuPercent, ramPercent, disk, warningReasons, finalSpecs } = node;
                  const isExpanded = expandedServerId === server.id;
                  const { driveMap, emptyDrives, occupiedDrives } = getDriveStatusForServer(server);

                  return (
                    <React.Fragment key={server.id}>
                      <tr className={!isOnline ? 'is-offline' : (warningReasons.length ? 'is-warning' : '')}>
                        <td>
                          <div className="vps-node-identity">
                            <span className="vps-node-icon"><Server size={16} /></span>
                            <div>
                              <strong>{server.name}</strong>
                              <span>{server.ipPort || 'Endpoint not configured'} · {server.serverType === 'Dedicated Server' ? 'Dedicated' : 'Shared VPS'}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`vps-state-chip ${isOnline ? 'is-online' : 'is-offline'}`}>
                            <span />{isOnline ? 'Online' : 'Offline'}
                          </span>
                        </td>
                        <td><MetricBar label="Client capacity" value={capacityPercent} warningAt={70} dangerAt={90} detail={`${serverUsers.length}/${capacity}`} /></td>
                        <td><MetricBar label="CPU load" value={cpuPercent} warningAt={70} dangerAt={85} /></td>
                        <td><MetricBar label="RAM usage" value={ramPercent} warningAt={75} dangerAt={85} /></td>
                        <td><MetricBar label="Storage usage" value={disk.percent} warningAt={75} dangerAt={90} detail={disk.freeGB !== null ? `${Math.max(0, disk.freeGB).toFixed(0)} GB free` : null} /></td>
                        <td>
                          <span className={`vps-heartbeat ${isOnline ? 'is-live' : ''}`}>
                            <i />{getRelativeHeartbeat(telemetry?.lastPingTimestamp)}
                          </span>
                        </td>
                        <td>
                          <div className="vps-row-actions">
                            <button
                              type="button"
                              className="vps-console-button"
                              onClick={() => handleServerSuperLogin(server)}
                              disabled={!isSuperAdmin}
                              title={isSuperAdmin ? `Open the Superclient console for ${server.name}` : 'Super Admin only'}
                            >
                              <Shield size={14} /><span>Console</span>
                            </button>
                            <ActionsDropdown
                              ariaLabel={`More actions for ${server.name}`}
                              items={[
                                {
                                  label: 'Live performance',
                                  icon: <Activity size={13} color="var(--accent-sky)" />,
                                  onClick: () => setSelectedPerformanceServer(server)
                                },
                                onNavigateToReports && {
                                  label: 'Performance graphs',
                                  icon: <BarChart3 size={13} color="var(--accent-purple)" />,
                                  onClick: () => onNavigateToReports(server.id)
                                },
                                onNavigateToServerUsers && {
                                  label: 'Server OS users',
                                  icon: <UserCog size={13} color="var(--accent-indigo)" />,
                                  onClick: () => onNavigateToServerUsers(server.id)
                                },
                                onNavigateToHardwareSpecs && {
                                  label: 'Hardware details',
                                  icon: <Cpu size={13} color="var(--accent-sky)" />,
                                  onClick: () => handleOpenHardware(server.id)
                                },
                                onNavigateToAssignment && {
                                  label: 'Drive assignments',
                                  icon: <HardDrive size={13} color="var(--accent-emerald)" />,
                                  onClick: onNavigateToAssignment
                                },
                                {
                                  label: isOnline ? 'Agent command' : 'Set up agent',
                                  icon: <Terminal size={13} color={isOnline ? 'var(--accent-emerald)' : 'var(--accent-amber)'} />,
                                  onClick: () => setAgentInstallModalServer(server)
                                },
                                {
                                  label: isExpanded ? 'Hide drive map' : 'View drive map',
                                  icon: <HardDrive size={13} color="var(--text-secondary)" />,
                                  onClick: () => setExpandedServerId(isExpanded ? null : server.id)
                                },
                                canEditServer && { divider: true },
                                canEditServer && {
                                  label: 'Edit VPS node',
                                  icon: <Edit2 size={13} color="var(--accent-sky)" />,
                                  onClick: () => onEditServer(server)
                                },
                                canEditServer && {
                                  label: 'Delete VPS node',
                                  icon: <Trash2 size={13} color="var(--accent-rose)" />,
                                  onClick: () => onDeleteServer(server.id),
                                  danger: true
                                }
                              ].filter(Boolean)}
                            />
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="vps-drive-map-row">
                          <td colSpan="8">
                            <div className="vps-drive-map">
                              <div className="vps-drive-map-summary">
                                <div>
                                  <strong>Drive assignments · {server.name}</strong>
                                  <span>{occupiedDrives.length} allocated · {emptyDrives.length} available</span>
                                </div>
                                <button type="button" onClick={() => setExpandedServerId(null)} aria-label={`Close drive map for ${server.name}`}><ChevronUp size={15} /></button>
                              </div>
                              {Object.keys(driveMap).length ? (
                                <div className="vps-drive-list">
                                  {Object.entries(driveMap).map(([driveName, driveUsers]) => {
                                    const isEmpty = driveUsers.length === 0;
                                    return (
                                      <div key={driveName} className={`vps-drive-item${isEmpty ? ' is-empty' : ''}`}>
                                        <strong>{driveName}</strong>
                                        <span>{isEmpty ? 'Available' : driveUsers[0].company}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="vps-drive-empty">No drives have been configured for this node yet.</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!filteredNodes.length && (
            <div className="vps-empty-state">
              <Server size={30} />
              <h3>{hasFilters ? 'No matching VPS nodes' : 'No VPS nodes yet'}</h3>
              <p>{hasFilters ? 'Try clearing a filter or searching for a different node.' : 'Register the first Windows VPS node to start monitoring your fleet.'}</p>
              {hasFilters ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>Clear filters</button>
              ) : canEditServer && (
                <button type="button" className="btn btn-primary btn-sm" onClick={onAddServer}><Plus size={14} /> Add first VPS node</button>
              )}
            </div>
          )}
        </section>

        <aside className="vps-attention-panel" aria-labelledby="attention-title">
          <div className="vps-attention-header">
            <div>
              <AlertTriangle size={17} />
              <h2 id="attention-title">Needs attention</h2>
            </div>
            <span>{attentionItems.length}</span>
          </div>

          {!attentionItems.length ? (
            <div className="vps-attention-empty">
              <CheckCircle2 size={22} />
              <strong>Fleet looks healthy</strong>
              <p>No offline nodes or high-usage signals right now.</p>
            </div>
          ) : (
            <div className="vps-attention-list">
              {attentionItems.slice(0, 5).map((node) => {
                const isOffline = !node.isOnline;
                const primaryReason = node.warningReasons[0];
                return (
                  <article key={node.server.id} className={`vps-attention-item${isOffline ? ' is-critical' : ''}`}>
                    <div className="vps-attention-item-title">
                      <span className={isOffline ? 'is-critical' : 'is-warning'} />
                      <strong>{node.server.name}</strong>
                    </div>
                    <p>{primaryReason}</p>
                    <small>{node.server.ipPort || 'No endpoint'} · {getRelativeHeartbeat(node.telemetry?.lastPingTimestamp)}</small>
                    <div className="vps-attention-item-actions">
                      <button type="button" onClick={() => setSelectedPerformanceServer(node.server)}>Inspect</button>
                      {!isOffline && node.disk.percent !== null && onNavigateToHardwareSpecs && (
                        <button type="button" onClick={() => handleOpenHardware(node.server.id)}>Hardware</button>
                      )}
                      {isOffline && onRefreshTelemetry && (
                        <button type="button" onClick={onRefreshTelemetry}>Refresh</button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      {selectedPerformanceServer && (
        <ServerPerformanceModal
          isOpen={Boolean(selectedPerformanceServer)}
          onClose={() => setSelectedPerformanceServer(null)}
          server={selectedPerformanceServer}
          telemetry={getTelemetryForServer(selectedPerformanceServer, telemetryData)}
          assignedUsers={users.filter((user) => user.serverId === selectedPerformanceServer.id)}
          onRefresh={onRefreshTelemetry}
          onDirectRemoteConnect={onDirectRemoteConnect}
        />
      )}

      {agentInstallModalServer && (
        <AgentInstallModal
          isOpen={Boolean(agentInstallModalServer)}
          onClose={() => setAgentInstallModalServer(null)}
          server={agentInstallModalServer}
          isOnline={fleetNodes.find((node) => node.server.id === agentInstallModalServer.id)?.isOnline || false}
        />
      )}
    </div>
  );
}

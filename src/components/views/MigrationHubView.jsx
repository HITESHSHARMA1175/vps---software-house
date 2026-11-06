import React, { useState, useEffect, useMemo } from 'react';
import {
  FolderSync,
  Server,
  HardDrive,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Search,
  Copy,
  Check,
  Clock,
  Lock,
  Zap,
  Sparkles,
  Layers,
  User,
  Filter,
  FileArchive,
  Trash2,
  RotateCcw,
  Undo2
} from 'lucide-react';
import MigrateClientModal from '../MigrateClientModal';

export default function MigrationHubView({
  users = [],
  servers = [],
  onRefreshUsers,
  onRefreshTelemetry
}) {
  const [migrations, setMigrations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClientForModal, setSelectedClientForModal] = useState(null);
  const [copiedHash, setCopiedHash] = useState(null);

  // Quick Migration Wizard Inline State
  const [quickClientId, setQuickClientId] = useState('');
  const [quickTargetServerId, setQuickTargetServerId] = useState('');
  const [quickTargetDrive, setQuickTargetDrive] = useState('');

  // Fetch recent migrations from backend
  const fetchMigrations = async () => {
    try {
      const res = await fetch('/api/migrations');
      const data = await res.json();
      if (data && data.success && Array.isArray(data.migrations)) {
        setMigrations(data.migrations);
      }
    } catch (e) {
      console.error('Error fetching migrations:', e);
    }
  };

  useEffect(() => {
    fetchMigrations();
    const interval = setInterval(fetchMigrations, 3000);
    return () => clearInterval(interval);
  }, []);

  // Quick Client selection
  const selectedClient = useMemo(() => {
    return users.find(u => u.id === quickClientId) || null;
  }, [users, quickClientId]);

  // Target servers excluding current client's server
  const eligibleTargetServers = useMemo(() => {
    if (!selectedClient) return servers;
    return servers.filter(s => s.id !== selectedClient.serverId && s.ipPort !== selectedClient.serverId);
  }, [servers, selectedClient]);

  // When quick client changes, pick first eligible server and drive
  useEffect(() => {
    if (selectedClient && eligibleTargetServers.length > 0) {
      const defaultSrv = eligibleTargetServers[0];
      setQuickTargetServerId(defaultSrv.id);
      const drives = Array.isArray(defaultSrv.availableDrives) && defaultSrv.availableDrives.length > 0
        ? defaultSrv.availableDrives
        : ['Drive E'];
      const nonC = drives.find(d => !d.toUpperCase().includes('C')) || drives[0];
      setQuickTargetDrive(nonC);
    }
  }, [selectedClient, eligibleTargetServers]);

  // Target server drives
  const targetServerObj = servers.find(s => s.id === quickTargetServerId) || null;
  const targetDrivesList = Array.isArray(targetServerObj?.availableDrives) && targetServerObj.availableDrives.length > 0
    ? targetServerObj.availableDrives
    : ['Drive E', 'Drive F', 'Drive G'];

  const handleCopyHash = (hash, id) => {
    if (!hash) return;
    navigator.clipboard.writeText(hash);
    setCopiedHash(id);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const [actionLoading, setActionLoading] = useState(false);

  // Delete single migration record from history ledger
  const handleDeleteMigration = async (migId) => {
    if (!window.confirm(`Delete migration record '${migId}' from ledger?`)) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/migrations/${encodeURIComponent(migId)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchMigrations();
      } else {
        alert(data.error || 'Failed to delete migration record.');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Clear all completed / failed migration logs
  const handleClearFinished = async () => {
    if (!window.confirm('Clear all finished and failed migration records from history?')) return;
    try {
      setActionLoading(true);
      const res = await fetch('/api/migrations', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchMigrations();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Rollback migration: Restore client back to source VPS and clean target VPS
  const handleRollback = async (m) => {
    const sSrv = servers.find(s => s.id === m.sourceServerId);
    const tSrv = servers.find(s => s.id === m.targetServerId);
    const confirmMsg = `Are you sure you want to rollback migration for '${m.company || m.username}'?\n\n` +
      `• Restores client back to Source VPS: ${sSrv ? sSrv.name : m.sourceServerId} (${m.sourceDrive})\n` +
      `• Cleans up test account & data from Target VPS: ${tSrv ? tSrv.name : m.targetServerId}\n` +
      `• Ready for fresh migration testing`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setActionLoading(true);
      const res = await fetch(`/api/migrations/${encodeURIComponent(m.id)}/rollback`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Client successfully restored to Source VPS.');
        fetchMigrations();
        if (onRefreshUsers) onRefreshUsers();
        if (onRefreshTelemetry) onRefreshTelemetry();
      } else {
        alert(data.error || 'Failed to rollback migration.');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Check if selected client in Quick Launcher was previously migrated
  const recentMigrationForSelectedClient = useMemo(() => {
    if (!selectedClient) return null;
    return migrations.find(m => (m.clientId === selectedClient.id || m.username === selectedClient.username) && m.status === 'COMPLETED');
  }, [selectedClient, migrations]);

  const completedCount = migrations.filter(m => m.status === 'COMPLETED').length;
  const activeCount = migrations.filter(m => m.status !== 'COMPLETED' && m.status !== 'FAILED').length;

  const filteredMigrations = useMemo(() => {
    if (!searchQuery.trim()) return migrations;
    const q = searchQuery.toLowerCase();
    return migrations.filter(m =>
      (m.company && m.company.toLowerCase().includes(q)) ||
      (m.username && m.username.toLowerCase().includes(q)) ||
      (m.id && m.id.toLowerCase().includes(q)) ||
      (m.sourceServerId && m.sourceServerId.toLowerCase().includes(q)) ||
      (m.targetServerId && m.targetServerId.toLowerCase().includes(q))
    );
  }, [migrations, searchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Header Overview */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FolderSync size={24} color="#38bdf8" />
            User Migration Hub &amp; Server Balancer
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: 0, marginTop: '4px' }}>
            1-Click zero-downtime client transfer across VPS fleet with native .NET compression, SHA-256 verification, and Zero-Trust NTFS isolation.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => {
              if (users.length > 0) setSelectedClientForModal(users[0]);
            }}
            className="btn btn-primary btn-sm"
            style={{
              fontSize: '11.5px',
              gap: '6px',
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)'
            }}
          >
            <Zap size={14} />
            Start Client Migration
          </button>

          <button
            onClick={() => {
              fetchMigrations();
              if (onRefreshUsers) onRefreshUsers();
              if (onRefreshTelemetry) onRefreshTelemetry();
            }}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '11.5px', gap: '6px' }}
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {/* 2. Key Metrics Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div className="surface-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FolderSync size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Completed Migrations</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>
              {completedCount} <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Successful</span>
            </div>
          </div>
        </div>

        <div className="surface-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: activeCount > 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.12)', color: activeCount > 0 ? '#f59e0b' : '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {activeCount > 0 ? <RefreshCw size={22} className="spin" /> : <CheckCircle2 size={22} />}
          </div>
          <div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>In-Transit Queue</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>
              {activeCount} <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Active</span>
            </div>
          </div>
        </div>

        <div className="surface-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(168, 85, 247, 0.12)', color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Server size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>VPS Fleet Nodes</div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>
              {servers.length} <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-muted)' }}>Servers</span>
            </div>
          </div>
        </div>

        <div className="surface-card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Data Safety Engine</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#34d399', marginTop: '2px' }}>
              100% Zero-Loss
            </div>
          </div>
        </div>
      </div>

      {/* 3. Fast Migration Trigger Card */}
      <div className="surface-card" style={{ padding: '18px', borderRadius: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Sparkles size={16} color="#38bdf8" />
          <span style={{ fontSize: '13.5px', fontWeight: '700', color: '#ffffff' }}>Quick Migration Launcher</span>
          <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>— Select any client to immediately configure server shift</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', alignItems: 'flex-end' }}>
          <div>
            <label className="form-label" style={{ fontSize: '11.5px', marginBottom: '4px' }}>Select Client to Shift</label>
            <select
              className="form-input"
              value={quickClientId}
              onChange={e => setQuickClientId(e.target.value)}
              style={{ fontSize: '12.5px', height: '36px' }}
            >
              <option value="">-- Choose Client Subscription ({users.length}) --</option>
              {users.map(u => {
                const s = servers.find(srv => srv.id === u.serverId);
                return (
                  <option key={u.id} value={u.id}>
                    {u.company} ({u.username}) [On: {s ? s.name : u.serverId} - {u.drive}]
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '11.5px', marginBottom: '4px' }}>Destination VPS Node</label>
            <select
              className="form-input"
              value={quickTargetServerId}
              onChange={e => {
                setQuickTargetServerId(e.target.value);
                const s = servers.find(srv => srv.id === e.target.value);
                if (s && Array.isArray(s.availableDrives) && s.availableDrives.length > 0) {
                  const nonC = s.availableDrives.find(d => !d.toUpperCase().includes('C')) || s.availableDrives[0];
                  setQuickTargetDrive(nonC);
                }
              }}
              disabled={!selectedClient}
              style={{ fontSize: '12.5px', height: '36px' }}
            >
              {eligibleTargetServers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.serverType || 'VPS'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '11.5px', marginBottom: '4px' }}>Destination Drive Letter</label>
            <select
              className="form-input"
              value={quickTargetDrive}
              onChange={e => setQuickTargetDrive(e.target.value)}
              disabled={!selectedClient}
              style={{ fontSize: '12.5px', height: '36px' }}
            >
              {targetDrivesList.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div>
            <button
              onClick={() => {
                if (selectedClient) setSelectedClientForModal(selectedClient);
              }}
              disabled={!selectedClient}
              className="btn btn-primary"
              style={{ height: '36px', width: '100%', fontSize: '12.5px', gap: '6px' }}
            >
              <FolderSync size={14} /> Launch Migration Wizard
            </button>
          </div>
        </div>

        {recentMigrationForSelectedClient && (
          <div style={{
            marginTop: '14px',
            padding: '10px 14px',
            borderRadius: '6px',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b', fontSize: '12px' }}>
              <RotateCcw size={15} />
              <span>
                <strong>{selectedClient.company}</strong> is currently migrated on <strong>{selectedClient.drive}</strong> ({servers.find(s => s.id === selectedClient.serverId)?.name || selectedClient.serverId}).
                Want to restore back to original Source VPS for re-testing?
              </span>
            </div>
            <button
              onClick={() => handleRollback(recentMigrationForSelectedClient)}
              disabled={actionLoading}
              className="btn btn-sm"
              style={{
                background: '#f59e0b',
                color: '#000000',
                fontWeight: '700',
                padding: '4px 12px',
                fontSize: '11px',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <RotateCcw size={12} /> Restore / Revert to Source VPS
            </button>
          </div>
        )}
      </div>

      {/* 4. Migration History & Active Ledger */}
      <div className="surface-card" style={{ padding: '18px', borderRadius: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              Migration Activity Log &amp; Checksum Audit Trail
            </h3>
            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: 0, marginTop: '2px' }}>
              Cryptographically verified record of all cross-server data movements
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {migrations.some(m => m.status === 'COMPLETED' || m.status === 'FAILED' || m.status === 'ROLLED_BACK') && (
              <button
                onClick={handleClearFinished}
                disabled={actionLoading}
                className="btn btn-sm"
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#f87171',
                  fontSize: '11px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
                title="Clear all completed and failed migration logs"
              >
                <Trash2 size={12} /> Clear History
              </button>
            )}

            <div style={{ position: 'relative', width: '200px' }}>
              <Search size={13} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search migration log..."
                className="input"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ height: '30px', paddingLeft: '28px', fontSize: '11.5px' }}
              />
            </div>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Migration ID</th>
                <th>Client &amp; Company</th>
                <th>Route (Source ➔ Target)</th>
                <th>Status</th>
                <th>Progress / Message</th>
                <th>SHA-256 Checksum</th>
                <th>Time</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMigrations.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    No migration records recorded yet. Use the launcher above to migrate a client.
                  </td>
                </tr>
              ) : (
                filteredMigrations.map(m => {
                  const sSrv = servers.find(s => s.id === m.sourceServerId);
                  const tSrv = servers.find(s => s.id === m.targetServerId);
                  const isCompleted = m.status === 'COMPLETED';
                  const isFailed = m.status === 'FAILED';
                  const isRolledBack = m.status === 'ROLLED_BACK';
                  const isRunning = !isCompleted && !isFailed && !isRolledBack;

                  return (
                    <tr key={m.id}>
                      <td className="font-mono" style={{ fontSize: '11px', color: '#38bdf8' }}>
                        {m.id}
                      </td>
                      <td>
                        <div style={{ fontWeight: '600', color: '#ffffff' }}>{m.company || m.username}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>User: <code>{m.username}</code></div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px' }}>
                          <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                            {sSrv ? sSrv.name : m.sourceServerId} ({m.sourceDrive})
                          </span>
                          <ArrowRight size={12} color="#38bdf8" />
                          <span className="badge badge-purple" style={{ fontSize: '10px' }}>
                            {tSrv ? tSrv.name : m.targetServerId} ({m.targetDrive})
                          </span>
                        </div>
                      </td>
                      <td>
                        {isCompleted && <span className="badge badge-emerald">COMPLETED</span>}
                        {isRolledBack && <span className="badge badge-neutral">ROLLED BACK</span>}
                        {isFailed && <span className="badge badge-rose">FAILED</span>}
                        {isRunning && (
                          <span className="badge badge-amber" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <RefreshCw size={10} className="spin" /> STEP {m.step || 1}/6
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: '11px', color: isFailed ? '#f87171' : isRolledBack ? '#94a3b8' : 'var(--text-secondary)', maxWidth: '300px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span>{m.stepMessage || 'Processing migration...'}</span>
                          {isRunning && m.chunksTotal > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                              <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{
                                  width: `${Math.round(((m.chunksReceived || 0) / m.chunksTotal) * 100)}%`,
                                  height: '100%',
                                  background: 'linear-gradient(90deg, #38bdf8, #818cf8)',
                                  borderRadius: '2px',
                                  transition: 'width 0.4s ease'
                                }} />
                              </div>
                              {m.transferSpeedMBps > 0 && (
                                <span style={{ fontSize: '10px', color: '#34d399', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                  {m.transferSpeedMBps} MB/s
                                </span>
                              )}
                            </div>
                          )}
                          {m.fileSizeBytes > 0 && (
                            <span style={{ fontSize: '10px', color: '#64748b' }}>
                              Archive: {(m.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="font-mono" style={{ fontSize: '10.5px' }}>
                        {m.sha256 ? (
                          <button
                            onClick={() => handleCopyHash(m.sha256, m.id)}
                            style={{
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: '4px',
                              padding: '2px 6px',
                              color: '#38bdf8',
                              fontSize: '10px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            title="Click to copy full SHA-256 hash"
                          >
                            {copiedHash === m.id ? <Check size={10} color="#34d399" /> : <Copy size={10} />}
                            {m.sha256.slice(0, 10)}...{m.sha256.slice(-6)}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Calculating...</span>
                        )}
                      </td>
                      <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          {isCompleted && (
                            <button
                              onClick={() => handleRollback(m)}
                              disabled={actionLoading}
                              className="btn btn-sm"
                              style={{
                                background: 'rgba(245, 158, 11, 0.12)',
                                border: '1px solid rgba(245, 158, 11, 0.3)',
                                color: '#f59e0b',
                                padding: '3px 8px',
                                fontSize: '10.5px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                              title="Rollback / Revert client back to Source VPS and clean Target VPS"
                            >
                              <RotateCcw size={11} /> Rollback
                            </button>
                          )}

                          <button
                            onClick={() => handleDeleteMigration(m.id)}
                            disabled={actionLoading}
                            className="btn btn-sm"
                            style={{
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.25)',
                              color: '#f87171',
                              padding: '3px 6px',
                              fontSize: '11px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                            title="Delete migration record"
                          >
                            <Trash2 size={12} />
                          </button>
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

      {/* Migration Modal Trigger */}
      {selectedClientForModal && (
        <MigrateClientModal
          isOpen={!!selectedClientForModal}
          client={selectedClientForModal}
          servers={servers}
          onClose={() => setSelectedClientForModal(null)}
          onMigrationSuccess={() => {
            setSelectedClientForModal(null);
            fetchMigrations();
            if (onRefreshUsers) onRefreshUsers();
            if (onRefreshTelemetry) onRefreshTelemetry();
          }}
        />
      )}
    </div>
  );
}

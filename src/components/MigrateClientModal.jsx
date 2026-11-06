import React, { useState, useEffect } from 'react';
import {
  X,
  ArrowRight,
  Server,
  HardDrive,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  FolderSync,
  Lock,
  FileArchive,
  Database,
  Radio,
  Sparkles
} from 'lucide-react';

export default function MigrateClientModal({
  isOpen,
  onClose,
  client,
  servers = [],
  onMigrationSuccess
}) {
  const [targetServerId, setTargetServerId] = useState('');
  const [targetDrive, setTargetDrive] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeMigration, setActiveMigration] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Eligible target servers (prefer other servers, but also allow drive re-assignment on current server)
  const otherServers = servers.filter(s => s.id !== client?.serverId && s.ipPort !== client?.serverId);
  const eligibleServers = otherServers.length > 0 ? otherServers : servers;

  useEffect(() => {
    if (!isOpen || !client) {
      setActiveMigration(null);
      setErrorMsg('');
      setIsSubmitting(false);
      return;
    }

    if (eligibleServers.length > 0) {
      const defaultSrv = eligibleServers[0];
      setTargetServerId(defaultSrv.id);
      const drives = Array.isArray(defaultSrv.availableDrives) && defaultSrv.availableDrives.length > 0
        ? defaultSrv.availableDrives
        : ['Drive E'];
      const nonCDrive = drives.find(d => !d.toUpperCase().includes('C') && d !== client.drive) || drives[0];
      setTargetDrive(nonCDrive);
    }
  }, [isOpen, client]);

  // When target server changes, auto-pick first available non-C drive
  const handleServerChange = (sid) => {
    setTargetServerId(sid);
    const targetSrv = eligibleServers.find(s => s.id === sid);
    if (targetSrv) {
      const drives = Array.isArray(targetSrv.availableDrives) && targetSrv.availableDrives.length > 0
        ? targetSrv.availableDrives
        : ['Drive E'];
      const nonCDrive = drives.find(d => !d.toUpperCase().includes('C')) || drives[0];
      setTargetDrive(nonCDrive);
    }
  };

  // Poll migration progress if active
  useEffect(() => {
    if (!activeMigration || activeMigration.status === 'COMPLETED' || activeMigration.status === 'FAILED') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/migrations/${activeMigration.id}/status`);
        const data = await res.json();
        if (data && data.success && data.migration) {
          setActiveMigration(data.migration);
          if (data.migration.status === 'COMPLETED') {
            clearInterval(interval);
            if (onMigrationSuccess) onMigrationSuccess(data.migration);
          } else if (data.migration.status === 'FAILED') {
            clearInterval(interval);
            setErrorMsg(data.migration.stepMessage || 'Migration failed on remote VPS.');
          }
        }
      } catch (e) {
        console.error('Error polling migration status:', e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeMigration]);

  if (!isOpen || !client) return null;

  const currentServer = servers.find(s => s.id === client.serverId || s.ipPort === client.serverId) || { name: 'Source VPS', id: client.serverId };
  const targetServer = eligibleServers.find(s => s.id === targetServerId) || null;
  const targetServerDrives = Array.isArray(targetServer?.availableDrives) && targetServer.availableDrives.length > 0
    ? targetServer.availableDrives
    : ['Drive E', 'Drive F', 'Drive G'];

  const handleStartMigration = async (e) => {
    e.preventDefault();
    if (!targetServerId || !targetDrive) return;

    setErrorMsg('');
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/clients/${client.id}/migrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetServerId,
          targetDrive,
          force: true
        })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to start client migration.');
      }

      setActiveMigration({
        id: data.migrationId,
        status: 'INITIATING',
        step: 1,
        totalSteps: 6,
        stepMessage: 'Job queued. Contacting source VPS agent to terminate session & archive data...'
      });
    } catch (err) {
      setErrorMsg(err.message);
      setIsSubmitting(false);
    }
  };

  const stepsList = [
    { num: 1, title: 'Session Flush & Account Lock', desc: 'Terminate active session on source VPS to release Tally file locks' },
    { num: 2, title: 'High-Speed Native ZIP', desc: 'Compress client directory into archive with SHA-256 calculation' },
    { num: 3, title: 'Chunked Stream Relay', desc: '8MB chunk transfer to portal relay with checksum verification per chunk' },
    { num: 4, title: 'Target Extraction', desc: 'Download and extract archive to target server drive' },
    { num: 5, title: 'User & Zero-Trust NTFS', desc: 'Recreate Windows user, isolate root, and configure TSplus' },
    { num: 6, title: 'Verification & Live', desc: 'Update portal record; source folder safely archived as backup' }
  ];

  return (
    <div className="modal-overlay" onClick={activeMigration?.status === 'COMPLETED' || !activeMigration ? onClose : undefined}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderSync size={20} color="#38bdf8" />
            <span>1-Click Client Server Migration</span>
          </div>
          {(!activeMigration || activeMigration.status === 'COMPLETED' || activeMigration.status === 'FAILED') && (
            <button className="modal-close" onClick={onClose}><X size={18} /></button>
          )}
        </div>

        {errorMsg && (
          <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid #ef4444', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', color: '#f87171', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {!activeMigration ? (
          <form onSubmit={handleStartMigration}>
            {/* Source & Client Info Card */}
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Client to Migrate
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: '700', color: '#ffffff' }}>{client.company}</div>
                  <div style={{ fontSize: '0.82rem', color: '#38bdf8', marginTop: '2px' }}>Username: <code>{client.username}</code></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Current Location:</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#cbd5e1' }}>
                    {currentServer.name} ({client.drive})
                  </div>
                </div>
              </div>
            </div>

            {/* Migration Target Selector */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
              <div>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Server size={14} color="#34d399" /> Target VPS Node *
                </label>
                <select
                  className="form-input"
                  value={targetServerId}
                  onChange={e => handleServerChange(e.target.value)}
                  required
                >
                  {eligibleServers.length === 0 ? (
                    <option value="">No other VPS servers available</option>
                  ) : (
                    eligibleServers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.serverType || 'VPS'})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <HardDrive size={14} color="#f59e0b" /> Target Drive *
                </label>
                <select
                  className="form-input"
                  value={targetDrive}
                  onChange={e => setTargetDrive(e.target.value)}
                  required
                >
                  {targetServerDrives.map(d => (
                    <option key={d} value={d}>
                      {d} {d.toUpperCase().includes('C') ? '(OS Drive)' : '(Data Volume)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Zero-Data-Loss Safety Guarantees */}
            <div style={{ background: 'rgba(56, 189, 248, 0.06)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '8px', padding: '12px 14px', marginBottom: '20px' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#38bdf8', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={15} /> 100% Zero-Data-Loss Guarantees:
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.5' }}>
                <li>Source folder is <strong>never deleted</strong>; it is renamed to <code>_MIGRATED_BACKUP_&lt;Date&gt;</code> for emergency rollback.</li>
                <li>Archive integrity is cryptographically validated using <strong>SHA-256 Checksum</strong> before extraction.</li>
                <li><strong>Zero-Trust NTFS Isolation</strong> is automatically applied on the target drive for this user.</li>
              </ul>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting || eligibleServers.length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {isSubmitting ? <RefreshCw size={14} className="spin" /> : <FolderSync size={14} />}
                <span>Start Migration</span>
              </button>
            </div>
          </form>
        ) : (
          /* Live Migration Progress Tracker */
          <div>
            <div style={{ marginBottom: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#ffffff' }}>
                {activeMigration.status === 'COMPLETED' ? '🎉 Migration Successfully Completed!' : 'Migrating Client in Background...'}
              </div>
              <div style={{ fontSize: '0.82rem', color: activeMigration.status === 'FAILED' ? '#f87171' : '#38bdf8', marginTop: '4px' }}>
                {activeMigration.stepMessage}
              </div>
            </div>

            {/* Stepper Card */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {stepsList.map(step => {
                const currentStepNum = activeMigration.step || 1;
                const isCompleted = activeMigration.status === 'COMPLETED' || step.num < currentStepNum;
                const isCurrent = step.num === currentStepNum && activeMigration.status !== 'COMPLETED' && activeMigration.status !== 'FAILED';
                const isFailed = step.num === currentStepNum && activeMigration.status === 'FAILED';

                return (
                  <div
                    key={step.num}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: isCurrent ? 'rgba(56, 189, 248, 0.1)' : (isCompleted ? 'rgba(52, 211, 153, 0.06)' : 'rgba(15, 23, 42, 0.4)'),
                      border: `1px solid ${isCurrent ? '#38bdf8' : (isCompleted ? '#10b981' : (isFailed ? '#ef4444' : 'rgba(255, 255, 255, 0.05)'))}`
                    }}
                  >
                    <div
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.78rem',
                        fontWeight: '700',
                        background: isCompleted ? '#10b981' : (isCurrent ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)'),
                        color: '#ffffff'
                      }}
                    >
                      {isCompleted ? <CheckCircle2 size={16} /> : (isCurrent ? <RefreshCw size={13} className="spin" /> : step.num)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: '600', color: isCurrent ? '#ffffff' : (isCompleted ? '#cbd5e1' : '#64748b') }}>
                        {step.title}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                        {step.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {activeMigration.status === 'COMPLETED' && (
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '0.82rem', color: '#34d399' }}>
                ✅ Client <strong>{client.company}</strong> is now live on <strong>{targetServer?.name || 'Target VPS'}</strong> ({targetDrive}). Credentials and Tally Data have been seamlessly switched over.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onClose}
                disabled={activeMigration.status !== 'COMPLETED' && activeMigration.status !== 'FAILED'}
              >
                {activeMigration.status === 'COMPLETED' ? 'Done' : (activeMigration.status === 'FAILED' ? 'Close' : 'Running in Background...')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

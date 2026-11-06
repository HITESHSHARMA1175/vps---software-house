import React from 'react';
import { X, UserPlus, HardDrive, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';

export default function QuickOnboardModal({
  isOpen,
  onClose,
  servers,
  users,
  onSelectDriveForNewUser
}) {
  if (!isOpen) return null;

  // Calculate empty drives per server
  const serverDriveAnalysis = servers.map(server => {
    const serverUsers = users.filter(u => u.serverId === server.id);
    const availableDrives = server.availableDrives || [];

    const driveUsageMap = {};
    availableDrives.forEach(d => { driveUsageMap[d] = 0; });
    serverUsers.forEach(u => {
      if (u.drive && driveUsageMap[u.drive] !== undefined) {
        driveUsageMap[u.drive] += 1;
      }
    });

    const emptyDrives = availableDrives.filter(d => driveUsageMap[d] === 0);
    const occupiedDrives = availableDrives.filter(d => driveUsageMap[d] > 0);

    return {
      server,
      emptyDrives,
      occupiedDrives,
      driveUsageMap,
      userCount: serverUsers.length
    };
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '850px' }}>
        <div className="modal-header">
          <div className="modal-title" style={{ color: '#34d399' }}>
            <Sparkles size={22} />
            Quick Client Onboarding & Empty Drive Finder
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
          Select an available <strong>Empty Drive</strong> on any VPS Server below to immediately open the Client Onboarding Form pre-assigned to that drive.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '500px', overflowY: 'auto' }}>
          {serverDriveAnalysis.map(({ server, emptyDrives, occupiedDrives, driveUsageMap, userCount }) => {
            const isDedicated = server.serverType === "Dedicated Server";

            return (
              <div
                key={server.id}
                className="glass-card"
                style={{
                  padding: '1.25rem',
                  border: emptyDrives.length > 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border-color)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div>
                    <strong style={{ fontSize: '1rem', color: '#f8fafc' }}>{server.name}</strong>
                    <span className="badge" style={{
                      marginLeft: '8px',
                      background: isDedicated ? 'rgba(236, 72, 153, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                      color: isDedicated ? '#f472b6' : '#a5b4fc',
                      fontSize: '0.7rem'
                    }}>
                      {isDedicated ? '🚀 Dedicated' : '🌐 Shared VPS'}
                    </span>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      IP: {server.ipPort} | Capacity: {userCount} / {server.totalUsersLimit} Users
                    </div>
                  </div>

                  <div>
                    {emptyDrives.length > 0 ? (
                      <span className="badge badge-active">
                        🟢 {emptyDrives.length} Empty Drives Ready
                      </span>
                    ) : (
                      <span className="badge badge-expired">
                        🔴 Full (No Empty Drives)
                      </span>
                    )}
                  </div>
                </div>

                {/* Available Empty Drives Row */}
                {emptyDrives.length > 0 ? (
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#a7f3d0', marginBottom: '6px' }}>
                      Click an empty drive to onboard client:
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {emptyDrives.map(driveName => (
                        <button
                          key={driveName}
                          className="btn btn-secondary"
                          style={{
                            background: 'rgba(16, 185, 129, 0.15)',
                            borderColor: 'rgba(16, 185, 129, 0.4)',
                            color: '#6ee7b7',
                            fontSize: '0.8rem',
                            padding: '0.4rem 0.8rem'
                          }}
                          onClick={() => {
                            onSelectDriveForNewUser(server.id, driveName);
                            onClose();
                          }}
                        >
                          <HardDrive size={14} /> Assign {driveName} [EMPTY] <ArrowRight size={12} />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                    All drives on this server are currently occupied.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import {
  Network,
  Server,
  HardDrive,
  UserPlus,
  Zap,
  Shield,
  Eye,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function AssignmentView({
  servers = [],
  users = [],
  onSelectDriveForNewUser,
  onViewUserProfile,
  onDirectRemoteConnect
}) {
  const [selectedServerId, setSelectedServerId] = useState(servers[0]?.id || 'ALL');

  const selectedServer = servers.find(s => s.id === selectedServerId) || servers[0];

  const getDriveStatusForServer = (server) => {
    if (!server) return { driveMap: {}, occupiedDrives: [], emptyDrives: [] };
    const serverUsers = users.filter(u => u.serverId === server.id);
    const availableDrives = server.availableDrives || [];

    const driveMap = {};
    availableDrives.forEach(d => {
      driveMap[d] = [];
    });

    serverUsers.forEach(u => {
      if (u.drive) {
        if (!driveMap[u.drive]) driveMap[u.drive] = [];
        driveMap[u.drive].push(u);
      }
    });

    const occupiedDrives = Object.keys(driveMap).filter(d => driveMap[d].length > 0);
    const emptyDrives = Object.keys(driveMap).filter(d => driveMap[d].length === 0);

    return { driveMap, occupiedDrives, emptyDrives };
  };

  const { driveMap, occupiedDrives, emptyDrives } = getDriveStatusForServer(selectedServer);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Header */}
      <div className="surface-card" style={{
        padding: '14px 18px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Network size={18} color="var(--accent-purple)" /> User–VPS Drive Assignment Matrix
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
            Visual storage drive mapping across server nodes. Click an empty drive to assign a new client instantly.
          </p>
        </div>

        {selectedServer && (
          <div style={{ display: 'flex', gap: '6px' }}>
            <span className="badge badge-emerald">
              🟢 {emptyDrives.length} Available Drives
            </span>
            <span className="badge badge-blue">
              📁 {occupiedDrives.length} Allocated Drives
            </span>
          </div>
        )}
      </div>

      {/* Server Node Selection Pills */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {servers.map(s => {
          const isSelected = selectedServer && selectedServer.id === s.id;
          const assignedCount = users.filter(u => u.serverId === s.id).length;

          return (
            <button
              key={s.id}
              onClick={() => setSelectedServerId(s.id)}
              className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Server size={14} />
              <span>{s.name}</span>
              <span style={{
                backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                padding: '1px 6px',
                borderRadius: '999px',
                fontSize: '10px'
              }}>
                {assignedCount} Users
              </span>
            </button>
          );
        })}
      </div>

      {/* Drive Capacity Grid */}
      {selectedServer ? (
        <div className="surface-card" style={{ padding: '16px' }}>
          <div style={{ marginBottom: '14px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              {selectedServer.name} Drive Allocations
            </h3>
            <div className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              IP: {selectedServer.ipPort}:443 • Specs: {selectedServer.specs}
            </div>
          </div>

          {Object.keys(driveMap).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
              <div style={{ maxWidth: '340px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <HardDrive size={36} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                <strong style={{ color: 'var(--text-primary)', fontSize: '14px' }}>No Storage Drives Configured</strong>
                <p style={{ fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                  This server node does not have any storage drives assigned in its settings. Edit the server configuration to specify available drive letters (e.g. D:, E:, F:).
                </p>
              </div>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '12px'
            }}>
              {Object.entries(driveMap).map(([driveName, driveUsers]) => {
                const isEmpty = driveUsers.length === 0;
                const assignedUser = driveUsers[0];

                return (
                  <div
                    key={driveName}
                    style={{
                      backgroundColor: isEmpty ? 'var(--accent-emerald-bg)' : 'var(--bg-surface-inset)',
                      border: isEmpty ? '1px dashed var(--accent-emerald-border)' : '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      minHeight: '130px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <HardDrive size={15} color={isEmpty ? 'var(--accent-emerald)' : 'var(--accent-sky)'} />
                          <strong className="font-mono" style={{ fontSize: '13px', color: isEmpty ? 'var(--accent-emerald)' : 'var(--text-primary)' }}>
                            {driveName}
                          </strong>
                        </div>
                        <span className={`badge ${isEmpty ? 'badge-emerald' : 'badge-blue'}`} style={{ fontSize: '9.5px' }}>
                          {isEmpty ? 'AVAILABLE' : 'ALLOCATED'}
                        </span>
                      </div>

                      {isEmpty ? (
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0' }}>
                          Storage slot unassigned and ready for client creation.
                        </p>
                      ) : (
                        <div style={{ margin: '4px 0' }}>
                          <div style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--text-primary)' }}>
                            {assignedUser.company}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            User: <strong className="font-mono" style={{ color: 'var(--text-secondary)' }}>{assignedUser.username}</strong>
                          </div>
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                      {isEmpty ? (
                        <button
                          onClick={() => onSelectDriveForNewUser(selectedServer.id, driveName)}
                          className="btn btn-success btn-xs"
                          style={{ width: '100%' }}
                        >
                          <UserPlus size={12} /> Assign Client to {driveName}
                        </button>
                      ) : (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={() => onViewUserProfile(assignedUser)}
                            className="btn btn-secondary btn-xs"
                            style={{ flex: 1 }}
                          >
                            <Eye size={11} /> Profile
                          </button>
                          <button
                            onClick={() => onDirectRemoteConnect(assignedUser, 'USER')}
                            className="btn btn-success btn-xs"
                            style={{ flex: 1 }}
                          >
                            <Zap size={11} /> Login
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="surface-card" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
          <div style={{ maxWidth: '340px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <Server size={36} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
            <strong style={{ color: 'var(--text-primary)', fontSize: '14px' }}>No VPS Nodes Configured</strong>
            <p style={{ fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
              Add a VPS node to start mapping drives and assigning client storage.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { Server, ShieldCheck, Cpu, HardDrive, Edit2, Trash2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Shield, Zap, ExternalLink, Database } from 'lucide-react';

export default function ServerTabList({
  servers,
  selectedServerId,
  onSelectServer,
  onEditServer,
  onDeleteServer,
  users,
  onDirectRemoteConnect
}) {
  const [showDriveInspector, setShowDriveInspector] = useState(false);

  const getUserCountForServer = (serverId) => {
    return users.filter(u => u.serverId === serverId).length;
  };

  // Calculate occupied vs empty drives for a server
  const getDriveStatusForServer = (server) => {
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

  const selectedServer = servers.find(s => s.id === selectedServerId);
  const selectedServerDriveStatus = selectedServer ? getDriveStatusForServer(selectedServer) : null;

  const handleServerSuperLogin = (e, server) => {
    e.stopPropagation();
    // Create dummy user wrapper to trigger Superclient Login for this server node
    const dummyUserForServer = {
      id: `srv-super-${server.id}`,
      serverId: server.id,
      company: server.name,
      username: server.superClientUser || 'Superclient',
      password: server.superClientPass || 'Pass#123',
      drive: 'Master Node',
      expiryDate: '2099-12-31'
    };

    if (onDirectRemoteConnect) {
      onDirectRemoteConnect(dummyUserForServer, 'SUPERCLIENT');
    }
  };

  return (
    <div className="server-tabs-section" style={{ marginBottom: '1.5rem' }}>
      <div className="tabs-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.85rem'
      }}>
        <h2 className="section-title" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '1rem',
          fontWeight: '700',
          color: '#ffffff',
          letterSpacing: '-0.01em'
        }}>
          <Server size={18} color="#38bdf8" />
          Infrastructure Server Nodes
        </h2>

        {selectedServerId !== 'ALL' && selectedServer && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-primary"
              style={{
                background: 'linear-gradient(135deg, #d97706, #b45309)',
                border: 'none',
                fontSize: '0.78rem',
                padding: '0.4rem 0.85rem',
                borderRadius: '8px',
                fontWeight: '700',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              onClick={(e) => handleServerSuperLogin(e, selectedServer)}
            >
              <Shield size={14} fill="#ffffff" /> Superclient Admin Login
            </button>
            <button
              className="btn btn-secondary"
              style={{
                fontSize: '0.78rem',
                padding: '0.4rem 0.85rem',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              onClick={() => setShowDriveInspector(!showDriveInspector)}
            >
              <HardDrive size={14} color="#38bdf8" />
              {showDriveInspector ? 'Hide Drive Inspector' : 'Inspect Drives'}
              {showDriveInspector ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        )}
      </div>

      {/* Server Tabs Row */}
      <div className="server-tabs" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '0.85rem'
      }}>
        {/* Unified Master View Tab */}
        <button
          className={`server-tab ${selectedServerId === 'ALL' ? 'active' : ''}`}
          onClick={() => onSelectServer('ALL')}
          style={{
            background: selectedServerId === 'ALL' ? 'rgba(37, 99, 235, 0.12)' : 'var(--bg-surface)',
            border: selectedServerId === 'ALL' ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '1rem',
            textAlign: 'left',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: selectedServerId === 'ALL' ? '0 0 20px rgba(59, 130, 246, 0.15)' : 'none'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontWeight: '800', fontSize: '0.95rem', color: '#ffffff' }}>⚡ All Server Nodes</span>
            <span className="badge badge-drive" style={{ fontSize: '0.7rem', fontWeight: '700' }}>
              {users.length} Clients
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: '#94a3b8', marginTop: '6px' }}>
            <span>Unified Console</span>
            <span style={{ color: '#38bdf8', fontWeight: '600' }}>{servers.length} Active Nodes</span>
          </div>
        </button>

        {servers.map(server => {
          const userCount = getUserCountForServer(server.id);
          const isSelected = selectedServerId === server.id;
          const isDedicated = server.serverType === "Dedicated Server";
          const { occupiedDrives, emptyDrives } = getDriveStatusForServer(server);

          return (
            <div
              key={server.id}
              className={`server-tab ${isSelected ? 'active' : ''}`}
              onClick={() => onSelectServer(server.id)}
              style={{
                position: 'relative',
                background: isSelected ? 'rgba(37, 99, 235, 0.12)' : 'var(--bg-surface)',
                border: isSelected ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                padding: '1rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: isSelected ? '0 0 20px rgba(59, 130, 246, 0.15)' : 'none'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontWeight: '800', fontSize: '0.92rem', color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {server.name}
                </span>
                <span className={`badge ${isDedicated ? 'badge-urgent' : 'badge-drive'}`} style={{ fontSize: '0.7rem', fontWeight: '700' }}>
                  {userCount} / {server.totalUsersLimit} Users
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0' }}>
                <span className="badge" style={{
                  backgroundColor: isDedicated ? 'rgba(244, 63, 94, 0.15)' : 'rgba(56, 189, 248, 0.12)',
                  color: isDedicated ? '#fda4af' : '#38bdf8',
                  border: isDedicated ? '1px solid rgba(244, 63, 94, 0.3)' : '1px solid rgba(56, 189, 248, 0.25)',
                  fontSize: '0.68rem',
                  fontWeight: '700'
                }}>
                  {isDedicated ? '🚀 Dedicated' : '🌐 Shared VPS'}
                </span>

                <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                  <button
                    className="action-btn"
                    title="👑 Direct Superclient Admin Login"
                    style={{
                      color: '#ffffff',
                      background: 'linear-gradient(135deg, #d97706, #b45309)',
                      border: 'none',
                      padding: '3px 7px',
                      borderRadius: '5px',
                      fontSize: '0.68rem',
                      fontWeight: '700',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}
                    onClick={(e) => handleServerSuperLogin(e, server)}
                  >
                    <Shield size={11} fill="#ffffff" /> Super Login
                  </button>

                  <button
                    className="action-btn"
                    title="Edit VPS Server"
                    style={{ padding: '3px 6px', borderRadius: '5px' }}
                    onClick={() => onEditServer(server)}
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    className="action-btn danger"
                    title="Delete VPS Server"
                    style={{ padding: '3px 6px', borderRadius: '5px' }}
                    onClick={() => onDeleteServer(server.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Drive Status & Specs */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', marginTop: '6px' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <span style={{ color: '#34d399', fontWeight: '700' }}>
                    🟢 {emptyDrives.length} Empty
                  </span>
                  <span style={{ color: 'var(--text-dim)' }}>|</span>
                  <span style={{ color: '#93c5fd', fontWeight: '600' }}>
                    {occupiedDrives.length} In Use
                  </span>
                </div>
                <div style={{ color: '#64748b', fontSize: '0.72rem', maxWidth: '110px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {server.specs}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Drive Inspector Grid Card for Selected Server */}
      {selectedServerId !== 'ALL' && selectedServer && showDriveInspector && selectedServerDriveStatus && (
        <div className="glass-card" style={{
          padding: '1.25rem',
          marginTop: '1rem',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <strong style={{ fontSize: '0.95rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <HardDrive size={16} color="#38bdf8" />
                Drive Map & Capacity: {selectedServer.name}
              </strong>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
                IP: {selectedServer.ipPort} • Specs: {selectedServer.specs}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <span className="badge badge-active" style={{ fontSize: '0.75rem' }}>
                🟢 {selectedServerDriveStatus.emptyDrives.length} Empty Available
              </span>
              <span className="badge badge-drive" style={{ fontSize: '0.75rem' }}>
                📁 {selectedServerDriveStatus.occupiedDrives.length} Assigned
              </span>
            </div>
          </div>

          {/* Drive Status Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
            {Object.entries(selectedServerDriveStatus.driveMap).map(([driveName, driveUsers]) => {
              const isEmpty = driveUsers.length === 0;

              return (
                <div
                  key={driveName}
                  style={{
                    backgroundColor: isEmpty ? 'rgba(16, 185, 129, 0.05)' : 'rgba(15, 23, 42, 0.6)',
                    border: isEmpty ? '1px dashed rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '10px',
                    padding: '0.85rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <strong style={{ color: isEmpty ? '#34d399' : '#ffffff', fontSize: '0.88rem' }}>
                      {driveName}
                    </strong>
                    <span className={`badge ${isEmpty ? 'badge-active' : 'badge-drive'}`} style={{ fontSize: '0.68rem' }}>
                      {isEmpty ? 'EMPTY' : `${driveUsers.length} Client(s)`}
                    </span>
                  </div>

                  {isEmpty ? (
                    <div style={{ fontSize: '0.75rem', color: '#a7f3d0' }}>
                      ✨ Ready for new user assignment
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      Assigned to:
                      <ul style={{ paddingLeft: '1rem', marginTop: '4px', color: '#cbd5e1' }}>
                        {driveUsers.map(u => (
                          <li key={u.id} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {u.company} ({u.username})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

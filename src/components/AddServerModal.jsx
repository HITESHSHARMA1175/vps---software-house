import React, { useState, useEffect } from 'react';
import {
  X,
  Server,
  HardDrive,
  Sparkles,
  Terminal,
  Copy,
  Check,
  ShieldCheck,
  Clock,
  Layers,
  Radio
} from 'lucide-react';

export function generateDriveRange(startChar = 'E', endChar = 'P', prefix = 'Drive ') {
  const startCode = (startChar || 'A').toUpperCase().charCodeAt(0);
  const endCode = (endChar || 'Z').toUpperCase().charCodeAt(0);

  if (startCode > endCode) return [];

  const drives = [];
  for (let i = startCode; i <= endCode; i++) {
    const letter = String.fromCharCode(i);
    const formattedPrefix = prefix ? (prefix.endsWith(' ') ? prefix : `${prefix} `) : '';
    drives.push(`${formattedPrefix}${letter}`.trim());
  }
  return drives;
}

export default function AddServerModal({ isOpen, onClose, onAddServer }) {
  const [createdServer, setCreatedServer] = useState(null);
  const [commandTab, setCommandTab] = useState('POWERSHELL');
  const [copied, setCopied] = useState(false);

  const [driveMode, setDriveMode] = useState('RANGE'); // 'RANGE' or 'CUSTOM'
  const [startLetter, setStartLetter] = useState('E');
  const [endLetter, setEndLetter] = useState('P');
  const [drivePrefix, setDrivePrefix] = useState('Drive ');

  useEffect(() => {
    if (!isOpen) {
      setCreatedServer(null);
      setCopied(false);
    } else {
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  const [formData, setFormData] = useState({
    name: '',
    serverType: 'Shared VPS',
    ipPort: '',
    httpUrl: '',
    httpsUrl: '',
    superClientUser: 'Superclient',
    superClientPass: '',
    totalUsersLimit: 30,
    specs: 'Auto-detecting via Agent...',
    portSerial: '443',
    drivesStr: 'Drive A, Drive B, Drive C'
  });

  if (!isOpen) return null;

  const generatedRangeDrives = generateDriveRange(startLetter, endLetter, drivePrefix);
  const alphabetList = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.ipPort) return;

    let availableDrives = [];
    if (driveMode === 'RANGE') {
      availableDrives = generatedRangeDrives;
    } else {
      availableDrives = formData.drivesStr
        .split(',')
        .map(d => d.trim())
        .filter(d => d.length > 0);
    }

    const rawIp = formData.ipPort.split(':')[0];

    const newServer = {
      id: `vps-${Date.now()}`,
      name: formData.name,
      serverType: formData.serverType,
      ipPort: formData.ipPort,
      httpUrl: `http://${rawIp}:8080`,
      httpsUrl: `https://${rawIp}:443`,
      superClientUser: formData.superClientUser,
      superClientPass: formData.superClientPass || 'Pass#123',
      totalUsersLimit: parseInt(formData.totalUsersLimit) || (formData.serverType === 'Dedicated Server' ? 5 : 30),
      specs: formData.specs,
      portSerial: '443',
      status: 'Active',
      availableDrives
    };

    onAddServer(newServer);
    setCreatedServer(newServer);
  };

  const portalBaseUrl = typeof window !== 'undefined' && window.location.origin.includes('localhost')
    ? 'https://vps.innovationwebworks.in'
    : (typeof window !== 'undefined' ? window.location.origin : 'https://vps.innovationwebworks.in');

  if (createdServer) {
    const srvTarget = createdServer.ipPort || createdServer.id;
    const encSrv = encodeURIComponent(srvTarget);
    const psCmd = `[Net.ServicePointManager]::SecurityProtocol = 3072 -bor 768 -bor 192; (New-Object Net.WebClient).DownloadString('${portalBaseUrl}/install.ps1?s=${encSrv}') | iex`;
    
    const handleCopyCreated = (cmd) => {
      navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    };

    return (
      <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px', backgroundColor: '#0f172a', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px' }}>
          <div className="modal-header" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <div className="modal-title" style={{ color: '#34d399' }}>
              <Check size={22} color="#34d399" />
              🎉 Server Node Added! Connect 24/7 Agent
            </div>
            <button className="modal-close" onClick={onClose}><X size={20} /></button>
          </div>

          <div style={{ padding: '1.25rem 0 0.5rem 0' }}>
            <div style={{
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '10px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#f1f5f9' }}>
                  {createdServer.name} ({createdServer.ipPort})
                </div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                  Allocated: {createdServer.serverType} • {createdServer.specs}
                </div>
              </div>
              <span className="badge badge-emerald" style={{ fontSize: '0.75rem' }}>Node Registered</span>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '10px', lineHeight: '1.4' }}>
              Copy this 1-click command and run it <strong>once</strong> on your Windows VPS as Administrator.
              It installs the 24/7 background agent, excludes Defender, and connects live telemetry and remote password sync:
            </p>

            <div style={{
              backgroundColor: '#030712',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '10px',
              padding: '14px 16px',
              fontFamily: 'Consolas, Monaco, monospace',
              fontSize: '0.78rem',
              color: '#38bdf8',
              wordBreak: 'break-all',
              lineHeight: '1.45',
              boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.5)',
              position: 'relative'
            }}>
              <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginBottom: '8px', fontWeight: '600' }}>
                ⚡ PowerShell 1-Click Command (Run in Administrator PowerShell):
              </div>
              {psCmd}
              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => handleCopyCreated(psCmd)}
                  style={{
                    backgroundColor: copied ? '#10b981' : '#4f46e5',
                    border: 'none',
                    color: '#ffffff',
                    padding: '7px 16px',
                    borderRadius: '7px',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {copied ? <><Check size={14} /> Copied PowerShell Command!</> : <><Copy size={14} /> Copy PowerShell Command</>}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '14px' }}>
              <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', padding: '8px', display: 'flex', gap: '8px' }}>
                <ShieldCheck size={16} color="#34d399" />
                <div style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>
                  <strong>Defender Safe:</strong> Automatically adds exclusions for zero AV interference.
                </div>
              </div>
              <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', padding: '8px', display: 'flex', gap: '8px' }}>
                <Layers size={16} color="#38bdf8" />
                <div style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>
                  <strong>All Windows Server:</strong> 2008 R2, 2012, 2016, 2019, 2022, 2025 compatible.
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '1rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setCreatedServer(null);
                onClose();
              }}
            >
              Done / Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px' }}>
        <div className="modal-header">
          <div className="modal-title">
            <Server size={22} color="#818cf8" />
            Add New VPS Server Node (HTTPS Port 443 Web Login)
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Server Type Allocation *</label>
              <select
                className="form-input"
                value={formData.serverType}
                onChange={e => setFormData({ ...formData, serverType: e.target.value })}
              >
                <option value="Shared VPS">🌐 Shared VPS Server</option>
                <option value="Dedicated Server">🚀 Dedicated Bare-Metal Server</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Server Display Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Cloud Server Node 01"
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">IP & Port *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. 192.168.1.100:443"
                required
                value={formData.ipPort}
                onChange={e => setFormData({ ...formData, ipPort: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Superclient Username</label>
              <input
                type="text"
                className="form-input"
                value={formData.superClientUser}
                onChange={e => setFormData({ ...formData, superClientUser: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Superclient Password</label>
              <input
                type="text"
                className="form-input"
                placeholder="Super#Pass123"
                value={formData.superClientPass}
                onChange={e => setFormData({ ...formData, superClientPass: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Total Users Capacity</label>
              <input
                type="number"
                className="form-input"
                value={formData.totalUsersLimit}
                onChange={e => setFormData({ ...formData, totalUsersLimit: e.target.value })}
              />
            </div>

            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Hardware Specifications</label>
              <input
                type="text"
                className="form-input"
                placeholder="Auto-detected live on Agent connect (e.g. 16 Core / 64GB RAM)"
                value={formData.specs}
                onChange={e => setFormData({ ...formData, specs: e.target.value })}
              />
            </div>
          </div>

          {/* Automatic Drive Alphabet Range Generator */}
          <div className="glass-card" style={{ padding: '1rem', marginTop: '1.25rem', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <strong style={{ fontSize: '0.9rem', color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={16} /> Auto-Generate Drive Range (Alphabet to Alphabet)
              </strong>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className={`btn ${driveMode === 'RANGE' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                  onClick={() => setDriveMode('RANGE')}
                >
                  Alphabet Range (Auto)
                </button>
                <button
                  type="button"
                  className={`btn ${driveMode === 'CUSTOM' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                  onClick={() => setDriveMode('CUSTOM')}
                >
                  Custom List
                </button>
              </div>
            </div>

            {driveMode === 'RANGE' ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Start Drive Letter</label>
                    <select
                      className="form-input"
                      value={startLetter}
                      onChange={e => setStartLetter(e.target.value)}
                    >
                      {alphabetList.map(lettr => (
                        <option key={lettr} value={lettr}>Drive {lettr}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">End Drive Letter</label>
                    <select
                      className="form-input"
                      value={endLetter}
                      onChange={e => setEndLetter(e.target.value)}
                    >
                      {alphabetList.map(lettr => (
                        <option key={lettr} value={lettr}>Drive {lettr}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Drive Label Prefix</label>
                    <input
                      type="text"
                      className="form-input"
                      value={drivePrefix}
                      onChange={e => setDrivePrefix(e.target.value)}
                      placeholder="e.g. Drive "
                    />
                  </div>
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Auto-Generated Intermediate Alphabet Drives ({generatedRangeDrives.length} Drives):
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {generatedRangeDrives.length === 0 ? (
                      <span style={{ color: '#f87171', fontSize: '0.8rem' }}>Invalid Range</span>
                    ) : (
                      generatedRangeDrives.map(d => (
                        <span key={d} className="badge badge-drive" style={{ fontSize: '0.7rem' }}>
                          {d}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Custom Drive Names (comma separated)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Dedicated Drive 1, Dedicated Drive 2"
                  value={formData.drivesStr}
                  onChange={e => setFormData({ ...formData, drivesStr: e.target.value })}
                />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Add Server Node</button>
          </div>
        </form>
      </div>
    </div>
  );
}

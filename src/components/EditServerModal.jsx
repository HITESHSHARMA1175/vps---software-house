import React, { useState, useEffect } from 'react';
import { X, Server, ShieldCheck, Eye, EyeOff, Sparkles, Edit3, Check, RotateCcw } from 'lucide-react';
import { KeyRound } from 'lucide-react';
import { generateDriveRange } from './AddServerModal';
import AgentKeyPanel from './AgentKeyPanel';
import { useAuth, API_BASE } from '../contexts/AuthContext';

export default function EditServerModal({ isOpen, onClose, server, onSaveServer }) {
  // Drive Modes: 'KEEP_EXISTING' (Default - Keep exact drives), 'RANGE' (Auto Range), 'CUSTOM' (Custom List)
  const [driveMode, setDriveMode] = useState('KEEP_EXISTING');
  const [isEditingDrives, setIsEditingDrives] = useState(false);

  const [startLetter, setStartLetter] = useState('E');
  const [endLetter, setEndLetter] = useState('P');
  const [drivePrefix, setDrivePrefix] = useState('Drive ');

  const [formData, setFormData] = useState({
    name: '',
    serverType: 'Shared VPS',
    ipPort: '',
    httpUrl: '',
    httpsUrl: '',
    superClientUser: 'Superclient',
    superClientPass: '',
    totalUsersLimit: 30,
    specs: '',
    portSerial: '',
    drivesStr: ''
  });

  const [showPassword, setShowPassword] = useState(false);

  const { currentUser, authFetch } = useAuth();
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const [isRotating, setIsRotating] = useState(false);
  const [rotateResult, setRotateResult] = useState(null); // { agentKey, installerUrl } | { error }

  // Drop any displayed key when the modal switches server or closes
  useEffect(() => {
    setRotateResult(null);
  }, [server?.id, isOpen]);

  const [graceInput, setGraceInput] = useState('0');
  const [graceError, setGraceError] = useState('');

  useEffect(() => {
    setGraceInput('0');
    setGraceError('');
  }, [server?.id, isOpen]);

  const parseGrace = (raw) => {
    const s = String(raw).trim();
    if (!/^\d+$/.test(s)) return null;
    const n = Number(s);
    return Number.isInteger(n) && n >= 0 && n <= 1440 ? n : null;
  };

  const handleRotateKey = async () => {
    const graceMinutes = parseGrace(graceInput);
    if (graceMinutes === null) {
      setGraceError('Grace period must be a whole number between 0 and 1440 minutes.');
      return;
    }
    setGraceError('');
    const graceNote = graceMinutes > 0
      ? `The current key keeps working for ${graceMinutes} more minute(s).`
      : 'The current key stops working immediately.';
    if (!window.confirm(`Rotate the agent key for "${server.name}"?\n\n${graceNote} The agent on this server must be reinstalled with the new key.`)) {
      return;
    }
    setIsRotating(true);
    setRotateResult(null);
    try {
      const res = await authFetch(`${API_BASE}/servers/${encodeURIComponent(server.id)}/rotate-agent-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graceMinutes })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.agentKey) {
        setRotateResult({ error: `Key rotation failed: ${data.error || `request failed (HTTP ${res.status})`}` });
      } else {
        setRotateResult({ agentKey: data.agentKey, installerUrl: data.installerUrl || '', previousKeyExpiresAt: data.previousKeyExpiresAt || null });
      }
    } catch (e) {
      setRotateResult({ error: `Key rotation failed: ${e.message || 'network error'}` });
    } finally {
      setIsRotating(false);
    }
  };

  const alphabetList = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
  const generatedRangeDrives = generateDriveRange(startLetter, endLetter, drivePrefix);

  useEffect(() => {
    if (server) {
      setDriveMode('KEEP_EXISTING');
      setIsEditingDrives(false);

      const existingDrivesArr = Array.isArray(server.availableDrives) ? server.availableDrives : [];

      setFormData({
        name: server.name || '',
        serverType: server.serverType || 'Shared VPS',
        ipPort: server.ipPort || '',
        httpUrl: server.httpUrl || '',
        httpsUrl: server.httpsUrl || '',
        superClientUser: server.superClientUser || 'Superclient',
        superClientPass: server.superClientPass || '',
        totalUsersLimit: server.totalUsersLimit || 30,
        specs: server.specs || '',
        portSerial: server.portSerial || '',
        drivesStr: existingDrivesArr.join(', ')
      });
    }
  }, [server, isOpen]);

  if (!isOpen || !server) return null;

  const currentExistingDrives = Array.isArray(server.availableDrives) ? server.availableDrives : [];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.ipPort) return;

    let availableDrives = [];
    if (!isEditingDrives || driveMode === 'KEEP_EXISTING') {
      // Keep exact existing drives untouched unless user explicitly clicked pencil to change!
      availableDrives = currentExistingDrives;
    } else if (driveMode === 'RANGE') {
      availableDrives = generatedRangeDrives;
    } else {
      availableDrives = formData.drivesStr
        .split(',')
        .map(d => d.trim())
        .filter(d => d.length > 0);
    }

    onSaveServer({
      ...server,
      name: formData.name,
      serverType: formData.serverType,
      ipPort: formData.ipPort,
      httpUrl: formData.httpUrl,
      httpsUrl: formData.httpsUrl,
      superClientUser: formData.superClientUser,
      superClientPass: formData.superClientPass,
      totalUsersLimit: parseInt(formData.totalUsersLimit) || 30,
      specs: formData.specs,
      portSerial: formData.portSerial,
      availableDrives
    });

    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px' }}>
        <div className="modal-header">
          <div className="modal-title">
            <Server size={22} color="#818cf8" />
            Edit VPS Server Configuration ({server.name})
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
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  style={{ width: '100%', paddingRight: '2.5rem' }}
                  placeholder="Leave blank to keep current password"
                  value={formData.superClientPass}
                  onChange={e => setFormData({ ...formData, superClientPass: e.target.value })}
                />
                <button
                  type="button"
                  style={{
                    position: 'absolute',
                    right: '0.5rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer'
                  }}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
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
                value={formData.specs}
                onChange={e => setFormData({ ...formData, specs: e.target.value })}
              />
            </div>
          </div>

          {/* Drive Allocation Section */}
          <div className="glass-card" style={{ padding: '1rem', marginTop: '1.25rem', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <strong style={{ fontSize: '0.9rem', color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={16} /> Drive Allocation ({currentExistingDrives.length} Existing Drives)
              </strong>

              {!isEditingDrives ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.4)' }}
                  onClick={() => {
                    setIsEditingDrives(true);
                    setDriveMode('RANGE');
                  }}
                >
                  <Edit3 size={14} /> Pencil: Change / Re-generate Drives
                </button>
              ) : (
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
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
                    onClick={() => {
                      setIsEditingDrives(false);
                      setDriveMode('KEEP_EXISTING');
                    }}
                  >
                    <RotateCcw size={12} /> Keep Original
                  </button>
                </div>
              )}
            </div>

            {!isEditingDrives ? (
              /* Display Current Server Drives Untouched */
              <div style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Current Server Drives (Protected - Click Pencil above if you want to modify):
                </div>
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                  {currentExistingDrives.length === 0 ? (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No drives allocated yet.</span>
                  ) : (
                    currentExistingDrives.map(d => (
                      <span key={d} className="badge badge-drive" style={{ fontSize: '0.75rem' }}>
                        {d}
                      </span>
                    ))
                  )}
                </div>
              </div>
            ) : (
              /* Allow Changing Range or Custom List */
              <div>
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
                      <div style={{ fontSize: '0.75rem', color: '#a5b4fc', marginBottom: '4px' }}>
                        New Range Preview ({generatedRangeDrives.length} Drives):
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
                      value={formData.drivesStr}
                      onChange={e => setFormData({ ...formData, drivesStr: e.target.value })}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {isSuperAdmin && (
            <div className="glass-card" style={{ padding: '1rem', marginTop: '1.25rem', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                <div>
                  <strong style={{ fontSize: '0.9rem', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <KeyRound size={16} /> Agent key
                  </strong>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Rotate to revoke the current key. The new key is shown once.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ color: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.4)' }}
                  disabled={isRotating}
                  onClick={handleRotateKey}
                >
                  {isRotating ? 'Rotating...' : 'Rotate agent key'}
                </button>
              </div>
              <div style={{ marginTop: '0.75rem' }}>
                <label htmlFor="rotate-grace-minutes" style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Grace period (minutes, 0 to 1440)
                </label>
                <input
                  id="rotate-grace-minutes"
                  type="number"
                  className="form-control"
                  min={0}
                  max={1440}
                  step={1}
                  value={graceInput}
                  disabled={isRotating}
                  aria-invalid={graceError ? 'true' : 'false'}
                  aria-describedby={graceError ? 'rotate-grace-error' : undefined}
                  onChange={(e) => { setGraceInput(e.target.value); setGraceError(''); }}
                  style={{ maxWidth: '140px' }}
                />
                {graceError && (
                  <div id="rotate-grace-error" role="alert" style={{ marginTop: '4px', fontSize: '0.75rem', color: '#fca5a5' }}>{graceError}</div>
                )}
              </div>
              {rotateResult && (
                <div style={{ marginTop: '0.75rem' }}>
                  <AgentKeyPanel
                    agentKey={rotateResult.agentKey}
                    installerUrl={rotateResult.installerUrl}
                    error={rotateResult.error}
                    onClose={() => setRotateResult(null)}
                  />
                  {rotateResult.agentKey && rotateResult.previousKeyExpiresAt && !Number.isNaN(new Date(rotateResult.previousKeyExpiresAt).getTime()) && (
                    <div role="status" style={{ marginTop: '8px', fontSize: '0.78rem', color: '#fbbf24' }}>
                      The previous key keeps working until {new Date(rotateResult.previousKeyExpiresAt).toLocaleString()}.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Server Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
}

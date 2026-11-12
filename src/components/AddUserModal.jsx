import React, { useState, useEffect } from 'react';
import { X, UserPlus, Calendar, HardDrive, CheckCircle2, ShieldAlert, AlertCircle, Key, Eye, EyeOff, Sparkles, RefreshCw, Zap } from 'lucide-react';

export default function AddUserModal({
  isOpen,
  onClose,
  onSaveUser,
  servers = [],
  salesAgents = [],
  initialUser = null,
  allUsers = []
}) {
  const initialSrv = servers[0] || null;
  const initialSrvDrives = Array.isArray(initialSrv?.availableDrives) && initialSrv.availableDrives.length > 0 ? initialSrv.availableDrives : ['Drive C'];
  const initialDefaultDrive = initialSrvDrives.find(d => !d.toUpperCase().includes('C')) || initialSrvDrives[0] || 'Drive C';

  const [formData, setFormData] = useState({
    clientType: 'Shared',
    username: '',
    password: '',
    company: '',
    billDate: new Date().toISOString().split('T')[0],
    expiryDate: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
    salesAgent: salesAgents[0] || 'Sales Rep 1',
    serverId: servers[0] ? servers[0].id : '',
    drive: initialDefaultDrive,
    tallyVersion: '',
    customerPhone: '',
    customerEmail: '',
    notes: ''
  });

  const [allowMultiUser, setAllowMultiUser] = useState(false);
  const [autoProvision, setAutoProvision] = useState(true);
  const [showUserPass, setShowUserPass] = useState(false);

  // Helper to generate strong password
  const generateStrongPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
    let pass = "";
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass + "9#A";
  };

  // Current selected server
  const currentServer = servers.find(s => s.id === formData.serverId) || servers[0] || null;
  const serverConfiguredDrives = Array.isArray(currentServer?.availableDrives) ? currentServer.availableDrives.filter(Boolean) : [];
  const serverTallyVersions = Array.isArray(currentServer?.tallyVersions) ? currentServer.tallyVersions : [];

  // Strictly use discovered/configured real drives from the VPS server (No phantom drives)
  const combinedDrivesSet = new Set();
  if (serverConfiguredDrives.length > 0) {
    serverConfiguredDrives.forEach(d => { if (d) combinedDrivesSet.add(d.trim()); });
  } else {
    // Only if server has never reported telemetry yet, minimal fallback
    combinedDrivesSet.add('Drive C');
  }

  // If editing an existing user whose drive is already set, ensure it's in the list
  if (formData.drive) combinedDrivesSet.add(formData.drive.trim());

  const allAvailableDriveOptions = Array.from(combinedDrivesSet);

  // Map each drive's usage count and occupant company on current server
  const driveUsageMap = {};
  const driveOccupantMap = {};
  allAvailableDriveOptions.forEach(d => { 
    driveUsageMap[d] = 0; 
    driveOccupantMap[d] = [];
  });

  if (formData.serverId && allUsers) {
    allUsers.filter(u => u.serverId === formData.serverId).forEach(u => {
      if (initialUser && u.id === initialUser.id) return;

      if (u.drive) {
        const dKey = u.drive.trim();
        if (driveUsageMap[dKey] === undefined) {
          driveUsageMap[dKey] = 0;
          driveOccupantMap[dKey] = [];
        }
        driveUsageMap[dKey] += 1;
        driveOccupantMap[dKey].push(u.company || u.username);
      }
    });
  }

  // ONLY initialize or reset form when modal opens (isOpen flips to true) or editing user changes!
  useEffect(() => {
    if (!isOpen) return;

    if (initialUser) {
      const isOccupied = (driveUsageMap[initialUser.drive] || 0) > 0;
      setAllowMultiUser(isOccupied);
      setAutoProvision(false);
      setFormData({
        clientType: initialUser.clientType || 'Shared',
        username: initialUser.username || '',
        // Stored passwords are no longer sent to the browser; blank on edit keeps the current password
        password: initialUser.password || '',
        company: initialUser.company || '',
        billDate: initialUser.billDate || '',
        expiryDate: initialUser.expiryDate || '',
        salesAgent: initialUser.salesAgent || salesAgents[0] || 'Sales Rep 1',
        serverId: initialUser.serverId || (servers[0] ? servers[0].id : ''),
        drive: initialUser.drive || 'Drive D',
        tallyVersion: initialUser.tallyVersion || '',
        customerPhone: initialUser.customerPhone || '',
        customerEmail: initialUser.customerEmail || '',
        notes: initialUser.notes || ''
      });
    } else {
      // New User Default
      const defaultSrv = servers[0] || null;
      const srvDrives = defaultSrv && Array.isArray(defaultSrv.availableDrives) && defaultSrv.availableDrives.length > 0 
        ? defaultSrv.availableDrives 
        : ['Drive C'];

      // Pick first non-C drive by default
      const preferredDefaultDrive = srvDrives.find(d => !d.toUpperCase().includes('C')) || srvDrives[0] || 'Drive C';
      const defaultTally = (defaultSrv?.tallyVersions && defaultSrv.tallyVersions.length > 0)
        ? (typeof defaultSrv.tallyVersions[0] === 'string' ? defaultSrv.tallyVersions[0] : (defaultSrv.tallyVersions[0].name || ''))
        : '';

      setAllowMultiUser(false);
      setAutoProvision(true);
      setFormData({
        clientType: 'Shared',
        username: '',
        password: generateStrongPassword(),
        company: '',
        billDate: new Date().toISOString().split('T')[0],
        expiryDate: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
        salesAgent: salesAgents[0] || 'Sales Rep 1',
        serverId: defaultSrv ? defaultSrv.id : '',
        drive: preferredDefaultDrive,
        tallyVersion: defaultTally,
        customerPhone: '',
        customerEmail: '',
        notes: ''
      });
    }
  }, [isOpen, initialUser]); // DO NOT put servers or salesAgents here to avoid re-trigger on background telemetry!

  if (!isOpen) return null;

  const currentDriveCount = driveUsageMap[formData.drive] || 0;
  const isSelectedDriveOccupied = currentDriveCount > 0;

  // Check if username is already taken on the selected server
  const targetUsernameClean = formData.username.trim().toLowerCase();
  const existingDuplicateUser = targetUsernameClean ? allUsers.find(u =>
    u.serverId === formData.serverId &&
    u.username.trim().toLowerCase() === targetUsernameClean &&
    (!initialUser || u.id !== initialUser.id)
  ) : null;

  // Auto-suggest username from company
  const handleAutoSuggestUsername = () => {
    if (!formData.company) return;
    const clean = formData.company.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    setFormData(prev => ({ ...prev, username: clean }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.username || !formData.company || !formData.expiryDate) return;

    if (existingDuplicateUser) {
      alert(`⚠️ Username '${formData.username}' is ALREADY TAKEN on ${currentServer ? currentServer.name : 'this VPS server'} by company '${existingDuplicateUser.company}'!\n\nPlease enter a unique username for this server.`);
      return;
    }

    if (isSelectedDriveOccupied && !allowMultiUser) {
      alert(`⚠️ ${formData.drive} on ${currentServer ? currentServer.name : 'VPS'} is ALREADY OCCUPIED by an existing client (${driveOccupantMap[formData.drive]?.join(', ')})!\n\nTo assign multiple users to the same drive, please check the 'Allow Multi-User / Shared Drive Access' option.`);
      return;
    }

    const isEditing = Boolean(initialUser && initialUser.id);
    const userId = isEditing ? initialUser.id : `u-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    onSaveUser({
      ...formData,
      autoProvision,
      id: userId
    });

    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
        <div className="modal-header">
          <div className="modal-title">
            <UserPlus size={22} color="#2563eb" />
            {initialUser ? 'Edit Client Subscription' : 'Create Tally Workspace'}
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          {!initialUser && (
            <div className="workspace-form-steps" aria-label="Workspace provisioning steps">
              <span className="is-current"><b>1</b> Company information</span>
              <i />
              <span><b>2</b> Infrastructure &amp; access</span>
              <i />
              <span><b>3</b> Review &amp; provision</span>
            </div>
          )}
          <div className="form-grid">
            {/* 1. Client Type */}
            <div className="form-group">
              <label className="form-label">Client Type *</label>
              <select
                className="form-input"
                value={formData.clientType}
                onChange={e => setFormData(prev => ({ ...prev, clientType: e.target.value }))}
              >
                <option value="Shared">Shared Multi-Tenant VPS</option>
                <option value="Dedicated">Dedicated Server Account</option>
                <option value="Single User">Single User VPS Account</option>
              </select>
            </div>

            {/* 2. Target Server */}
            <div className="form-group">
              <label className="form-label">Target Server Node *</label>
              <select
                className="form-input"
                value={formData.serverId}
                onChange={e => {
                  const newSrvId = e.target.value;
                  const selectedSrv = servers.find(s => s.id === newSrvId);
                  const isDedi = selectedSrv && selectedSrv.serverType === "Dedicated Server";
                  const sDrives = Array.isArray(selectedSrv?.availableDrives) ? selectedSrv.availableDrives.filter(Boolean) : [];
                  const newDrive = (sDrives.length > 0 && !sDrives.includes(formData.drive))
                    ? (sDrives.find(d => !d.toUpperCase().includes('C')) || sDrives[0])
                    : formData.drive;
                  setFormData(prev => ({
                    ...prev,
                    serverId: newSrvId,
                    drive: newDrive || prev.drive,
                    clientType: isDedi ? 'Dedicated' : prev.clientType
                  }));
                }}
                required
              >
                {servers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.serverType || 'Shared VPS'})
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Dedicated Server Drive Selector - 100% User Freedom */}
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <HardDrive size={15} color="#38bdf8" /> Select Server Drive (Aap jo drive chahein freely select karein) *
                </label>
                <span style={{ fontSize: '0.74rem', color: isSelectedDriveOccupied ? '#f87171' : '#34d399', fontWeight: '600' }}>
                  {isSelectedDriveOccupied ? `🔴 Occupied (${currentDriveCount} user)` : '🟢 Empty / Free Drive'}
                </span>
              </div>

              <select
                className="form-input"
                value={formData.drive}
                onChange={e => {
                  const chosenDrive = e.target.value;
                  setFormData(prev => ({ ...prev, drive: chosenDrive }));
                }}
                required
                style={{
                  fontWeight: '700',
                  fontSize: '0.95rem',
                  borderColor: isSelectedDriveOccupied && !allowMultiUser ? '#ef4444' : '#10b981',
                  background: 'var(--bg-input, #0f172a)',
                  color: '#ffffff'
                }}
              >
                {allAvailableDriveOptions.map(d => {
                  const count = driveUsageMap[d] || 0;
                  const isEmpty = count === 0;
                  const occupants = driveOccupantMap[d] || [];
                  const occupantText = occupants.length > 0 ? ` [ALLOTTED: ${occupants.slice(0, 2).join(', ')}]` : '';
                  return (
                    <option key={d} value={d}>
                      {isEmpty ? `🟢 ${d} — [FREE & UNALLOTTED / READY]` : `🔴 ${d} — (${count} Client)${occupantText}`}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Tally / Accounting Version Selection - Discovered from VPS */}
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Zap size={14} color="#f59e0b" /> Tally / Accounting Version (Auto-Discovered from VPS)
                </label>
                <span style={{ fontSize: '0.72rem', color: serverTallyVersions.length > 0 ? '#34d399' : '#94a3b8', fontWeight: '600' }}>
                  {serverTallyVersions.length > 0 ? `⚡ ${serverTallyVersions.length} versions detected` : 'Standard default template'}
                </span>
              </div>
              <select
                className="form-input"
                value={formData.tallyVersion}
                onChange={e => setFormData(prev => ({ ...prev, tallyVersion: e.target.value }))}
                style={{
                  background: 'var(--bg-input, #0f172a)',
                  color: '#ffffff',
                  fontWeight: '500'
                }}
              >
                <option value="">Standard Default Template (Auto / C:\Tally.ERP9 or C:\Program Files\TallyPrime)</option>
                {serverTallyVersions.map((tv, idx) => {
                  const name = typeof tv === 'string' ? tv : (tv.name || tv.version || `Tally Version ${idx + 1}`);
                  const ver = typeof tv === 'object' && tv.version ? ` (v${tv.version})` : '';
                  const path = typeof tv === 'object' && tv.path ? ` [${tv.path}]` : '';
                  return (
                    <option key={idx} value={name}>
                      ⚡ {name}{ver}{path}
                    </option>
                  );
                })}
              </select>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>
                💡 VPS par <code style={{ color: '#38bdf8' }}>C:\TallyVersions\&lt;VersionFolder&gt;</code> me alag alag versions rakhein; agent unhe auto-discover karke yaha show karega.
              </div>
            </div>

            {/* 4. Company Name */}
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Company / Client Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Sharma Building Materials Pvt Ltd"
                required
                value={formData.company}
                onChange={e => {
                  const newComp = e.target.value;
                  setFormData(prev => {
                    const shouldAutoFillUser = !prev.username || prev.username === prev.company.toLowerCase().replace(/[^a-z0-9]/g, '_');
                    return {
                      ...prev,
                      company: newComp,
                      username: shouldAutoFillUser ? newComp.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') : prev.username
                    };
                  });
                }}
              />
            </div>

            {/* 5. Desired Username with Auto-Suggest */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label className="form-label" style={{ margin: 0 }}>Windows RDP Username *</label>
                <button
                  type="button"
                  onClick={handleAutoSuggestUsername}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#38bdf8',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: 0
                  }}
                >
                  <Sparkles size={12} /> Auto-Suggest
                </button>
              </div>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. sharma_materials"
                required
                value={formData.username}
                onChange={e => setFormData(prev => ({ ...prev, username: e.target.value }))}
                style={{
                  borderColor: existingDuplicateUser ? '#ef4444' : undefined
                }}
              />
              {existingDuplicateUser && (
                <div style={{ color: '#f87171', fontSize: '0.75rem', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertCircle size={13} /> Username '{formData.username}' is ALREADY TAKEN on this server ({existingDuplicateUser.company})!
                </div>
              )}
            </div>

            {/* 6. Password */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Key size={14} color="#34d399" /> RDP Password *
                </label>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, password: generateStrongPassword() }))}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#34d399',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: 0
                  }}
                >
                  <RefreshCw size={11} /> New Pass
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showUserPass ? 'text' : 'password'}
                  className="form-input"
                  style={{ width: '100%', paddingRight: '2.5rem' }}
                  placeholder={initialUser ? 'Leave blank to keep current password' : 'e.g. UserPass#2026'}
                  required={!initialUser}
                  value={formData.password}
                  onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))}
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
                  onClick={() => setShowUserPass(!showUserPass)}
                >
                  {showUserPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* 7. Sales Rep */}
            <div className="form-group">
              <label className="form-label">Sales Representative *</label>
              <select
                className="form-input"
                value={formData.salesAgent}
                onChange={e => setFormData(prev => ({ ...prev, salesAgent: e.target.value }))}
              >
                {salesAgents.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            {/* 8. Expiry Date */}
            <div className="form-group">
              <label className="form-label">Subscription Expiry Date *</label>
              <input
                type="date"
                className="form-input"
                required
                value={formData.expiryDate}
                onChange={e => setFormData(prev => ({ ...prev, expiryDate: e.target.value }))}
              />
            </div>

            {/* 9. Phone & Email */}
            <div className="form-group">
              <label className="form-label">Customer Contact Phone</label>
              <input
                type="text"
                className="form-input"
                placeholder="+91 9000000001"
                value={formData.customerPhone}
                onChange={e => setFormData(prev => ({ ...prev, customerPhone: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Customer Email Address</label>
              <input
                type="email"
                className="form-input"
                placeholder="client@company.sample"
                value={formData.customerEmail}
                onChange={e => setFormData(prev => ({ ...prev, customerEmail: e.target.value }))}
              />
            </div>
          </div>

          {/* Auto-Provision on Windows VPS Toggle */}
          <div style={{
            background: autoProvision ? 'rgba(16, 185, 129, 0.12)' : 'rgba(9, 14, 26, 0.8)',
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-md)',
            border: autoProvision ? '1px solid #10b981' : '1px solid var(--border-color)',
            marginTop: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <input
              type="checkbox"
              id="autoProvisionCheck"
              checked={autoProvision}
              onChange={e => setAutoProvision(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <label htmlFor="autoProvisionCheck" style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600', color: autoProvision ? '#34d399' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={15} color="#34d399" /> Auto-Provision on Windows VPS (Create User, Zero-Trust Folder, Tally & TSplus automatically)
            </label>
          </div>

          {/* Multi-User Checkbox Toggle */}
          <div style={{
            background: allowMultiUser ? 'rgba(192, 132, 252, 0.15)' : 'rgba(9, 14, 26, 0.8)',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            border: allowMultiUser ? '1px solid #c084fc' : (isSelectedDriveOccupied ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid var(--border-color)'),
            marginTop: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <input
              type="checkbox"
              id="multiUserCheck"
              checked={allowMultiUser}
              onChange={e => setAllowMultiUser(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <label htmlFor="multiUserCheck" style={{ cursor: 'pointer', fontSize: '0.82rem', fontWeight: '600', color: allowMultiUser ? '#c084fc' : 'var(--text-main)' }}>
              👥 Allow Multi-User / Shared Drive Access (Assign multiple clients to the same drive)
            </label>
          </div>

          {isSelectedDriveOccupied && !allowMultiUser && (
            <div style={{ color: '#f87171', fontSize: '0.78rem', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ShieldAlert size={14} /> Warning: {formData.drive} is occupied. Check 'Allow Multi-User' above to assign another client to this drive.
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={Boolean(existingDuplicateUser)}>
              {initialUser ? 'Update Subscription' : '🚀 Create & Provision Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

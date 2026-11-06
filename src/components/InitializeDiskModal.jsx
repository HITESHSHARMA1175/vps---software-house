import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  HardDrive,
  Server,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Layers,
  Sparkles,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  Info
} from 'lucide-react';

export default function InitializeDiskModal({
  isOpen,
  onClose,
  servers = [],
  telemetryData = {},
  initialServerId = null,
  initialDiskNumber = null,
  initialMode = 'create',
  initialDriveLetter = null,
  onSuccess
}) {
  const [selectedServerId, setSelectedServerId] = useState('');
  const [selectedDiskNumber, setSelectedDiskNumber] = useState('');
  const [modalMode, setModalMode] = useState('CREATE'); // 'CREATE' | 'EXTEND'
  const [targetExtendDrive, setTargetExtendDrive] = useState('E');
  const [driveLetter, setDriveLetter] = useState('D');
  const [volumeLabel, setVolumeLabel] = useState('Data_D');
  const [customSizeGB, setCustomSizeGB] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Synchronize server selection when modal opens
  useEffect(() => {
    if (isOpen) {
      const targetId = initialServerId || (servers[0] ? servers[0].id : '');
      setSelectedServerId(targetId);
      setModalMode(initialMode ? initialMode.toUpperCase() : 'CREATE');
      if (initialDriveLetter) setTargetExtendDrive(initialDriveLetter.replace(/[^a-zA-Z]/g, '').toUpperCase());
      setStatusMessage(null);
      setErrorMessage(null);

      const handleKeyDown = (e) => {
        if (e.key === 'Escape' && !isSubmitting) onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, initialServerId, servers, onClose, isSubmitting]);

  // Current server and telemetry
  const currentServer = useMemo(() => {
    return servers.find(s => s.id === selectedServerId || s.ipPort === selectedServerId) || servers[0] || null;
  }, [servers, selectedServerId]);

  const currentTelem = useMemo(() => {
    if (!currentServer) return null;
    const sIpPure = currentServer.ipPort ? currentServer.ipPort.split(':')[0] : '';
    return telemetryData[currentServer.id] || telemetryData[currentServer.ipPort] || (sIpPure && telemetryData[sIpPure]) || null;
  }, [currentServer, telemetryData]);

  // Physical disks on current server
  const physicalDisks = useMemo(() => {
    if (currentTelem && Array.isArray(currentTelem.physicalDisks) && currentTelem.physicalDisks.length > 0) {
      return currentTelem.physicalDisks;
    }
    if (currentServer && Array.isArray(currentServer.physicalDisks) && currentServer.physicalDisks.length > 0) {
      return currentServer.physicalDisks;
    }
    return [];
  }, [currentTelem, currentServer]);

  // Discovered logical mounted drive letters (e.g. ['C', 'E'])
  const mountedLetters = useMemo(() => {
    const letters = new Set();
    if (currentTelem && Array.isArray(currentTelem.disks)) {
      currentTelem.disks.forEach(d => {
        const l = (d.driveLetter || d.drive || '').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 1);
        if (l) letters.add(l);
      });
    }
    if (currentTelem && Array.isArray(currentTelem.occupiedDrives)) {
      currentTelem.occupiedDrives.forEach(d => {
        const l = (d || '').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 1);
        if (l) letters.add(l);
      });
    }
    if (currentServer && Array.isArray(currentServer.occupiedDrives)) {
      currentServer.occupiedDrives.forEach(d => {
        const l = (d || '').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 1);
        if (l) letters.add(l);
      });
    }
    if (currentServer && Array.isArray(currentServer.availableDrives)) {
      currentServer.availableDrives.forEach(d => {
        const l = (d || '').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 1);
        if (l) letters.add(l);
      });
    }
    // Always include C: as mounted
    letters.add('C');
    return Array.from(letters);
  }, [currentTelem, currentServer]);

  // Available candidate drive letters (excluding mounted letters)
  const availableLetters = useMemo(() => {
    const all = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
    return all.filter(l => !mountedLetters.includes(l));
  }, [mountedLetters]);

  // Auto-select initial disk and recommended drive letter
  useEffect(() => {
    if (physicalDisks.length > 0) {
      if (initialDiskNumber !== null && initialDiskNumber !== undefined) {
        setSelectedDiskNumber(String(initialDiskNumber));
      } else {
        // Priority 1: Pick any disk with unallocated space > 0.5 GB (including Disk 0 if resized!)
        const unallocatedCandidate = physicalDisks.find(d => (parseFloat(d.unallocatedGB) || 0) > 0.5);
        // Priority 2: Pick any non-0 disk that is RAW or Offline
        const rawCandidate = physicalDisks.find(d => d.diskNumber !== 0 && (d.isOffline || d.partitionStyle === 'RAW'));
        // Priority 3: First non-0 disk or disk 0
        const fallback = physicalDisks.find(d => d.diskNumber !== 0) || physicalDisks[0];

        const chosen = unallocatedCandidate || rawCandidate || fallback;
        if (chosen) {
          setSelectedDiskNumber(String(chosen.diskNumber));
          if (chosen.unallocatedGB > 0) {
            setCustomSizeGB(String(chosen.unallocatedGB));
          } else {
            setCustomSizeGB('');
          }
        }
      }
    } else {
      setSelectedDiskNumber(initialDiskNumber !== null ? String(initialDiskNumber) : '1');
    }

    if (availableLetters.length > 0) {
      const rec = availableLetters[0];
      setDriveLetter(rec);
      setVolumeLabel(`Data_${rec}`);
    }
  }, [physicalDisks, initialDiskNumber, availableLetters]);

  const selectedDiskObj = useMemo(() => {
    const num = parseInt(selectedDiskNumber, 10);
    return physicalDisks.find(d => d.diskNumber === num) || null;
  }, [physicalDisks, selectedDiskNumber]);

  // When selected disk changes, prefill size with available unallocated space
  const handleDiskSelect = (dNum) => {
    setSelectedDiskNumber(String(dNum));
    const disk = physicalDisks.find(d => d.diskNumber === parseInt(dNum, 10));
    if (disk && (parseFloat(disk.unallocatedGB) || 0) > 0) {
      setCustomSizeGB(String(disk.unallocatedGB));
    } else {
      setCustomSizeGB('');
    }
  };

  const handleDriveLetterChange = (letter) => {
    setDriveLetter(letter);
    setVolumeLabel(`Data_${letter}`);
  };

  if (!isOpen) return null;

  const isSelectedDiskHasUnallocated = selectedDiskObj && (parseFloat(selectedDiskObj.unallocatedGB) || 0) > 0.2;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    const diskNum = parseInt(selectedDiskNumber, 10);
    if (isNaN(diskNum) || diskNum < 0) {
      setErrorMessage('Please select a valid physical disk number.');
      return;
    }

    if (modalMode === 'EXTEND') {
      if (!targetExtendDrive) {
        setErrorMessage('Please select a target drive to extend.');
        return;
      }

      if (targetExtendDrive.toUpperCase() === 'C') {
        setErrorMessage('System drive C: extension from portal is restricted for OS safety.');
        return;
      }

      const payload = {
        diskNumber: diskNum,
        driveLetter: targetExtendDrive.toUpperCase(),
        sizeGB: customSizeGB ? parseFloat(customSizeGB) : null
      };

      try {
        setIsSubmitting(true);
        setStatusMessage(`Dispatching drive extension job (Disk ${diskNum} unallocated space ➔ Drive ${targetExtendDrive}:)...`);

        const res = await fetch(`/api/servers/${encodeURIComponent(selectedServerId)}/extend-drive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || data.message || 'Failed to dispatch drive extension');
        }

        setStatusMessage(`✅ Drive extension dispatched! The VPS Agent is growing Drive ${targetExtendDrive}: without data loss...`);

        setTimeout(() => {
          if (onSuccess) {
            onSuccess({
              serverId: selectedServerId,
              diskNumber: diskNum,
              driveLetter: targetExtendDrive.toUpperCase(),
              action: 'EXTEND'
            });
          }
          setIsSubmitting(false);
          onClose();
        }, 2200);
      } catch (err) {
        setIsSubmitting(false);
        setErrorMessage(err.message);
      }
      return;
    }

    // CREATE NEW DRIVE MODE
    if (!driveLetter) {
      setErrorMessage('Please select a target drive letter.');
      return;
    }

    if (driveLetter.toUpperCase() === 'C') {
      setErrorMessage('Drive C: is reserved for the Windows Operating System root.');
      return;
    }

    if (mountedLetters.includes(driveLetter.toUpperCase())) {
      setErrorMessage(`Drive ${driveLetter}: is already assigned and in use on this server.`);
      return;
    }

    // Safety guard on Disk 0: Only allow if there is verified unallocated space
    if (diskNum === 0 && selectedDiskObj && (parseFloat(selectedDiskObj.unallocatedGB) || 0) < 0.2) {
      setErrorMessage('Disk 0 has no unallocated free space to create a new drive. It is fully allocated to C: OS partition.');
      return;
    }

    const payload = {
      diskNumber: diskNum,
      driveLetter: driveLetter.toUpperCase(),
      label: volumeLabel.trim() || `Data_${driveLetter.toUpperCase()}`,
      sizeGB: customSizeGB ? parseFloat(customSizeGB) : null
    };

    try {
      setIsSubmitting(true);
      setStatusMessage(`Dispatching volume creation job (Disk ${diskNum} unallocated space ➔ Drive ${driveLetter}:)...`);

      const res = await fetch(`/api/servers/${encodeURIComponent(selectedServerId)}/initialize-disk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to dispatch disk volume creation');
      }

      setStatusMessage(`✅ Volume creation job dispatched! The VPS Agent is allocating unallocated space, formatting as NTFS, and mounting Drive ${driveLetter}:...`);

      setTimeout(() => {
        if (onSuccess) {
          onSuccess({
            serverId: selectedServerId,
            diskNumber: diskNum,
            driveLetter: driveLetter.toUpperCase(),
            action: 'CREATE'
          });
        }
        setIsSubmitting(false);
        onClose();
      }, 2200);
    } catch (err) {
      setIsSubmitting(false);
      setErrorMessage(err.message);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(5, 7, 12, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1050,
      padding: '16px'
    }}>
      <div style={{
        backgroundColor: '#0f172a',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(59, 130, 246, 0.15)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '580px',
        overflow: 'hidden',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* HEADER */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.7) 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: isSelectedDiskHasUnallocated ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
              color: isSelectedDiskHasUnallocated ? '#34d399' : '#60a5fa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {isSelectedDiskHasUnallocated ? <Sparkles size={22} /> : <HardDrive size={22} />}
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '800', margin: 0, color: '#f8fafc' }}>
                {isSelectedDiskHasUnallocated ? 'Create New Drive from Unallocated Space' : 'Initialize & Provision Physical Disk'}
              </h3>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, marginTop: '2px' }}>
                {isSelectedDiskHasUnallocated 
                  ? 'Allocate free unallocated space into a fast new NTFS drive (C: and existing data remain 100% safe)'
                  : 'Bring disk online, initialize GPT, partition & format NTFS directly from portal'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="btn btn-ghost btn-sm"
            style={{ color: '#94a3b8', padding: '6px' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* BODY FORM */}
        <form onSubmit={handleSubmit} style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* SERVER SELECTOR */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#cbd5e1', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Server size={14} color="#60a5fa" />
              Target VPS Server Node
            </label>
            <select
              value={selectedServerId}
              onChange={(e) => setSelectedServerId(e.target.value)}
              disabled={isSubmitting}
              className="form-input"
              style={{
                width: '100%',
                backgroundColor: '#1e293b',
                borderColor: 'rgba(255,255,255,0.12)',
                color: '#fff',
                fontSize: '13px',
                height: '38px'
              }}
            >
              {servers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.ipPort})
                </option>
              ))}
            </select>
          </div>

          {/* MODE TOGGLE: CREATE NEW DRIVE vs EXTEND EXISTING DRIVE */}
          {isSelectedDiskHasUnallocated && (
            <div style={{
              display: 'flex',
              background: '#1e293b',
              borderRadius: '10px',
              padding: '4px',
              gap: '6px',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              <button
                type="button"
                onClick={() => setModalMode('CREATE')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: '12.5px',
                  fontWeight: '700',
                  borderRadius: '8px',
                  border: 'none',
                  background: modalMode === 'CREATE' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : 'transparent',
                  color: modalMode === 'CREATE' ? '#ffffff' : '#94a3b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
              >
                <Sparkles size={14} />
                Create New Drive
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalMode('EXTEND');
                  const firstNonC = mountedLetters.find(l => l !== 'C');
                  if (firstNonC) setTargetExtendDrive(firstNonC);
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: '12.5px',
                  fontWeight: '700',
                  borderRadius: '8px',
                  border: 'none',
                  background: modalMode === 'EXTEND' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'transparent',
                  color: modalMode === 'EXTEND' ? '#ffffff' : '#94a3b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
              >
                <ArrowRight size={14} />
                Extend Existing Drive
              </button>
            </div>
          )}

          {/* PHYSICAL DISK SELECTOR */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#cbd5e1', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={14} color="#a78bfa" />
                Select Physical Disk
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                {physicalDisks.length} physical disk(s) detected
              </span>
            </label>

            {physicalDisks.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {physicalDisks.map(d => {
                  const isSelected = String(d.diskNumber) === String(selectedDiskNumber);
                  const isOsDisk = d.diskNumber === 0;
                  const hasUnallocated = (parseFloat(d.unallocatedGB) || 0) > 0.2;
                  // Disk 0 is only disabled IF it has NO unallocated space!
                  const isDisabled = isOsDisk && !hasUnallocated;

                  return (
                    <div
                      key={d.diskNumber}
                      onClick={() => {
                        if (!isDisabled && !isSubmitting) handleDiskSelect(d.diskNumber);
                      }}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: isSelected
                          ? '2px solid #3b82f6'
                          : hasUnallocated
                            ? '1px solid rgba(52, 211, 153, 0.4)'
                            : isDisabled
                              ? '1px solid rgba(255, 255, 255, 0.05)'
                              : '1px solid rgba(255, 255, 255, 0.1)',
                        backgroundColor: isSelected
                          ? 'rgba(59, 130, 246, 0.12)'
                          : hasUnallocated
                            ? 'rgba(52, 211, 153, 0.04)'
                            : isDisabled
                              ? 'rgba(15, 23, 42, 0.5)'
                              : '#1e293b',
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        opacity: isDisabled ? 0.55 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="radio"
                          name="diskRadio"
                          checked={isSelected}
                          disabled={isDisabled || isSubmitting}
                          onChange={() => handleDiskSelect(d.diskNumber)}
                          style={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                        />
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: isSelected ? '#60a5fa' : '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>Disk {d.diskNumber}</span>
                            <span style={{ fontSize: '11.5px', fontWeight: '500', color: '#94a3b8' }}>({d.friendlyName || 'Attached Physical Storage'})</span>
                            {isOsDisk && hasUnallocated && (
                              <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', fontWeight: '700' }}>
                                FREE UNALLOCATED SPACE DETECTED
                              </span>
                            )}
                            {isOsDisk && !hasUnallocated && (
                              <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#f87171', fontWeight: '700' }}>
                                FULLY ALLOCATED (NO FREE SPACE)
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
                            Total: <strong style={{ color: '#fff' }}>{d.totalGB} GB</strong> • Allocated: {d.allocatedGB} GB • Partition: {d.partitionStyle}
                          </div>
                        </div>
                      </div>

                      <div>
                        {hasUnallocated ? (
                          <span style={{ fontSize: '11.5px', padding: '4px 10px', borderRadius: '6px', backgroundColor: 'rgba(16, 185, 129, 0.18)', color: '#34d399', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Sparkles size={13} />
                            {d.unallocatedGB} GB Free
                          </span>
                        ) : d.isOffline ? (
                          <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', fontWeight: '700' }}>
                            Offline
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            Allocated ({d.allocatedGB} GB)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div>
                <input
                  type="number"
                  min="0"
                  max="16"
                  placeholder="Disk Number (e.g. 0 or 1)"
                  value={selectedDiskNumber}
                  onChange={(e) => setSelectedDiskNumber(e.target.value)}
                  disabled={isSubmitting}
                  className="form-input"
                  style={{ width: '100%', backgroundColor: '#1e293b', color: '#fff', fontSize: '13px' }}
                />
              </div>
            )}
          </div>

          {/* DRIVE SELECTION: EXTEND vs CREATE */}
          {modalMode === 'EXTEND' ? (
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#cbd5e1', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <HardDrive size={14} color="#34d399" />
                Select Existing Drive to Extend (Add Free Space)
              </label>
              <select
                value={targetExtendDrive}
                onChange={e => setTargetExtendDrive(e.target.value)}
                disabled={isSubmitting}
                className="form-input"
                style={{
                  width: '100%',
                  backgroundColor: '#1e293b',
                  borderColor: 'rgba(255,255,255,0.12)',
                  color: '#34d399',
                  fontWeight: '700',
                  fontSize: '13px',
                  height: '38px'
                }}
              >
                {mountedLetters.filter(l => l !== 'C').map(l => {
                  const dObj = currentTelem?.disks?.find(d => (d.driveLetter || d.drive || '').toUpperCase().startsWith(l));
                  return (
                    <option key={l} value={l}>
                      Drive {l}: {dObj ? `(${dObj.totalGB} GB Total • ${dObj.freeGB} GB Free)` : ''}
                    </option>
                  );
                })}
              </select>
              <span style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '3px', display: 'block' }}>
                Drive will expand dynamically using unallocated space with zero downtime and zero data loss.
              </span>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#cbd5e1', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={14} color="#34d399" />
                  Target Drive Letter
                </label>
                <select
                  value={driveLetter}
                  onChange={(e) => handleDriveLetterChange(e.target.value)}
                  disabled={isSubmitting}
                  className="form-input"
                  style={{
                    width: '100%',
                    backgroundColor: '#1e293b',
                    borderColor: 'rgba(255,255,255,0.12)',
                    color: '#34d399',
                    fontWeight: '700',
                    fontSize: '13px',
                    height: '38px'
                  }}
                >
                  {availableLetters.map(l => (
                    <option key={l} value={l}>
                      Drive {l}: (Available)
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '3px', display: 'block' }}>
                  Mounted: {mountedLetters.join(':, ')}:
                </span>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#cbd5e1', marginBottom: '6px', display: 'block' }}>
                  NTFS Volume Label
                </label>
                <input
                  type="text"
                  value={volumeLabel}
                  onChange={(e) => setVolumeLabel(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="Data_D"
                  className="form-input"
                  style={{
                    width: '100%',
                    backgroundColor: '#1e293b',
                    borderColor: 'rgba(255,255,255,0.12)',
                    color: '#fff',
                    fontSize: '13px',
                    height: '38px'
                  }}
                />
                <span style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '3px', display: 'block' }}>
                  Filesystem volume name
                </span>
              </div>
            </div>
          )}

          {/* OPTIONAL SIZE OVERRIDE */}
          {isSelectedDiskHasUnallocated && (
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#cbd5e1', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{modalMode === 'EXTEND' ? 'Storage to Add (GB)' : 'Partition Size (GB)'}</span>
                <span style={{ fontSize: '11px', color: '#34d399' }}>
                  Maximum Available: {selectedDiskObj.unallocatedGB} GB
                </span>
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max={selectedDiskObj.unallocatedGB || 5000}
                value={customSizeGB}
                onChange={(e) => setCustomSizeGB(e.target.value)}
                disabled={isSubmitting}
                placeholder={`All (${selectedDiskObj.unallocatedGB} GB)`}
                className="form-input"
                style={{
                  width: '100%',
                  backgroundColor: '#1e293b',
                  borderColor: 'rgba(255,255,255,0.12)',
                  color: '#fff',
                  fontSize: '13px',
                  height: '38px'
                }}
              />
              <span style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '3px', display: 'block' }}>
                Leave as {selectedDiskObj.unallocatedGB} GB to add 100% of the free unallocated space.
              </span>
            </div>
          )}

          {/* SAFETY NOTICE BANNER */}
          <div style={{
            padding: '12px 14px',
            borderRadius: '10px',
            backgroundColor: isSelectedDiskHasUnallocated ? 'rgba(16, 185, 129, 0.08)' : 'rgba(59, 130, 246, 0.08)',
            border: isSelectedDiskHasUnallocated ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(59, 130, 246, 0.25)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px'
          }}>
            <ShieldCheck size={18} color={isSelectedDiskHasUnallocated ? "#34d399" : "#60a5fa"} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '11.5px', color: '#94a3b8', lineHeight: '1.45' }}>
              <strong style={{ color: isSelectedDiskHasUnallocated ? "#34d399" : "#60a5fa" }}>Non-Destructive Space Allocation:</strong> {modalMode === 'EXTEND' 
                ? `Growing Drive ${targetExtendDrive}: dynamically using free unallocated space. All existing files and database folders remain 100% untouched.` 
                : `Exclusively partitions the unallocated free space into Drive ${driveLetter}:. Your existing partitions (including Windows C: and active client drives) are 100% untouched.`}
            </div>
          </div>

          {/* STATUS OR ERROR NOTIFICATIONS */}
          {errorMessage && (
            <div style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#f87171',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertTriangle size={15} style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}

          {statusMessage && (
            <div style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              color: '#34d399',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* ACTIONS */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn btn-secondary"
              style={{ fontSize: '12.5px' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (modalMode === 'CREATE' ? !driveLetter : !targetExtendDrive)}
              className="btn btn-primary"
              style={{
                fontSize: '12.5px',
                gap: '8px',
                background: modalMode === 'EXTEND'
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  : (isSelectedDiskHasUnallocated
                    ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
                    : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'),
                boxShadow: modalMode === 'EXTEND'
                  ? '0 4px 12px rgba(16, 185, 129, 0.3)'
                  : '0 4px 12px rgba(37, 99, 235, 0.3)'
              }}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={14} className="spin-animate" />
                  {modalMode === 'EXTEND' ? `Extending Drive ${targetExtendDrive}:...` : `Creating Drive ${driveLetter}:...`}
                </>
              ) : (
                <>
                  {modalMode === 'EXTEND' ? <ArrowRight size={14} /> : <Sparkles size={14} />}
                  {modalMode === 'EXTEND' ? `Extend Drive ${targetExtendDrive}: Now` : `Create Drive ${driveLetter}: from Free Space`}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

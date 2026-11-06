import React, { useState } from 'react';
import { X, Download, Upload, Database, Check, AlertCircle } from 'lucide-react';

export default function BackupModal({ isOpen, onClose, servers, users, onRestoreData }) {
  const [importedFile, setImportedFile] = useState(null);
  const [restoreStatus, setRestoreStatus] = useState(null);

  if (!isOpen) return null;

  const handleDownloadBackup = () => {
    const backupData = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      system: "Software House VPS Portal",
      servers,
      users
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `SoftwareHouse_Backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed && Array.isArray(parsed.servers) && Array.isArray(parsed.users)) {
          setImportedFile(parsed);
          setRestoreStatus({ type: 'success', msg: `Valid backup file loaded! Contains ${parsed.servers.length} Servers and ${parsed.users.length} Clients.` });
        } else {
          setRestoreStatus({ type: 'error', msg: 'Invalid backup format! File must contain servers and users arrays.' });
        }
      } catch (err) {
        setRestoreStatus({ type: 'error', msg: 'Failed to parse JSON file! Please select a valid backup JSON.' });
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteRestore = () => {
    if (!importedFile) return;
    onRestoreData(importedFile.servers, importedFile.users);
    setRestoreStatus({ type: 'success', msg: 'Database successfully restored from backup!' });
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px' }}>
        <div className="modal-header">
          <div className="modal-title" style={{ color: '#38bdf8' }}>
            <Database size={22} />
            JSON Database Backup & Restore Center
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginTop: '1rem' }}>
          {/* Export / Download Section */}
          <div className="glass-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <h4 style={{ fontSize: '1rem', fontWeight: '700', color: '#f8fafc', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Download size={18} color="#34d399" />
                Export Full Backup
              </h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Download a complete standalone JSON backup of all {servers.length} VPS servers and {users.length} client accounts.
              </p>
            </div>
            <button className="btn btn-primary" style={{ marginTop: '1.25rem', width: '100%', justifyContent: 'center' }} onClick={handleDownloadBackup}>
              <Download size={16} /> Download Backup (.json)
            </button>
          </div>

          {/* Import / Restore Section */}
          <div className="glass-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <h4 style={{ fontSize: '1rem', fontWeight: '700', color: '#f8fafc', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Upload size={18} color="#c084fc" />
                Restore from Backup
              </h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Upload a previously saved `.json` backup file to restore database state.
              </p>
              <input
                type="file"
                accept=".json"
                onChange={handleFileChange}
                style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}
              />
            </div>

            {importedFile && (
              <button className="btn btn-warning" style={{ marginTop: '1.25rem', width: '100%', justifyContent: 'center' }} onClick={handleExecuteRestore}>
                <Check size={16} /> Restore Database Now
              </button>
            )}
          </div>
        </div>

        {restoreStatus && (
          <div style={{
            marginTop: '1.25rem',
            padding: '0.85rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.85rem',
            background: restoreStatus.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: restoreStatus.type === 'success' ? '#6ee7b7' : '#fca5a5',
            border: restoreStatus.type === 'success' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)'
          }}>
            {restoreStatus.type === 'success' ? <Check size={14} style={{ display: 'inline', marginRight: 4 }} /> : <AlertCircle size={14} style={{ display: 'inline', marginRight: 4 }} />}
            {restoreStatus.msg}
          </div>
        )}
      </div>
    </div>
  );
}

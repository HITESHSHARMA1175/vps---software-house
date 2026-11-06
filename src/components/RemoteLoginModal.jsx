import React, { useState } from 'react';
import { X, Monitor, ExternalLink, Copy, Check, ShieldCheck, Download, Server, Terminal, Lock, Key, Globe } from 'lucide-react';

export default function RemoteLoginModal({ isOpen, onClose, user, server }) {
  const [copiedField, setCopiedField] = useState(null);

  if (!isOpen || !user) return null;

  const serverIp = server ? server.ipPort.split(':')[0] : '192.168.1.100';
  const rdpPort = server ? (server.ipPort.split(':')[1] || '3389') : '3389';
  const webLoginUrl = server ? (server.httpUrl || `http://${server.ipPort}`) : `http://${serverIp}:${rdpPort}`;

  const copyToClipboard = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Generate 1-Click .rdp Windows Remote Desktop Connection File
  const handleDownloadRdpFile = () => {
    const rdpContent = [
      `full address:s:${serverIp}:${rdpPort === '8080' ? '3389' : rdpPort}`,
      `username:s:${user.username}`,
      `prompt for credentials:i:0`,
      `screen mode id:i:2`,
      `use multimon:i:0`,
      `desktopwidth:i:1920`,
      `desktopheight:i:1080`,
      `session bpp:i:32`,
      `compression:i:1`,
      `keyboardhook:i:2`,
      `audiocapturemode:i:0`,
      `videoplaybackmode:i:1`,
      `connection type:i:7`,
      `networkautodetect:i:1`,
      `bandwidthautodetect:i:1`,
      `displayconnectionbar:i:1`,
      `enableworkspacereconnect:i:0`,
      `allow font smoothing:i:1`,
      `allow desktop composition:i:1`,
      `disable full window drag:i:0`,
      `disable menu anims:i:0`,
      `disable themes:i:0`,
      `disable wallpaper:i:0`,
      `audiobookingmode:i:0`,
      `authentication level:i:2`,
      `negotiate security layer:i:1`,
      `remoteapplicationmode:i:0`,
      `alternate shell:s:`,
      `shell working directory:s:`
    ].join('\r\n');

    const blob = new Blob([rdpContent], { type: 'application/x-rdp' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${user.username}_${server ? server.name.replace(/\s+/g, '_') : 'VPS'}.rdp`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleLaunchWebPortal = () => {
    window.open(webLoginUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px' }}>
        <div className="modal-header">
          <div className="modal-title" style={{ color: '#34d399' }}>
            <Monitor size={22} />
            Remote VPS Direct Login & Connection Launcher
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Target Server & User Badge */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(52, 211, 153, 0.15), rgba(15, 23, 42, 0.9))',
          border: '1px solid rgba(52, 211, 153, 0.4)',
          borderRadius: 'var(--radius-md)',
          padding: '1rem',
          marginBottom: '1.25rem',
          display: 'flex',
          justify: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '700' }}>
              Target Remote Client Account
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#ffffff', marginTop: '2px' }}>
              {user.company}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', gap: '8px', marginTop: '4px' }}>
              <span>Username: <strong style={{ color: '#34d399' }}>{user.username}</strong></span>
              <span>•</span>
              <span>Node: <strong style={{ color: '#38bdf8' }}>{server ? server.name : 'VPS Server'}</strong></span>
              <span>•</span>
              <span>Drive: <strong style={{ color: '#c084fc' }}>{user.drive}</strong></span>
            </div>
          </div>

          <button
            className="btn btn-primary"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', padding: '0.65rem 1rem' }}
            onClick={handleDownloadRdpFile}
            title="Download 1-Click RDP file to connect directly from Windows"
          >
            <Download size={16} /> 1-Click RDP Connection File
          </button>
        </div>

        {/* Connection Credentials & Quick Copy */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
          <div className="glass-card" style={{ padding: '0.85rem 1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>VPS Server IP & Port</span>
              <button
                style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: '0.75rem' }}
                onClick={() => copyToClipboard(server ? server.ipPort : '192.168.1.100', 'ip')}
              >
                {copiedField === 'ip' ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
              </button>
            </div>
            <div className="font-mono" style={{ fontSize: '1rem', fontWeight: '700', color: '#f8fafc' }}>
              {server ? server.ipPort : '192.168.1.100:8080'}
            </div>
          </div>

          <div className="glass-card" style={{ padding: '0.85rem 1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Remote Username ID</span>
              <button
                style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: '0.75rem' }}
                onClick={() => copyToClipboard(user.username, 'user')}
              >
                {copiedField === 'user' ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
              </button>
            </div>
            <div className="font-mono" style={{ fontSize: '1rem', fontWeight: '700', color: '#34d399' }}>
              {user.username}
            </div>
          </div>
        </div>

        {/* Superclient Admin Credentials */}
        {server && server.superClientPass && (
          <div className="glass-card" style={{ padding: '0.85rem 1rem', marginBottom: '1.25rem', background: 'rgba(9, 14, 26, 0.9)' }}>
            <div style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: '700', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Superclient Admin Password (VPS Node Admin)</span>
              <button
                style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', fontSize: '0.75rem' }}
                onClick={() => copyToClipboard(server.superClientPass, 'pass')}
              >
                {copiedField === 'pass' ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
              </button>
            </div>
            <div className="font-mono" style={{ fontSize: '0.9rem', color: '#fca5a5' }}>
              {server.superClientPass}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          <button
            className="btn btn-primary"
            style={{ background: 'linear-gradient(135deg, #0284c7, #0369a1)', border: 'none' }}
            onClick={handleLaunchWebPortal}
          >
            <Globe size={16} /> Open VPS Web Console ({server ? server.name : 'Web'}) <ExternalLink size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

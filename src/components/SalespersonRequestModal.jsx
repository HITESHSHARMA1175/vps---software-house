import React, { useState, useEffect } from 'react';
import { X, UserPlus, Server, HardDrive, Key, Send, UserCheck, Sparkles, Mail } from 'lucide-react';

export default function SalespersonRequestModal({
  isOpen,
  onClose,
  servers,
  users,
  salesAgents,
  currentUser,
  onSubmitRequest
}) {
  const [formData, setFormData] = useState({
    clientType: 'Shared',
    serverId: servers[0] ? servers[0].id : '',
    drive: '',
    username: '',
    password: 'UserPass#2026',
    company: '',
    expiryDate: '2027-08-14',
    customerPhone: '',
    customerEmail: '',
    assignedEmployee: 'Staff Employee',
    assignedEmail: 'employee@innovationwebworks.com',
    notes: ''
  });

  const staffEmployeesList = [
    { name: 'Staff Employee', email: 'employee@innovationwebworks.com' },
    { name: 'Master Admin (HOD)', email: 'admin@innovationwebworks.com' },
    { name: 'Ops Engineer - Alex', email: 'alex.ops@innovationwebworks.com' },
    { name: 'Ops Tech - Rahul', email: 'rahul.ops@innovationwebworks.com' }
  ];

  const currentServer = servers.find(s => s.id === formData.serverId);
  const availableDrives = currentServer ? (currentServer.availableDrives || []) : ['Drive A', 'Drive B'];

  // Map occupied drives
  const driveUsageMap = {};
  availableDrives.forEach(d => { driveUsageMap[d] = 0; });
  if (formData.serverId && users) {
    users.filter(u => u.serverId === formData.serverId).forEach(u => {
      if (u.drive && driveUsageMap[u.drive] !== undefined) {
        driveUsageMap[u.drive] += 1;
      }
    });
  }

  const emptyDrives = availableDrives.filter(d => driveUsageMap[d] === 0);

  useEffect(() => {
    if (isOpen && servers.length > 0) {
      const defaultSrv = servers[0];
      const srvUsers = users ? users.filter(u => u.serverId === defaultSrv.id) : [];
      const srvDrives = defaultSrv.availableDrives || [];
      const emptyD = srvDrives.find(d => !srvUsers.some(u => u.drive === d)) || srvDrives[0] || 'Drive A';

      setFormData({
        clientType: 'Shared',
        serverId: defaultSrv.id,
        drive: emptyD,
        username: '',
        password: 'UserPass#2026',
        company: '',
        expiryDate: '2027-08-14',
        customerPhone: '',
        customerEmail: '',
        assignedEmployee: staffEmployeesList[0].name,
        assignedEmail: staffEmployeesList[0].email,
        notes: ''
      });
    }
  }, [isOpen, servers]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.username || !formData.company || !formData.serverId || !formData.drive) {
      alert("Please fill all required fields!");
      return;
    }

    const newRequest = {
      id: `req-${Date.now()}`,
      createdAt: new Date().toLocaleString(),
      salesperson: currentUser ? currentUser.username : 'Sales Agent',
      clientType: formData.clientType,
      serverId: formData.serverId,
      serverName: currentServer ? currentServer.name : 'VPS',
      drive: formData.drive,
      username: formData.username,
      password: formData.password,
      company: formData.company,
      expiryDate: formData.expiryDate,
      customerPhone: formData.customerPhone,
      customerEmail: formData.customerEmail,
      assignedEmployee: formData.assignedEmployee,
      assignedEmail: formData.assignedEmail,
      notes: formData.notes,
      status: 'PENDING'
    };

    onSubmitRequest(newRequest);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '720px' }}>
        <div className="modal-header">
          <div className="modal-title" style={{ color: '#ea580c' }}>
            <UserPlus size={22} />
            Submit New VPS Onboarding Request (Innovation Web Works)
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Target VPS Server Node *</label>
              <select
                className="form-input"
                value={formData.serverId}
                onChange={e => {
                  const srvId = e.target.value;
                  const selectedSrv = servers.find(s => s.id === srvId);
                  const srvDrives = selectedSrv ? selectedSrv.availableDrives : [];
                  const emptyD = srvDrives.find(d => (driveUsageMap[d] || 0) === 0) || srvDrives[0] || '';
                  setFormData({ ...formData, serverId: srvId, drive: emptyD });
                }}
              >
                {servers.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.ipPort})</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Select Drive Allocation *</label>
              <select
                className="form-input"
                value={formData.drive}
                onChange={e => setFormData({ ...formData, drive: e.target.value })}
                style={{ fontWeight: '600', borderColor: (driveUsageMap[formData.drive] || 0) === 0 ? '#34d399' : undefined }}
              >
                {availableDrives.map(d => {
                  const count = driveUsageMap[d] || 0;
                  return (
                    <option key={d} value={d}>
                      {count === 0 ? `🟢 ${d} [EMPTY / FREE]` : `🔴 ${d} (${count} Client - Occupied)`}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">New Username / ID *</label>
              <input
                type="text"
                className="form-input"
                required
                placeholder="e.g. client_cloud_user"
                value={formData.username}
                onChange={e => setFormData({ ...formData, username: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Set User Password *</label>
              <input
                type="text"
                className="form-input"
                required
                placeholder="UserPass#2026"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Company Name *</label>
              <input
                type="text"
                className="form-input"
                required
                placeholder="Acme Enterprise Ltd"
                value={formData.company}
                onChange={e => setFormData({ ...formData, company: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Subscription Expiry Date *</label>
              <input
                type="date"
                className="form-input"
                required
                value={formData.expiryDate}
                onChange={e => setFormData({ ...formData, expiryDate: e.target.value })}
              />
            </div>

            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label" style={{ color: '#ea580c', fontWeight: '700' }}>
                👤 Assign To Staff Member for Creation & Email Notification *
              </label>
              <select
                className="form-input"
                style={{ borderColor: 'var(--primary-border)', backgroundColor: 'var(--bg-surface-elevated)' }}
                value={formData.assignedEmployee}
                onChange={e => {
                  const empName = e.target.value;
                  const matched = staffEmployeesList.find(item => item.name === empName);
                  setFormData({
                    ...formData,
                    assignedEmployee: empName,
                    assignedEmail: matched ? matched.email : 'employee@innovationwebworks.com'
                  });
                }}
              >
                {staffEmployeesList.map(emp => (
                  <option key={emp.name} value={emp.name}>
                    👤 {emp.name} ({emp.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Customer Phone</label>
              <input
                type="text"
                className="form-input"
                placeholder="+91 9000000000"
                value={formData.customerPhone}
                onChange={e => setFormData({ ...formData, customerPhone: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Customer Email</label>
              <input
                type="email"
                className="form-input"
                placeholder="client@acme.sample"
                value={formData.customerEmail}
                onChange={e => setFormData({ ...formData, customerEmail: e.target.value })}
              />
            </div>
          </div>

          <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Mail size={14} color="#34d399" /> Automatic email notification to {formData.assignedEmail}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" style={{ backgroundColor: '#ea580c', borderColor: '#f97316' }}>
                <Send size={15} /> Assign & Submit Request
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

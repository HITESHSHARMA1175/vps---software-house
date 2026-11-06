import React, { useState, useEffect } from 'react';
import { X, Users, Lock, Mail, Shield, CheckCircle2 } from 'lucide-react';

export default function EmployeeModal({
  isOpen,
  onClose,
  onSaveEmployee,
  initialEmployee = null
}) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('EMPLOYEE');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (initialEmployee) {
      setName(initialEmployee.name || '');
      setUsername(initialEmployee.username || '');
      setEmail(initialEmployee.email || '');
      setRole(initialEmployee.role || 'EMPLOYEE');
      setPassword('');
    } else {
      setName('');
      setUsername('');
      setEmail('mannk4811@gmail.com');
      setRole('EMPLOYEE');
      setPassword('');
    }
    setError(null);
  }, [initialEmployee, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !username.trim()) {
      setError('Name and Username are required.');
      return;
    }
    if (!initialEmployee) {
      if (!password.trim()) {
        setError('Password is required for new employees.');
        return;
      }
      if (password.trim().length < 12) {
        setError('Security Policy: Password must be at least 12 characters long.');
        return;
      }
    } else if (password && password.trim().length < 12) {
      setError('Security Policy: New password must be at least 12 characters long.');
      return;
    }

    const payload = {
      name: name.trim(),
      username: username.trim().toLowerCase(),
      email: email.trim(),
      role,
      password: password ? password.trim() : undefined
    };

    onSaveEmployee(payload);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '480px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={20} color="#38bdf8" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#ffffff', margin: 0 }}>
              {initialEmployee ? 'Edit Staff Employee' : 'Create Staff Employee Account'}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div style={{ backgroundColor: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fda4af', padding: '0.65rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
              FULL NAME *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Rahul Sharma"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '0.55rem 0.85rem',
                color: '#ffffff',
                fontSize: '0.84rem'
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
              USERNAME (LOGIN ID) *
            </label>
            <input
              type="text"
              required
              disabled={!!initialEmployee}
              placeholder="e.g. rahul_sales"
              value={username}
              onChange={e => setUsername(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: initialEmployee ? 'rgba(0, 0, 0, 0.3)' : 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '0.55rem 0.85rem',
                color: '#ffffff',
                fontSize: '0.84rem'
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
              OFFICIAL EMAIL ADDRESS
            </label>
            <input
              type="email"
              placeholder="mannk4811@gmail.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '0.55rem 0.85rem',
                color: '#ffffff',
                fontSize: '0.84rem'
              }}
            />
          </div>

          {!initialEmployee && (
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                INITIAL PASSWORD (AUTO-HASHED VIA BCRYPT) *
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '0.55rem 0.85rem',
                  color: '#ffffff',
                  fontSize: '0.84rem'
                }}
              />
            </div>
          )}

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: '700', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
              ROLE & ACCESS LEVEL *
            </label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '0.55rem 0.85rem',
                color: '#ffffff',
                fontSize: '0.84rem'
              }}
            >
              <option value="EMPLOYEE">👤 Staff Employee (Standard Operations)</option>
              <option value="SALESPERSON">💼 Sales Representative (Client Requests)</option>
              <option value="SUPER_ADMIN">👑 Super Administrator (Full Management)</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#cbd5e1',
                padding: '0.55rem 1rem',
                borderRadius: '8px',
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                background: 'linear-gradient(135deg, #38bdf8, #2563eb)',
                border: 'none',
                color: '#ffffff',
                padding: '0.55rem 1.25rem',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
              }}
            >
              {initialEmployee ? 'Save Changes' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

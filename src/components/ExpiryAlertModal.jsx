import React, { useState } from 'react';
import { X, AlertTriangle, Send, Copy, Check, MessageSquare, Mail, UserCheck } from 'lucide-react';
import { getDaysRemaining } from './UserTable';

export default function ExpiryAlertModal({ isOpen, onClose, users, servers }) {
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [activeTab, setActiveTab] = useState('SALES'); // 'ADMIN', 'SALES', 'CUSTOMER'

  if (!isOpen) return null;

  // Filter users expiring in 10-15 days or <= 15 days
  const expiring15Users = users.filter(u => {
    const days = getDaysRemaining(u.expiryDate);
    return days >= 0 && days <= 15;
  }).sort((a, b) => getDaysRemaining(a.expiryDate) - getDaysRemaining(b.expiryDate));

  // Group by sales agent
  const groupedByAgent = expiring15Users.reduce((acc, user) => {
    const agent = user.salesAgent || 'Unassigned';
    if (!acc[agent]) acc[agent] = [];
    acc[agent].push(user);
    return acc;
  }, {});

  const copyToClipboard = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '850px' }}>
        <div className="modal-header">
          <div className="modal-title" style={{ color: '#f59e0b' }}>
            <AlertTriangle size={22} />
            10–15 Days Subscription Expiry Alert Center
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
          Alerts for clients whose VPS subscriptions are expiring within the next <strong>10–15 days</strong>. Notifications are automatically prepared for <strong>Admin</strong>, <strong>Sales Agent</strong>, and <strong>Customer</strong>.
        </p>

        {/* Tab Navigation */}
        <div className="filter-group" style={{ marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
          <button
            className={`btn ${activeTab === 'SALES' ? 'btn-warning' : 'btn-secondary'}`}
            onClick={() => setActiveTab('SALES')}
          >
            <UserCheck size={16} /> Sales Representative Alerts ({expiring15Users.length})
          </button>
          <button
            className={`btn ${activeTab === 'CUSTOMER' ? 'btn-warning' : 'btn-secondary'}`}
            onClick={() => setActiveTab('CUSTOMER')}
          >
            <Mail size={16} /> Direct Customer Reminders
          </button>
          <button
            className={`btn ${activeTab === 'ADMIN' ? 'btn-warning' : 'btn-secondary'}`}
            onClick={() => setActiveTab('ADMIN')}
          >
            <MessageSquare size={16} /> Admin Summary Notice
          </button>
        </div>

        {expiring15Users.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            🎉 No subscriptions expiring in the 10–15 days window right now.
          </div>
        ) : (
          <div>
            {/* SALES AGENT ALERTS TAB */}
            {activeTab === 'SALES' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {Object.entries(groupedByAgent).map(([agent, agentUsers], idx) => {
                  const agentMessage = `📌 *EXPIRY ALERT FOR SALES REPRESENTATIVE: ${agent.toUpperCase()}*\n` +
                    `Hello ${agent}, the following ${agentUsers.length} client(s) assigned to you have subscriptions expiring in 10-15 days:\n\n` +
                    agentUsers.map(u => {
                      const days = getDaysRemaining(u.expiryDate);
                      const s = servers.find(srv => srv.id === u.serverId);
                      return `• *${u.company}* (${u.username})\n  Server: ${s ? s.name : u.serverId} (${u.drive})\n  Allocation: ${u.clientType || 'Shared'}\n  Expiry Date: ${u.expiryDate} (${days} Days Left)\n`;
                    }).join('\n') +
                    `\nPlease coordinate with clients for timely subscription renewal.`;

                  const encodedWA = encodeURIComponent(agentMessage);

                  return (
                    <div key={agent} className="glass-card" style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <div>
                          <strong style={{ fontSize: '1rem', color: '#f8fafc' }}>👨‍💼 Sales Representative: {agent}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {agentUsers.length} Client(s) Expiring Soon
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <a
                            href={`https://wa.me/?text=${encodedWA}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary"
                            style={{ background: '#25D366', color: '#000', fontWeight: '700', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                          >
                            <Send size={14} /> Send WhatsApp Alert
                          </a>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                            onClick={() => copyToClipboard(agentMessage, `agent-${idx}`)}
                          >
                            {copiedIndex === `agent-${idx}` ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                            {copiedIndex === `agent-${idx}` ? 'Copied!' : 'Copy Text'}
                          </button>
                        </div>
                      </div>

                      <div className="email-preview-box">
                        {agentMessage}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* CUSTOMER DIRECT MESSAGES TAB */}
            {activeTab === 'CUSTOMER' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {expiring15Users.map((u, idx) => {
                  const days = getDaysRemaining(u.expiryDate);
                  const server = servers.find(s => s.id === u.serverId);
                  const custMessage = `Dear ${u.company} (${u.username}),\n\n` +
                    `This is an advance notification that your Cloud Server subscription (${server ? server.name : 'VPS'} - ${u.drive}) will expire on ${u.expiryDate} (${days} days remaining).\n\n` +
                    `• Allocation Type: ${u.clientType || 'Shared'}\n` +
                    `• Assigned Representative: ${u.salesAgent}\n\n` +
                    `To ensure uninterrupted cloud service access, kindly process your subscription renewal before the expiry date.\n\n` +
                    `Thank you,\n` +
                    `Software House VPS Operations Team`;

                  return (
                    <div key={u.id} className="glass-card" style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <div>
                          <strong style={{ fontSize: '0.95rem', color: '#38bdf8' }}>{u.company}</strong> ({u.username})
                          <span className="badge badge-warning" style={{ marginLeft: '8px' }}>
                            {days} Days Left
                          </span>
                        </div>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                          onClick={() => copyToClipboard(custMessage, `cust-${idx}`)}
                        >
                          {copiedIndex === `cust-${idx}` ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                          {copiedIndex === `cust-${idx}` ? 'Copied' : 'Copy Message'}
                        </button>
                      </div>
                      <div className="email-preview-box">
                        {custMessage}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ADMIN NOTICE TAB */}
            {activeTab === 'ADMIN' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <strong>📢 System Admin Master Notice (10-15 Day Expiry Window)</strong>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      const adminMsg = `🚨 *ADMIN ALERT: 10-15 DAY SUBSCRIPTION EXPIRIES*\n\n` +
                        expiring15Users.map(u => `• ${u.company} | ${u.username} | ${u.expiryDate} (${getDaysRemaining(u.expiryDate)}d left) | Agent: ${u.salesAgent}`).join('\n') +
                        `\n\nTotal Accounts Expiring: ${expiring15Users.length}`;
                      copyToClipboard(adminMsg, 'admin-all');
                    }}
                  >
                    {copiedIndex === 'admin-all' ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                    {copiedIndex === 'admin-all' ? 'Copied Admin Report!' : 'Copy Complete Admin Summary'}
                  </button>
                </div>
                <div className="email-preview-box" style={{ maxHeight: '350px' }}>
                  {`🚨 ADMIN NOTICE: 10-15 DAY SUBSCRIPTION EXPIRIES\nTotal Accounts Expiring: ${expiring15Users.length}\n\n` +
                    expiring15Users.map(u => `[${u.expiryDate}] ${u.company} (${u.username}) -> Server: ${u.drive} | Agent: ${u.salesAgent}`).join('\n')}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { X, Mail, Copy, Check, Calendar, Download, Send, Lock, Key, AlertCircle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { getDaysRemaining } from './UserTable';

export default function MasterMailModal({ isOpen, onClose, users, servers }) {
  const [selectedMonth, setSelectedMonth] = useState('2026-08'); // YYYY-MM
  const [copied, setCopied] = useState(false);

  // Real Email Dispatch States with User's Gmail App Password
  const [senderEmail, setSenderEmail] = useState('mannk4811@gmail.com');
  const [emailPassword, setEmailPassword] = useState('cpli fpil mgua mhhl');
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [isSendingEmails, setIsSendingEmails] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState(null);

  if (!isOpen) return null;

  // Filter users expiring in the selected month
  const monthlyExpiringUsers = users.filter(u => {
    if (!u.expiryDate) return false;
    return u.expiryDate.startsWith(selectedMonth);
  }).sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || ''));

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const [yearStr, monthNumStr] = selectedMonth.split('-');
  const monthName = monthNames[parseInt(monthNumStr) - 1] || 'Selected Month';

  // Generate Master Mail Text
  const masterMailText = `Subject: Master Expiry Report - VPS Subscriptions (${monthName} ${yearStr})\n\n` +
    `Dear Operations Team & Management,\n\n` +
    `Please find below the consolidated master subscription expiry report for ${monthName} ${yearStr}:\n\n` +
    `--------------------------------------------------------------------------------\n` +
    `SUMMARY METRICS:\n` +
    `• Target Month: ${monthName} ${yearStr}\n` +
    `• Total Expiring Subscriptions: ${monthlyExpiringUsers.length}\n` +
    `--------------------------------------------------------------------------------\n\n` +
    `DETAILED CLIENT LIST:\n` +
    (monthlyExpiringUsers.length === 0 ? `(No subscriptions expiring in ${monthName} ${yearStr})\n` :
      monthlyExpiringUsers.map((u, idx) => {
        const srv = servers.find(s => s.id === u.serverId);
        return `${idx + 1}. ${u.company} (${u.username})\n` +
               `   • Expiry Date: ${u.expiryDate} (${getDaysRemaining(u.expiryDate)} days remaining)\n` +
               `   • Server & Drive: ${srv ? srv.name : u.serverId} (${u.drive})\n` +
               `   • Allocation: ${u.clientType || 'Shared'}\n` +
               `   • Sales Representative: ${u.salesAgent}\n` +
               `   • Contact: ${u.customerPhone || 'N/A'} | ${u.customerEmail || 'N/A'}\n`;
      }).join('\n')) +
    `\nRegards,\n` +
    `Innovation Web Works VPS Operations Team`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(masterMailText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "Expiry Date,Company Name,Username,VPS Server,Drive,Allocation Type,Sales Agent,Phone,Email\n";

    monthlyExpiringUsers.forEach(u => {
      const srv = servers.find(s => s.id === u.serverId);
      const row = [
        u.expiryDate,
        `"${u.company.replace(/"/g, '""')}"`,
        u.username,
        srv ? srv.name : u.serverId,
        u.drive,
        u.clientType || 'Shared',
        u.salesAgent,
        u.customerPhone || '',
        u.customerEmail || ''
      ].join(",");
      csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Master_Expiry_Report_${monthName}_${yearStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Real Automated Email Dispatch API Trigger
  const handleDispatchRealEmails = async () => {
    const clientsWithEmail = monthlyExpiringUsers.filter(u => u.customerEmail && u.customerEmail.includes('@'));

    if (clientsWithEmail.length === 0) {
      alert("No clients with valid email addresses found for this month!");
      return;
    }

    if (!emailPassword) {
      alert("Please enter your SMTP App Password / API Key to authorize sending emails!");
      return;
    }

    setIsSendingEmails(true);
    setDispatchStatus({ sentCount: 0, totalCount: clientsWithEmail.length, currentTarget: 'Starting...' });

    let sentSuccess = 0;
    let failedCount = 0;

    for (let i = 0; i < clientsWithEmail.length; i++) {
      const client = clientsWithEmail[i];
      const srv = servers.find(s => s.id === client.serverId);
      const days = getDaysRemaining(client.expiryDate);

      setDispatchStatus({
        sentCount: i,
        totalCount: clientsWithEmail.length,
        currentTarget: `${client.company} (${client.customerEmail})`
      });

      const clientHtmlBody = `
        <div style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 20px; color: #1e293b;">
          <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 10px; padding: 30px; border: 1px solid #e2e8f0;">
            <h2 style="color: #ea580c; margin-top: 0;">Innovation Web Works VPS Subscription Renewal Notice</h2>
            <p>Dear <strong>${client.company}</strong>,</p>
            <p>Your VPS Cloud Subscription node <strong>${srv ? srv.name : 'VPS Server'}</strong> (${client.drive}) is set to expire on <strong>${client.expiryDate}</strong> (${days} days remaining).</p>
            <div style="background-color: #fff7ed; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #ffedd5;">
              <p style="margin: 4px 0;"><strong>Username Account:</strong> ${client.username}</p>
              <p style="margin: 4px 0;"><strong>Node Drive:</strong> ${client.drive}</p>
              <p style="margin: 4px 0;"><strong>Expiry Date:</strong> ${client.expiryDate}</p>
            </div>
            <p>Please contact your Account Manager <strong>${client.salesAgent}</strong> to ensure uninterrupted operations.</p>
            <p style="font-size: 12px; color: #64748b; margin-top: 30px;">Designed & Developed by Innovation Web Works</p>
          </div>
        </div>
      `;

      try {
        const res = await fetch('http://localhost:5000/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: client.customerEmail,
            subject: `VPS Subscription Renewal Notice: ${client.company} (Expires ${client.expiryDate})`,
            htmlText: clientHtmlBody,
            senderEmail,
            emailPassword,
            smtpHost
          })
        });

        const data = await res.json();
        if (data.success) {
          sentSuccess++;
        } else {
          failedCount++;
        }
      } catch (err) {
        failedCount++;
      }
    }

    setIsSendingEmails(false);
    setDispatchStatus({
      done: true,
      sentSuccess,
      failedCount,
      totalCount: clientsWithEmail.length
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '850px' }}>
        <div className="modal-header">
          <div className="modal-title" style={{ color: '#ea580c' }}>
            <Mail size={22} />
            Master Monthly Expiry Mailer & Gmail Automated Email Dispatch
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Gmail App Password Authorization Box */}
        <div className="glass-card" style={{ padding: '1rem', marginBottom: '1.25rem', backgroundColor: 'var(--bg-surface-elevated)' }}>
          <strong style={{ fontSize: '0.88rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.75rem' }}>
            <Sparkles size={16} color="#34d399" /> Gmail SMTP App Password Configured (Innovation Web Works)
          </strong>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">SMTP Server Host</label>
              <input
                type="text"
                className="form-input"
                value={smtpHost}
                onChange={e => setSmtpHost(e.target.value)}
                placeholder="smtp.gmail.com"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Sender Email Address *</label>
              <input
                type="email"
                className="form-input"
                value={senderEmail}
                onChange={e => setSenderEmail(e.target.value)}
                placeholder="support@innovationwebworks.com"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Gmail App Password *</label>
              <input
                type="text"
                className="form-input"
                style={{ color: '#34d399', fontWeight: '700' }}
                value={emailPassword}
                onChange={e => setEmailPassword(e.target.value)}
                placeholder="cpli fpil mgua mhhl"
              />
            </div>
          </div>
        </div>

        {/* Live Dispatch Progress Banner */}
        {dispatchStatus && (
          <div style={{
            backgroundColor: dispatchStatus.done ? 'var(--accent-emerald-bg)' : 'var(--primary-subtle)',
            border: dispatchStatus.done ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--primary-border)',
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem 1rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justify: 'space-between'
          }}>
            {dispatchStatus.done ? (
              <div style={{ color: '#34d399', fontWeight: '700', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={18} /> Successfully dispatched {dispatchStatus.sentSuccess} real emails to clients ({dispatchStatus.failedCount} failed)!
              </div>
            ) : (
              <div style={{ color: '#a5b4fc', fontWeight: '700', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Loader2 size={16} className="animate-spin" /> Dispatching email to: {dispatchStatus.currentTarget}...
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label className="form-label" style={{ margin: 0 }}>Select Report Month:</label>
            <input
              type="month"
              className="form-input"
              style={{ padding: '0.4rem 0.75rem' }}
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={downloadCSV}>
              <Download size={14} /> Export CSV
            </button>

            <button className="btn btn-secondary" onClick={copyToClipboard}>
              {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy Master Mail'}
            </button>

            <button
              className="btn btn-primary"
              style={{ background: 'linear-gradient(135deg, #ea580c, #c2410c)', border: 'none' }}
              onClick={handleDispatchRealEmails}
              disabled={isSendingEmails}
            >
              {isSendingEmails ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {isSendingEmails ? 'Dispatching...' : `Dispatch Real Emails to All (${monthlyExpiringUsers.filter(u => u.customerEmail).length})`}
            </button>
          </div>
        </div>

        {/* Master Mail Draft Preview Box */}
        <div className="email-preview-box" style={{ maxHeight: '350px' }}>
          {masterMailText}
        </div>
      </div>
    </div>
  );
}

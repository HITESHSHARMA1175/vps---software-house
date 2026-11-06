import React, { useState, useMemo } from 'react';
import {
  Ticket,
  Search,
  Filter,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Radio,
  User,
  HardDrive,
  MessageCircle,
  Mail,
  Edit2,
  Trash2,
  ArrowRight,
  ShieldCheck,
  Send,
  Zap,
  Check,
  RotateCcw,
  Sparkles,
  Mic,
  MicOff,
  Volume2,
  Copy,
  ExternalLink,
  PhoneCall,
  FileText,
  Eye
} from 'lucide-react';
import { translateHinglishToEnglish } from '../../utils/nlpTranslate';

const EMPTY_ARRAY = [];

const getPriorityBadge = (priority) => {
  switch (priority) {
    case 'URGENT':
      return { bg: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e', border: 'rgba(244, 63, 94, 0.3)', label: '🔴 Urgent' };
    case 'HIGH':
      return { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)', label: '🟠 High' };
    case 'MEDIUM':
      return { bg: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: 'rgba(56, 189, 248, 0.3)', label: '🔵 Medium' };
    default:
      return { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: 'rgba(16, 185, 129, 0.3)', label: '🟢 Low' };
  }
};

const getStatusBadge = (status) => {
  switch (status) {
    case 'OPEN':
      return { bg: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)', label: '🟡 Open' };
    case 'IN_PROGRESS':
      return { bg: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: 'rgba(56, 189, 248, 0.3)', label: '🔵 In Progress' };
    case 'RESOLVED':
      return { bg: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: 'rgba(16, 185, 129, 0.3)', label: '🟢 Resolved' };
    case 'CLOSED':
      return { bg: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', border: 'rgba(148, 163, 184, 0.3)', label: '⚫ Closed' };
    default:
      return { bg: 'rgba(255, 255, 255, 0.05)', color: '#cbd5e1', border: 'rgba(255, 255, 255, 0.1)', label: status };
  }
};

export default function TicketsView({
  tickets = EMPTY_ARRAY,
  servers = EMPTY_ARRAY,
  users = EMPTY_ARRAY,
  employees = EMPTY_ARRAY,
  currentUser,
  onOpenRaiseTicket,
  onUpdateTicket,
  onDeleteTicket,
  onDirectRemoteConnect
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [serverFilter, setServerFilter] = useState('ALL');
  const [assignedFilter, setAssignedFilter] = useState('ALL');

  // Modal for inspecting ticket details, problem query & resolution
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [modalStatus, setModalStatus] = useState('OPEN');
  const [modalPriority, setModalPriority] = useState('MEDIUM');
  const [modalAssignedTo, setModalAssignedTo] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isSavingModal, setIsSavingModal] = useState(false);
  const [voiceLang, setVoiceLang] = useState('hi-IN');
  const [isListeningRes, setIsListeningRes] = useState(false);
  const [isTranslatingRes, setIsTranslatingRes] = useState(false);

  const handleConvertResolution = async () => {
    if (!resolutionNotes) return;
    setIsTranslatingRes(true);
    try {
      const converted = await translateHinglishToEnglish(resolutionNotes);
      setResolutionNotes(converted);
    } finally {
      setIsTranslatingRes(false);
    }
  };

  // Computed KPIs
  const totalCount = tickets.length;
  const openCount = tickets.filter(t => t.status === 'OPEN').length;
  const inProgressCount = tickets.filter(t => t.status === 'IN_PROGRESS').length;
  const resolvedCount = tickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED').length;
  const urgentCount = tickets.filter(t => t.priority === 'URGENT' && t.status !== 'RESOLVED' && t.status !== 'CLOSED').length;
  const unclaimedCount = tickets.filter(t => t.status === 'OPEN' && (!t.assignedTo || t.assignedTo === 'Unassigned' || t.assignedTo === 'Staff')).length;

  const handleClaimTicket = async (ticketId) => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/claim`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok && data.success && data.ticket) {
        onUpdateTicket(ticketId, data.ticket);
      }
    } catch (e) {
      console.error("Error claiming ticket:", e);
    }
  };

  // Filtered List
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      if (statusFilter === 'UNCLAIMED') {
        return t.status === 'OPEN' && (!t.assignedTo || t.assignedTo === 'Unassigned' || t.assignedTo === 'Staff');
      }
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'ALL' && t.priority !== priorityFilter) return false;
      if (serverFilter !== 'ALL' && t.serverId !== serverFilter) return false;
      if (assignedFilter !== 'ALL' && t.assignedTo !== assignedFilter) return false;

      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matches =
          (t.id || '').toLowerCase().includes(q) ||
          (t.company || '').toLowerCase().includes(q) ||
          (t.clientName || '').toLowerCase().includes(q) ||
          (t.subject || '').toLowerCase().includes(q) ||
          (t.issueCategory || '').toLowerCase().includes(q) ||
          (t.assignedTo || '').toLowerCase().includes(q) ||
          (t.customerPhone || '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [tickets, statusFilter, priorityFilter, serverFilter, assignedFilter, searchTerm]);

  const startVoiceTyping = async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice typing is supported on Google Chrome, Microsoft Edge, and modern mobile browsers. Please allow microphone access.');
      return;
    }

    if (isListeningRes) {
      setIsListeningRes(false);
      return;
    }

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch (permErr) {
      if (permErr.name === 'NotAllowedError' || permErr.name === 'PermissionDeniedError') {
        alert('🎙️ Microphone access was blocked. Please allow microphone access in your browser.');
        return;
      }
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = voiceLang || 'hi-IN';
      recognition.continuous = true;
      recognition.interimResults = true;

      const baseText = resolutionNotes ? resolutionNotes.trim() : '';

      recognition.onstart = () => {
        setIsListeningRes(true);
      };

      recognition.onresult = (event) => {
        let finalChunk = '';
        let interimChunk = '';

        for (let i = 0; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalChunk += event.results[i][0].transcript + ' ';
          } else {
            interimChunk += event.results[i][0].transcript;
          }
        }

        const currentSpoken = (finalChunk + interimChunk).trim();
        if (currentSpoken) {
          setResolutionNotes(baseText ? `${baseText} ${currentSpoken}` : currentSpoken);
        }
      };

      recognition.onerror = () => {
        setIsListeningRes(false);
      };

      recognition.onend = () => {
        setIsListeningRes(false);
      };

      recognition.start();
    } catch (e) {
      console.error("SpeechRecognition error:", e);
      setIsListeningRes(false);
    }
  };

  const handleOpenResolveModal = (ticket) => {
    setSelectedTicket(ticket);
    setModalStatus(ticket.status || 'OPEN');
    setModalPriority(ticket.priority || 'MEDIUM');
    setModalAssignedTo(ticket.assignedTo || '');
    setResolutionNotes(ticket.resolutionNotes || '');
    setIsCopied(false);
  };

  const handleSaveTicketModal = async () => {
    if (!selectedTicket) return;
    setIsSavingModal(true);
    try {
      const isNowResolved = (modalStatus === 'RESOLVED' || modalStatus === 'CLOSED');
      const updates = {
        status: modalStatus,
        priority: modalPriority,
        assignedTo: modalAssignedTo || (modalStatus === 'IN_PROGRESS' || isNowResolved ? (currentUser?.name || currentUser?.username || 'Staff') : 'Unassigned'),
        resolutionNotes: resolutionNotes.trim()
      };
      await onUpdateTicket(selectedTicket.id, updates);
      setSelectedTicket(null);
    } catch (e) {
      console.error("Error saving ticket modal:", e);
    } finally {
      setIsSavingModal(false);
    }
  };

  const copyTicketSummary = (ticket) => {
    const summary = `[${ticket.id}] Support Ticket Details\n` +
      `Client: ${ticket.company} (${ticket.clientName || ''})\n` +
      `Server: ${ticket.serverName || 'VPS'} (${ticket.drive})\n` +
      `Phone: ${ticket.customerPhone || 'N/A'} | Email: ${ticket.customerEmail || 'N/A'}\n` +
      `Category: ${ticket.issueCategory} | Priority: ${ticket.priority} | Status: ${ticket.status}\n` +
      `Subject: ${ticket.subject}\n` +
      (ticket.description ? `Description: ${ticket.description}\n` : '') +
      (ticket.resolutionNotes ? `Resolution: ${ticket.resolutionNotes}\n` : '') +
      `Assigned: ${ticket.assignedTo || 'Unassigned'}\n` +
      `Created At: ${ticket.createdAt || 'Recent'}`;

    navigator.clipboard.writeText(summary);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleQuickStatusChange = async (ticket, newStatus) => {
    if (newStatus === 'RESOLVED') {
      handleOpenResolveModal(ticket);
    } else {
      await onUpdateTicket(ticket.id, { status: newStatus });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* 1. Header Banner & Action */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Ticket size={20} color="var(--primary)" />
            <h1 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em' }}>
              Support Helpdesk & Tickets
            </h1>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
            Log customer issues, assign technical staff, and automatically notify clients via Email & WhatsApp.
          </p>
        </div>

        <button
          onClick={() => onOpenRaiseTicket(null)}
          className="btn btn-primary btn-sm"
        >
          <Plus size={14} /> Raise Support Ticket
        </button>
      </div>

      {/* 🚨 Unclaimed Customer Tickets Alert Banner */}
      {unclaimedCount > 0 && (
        <div style={{
          backgroundColor: 'var(--accent-rose-bg)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 'var(--radius-lg)',
          padding: '10px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={18} color="var(--accent-rose)" />
            <div>
              <div style={{ color: 'var(--accent-rose)', fontSize: '13px', fontWeight: '700' }}>
                {unclaimedCount} Unclaimed Customer Ticket{unclaimedCount > 1 ? 's' : ''} in Pending Queue!
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                Customers are awaiting engineer response. Claim a ticket to begin diagnosing.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'UNCLAIMED' ? 'ALL' : 'UNCLAIMED')}
            className="btn btn-secondary btn-sm"
            style={{ color: 'var(--accent-rose)', borderColor: 'rgba(239, 68, 68, 0.4)' }}
          >
            <Zap size={12} /> {statusFilter === 'UNCLAIMED' ? 'Showing Unclaimed' : `Filter Unclaimed (${unclaimedCount})`}
          </button>
        </div>
      )}

      {/* 2. Top Bento KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px'
      }}>
        {/* Total Tickets */}
        <div className="surface-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>Total Tickets</span>
            <Ticket size={14} />
          </div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>
            {totalCount}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Lifetime client tickets
          </div>
        </div>

        {/* Unclaimed Customer Queue */}
        <div className="surface-card" style={{
          backgroundColor: unclaimedCount > 0 ? 'var(--accent-rose-bg)' : 'var(--bg-surface)',
          borderColor: unclaimedCount > 0 ? 'rgba(239, 68, 68, 0.3)' : 'var(--border-default)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: unclaimedCount > 0 ? 'var(--accent-rose)' : 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>Unclaimed Queue</span>
            <Zap size={14} />
          </div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: unclaimedCount > 0 ? 'var(--accent-rose)' : 'var(--text-primary)', marginTop: '4px' }}>
            {unclaimedCount}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Pending staff assignment
          </div>
        </div>

        {/* Open / Pending */}
        <div className="surface-card" style={{
          backgroundColor: openCount > 0 ? 'var(--accent-amber-bg)' : 'var(--bg-surface)',
          borderColor: openCount > 0 ? 'rgba(245, 158, 11, 0.3)' : 'var(--border-default)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: openCount > 0 ? 'var(--accent-amber)' : 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>Open</span>
            <Clock size={14} />
          </div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: openCount > 0 ? 'var(--accent-amber)' : 'var(--text-primary)', marginTop: '4px' }}>
            {openCount}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Awaiting action
          </div>
        </div>

        {/* In Progress */}
        <div className="surface-card" style={{
          backgroundColor: inProgressCount > 0 ? 'var(--accent-blue-bg)' : 'var(--bg-surface)',
          borderColor: inProgressCount > 0 ? 'rgba(56, 189, 248, 0.3)' : 'var(--border-default)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: inProgressCount > 0 ? '#38bdf8' : 'var(--text-muted)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>In Progress</span>
            <Radio size={14} />
          </div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: inProgressCount > 0 ? '#38bdf8' : 'var(--text-primary)', marginTop: '4px' }}>
            {inProgressCount}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Under troubleshooting
          </div>
        </div>

        {/* Resolved */}
        <div className="surface-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-emerald)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <span>Resolved</span>
            <CheckCircle2 size={14} />
          </div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: 'var(--accent-emerald)', marginTop: '4px' }}>
            {resolvedCount}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Successfully closed
          </div>
        </div>
      </div>

      {/* 3. Search & Filter Toolbar */}
      <div className="surface-card" style={{
        padding: '10px 14px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Search Input */}
        <div style={{ position: 'relative', minWidth: '240px', flex: '1' }}>
          <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search Ticket ID, Company, Issue, Phone..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="input"
            style={{ height: '34px', paddingLeft: '30px', fontSize: '12px' }}
          />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="select"
            style={{ width: 'auto', minWidth: '130px', height: '34px', fontSize: '12px' }}
          >
            <option value="ALL">All Statuses ({totalCount})</option>
            <option value="UNCLAIMED">🚨 Unclaimed Pool ({unclaimedCount})</option>
            <option value="OPEN">Open ({openCount})</option>
            <option value="IN_PROGRESS">In Progress ({inProgressCount})</option>
            <option value="RESOLVED">Resolved ({resolvedCount})</option>
            <option value="CLOSED">Closed</option>
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="select"
            style={{ width: 'auto', minWidth: '120px', height: '34px', fontSize: '12px' }}
          >
            <option value="ALL">All Priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          {/* Server Filter */}
          <select
            value={serverFilter}
            onChange={e => setServerFilter(e.target.value)}
            className="select"
            style={{ width: 'auto', minWidth: '130px', height: '34px', fontSize: '12px' }}
          >
            <option value="ALL">All Servers</option>
            {servers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 4. Tickets Table */}
      <div style={{
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem 1rem', fontWeight: '700' }}>Ticket ID</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: '700' }}>Client & Server</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: '700' }}>Issue / Subject</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: '700' }}>Priority</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: '700' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: '700' }}>Assigned To</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: '700' }}>Created At</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: '700', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    <Ticket size={36} style={{ margin: '0 auto 10px auto', opacity: 0.4 }} />
                    <div style={{ fontWeight: '600' }}>No support tickets found matching your filters.</div>
                    <div style={{ fontSize: '0.74rem', marginTop: '4px' }}>Click "Raise New Support Ticket" or use the 🎫 button on any client in the Users table.</div>
                  </td>
                </tr>
              ) : (
                filteredTickets.map(t => {
                  const pri = getPriorityBadge(t.priority);
                  const sta = getStatusBadge(t.status);
                  const isResolved = t.status === 'RESOLVED' || t.status === 'CLOSED';

                  // WhatsApp pre-formatted message
                  const waText = encodeURIComponent(
                    `*Innovation Web Works Support Update*\n` +
                    `Ticket ID: *${t.id}*\n` +
                    `Client: ${t.company}\n` +
                    `Issue: ${t.subject}\n` +
                    `Status: *${t.status}*\n` +
                    (t.resolutionNotes ? `Resolution: ${t.resolutionNotes}\n` : '') +
                    `Assigned Engineer: ${t.assignedTo || 'Support Staff'}\n\n` +
                    `Need assistance? Contact Innovation VPS Support.`
                  );

                  const matchedClient = users.find(u => u.id === t.clientId || u.company === t.company);

                  return (
                    <tr
                      key={t.id}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        backgroundColor: t.priority === 'URGENT' && !isResolved ? 'rgba(244, 63, 94, 0.04)' : 'transparent',
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      {/* Ticket ID */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          onClick={() => handleOpenResolveModal(t)}
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: '800',
                            color: '#38bdf8',
                            backgroundColor: 'rgba(56, 189, 248, 0.1)',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          title="Click to view full problem query & resolution details"
                        >
                          <Ticket size={12} /> {t.id}
                        </span>
                      </td>

                      {/* Client & Server */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div
                          onClick={() => handleOpenResolveModal(t)}
                          style={{ fontWeight: '700', color: '#ffffff', cursor: 'pointer' }}
                          title="Click to view ticket query & resolution"
                        >
                          {t.company}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>
                          <span style={{ color: '#38bdf8' }}>{t.serverName || 'VPS'}</span> • <span style={{ color: '#34d399' }}>{t.drive}</span>
                          {t.customerPhone && <span> • {t.customerPhone}</span>}
                        </div>
                      </td>

                      {/* Subject & Category */}
                      <td style={{ padding: '0.75rem 1rem', maxWidth: '300px' }}>
                        <div
                          onClick={() => handleOpenResolveModal(t)}
                          style={{ fontWeight: '600', color: '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                          title="Click to inspect query & resolution"
                        >
                          {t.subject}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: '1px 5px', borderRadius: '4px' }}>
                            {t.issueCategory}
                          </span>
                          {t.customerEmail && (
                            <span style={{ color: '#34d399', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                              <Mail size={10} /> Email sent
                            </span>
                          )}
                        </div>
                        {t.voiceNoteUrl && (
                          <div style={{ marginTop: '5px', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '6px', padding: '3px 6px', maxWidth: '240px' }}>
                            <Volume2 size={13} color="#38bdf8" />
                            <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#38bdf8' }}>Voice Msg:</span>
                            <audio controls src={t.voiceNoteUrl} style={{ height: '22px', maxWidth: '140px' }} />
                          </div>
                        )}
                      </td>

                      {/* Priority */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{
                          backgroundColor: pri.bg,
                          color: pri.color,
                          border: `1px solid ${pri.border}`,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          fontSize: '0.68rem',
                          fontWeight: '700'
                        }}>
                          {pri.label}
                        </span>
                      </td>

                      {/* Status & Quick Advance */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{
                            backgroundColor: sta.bg,
                            color: sta.color,
                            border: `1px solid ${sta.border}`,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            fontSize: '0.7rem',
                            fontWeight: '700'
                          }}>
                            {sta.label}
                          </span>

                          {/* Quick Advance Button */}
                          {t.status === 'OPEN' && (
                            <button
                              onClick={() => handleQuickStatusChange(t, 'IN_PROGRESS')}
                              style={{
                                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                color: '#38bdf8',
                                padding: '2px 6px',
                                borderRadius: '5px',
                                fontSize: '0.65rem',
                                fontWeight: '700',
                                cursor: 'pointer'
                              }}
                              title="Advance to In Progress"
                            >
                              Start ➔
                            </button>
                          )}

                          {t.status === 'IN_PROGRESS' && (
                            <button
                              onClick={() => handleQuickStatusChange(t, 'RESOLVED')}
                              style={{
                                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                color: '#34d399',
                                padding: '2px 6px',
                                borderRadius: '5px',
                                fontSize: '0.65rem',
                                fontWeight: '700',
                                cursor: 'pointer'
                              }}
                              title="Mark as Resolved & Email Client"
                            >
                              Resolve ✓
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Assigned To */}
                      <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1', fontSize: '0.78rem' }}>
                        {(!t.assignedTo || t.assignedTo === 'Unassigned' || t.assignedTo === 'Staff') && t.status === 'OPEN' ? (
                          <button
                            type="button"
                            onClick={() => handleClaimTicket(t.id)}
                            style={{
                              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                              border: 'none',
                              color: '#000000',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '0.72rem',
                              fontWeight: '800',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              boxShadow: '0 2px 8px rgba(245, 158, 11, 0.35)'
                            }}
                          >
                            <Zap size={12} fill="#000000" /> ⚡ Take Ticket
                          </button>
                        ) : (
                          <div>
                            <div style={{ fontWeight: '700', color: t.assignedTo ? '#34d399' : '#cbd5e1' }}>{t.assignedTo || 'Unassigned'}</div>
                            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>By {t.createdBy || 'Staff'}</div>
                          </div>
                        )}
                      </td>

                      {/* Created At */}
                      <td style={{ padding: '0.75rem 1rem', color: '#94a3b8', fontSize: '0.74rem', fontFamily: 'monospace' }}>
                        {t.createdAt ? t.createdAt.substring(0, 16) : 'Recent'}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                          {/* Direct TSplus Connect */}
                          {matchedClient && (
                            <button
                              onClick={() => onDirectRemoteConnect(matchedClient, 'USER')}
                              style={{
                                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                                border: '1px solid rgba(56, 189, 248, 0.25)',
                                color: '#38bdf8',
                                padding: '3px 6px',
                                borderRadius: '5px',
                                cursor: 'pointer'
                              }}
                              title="⚡ Direct Remote Connect to Client Session"
                            >
                              <Zap size={12} fill="#38bdf8" />
                            </button>
                          )}

                          {/* WhatsApp Button */}
                          <a
                            href={`https://wa.me/?text=${waText}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              backgroundColor: 'rgba(37, 211, 102, 0.15)',
                              border: '1px solid rgba(37, 211, 102, 0.3)',
                              color: '#25D366',
                              padding: '3px 6px',
                              borderRadius: '5px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              textDecoration: 'none'
                            }}
                            title="Send WhatsApp Update to Client"
                          >
                            <MessageCircle size={12} />
                          </a>

                          {/* Query, Details & Resolve Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenResolveModal(t)}
                            style={{
                              backgroundColor: isResolved ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                              border: isResolved ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(56, 189, 248, 0.35)',
                              color: isResolved ? '#34d399' : '#38bdf8',
                              padding: '3px 8px',
                              borderRadius: '5px',
                              fontSize: '0.72rem',
                              fontWeight: '700',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            title="View Full Problem Query & Resolution Details"
                          >
                            <Eye size={12} /> {isResolved ? 'Details' : 'Query & Resolve'}
                          </button>

                          {/* Delete Ticket */}
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete support ticket ${t.id}?`)) {
                                onDeleteTicket(t.id);
                              }
                            }}
                            style={{
                              backgroundColor: 'rgba(244, 63, 94, 0.1)',
                              border: '1px solid rgba(244, 63, 94, 0.25)',
                              color: '#fda4af',
                              padding: '3px 6px',
                              borderRadius: '5px',
                              cursor: 'pointer'
                            }}
                            title="Delete Ticket"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Comprehensive Ticket Query & Resolution Investigation Modal */}
      {selectedTicket && (() => {
        const isResolved = selectedTicket.status === 'RESOLVED' || selectedTicket.status === 'CLOSED';
        const isPortal = selectedTicket.source === 'CUSTOMER_PORTAL' || (selectedTicket.createdBy || '').includes('Customer');
        const matchedClient = users.find(u => u.id === selectedTicket.clientId || u.company === selectedTicket.company);
        
        // WhatsApp dispatch preformatted text with full query & resolution
        const waModalText = encodeURIComponent(
          `*Innovation Web Works Support Update*\n` +
          `Ticket ID: *${selectedTicket.id}*\n` +
          `Client: ${selectedTicket.company}\n` +
          `Server / Drive: ${selectedTicket.serverName || 'VPS'} (${selectedTicket.drive})\n` +
          `Problem / Query: ${selectedTicket.subject}\n` +
          (selectedTicket.description ? `Details: ${selectedTicket.description}\n` : '') +
          `Status: *${modalStatus}*\n` +
          (resolutionNotes ? `Resolution Provided: ${resolutionNotes}\n` : '') +
          `Assigned Support Rep: ${modalAssignedTo || 'Support Operations'}\n\n` +
          `Need further assistance? Contact Innovation Support Desk.`
        );

        return (
          <div className="modal-overlay" onClick={() => setSelectedTicket(null)}>
            <div className="modal-content" style={{ maxWidth: '720px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              {/* Modal Header */}
              <div className="modal-header" style={{ marginBottom: '1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.85rem' }}>
                <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '8px', backgroundColor: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Ticket size={18} color="#38bdf8" />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#ffffff' }}>
                        {selectedTicket.id}
                      </span>
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: '700',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        backgroundColor: isPortal ? 'rgba(168, 85, 247, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                        border: isPortal ? '1px solid rgba(168, 85, 247, 0.4)' : '1px solid rgba(56, 189, 248, 0.4)',
                        color: isPortal ? '#c084fc' : '#38bdf8'
                      }}>
                        {isPortal ? '🌐 Customer Portal Ticket' : '💻 Staff Console Ticket'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>
                      Created: {selectedTicket.createdAt || 'Recent'} • Logged By: <strong style={{ color: '#cbd5e1' }}>{selectedTicket.createdBy || 'Staff'}</strong>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => copyTicketSummary(selectedTicket)}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: isCopied ? '#34d399' : '#94a3b8',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Copy Full Ticket Summary to Clipboard"
                  >
                    {isCopied ? <Check size={13} /> : <Copy size={13} />}
                    {isCopied ? 'Copied!' : 'Copy Summary'}
                  </button>
                  <button className="modal-close" onClick={() => setSelectedTicket(null)}>✕</button>
                </div>
              </div>

              {/* 1. CUSTOMER & NODE INFORMATION CARD */}
              <div style={{
                backgroundColor: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '1rem',
                marginBottom: '1rem'
              }}>
                <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <User size={13} /> 1. Client & Server Infrastructure Context
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.8rem' }}>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block' }}>Company / Client:</span>
                    <strong style={{ color: '#ffffff', fontSize: '0.9rem' }}>{selectedTicket.company}</strong>
                    {selectedTicket.clientName && selectedTicket.clientName !== selectedTicket.company && (
                      <div style={{ fontSize: '0.72rem', color: '#38bdf8' }}>User: {selectedTicket.clientName}</div>
                    )}
                  </div>

                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block' }}>Server IP & Drive:</span>
                    <strong style={{ color: '#38bdf8' }}>{selectedTicket.serverName || 'VPS'}</strong> • <strong style={{ color: '#34d399' }}>{selectedTicket.drive}</strong>
                  </div>

                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block' }}>Customer Contact:</span>
                    {selectedTicket.customerPhone ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <a href={`tel:${selectedTicket.customerPhone}`} style={{ color: '#34d399', textDecoration: 'none', fontWeight: '700', fontSize: '0.78rem' }}>
                          📞 {selectedTicket.customerPhone}
                        </a>
                        <a href={`https://wa.me/?text=${waModalText}`} target="_blank" rel="noreferrer" style={{ color: '#25D366', fontSize: '0.72rem', backgroundColor: 'rgba(37, 211, 102, 0.12)', padding: '2px 6px', borderRadius: '4px', textDecoration: 'none', fontWeight: '700' }}>
                          WhatsApp 💬
                        </a>
                      </div>
                    ) : (
                      <span style={{ color: '#64748b' }}>No phone recorded</span>
                    )}
                  </div>

                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block' }}>Customer Email:</span>
                    {selectedTicket.customerEmail ? (
                      <a href={`mailto:${selectedTicket.customerEmail}`} style={{ color: '#38bdf8', textDecoration: 'none', fontSize: '0.78rem', wordBreak: 'break-all' }}>
                        ✉️ {selectedTicket.customerEmail}
                      </a>
                    ) : (
                      <span style={{ color: '#64748b' }}>No email attached</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. CUSTOMER QUERY & PROBLEM STATEMENT CARD */}
              <div style={{
                backgroundColor: 'rgba(6, 9, 17, 0.85)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: '12px',
                padding: '1.1rem',
                marginBottom: '1rem',
                boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: '800', color: '#38bdf8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <FileText size={14} /> 2. Customer Problem Query (Reported Issue)
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <span style={{ backgroundColor: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#cbd5e1', padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: '700' }}>
                      🏷️ {selectedTicket.issueCategory}
                    </span>
                    <span style={{ backgroundColor: getPriorityBadge(modalPriority).bg, border: `1px solid ${getPriorityBadge(modalPriority).border}`, color: getPriorityBadge(modalPriority).color, padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: '800' }}>
                      {getPriorityBadge(modalPriority).label}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: '1.05rem', fontWeight: '800', color: '#ffffff', marginBottom: '8px', lineHeight: '1.4' }}>
                  {selectedTicket.subject}
                </div>

                {selectedTicket.description && (
                  <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '0.85rem', fontSize: '0.84rem', color: '#cbd5e1', lineHeight: '1.6', whiteSpace: 'pre-wrap', marginBottom: '8px' }}>
                    <strong style={{ color: '#94a3b8', fontSize: '0.72rem', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                      Detailed Problem Query:
                    </strong>
                    {selectedTicket.description}
                  </div>
                )}

                {/* 🎙️ Voice Audio Note Player */}
                {selectedTicket.voiceNoteUrl && (
                  <div style={{ marginTop: '0.65rem', backgroundColor: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.35)', padding: '0.85rem 1rem', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Volume2 size={18} color="#38bdf8" />
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#38bdf8' }}>
                          Customer Voice Note Recording Attached
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                          Listen to the user's spoken problem audio note
                        </div>
                      </div>
                    </div>
                    <audio controls src={selectedTicket.voiceNoteUrl} style={{ height: '36px', maxWidth: '280px' }} />
                  </div>
                )}
              </div>

              {/* 3. LIFECYCLE STATUS & ASSIGNMENT WORKSPACE */}
              <div style={{
                backgroundColor: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '1rem',
                marginBottom: '1rem'
              }}>
                <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Zap size={13} /> 3. Support Status & Engineer Assignment
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem', marginBottom: '0.75rem' }}>
                  {/* Status Selector */}
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: '700', color: '#cbd5e1', display: 'block', marginBottom: '4px' }}>
                      Current Lifecycle Status
                    </label>
                    <select
                      value={modalStatus}
                      onChange={e => setModalStatus(e.target.value)}
                      style={{ width: '100%', padding: '0.5rem', backgroundColor: '#090d16', border: '1px solid rgba(255, 255, 255, 0.15)', color: getStatusBadge(modalStatus).color, borderRadius: '8px', fontSize: '0.8rem', fontWeight: '700' }}
                    >
                      <option value="OPEN">🟡 OPEN (Awaiting Action)</option>
                      <option value="IN_PROGRESS">🔵 IN PROGRESS (Troubleshooting)</option>
                      <option value="RESOLVED">🟢 RESOLVED (Issue Fixed)</option>
                      <option value="CLOSED">⚫ CLOSED (Complete)</option>
                    </select>
                  </div>

                  {/* Assigned Engineer */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: '700', color: '#cbd5e1' }}>
                        Assigned Support Rep
                      </label>
                      {(!modalAssignedTo || modalAssignedTo === 'Unassigned' || modalAssignedTo === 'Staff') && (
                        <button
                          type="button"
                          onClick={() => setModalAssignedTo(currentUser?.name || currentUser?.username || 'Staff')}
                          style={{ background: 'none', border: 'none', color: '#fbbf24', fontSize: '0.68rem', fontWeight: '800', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          ⚡ Assign to Me
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={modalAssignedTo}
                      onChange={e => setModalAssignedTo(e.target.value)}
                      placeholder="Support Engineer Name"
                      style={{ width: '100%', padding: '0.5rem 0.65rem', backgroundColor: '#090d16', border: '1px solid rgba(255, 255, 255, 0.15)', color: '#34d399', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '700' }}
                    />
                  </div>

                  {/* Priority Level */}
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: '700', color: '#cbd5e1', display: 'block', marginBottom: '4px' }}>
                      Priority Level
                    </label>
                    <select
                      value={modalPriority}
                      onChange={e => setModalPriority(e.target.value)}
                      style={{ width: '100%', padding: '0.5rem', backgroundColor: '#090d16', border: '1px solid rgba(255, 255, 255, 0.15)', color: getPriorityBadge(modalPriority).color, borderRadius: '8px', fontSize: '0.8rem', fontWeight: '700' }}
                    >
                      <option value="LOW">🟢 LOW Priority</option>
                      <option value="MEDIUM">🔵 MEDIUM Priority</option>
                      <option value="HIGH">🟠 HIGH Priority</option>
                      <option value="URGENT">🔴 URGENT Priority</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 4. RESOLUTION DETAILS CARD ("Resolution kya diya gya") */}
              <div style={{
                backgroundColor: isResolved ? 'rgba(16, 185, 129, 0.08)' : 'rgba(15, 23, 42, 0.8)',
                border: isResolved ? '1.5px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '1.1rem',
                marginBottom: '1.25rem',
                boxShadow: isResolved ? '0 0 20px rgba(16, 185, 129, 0.1)' : 'none'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: '800', color: isResolved ? '#34d399' : '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={18} color={isResolved ? '#34d399' : '#38bdf8'} />
                    <span>4. Resolution Provided ("Resolution Kya Diya Gya")</span>
                  </div>

                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <select
                      value={voiceLang}
                      onChange={e => setVoiceLang(e.target.value)}
                      style={{ backgroundColor: '#090d16', border: '1px solid rgba(52, 211, 153, 0.4)', color: '#34d399', padding: '3px 6px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: '700' }}
                    >
                      {VOICE_LANGUAGES.map(l => (
                        <option key={l.code} value={l.code}>{l.label}</option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={startVoiceTyping}
                      style={{
                        backgroundColor: isListeningRes ? '#ef4444' : 'rgba(239, 68, 68, 0.12)',
                        border: isListeningRes ? '1px solid #ef4444' : '1px solid rgba(239, 68, 68, 0.4)',
                        color: isListeningRes ? '#ffffff' : '#f87171',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.68rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {isListeningRes ? <MicOff size={11} /> : <Mic size={11} />}
                      {isListeningRes ? '🔴 Listening...' : '🎙️ Voice Type'}
                    </button>

                    <button
                      type="button"
                      disabled={isTranslatingRes}
                      onClick={handleConvertResolution}
                      style={{
                        background: 'linear-gradient(135deg, #059669, #0284c7)',
                        border: 'none',
                        color: '#ffffff',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.68rem',
                        fontWeight: '700',
                        cursor: isTranslatingRes ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}
                    >
                      <Sparkles size={11} /> {isTranslatingRes ? 'Translating...' : '✨ To English'}
                    </button>
                  </div>
                </div>

                {/* If ticket is resolved, highlight the official resolution */}
                {selectedTicket.resolutionNotes && (
                  <div style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    borderRadius: '8px',
                    padding: '0.85rem 1rem',
                    marginBottom: '0.85rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', fontSize: '0.72rem', color: '#34d399', fontWeight: '800', textTransform: 'uppercase' }}>
                      <span>✅ Official Solution Delivered:</span>
                      <span>By: {selectedTicket.assignedTo || 'Support Staff'}</span>
                    </div>
                    <div style={{ fontSize: '0.88rem', color: '#ffffff', fontWeight: '600', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                      {selectedTicket.resolutionNotes}
                    </div>
                  </div>
                )}

                {/* Editable Resolution Input / Notes */}
                <div style={{ position: 'relative', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: '700', color: '#cbd5e1', display: 'block', marginBottom: '4px' }}>
                    {isResolved ? '✏️ Edit / Update Resolution Summary:' : '📝 Write Resolution Summary (Sent to Client):'}
                  </label>
                  <textarea
                    rows="3"
                    value={resolutionNotes}
                    onChange={e => setResolutionNotes(e.target.value)}
                    placeholder="Enter resolution notes in detail (e.g. Diagnosed slowness, cleaned temp files, verified Tally license server, and confirmed with client)..."
                    style={{
                      width: '100%',
                      padding: '0.65rem',
                      backgroundColor: '#090d16',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      color: '#ffffff',
                      borderRadius: '8px',
                      fontSize: '0.84rem',
                      lineHeight: '1.5',
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: '#94a3b8', flexWrap: 'wrap', gap: '6px' }}>
                  <span>
                    {selectedTicket.resolvedAt ? `✅ Resolved on: ${selectedTicket.resolvedAt}` : '⏳ Not yet marked as resolved'}
                  </span>
                  <span>
                    {selectedTicket.customerEmail ? `✉️ Client email: ${selectedTicket.customerEmail}` : 'No email attached'}
                  </span>
                </div>
              </div>

              {/* Modal Footer Controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '1rem', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {matchedClient && (
                    <button
                      type="button"
                      onClick={() => onDirectRemoteConnect(matchedClient, 'USER')}
                      style={{
                        backgroundColor: 'rgba(56, 189, 248, 0.12)',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        color: '#38bdf8',
                        padding: '0.5rem 0.85rem',
                        borderRadius: '7px',
                        fontSize: '0.78rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Zap size={13} fill="#38bdf8" /> Connect TSplus RDP
                    </button>
                  )}

                  <a
                    href={`https://wa.me/?text=${waModalText}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      backgroundColor: 'rgba(37, 211, 102, 0.15)',
                      border: '1px solid rgba(37, 211, 102, 0.35)',
                      color: '#25D366',
                      padding: '0.5rem 0.85rem',
                      borderRadius: '7px',
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <MessageCircle size={13} /> WhatsApp Update
                  </a>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedTicket(null)}
                    style={{
                      backgroundColor: 'transparent',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: '#94a3b8',
                      padding: '0.5rem 1rem',
                      borderRadius: '7px',
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    disabled={isSavingModal}
                    onClick={handleSaveTicketModal}
                    style={{
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      border: 'none',
                      color: '#ffffff',
                      padding: '0.5rem 1.25rem',
                      borderRadius: '7px',
                      fontSize: '0.82rem',
                      fontWeight: '800',
                      cursor: isSavingModal ? 'wait' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
                    }}
                  >
                    <CheckCircle2 size={15} /> {isSavingModal ? 'Saving...' : 'Save & Apply Updates'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

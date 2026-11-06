import React, { useState, useEffect, useRef } from 'react';
import { X, Ticket, AlertCircle, HardDrive, Server, User, Mail, Phone, CheckCircle2, ShieldAlert, Zap, Sparkles, Mic, MicOff, Search, Check, Lock, ChevronDown } from 'lucide-react';
import { translateHinglishToEnglish } from '../utils/nlpTranslate';

const COMMON_ISSUES = [
  { label: '✏️ Custom Subject (Speak or Type anything in Hindi / English)', category: 'General Support', defaultSubject: '' },
  { label: '🔑 Password Reset / TSplus Login Failed', category: 'Login Issue', defaultSubject: 'Client TSplus / RDP Password Reset' },
  { label: '📊 Tally License / Gateway Server Error', category: 'Tally Error', defaultSubject: 'Tally License Server Unreachable / Error' },
  { label: '🖨️ Printer Redirection / Cloud Print Issue', category: 'Printer Issue', defaultSubject: 'Virtual Printer Redirection Failed' },
  { label: '💾 Disk Space Full / High Storage Usage', category: 'Disk Space', defaultSubject: 'Client Allocated Drive Space Near 100%' },
  { label: '🐢 Server Slowness / High CPU Lag', category: 'Performance', defaultSubject: 'Application Lag / High CPU on TSplus Session' },
  { label: '➕ New User Setup / Drive Permission', category: 'User Setup', defaultSubject: 'New User Profile Setup & Drive Access' },
  { label: '🛡️ Antivirus / Firewall Port Blocking', category: 'Network / Security', defaultSubject: 'Port 443 / 3389 Connection Interrupted' },
  { label: '📋 Other / Custom Support Request', category: 'General Support', defaultSubject: 'Technical Assistance Request' }
];

export const VOICE_LANGUAGES = [
  { code: 'hi-IN', label: '🇮🇳 Hindi (हिन्दी)', short: 'Hindi' },
  { code: 'en-IN', label: '🇮🇳 English (India)', short: 'Eng (IN)' },
  { code: 'en-US', label: '🇺🇸 English (US)', short: 'Eng (US)' },
  { code: 'gu-IN', label: '🇮🇳 Gujarati (ગુજરાતી)', short: 'Gujarati' },
  { code: 'mr-IN', label: '🇮🇳 Marathi (मराठी)', short: 'Marathi' },
  { code: 'pa-IN', label: '🇮🇳 Punjabi (ਪੰਜਾਬੀ)', short: 'Punjabi' },
  { code: 'bn-IN', label: '🇮🇳 Bengali (বাংলা)', short: 'Bengali' },
  { code: 'ta-IN', label: '🇮🇳 Tamil (தமிழ்)', short: 'Tamil' },
  { code: 'te-IN', label: '🇮🇳 Telugu (తెలుగు)', short: 'Telugu' },
  { code: 'kn-IN', label: '🇮🇳 Kannada (ಕನ್ನಡ)', short: 'Kannada' },
  { code: 'ur-IN', label: '🇮🇳 Urdu (اردو)', short: 'Urdu' }
];

export default function TicketModal({
  isOpen,
  onClose,
  onSaveTicket,
  initialClient = null,
  servers = [],
  users = [],
  employees = [],
  currentUser
}) {
  const [formData, setFormData] = useState({
    clientId: '',
    clientName: '',
    company: '',
    customerPhone: '',
    customerEmail: '',
    serverId: '',
    serverName: '',
    drive: '',
    issueCategory: 'General Support',
    subject: '',
    description: '',
    priority: 'MEDIUM',
    status: 'OPEN',
    resolutionNotes: '',
    assignedTo: '',
    assignedToEmail: ''
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [voiceLang, setVoiceLang] = useState('hi-IN');
  const [isListeningSubject, setIsListeningSubject] = useState(false);
  const [isListeningDesc, setIsListeningDesc] = useState(false);
  const [isTranslatingSubject, setIsTranslatingSubject] = useState(false);
  const [isTranslatingDesc, setIsTranslatingDesc] = useState(false);
  // Instant Real-Time Synchronous Validation against loaded database
  const getValidation = () => {
    if (!formData.clientName || !formData.clientName.trim()) {
      return { status: 'EMPTY', message: '', user: null };
    }
    const cleanUser = formData.clientName.trim().toLowerCase();
    const cleanIp = (formData.serverName || formData.serverId || '').trim().toLowerCase();
    const cleanDrive = (formData.drive || '').trim().toLowerCase();

    // 1. Find matching server
    const currentServer = servers.find(s => 
      (s.ipAddress && s.ipAddress.toLowerCase() === cleanIp) ||
      (s.name && s.name.toLowerCase() === cleanIp) ||
      (s.id && s.id.toLowerCase() === cleanIp)
    );

    // 2. Find exact match
    const exactUser = users.find(u => 
      (u.username && u.username.toLowerCase() === cleanUser) ||
      (u.company && u.company.toLowerCase() === cleanUser)
    );

    if (!exactUser) {
      // Look for fuzzy close match
      const closeMatch = users.find(u => 
        (u.username && (u.username.toLowerCase().includes(cleanUser) || cleanUser.includes(u.username.toLowerCase()))) ||
        (u.company && (u.company.toLowerCase().includes(cleanUser) || cleanUser.includes(u.company.toLowerCase())))
      );

      return {
        status: 'USER_NOT_FOUND',
        message: `❌ User '${formData.clientName}' does NOT exist in database!`,
        suggestion: closeMatch
      };
    }

    // 3. User exists: check Server mismatch
    if (currentServer && exactUser.serverId !== currentServer.id) {
      const actualServer = servers.find(s => s.id === exactUser.serverId);
      const actualServerLabel = actualServer ? (actualServer.ipAddress || actualServer.name) : exactUser.serverId;
      return {
        status: 'SERVER_MISMATCH',
        message: `⚠️ Server Mismatch: '${exactUser.username}' is on ${actualServerLabel}, not on ${formData.serverName}!`,
        user: exactUser,
        actualServer
      };
    }

    // 4. Check Drive mismatch
    if (cleanDrive && exactUser.drive && exactUser.drive.toLowerCase() !== cleanDrive) {
      return {
        status: 'DRIVE_MISMATCH',
        message: `⚠️ Drive Mismatch: In database, '${exactUser.username}' is on ${exactUser.drive} (not ${formData.drive})`,
        user: exactUser
      };
    }

    return {
      status: 'VALID',
      message: `✅ Verified Client: ${exactUser.company} (${exactUser.username} • ${exactUser.drive})`,
      user: exactUser
    };
  };

  const validation = getValidation();

  const handleConvertSubject = async () => {
    if (!formData.subject) return;
    setIsTranslatingSubject(true);
    try {
      const converted = await translateHinglishToEnglish(formData.subject);
      setFormData(prev => ({ ...prev, subject: converted }));
    } finally {
      setIsTranslatingSubject(false);
    }
  };

  const handleConvertDescription = async () => {
    if (!formData.description) return;
    setIsTranslatingDesc(true);
    try {
      const converted = await translateHinglishToEnglish(formData.description);
      setFormData(prev => ({ ...prev, description: converted }));
    } finally {
      setIsTranslatingDesc(false);
    }
  };

  useEffect(() => {
    if (initialClient) {
      const srv = servers.find(s => s.id === initialClient.serverId);
      setFormData({
        clientId: initialClient.id || '',
        clientName: initialClient.username || initialClient.company || '',
        company: initialClient.company || '',
        customerPhone: initialClient.customerPhone || '',
        customerEmail: initialClient.customerEmail || '',
        serverId: initialClient.serverId || (servers[0] ? servers[0].id : ''),
        serverName: srv ? srv.name : (initialClient.serverId || ''),
        drive: initialClient.drive || 'Drive D',
        issueCategory: 'General Support',
        subject: '',
        description: '',
        priority: 'MEDIUM',
        assignedTo: currentUser ? (currentUser.name || currentUser.username) : (staffEmployees[0]?.name || 'Support Staff'),
        assignedToEmail: currentUser?.email || staffEmployees[0]?.email || ''
      });
    } else {
      // Start completely blank for fresh ticket creation
      setFormData({
        clientId: '',
        clientName: '',
        company: '',
        customerPhone: '',
        customerEmail: '',
        serverId: '',
        serverName: '',
        drive: 'Drive D',
        issueCategory: 'General Support',
        subject: '',
        description: '',
        priority: 'MEDIUM',
        assignedTo: currentUser ? (currentUser.name || currentUser.username) : (staffEmployees[0]?.name || 'Support Staff'),
        assignedToEmail: currentUser?.email || staffEmployees[0]?.email || ''
      });
    }
  }, [initialClient, isOpen, servers, users]);

  if (!isOpen) return null;

  const selectClient = (client) => {
    if (!client) return;
    const srv = servers.find(s => s.id === client.serverId);
    setFormData(prev => ({
      ...prev,
      clientId: client.id,
      clientName: client.username || client.company,
      company: client.company,
      customerPhone: client.customerPhone || '',
      customerEmail: client.customerEmail || '',
      serverId: client.serverId || prev.serverId,
      serverName: srv ? (srv.ipAddress ? `${srv.ipAddress} (${srv.name})` : srv.name) : (client.serverId || prev.serverName),
      drive: client.drive || 'Drive D'
    }));
    setShowSearchDropdown(false);
    setSearchQuery('');
  };

  const matchingSearchResults = users.filter(u => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const srv = servers.find(s => s.id === u.serverId);
    const ip = srv?.ipAddress?.toLowerCase() || '';
    const srvName = srv?.name?.toLowerCase() || '';
    return (
      (u.username && u.username.toLowerCase().includes(q)) ||
      (u.company && u.company.toLowerCase().includes(q)) ||
      (u.customerEmail && u.customerEmail.toLowerCase().includes(q)) ||
      (u.customerPhone && u.customerPhone.toLowerCase().includes(q)) ||
      (u.drive && u.drive.toLowerCase().includes(q)) ||
      ip.includes(q) ||
      srvName.includes(q)
    );
  });

  const handleServerSelectChange = (e) => {
    const selectedServerId = e.target.value;
    const srv = servers.find(s => s.id === selectedServerId);
    
    // Find first client on this server if available
    const clientsOnServer = users.filter(u => u.serverId === selectedServerId);
    const firstClient = clientsOnServer[0];
    
    setFormData(prev => ({
      ...prev,
      serverId: selectedServerId,
      serverName: srv ? (srv.ipAddress ? `${srv.ipAddress} (${srv.name})` : srv.name) : (selectedServerId || ''),
      clientId: firstClient ? firstClient.id : '',
      clientName: firstClient ? (firstClient.username || firstClient.company) : '',
      company: firstClient ? firstClient.company : '',
      customerPhone: firstClient ? firstClient.customerPhone : '',
      customerEmail: firstClient ? firstClient.customerEmail : '',
      drive: firstClient ? (firstClient.drive || 'Drive D') : prev.drive
    }));
  };

  const handleClientSelectChange = (e) => {
    const selectedUserId = e.target.value;
    const client = users.find(u => u.id === selectedUserId);
    if (client) {
      const srv = servers.find(s => s.id === client.serverId);
      setFormData(prev => ({
        ...prev,
        clientId: client.id,
        clientName: client.username || client.company,
        company: client.company,
        customerPhone: client.customerPhone || '',
        customerEmail: client.customerEmail || '',
        serverId: client.serverId || prev.serverId,
        serverName: srv ? (srv.ipAddress ? `${srv.ipAddress} (${srv.name})` : srv.name) : (client.serverId || prev.serverName),
        drive: client.drive || 'Drive D'
      }));
    }
  };

  const handleIssueTemplateChange = (e) => {
    const selectedTemplate = COMMON_ISSUES.find(item => item.label === e.target.value);
    if (selectedTemplate) {
      setFormData(prev => ({
        ...prev,
        issueCategory: selectedTemplate.category,
        subject: `[${prev.company || 'Client'}] ${selectedTemplate.defaultSubject}`
      }));
    }
  };

  const handleStaffSelect = (e) => {
    const staffName = e.target.value;
    const staffObj = employees.find(emp => emp.name === staffName || emp.username === staffName);
    setFormData(prev => ({
      ...prev,
      assignedTo: staffName,
      assignedToEmail: staffObj?.email || ''
    }));
  };

  const startVoiceTyping = async (field) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice typing is supported in Google Chrome, Microsoft Edge, and modern mobile browsers. Please ensure microphone access is permitted in your browser settings.');
      return;
    }

    if ((field === 'subject' && isListeningSubject) || (field === 'description' && isListeningDesc)) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
        recognitionRef.current = null;
      }
      setIsListeningSubject(false);
      setIsListeningDesc(false);
      return;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
      recognitionRef.current = null;
    }

    // Explicitly prompt for mic permission if needed
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch (permErr) {
      console.warn("Mic permission prompt notice:", permErr);
      if (permErr.name === 'NotAllowedError' || permErr.name === 'PermissionDeniedError') {
        alert('🎙️ Microphone access was blocked. Please click the lock/camera icon in your browser address bar and allow Microphone access.');
        return;
      }
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = voiceLang || 'hi-IN';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      const baseText = formData[field] ? formData[field].trim() : '';

      recognition.onstart = () => {
        if (field === 'subject') setIsListeningSubject(true);
        if (field === 'description') setIsListeningDesc(true);
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
          setFormData(prev => ({
            ...prev,
            [field]: baseText ? `${baseText} ${currentSpoken}` : currentSpoken
          }));
        }
      };

      recognition.onerror = (event) => {
        console.warn("Speech recognition notice:", event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          alert('🎙️ Microphone permission denied. Please allow microphone access in your browser address bar.');
        }
        setIsListeningSubject(false);
        setIsListeningDesc(false);
      };

      recognition.onend = () => {
        setIsListeningSubject(false);
        setIsListeningDesc(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.error("SpeechRecognition error:", e);
      alert('Unable to start voice recognition. Please verify microphone access in browser settings.');
      setIsListeningSubject(false);
      setIsListeningDesc(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.company && !formData.clientName) {
      alert('Please enter a Client Username or Company name.');
      return;
    }

    if (validation.status === 'USER_NOT_FOUND') {
      alert(`❌ Error: User '${formData.clientName}' does NOT exist in the database!\n\nPlease check the spelling or select from registered clients.`);
      return;
    }

    if (validation.status === 'SERVER_MISMATCH') {
      alert(`⚠️ Server Mismatch:\n\nUser '${validation.user?.username}' is registered on '${validation.actualServer?.ipAddress || validation.actualServer?.name}', NOT on '${formData.serverName}'!\n\nPlease switch to the correct server IP.`);
      return;
    }

    if (!formData.subject) {
      alert('Please enter a ticket subject.');
      return;
    }

    onSaveTicket({
      ...formData,
      company: validation.user ? validation.user.company : formData.company,
      clientId: validation.user ? validation.user.id : formData.clientId,
      drive: validation.user ? validation.user.drive : formData.drive,
      createdBy: currentUser ? (currentUser.name || currentUser.username) : 'Staff'
    });

    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '650px', width: '95%' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header" style={{ marginBottom: '1.25rem' }}>
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Ticket size={22} color="#38bdf8" />
            <span>Raise Support Ticket & Notify Client</span>
          </div>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* 1. Client Picker & Pre-filled Info */}
          <div style={{
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '1rem',
            marginBottom: '1rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: '700', color: '#38bdf8', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <User size={13} /> Target VPS Server & Client Details
              </span>
              {formData.customerEmail ? (
                <span style={{ fontSize: '0.72rem', color: '#34d399', display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: '600' }}>
                  <Mail size={12} /> Auto-Email Active ({formData.customerEmail})
                </span>
              ) : (
                <span style={{ fontSize: '0.72rem', color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <AlertCircle size={12} /> No email provided
                </span>
              )}
            </div>

            {/* Direct User Locked Banner (When clicked directly from a User Row) */}
            {initialClient ? (
              <div style={{
                backgroundColor: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: '8px',
                padding: '0.65rem 0.85rem',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
                  <Lock size={14} color="#38bdf8" />
                  <span style={{ color: '#ffffff' }}>
                    Locked to Client: <strong style={{ color: '#38bdf8' }}>{initialClient.company}</strong> ({initialClient.username})
                  </span>
                </div>
                <span style={{ fontSize: '0.72rem', backgroundColor: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '2px 8px', borderRadius: '4px', fontWeight: '700' }}>
                  {initialClient.drive || 'Drive D'}
                </span>
              </div>
            ) : null}

            {/* Sequential Step 1: Server IP Address & Step 2: Username */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
              {/* Field 1: Manual / Select Server IP Address */}
              <div className="form-group" style={{ margin: 0, position: 'relative' }}>
                <label style={{ fontSize: '0.74rem', color: '#38bdf8', fontWeight: '700' }}>1. Enter / Select Server IP Address *</label>
                <input
                  type="text"
                  placeholder="e.g. 192.168.1.1 or select below"
                  value={formData.serverName}
                  disabled={!!initialClient}
                  onChange={e => {
                    const typedIp = e.target.value;
                    const matchedSrv = servers.find(s => (s.ipAddress && s.ipAddress.toLowerCase() === typedIp.toLowerCase()) || (s.name && s.name.toLowerCase() === typedIp.toLowerCase()));
                    setFormData(prev => ({
                      ...prev,
                      serverName: typedIp,
                      serverId: matchedSrv ? matchedSrv.id : (typedIp || '')
                    }));
                  }}
                  style={{ width: '100%', padding: '0.5rem', backgroundColor: '#090d16', border: '1px solid rgba(56, 189, 248, 0.35)', color: '#ffffff', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '600' }}
                />

                {/* Quick Server IP Chips */}
                {!initialClient && servers.length > 0 && (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {servers.map(s => {
                      const ipText = s.ipAddress || s.name;
                      const isSelected = formData.serverName === ipText || formData.serverId === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({
                              ...prev,
                              serverName: ipText,
                              serverId: s.id
                            }));
                          }}
                          style={{
                            background: isSelected ? '#0284c7' : 'rgba(56, 189, 248, 0.1)',
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                            color: isSelected ? '#ffffff' : '#38bdf8',
                            fontSize: '0.68rem',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: '600'
                          }}
                        >
                          {ipText}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Field 2: Username on this Server IP */}
              <div className="form-group" style={{ margin: 0, position: 'relative' }}>
                <label style={{ fontSize: '0.74rem', color: '#34d399', fontWeight: '700' }}>
                  2. Client Username / Company * {formData.serverName ? `(on ${formData.serverName})` : ''}
                </label>
                <input
                  type="text"
                  placeholder="e.g. mann or type username..."
                  value={formData.clientName}
                  disabled={!!initialClient}
                  onChange={e => {
                    const typedUser = e.target.value;
                    const matched = users.find(u => 
                      u.username?.toLowerCase() === typedUser.toLowerCase() ||
                      u.company?.toLowerCase() === typedUser.toLowerCase()
                    );
                    setFormData(prev => ({
                      ...prev,
                      clientName: typedUser,
                      company: matched ? matched.company : typedUser,
                      clientId: matched ? matched.id : '',
                      drive: matched ? matched.drive : prev.drive,
                      customerEmail: matched ? (matched.customerEmail || prev.customerEmail) : prev.customerEmail,
                      customerPhone: matched ? (matched.customerPhone || prev.customerPhone) : prev.customerPhone
                    }));
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    backgroundColor: (validation.status === 'USER_NOT_FOUND' || validation.status === 'SERVER_MISMATCH')
                      ? 'rgba(239, 68, 68, 0.15)' 
                      : validation.status === 'VALID' 
                      ? 'rgba(16, 185, 129, 0.08)' 
                      : '#090d16',
                    border: (validation.status === 'USER_NOT_FOUND' || validation.status === 'SERVER_MISMATCH')
                      ? '2px solid #ef4444'
                      : validation.status === 'DRIVE_MISMATCH'
                      ? '2px solid #f59e0b'
                      : validation.status === 'VALID'
                      ? '2px solid #10b981'
                      : '1px solid rgba(52, 211, 153, 0.35)',
                    color: '#ffffff',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                />

                {/* Instant Real-Time Validation Feedback & Fuzzy Matching */}
                {validation.status === 'USER_NOT_FOUND' && (
                  <div style={{ marginTop: '4px' }}>
                    <div style={{ color: '#ef4444', fontSize: '0.74rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertCircle size={13} color="#ef4444" />
                      <span>❌ User '{formData.clientName}' NOT found in database!</span>
                    </div>
                    {validation.suggestion && (
                      <div style={{ marginTop: '4px', fontSize: '0.72rem', color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.1)', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                        💡 Did you mean:{' '}
                        <button
                          type="button"
                          onClick={() => selectClient(validation.suggestion)}
                          style={{ background: 'none', border: 'none', color: '#38bdf8', textDecoration: 'underline', cursor: 'pointer', fontWeight: '700', padding: 0 }}
                        >
                          {validation.suggestion.username} ({validation.suggestion.company} • {validation.suggestion.drive})
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {validation.status === 'SERVER_MISMATCH' && (
                  <div style={{ color: '#f59e0b', fontSize: '0.74rem', fontWeight: '800', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertCircle size={13} color="#f59e0b" />
                      <span>⚠️ '{validation.user?.username}' is on {validation.actualServer?.ipAddress || validation.actualServer?.name}, not {formData.serverName}!</span>
                    </div>
                    {validation.actualServer && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            serverId: validation.actualServer.id,
                            serverName: validation.actualServer.ipAddress || validation.actualServer.name
                          }));
                        }}
                        style={{ backgroundColor: '#f59e0b', color: '#000000', border: 'none', padding: '1px 6px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '800', cursor: 'pointer' }}
                      >
                        Switch IP
                      </button>
                    )}
                  </div>
                )}

                {validation.status === 'DRIVE_MISMATCH' && (
                  <div style={{ color: '#f59e0b', fontSize: '0.74rem', fontWeight: '800', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertCircle size={13} color="#f59e0b" />
                      <span>⚠️ In DB, user is on {validation.user?.drive} (not {formData.drive})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, drive: validation.user.drive }))}
                      style={{ backgroundColor: '#f59e0b', color: '#000000', border: 'none', padding: '1px 6px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '800', cursor: 'pointer' }}
                    >
                      Fix Drive
                    </button>
                  </div>
                )}

                {validation.status === 'VALID' && (
                  <div style={{ color: '#10b981', fontSize: '0.74rem', fontWeight: '700', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={13} color="#10b981" />
                    <span>✅ User verified: {validation.user?.company} ({validation.user?.drive})</span>
                  </div>
                )}

                {/* Quick User Chips for the chosen Server IP */}
                {!initialClient && (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px', maxHeight: '48px', overflowY: 'auto' }}>
                    {(formData.serverId 
                      ? users.filter(u => u.serverId === formData.serverId)
                      : users
                    ).slice(0, 8).map(u => {
                      const isSelected = formData.clientName === u.username || formData.clientId === u.id;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => selectClient(u)}
                          style={{
                            background: isSelected ? '#059669' : 'rgba(52, 211, 153, 0.1)',
                            border: '1px solid rgba(52, 211, 153, 0.3)',
                            color: isSelected ? '#ffffff' : '#34d399',
                            fontSize: '0.68rem',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: '600'
                          }}
                          title={`${u.company} (${u.drive})`}
                        >
                          {u.username} ({u.drive})
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              {/* Field 3: Assigned Drive */}
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.74rem', color: '#94a3b8' }}>3. Assigned Drive</label>
                <select
                  value={formData.drive}
                  onChange={e => setFormData(prev => ({ ...prev, drive: e.target.value }))}
                  style={{ width: '100%', padding: '0.5rem', backgroundColor: '#090d16', border: '1px solid rgba(255, 255, 255, 0.12)', color: '#34d399', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '600' }}
                >
                  {(() => {
                    const selSrv = servers.find(s => s.id === formData.serverId || s.name === formData.serverName || s.ipPort === formData.serverId);
                    const driveOpts = (selSrv && Array.isArray(selSrv.availableDrives) && selSrv.availableDrives.length > 0)
                      ? selSrv.availableDrives
                      : (formData.drive ? [formData.drive] : ['Drive C']);
                    return driveOpts.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ));
                  })()}
                </select>
              </div>

              {/* Field 4: Client Email */}
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.74rem', color: '#94a3b8' }}>4. Client Email (Auto-Notification)</label>
                <input
                  type="email"
                  placeholder="client@example.com"
                  value={formData.customerEmail}
                  onChange={e => setFormData(prev => ({ ...prev, customerEmail: e.target.value }))}
                  style={{ width: '100%', padding: '0.5rem', backgroundColor: '#090d16', border: '1px solid rgba(255, 255, 255, 0.12)', color: '#ffffff', borderRadius: '8px', fontSize: '0.82rem' }}
                />
              </div>
            </div>

            {/* Live Synchronous Database Verification Banner */}
            {formData.clientName && (
              <div style={{
                marginTop: '0.65rem',
                padding: '0.55rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.78rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                backgroundColor: (validation.status === 'USER_NOT_FOUND' || validation.status === 'SERVER_MISMATCH')
                  ? 'rgba(244, 63, 94, 0.12)'
                  : validation.status === 'DRIVE_MISMATCH'
                  ? 'rgba(245, 158, 11, 0.12)'
                  : 'rgba(16, 185, 129, 0.12)',
                border: (validation.status === 'USER_NOT_FOUND' || validation.status === 'SERVER_MISMATCH')
                  ? '1px solid rgba(244, 63, 94, 0.35)'
                  : validation.status === 'DRIVE_MISMATCH'
                  ? '1px solid rgba(245, 158, 11, 0.35)'
                  : '1px solid rgba(16, 185, 129, 0.35)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {validation.status === 'VALID' && (
                    <>
                      <CheckCircle2 size={15} color="#10b981" />
                      <span style={{ color: '#34d399', fontWeight: '600' }}>
                        {validation.message}
                      </span>
                    </>
                  )}
                  {validation.status === 'DRIVE_MISMATCH' && (
                    <>
                      <AlertCircle size={15} color="#f59e0b" />
                      <span style={{ color: '#fbbf24' }}>
                        {validation.message}
                      </span>
                    </>
                  )}
                  {validation.status === 'SERVER_MISMATCH' && (
                    <>
                      <AlertCircle size={15} color="#f59e0b" />
                      <span style={{ color: '#fbbf24', fontWeight: '700' }}>
                        {validation.message}
                      </span>
                    </>
                  )}
                  {validation.status === 'USER_NOT_FOUND' && (
                    <>
                      <AlertCircle size={15} color="#f43f5e" />
                      <span style={{ color: '#f87171', fontWeight: '700' }}>
                        {validation.message}
                      </span>
                    </>
                  )}
                </div>

                {validation.status === 'DRIVE_MISMATCH' && validation.user?.drive && (
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, drive: validation.user.drive }))}
                    style={{
                      backgroundColor: '#f59e0b',
                      color: '#000000',
                      border: 'none',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    Fix to {validation.user.drive}
                  </button>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.65rem', fontSize: '0.74rem', color: '#cbd5e1', flexWrap: 'wrap' }}>
              <span>IP / Server: <strong style={{ color: '#38bdf8' }}>{formData.serverName || 'Enter IP'}</strong></span>
              <span>•</span>
              <span>Username: <strong style={{ color: '#34d399' }}>{formData.clientName || 'Enter Username'}</strong></span>
              <span>•</span>
              <span>Company: <strong style={{ color: '#ffffff' }}>{formData.company || 'None'}</strong></span>
              <span>•</span>
              <span>Drive: <strong style={{ color: '#34d399' }}>{formData.drive || 'Drive D'}</strong></span>
            </div>
          </div>

          {/* 2. Issue Template & Details */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '0.85rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#cbd5e1' }}>⚡ Quick Issue Template</label>
              <select
                onChange={handleIssueTemplateChange}
                style={{ width: '100%', padding: '0.55rem', backgroundColor: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(56, 189, 248, 0.3)', color: '#38bdf8', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '600' }}
              >
                {COMMON_ISSUES.map((issue, idx) => (
                  <option key={idx} value={issue.label}>{issue.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#cbd5e1' }}>Priority Level</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginTop: '3px' }}>
                {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map(p => {
                  const isSelected = formData.priority === p;
                  const colors = {
                    LOW: '#10b981',
                    MEDIUM: '#38bdf8',
                    HIGH: '#f59e0b',
                    URGENT: '#f43f5e'
                  };
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, priority: p }))}
                      style={{
                        backgroundColor: isSelected ? colors[p] : 'rgba(255, 255, 255, 0.05)',
                        color: isSelected ? '#ffffff' : '#94a3b8',
                        border: isSelected ? `1px solid ${colors[p]}` : '1px solid rgba(255, 255, 255, 0.08)',
                        padding: '6px 0',
                        borderRadius: '6px',
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      {p === 'URGENT' ? '🔴 ' : ''}{p}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Ticket Lifecycle Status Selector */}
          <div className="form-group" style={{ marginBottom: '0.85rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#cbd5e1' }}>Ticket Initial Status</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginTop: '3px' }}>
              {[
                { id: 'OPEN', label: '🟢 OPEN', bg: 'rgba(56, 189, 248, 0.2)', border: '#38bdf8', color: '#38bdf8' },
                { id: 'IN_PROGRESS', label: '🟡 IN PROGRESS', bg: 'rgba(245, 158, 11, 0.2)', border: '#f59e0b', color: '#fbbf24' },
                { id: 'RESOLVED', label: '✅ RESOLVED', bg: 'rgba(16, 185, 129, 0.2)', border: '#10b981', color: '#34d399' },
                { id: 'CLOSED', label: '🔒 CLOSED', bg: 'rgba(148, 163, 184, 0.2)', border: '#94a3b8', color: '#cbd5e1' }
              ].map(s => {
                const isSelected = formData.status === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, status: s.id }))}
                    style={{
                      backgroundColor: isSelected ? s.bg : 'rgba(255, 255, 255, 0.05)',
                      color: isSelected ? s.color : '#94a3b8',
                      border: isSelected ? `1.5px solid ${s.border}` : '1px solid rgba(255, 255, 255, 0.08)',
                      padding: '6px 0',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: '800',
                      cursor: 'pointer',
                      boxShadow: isSelected ? `0 0 10px ${s.bg}` : 'none'
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* If marked as RESOLVED or CLOSED, show Resolution Notes */}
          {(formData.status === 'RESOLVED' || formData.status === 'CLOSED') && (
            <div className="form-group" style={{ marginBottom: '0.85rem', backgroundColor: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', padding: '0.75rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#34d399', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                <CheckCircle2 size={14} /> Resolution Notes (Sent to Client in Email)
              </label>
              <textarea
                rows="2"
                value={formData.resolutionNotes}
                onChange={e => setFormData(prev => ({ ...prev, resolutionNotes: e.target.value }))}
                placeholder="e.g. Diagnosed on call, session restarted and password updated..."
                style={{ width: '100%', padding: '0.5rem', backgroundColor: '#090d16', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#ffffff', borderRadius: '6px', fontSize: '0.82rem' }}
              />
            </div>
          )}

          {/* Subject Field with Multi-Language Voice Typing + Convert to English */}
          <div className="form-group" style={{ marginBottom: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '6px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#cbd5e1' }}>Ticket Subject / Title</label>
              
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {/* Voice Language Selector */}
                <select
                  value={voiceLang}
                  onChange={e => setVoiceLang(e.target.value)}
                  style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    color: '#38bdf8',
                    padding: '3px 6px',
                    borderRadius: '6px',
                    fontSize: '0.7rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                  title="Select spoken language for Voice Typing"
                >
                  {VOICE_LANGUAGES.map(l => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>

                {/* 🎙️ Voice Typing Button */}
                <button
                  type="button"
                  onClick={() => startVoiceTyping('subject')}
                  style={{
                    backgroundColor: isListeningSubject ? '#ef4444' : 'rgba(239, 68, 68, 0.12)',
                    border: isListeningSubject ? '1px solid #ef4444' : '1px solid rgba(239, 68, 68, 0.4)',
                    color: isListeningSubject ? '#ffffff' : '#f87171',
                    padding: '3px 9px',
                    borderRadius: '6px',
                    fontSize: '0.7rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: isListeningSubject ? '0 0 12px rgba(239, 68, 68, 0.6)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                  title={`Click and speak in ${VOICE_LANGUAGES.find(l => l.code === voiceLang)?.short || 'Hindi'}`}
                >
                  {isListeningSubject ? <MicOff size={12} /> : <Mic size={12} />}
                  {isListeningSubject ? `🔴 Listening (${VOICE_LANGUAGES.find(l => l.code === voiceLang)?.short || 'Voice'})...` : `🎙️ Voice (${VOICE_LANGUAGES.find(l => l.code === voiceLang)?.short || 'Hindi'})`}
                </button>

                {/* ✨ Convert to English & Fix Grammar Button */}
                <button
                  type="button"
                  disabled={isTranslatingSubject}
                  onClick={handleConvertSubject}
                  style={{
                    background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    color: '#ffffff',
                    padding: '3px 10px',
                    borderRadius: '6px',
                    fontSize: '0.7rem',
                    fontWeight: '700',
                    cursor: isTranslatingSubject ? 'wait' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
                    opacity: isTranslatingSubject ? 0.7 : 1
                  }}
                  title="Translate into fluent English with Google Translate API"
                >
                  <Sparkles size={12} /> {isTranslatingSubject ? '⏳ Translating...' : '✨ Convert to English'}
                </button>
              </div>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                required
                value={formData.subject}
                onChange={e => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="Speak or type (e.g. Password reset krna h) then click 'Convert to English'..."
                style={{ width: '100%', padding: '0.55rem 2.2rem 0.55rem 0.75rem', backgroundColor: 'rgba(15, 23, 42, 0.6)', border: isListeningSubject ? '1.5px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)', color: '#ffffff', borderRadius: '8px', fontSize: '0.85rem' }}
              />
              <button
                type="button"
                onClick={() => startVoiceTyping('subject')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: isListeningSubject ? '#ef4444' : '#94a3b8',
                  cursor: 'pointer',
                  padding: '2px'
                }}
                title="Voice Typing (Click to speak)"
              >
                {isListeningSubject ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
            </div>
          </div>

          {/* Description Field with Multi-Language Voice Typing + Convert to English */}
          <div className="form-group" style={{ marginBottom: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '6px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#cbd5e1' }}>Issue Details & Instructions (Optional)</label>
              
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {/* 🎙️ Voice Typing Button */}
                <button
                  type="button"
                  onClick={() => startVoiceTyping('description')}
                  style={{
                    backgroundColor: isListeningDesc ? '#ef4444' : 'rgba(239, 68, 68, 0.12)',
                    border: isListeningDesc ? '1px solid #ef4444' : '1px solid rgba(239, 68, 68, 0.4)',
                    color: isListeningDesc ? '#ffffff' : '#f87171',
                    padding: '3px 9px',
                    borderRadius: '6px',
                    fontSize: '0.7rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: isListeningDesc ? '0 0 12px rgba(239, 68, 68, 0.6)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                  title={`Click and speak details in ${VOICE_LANGUAGES.find(l => l.code === voiceLang)?.short || 'Hindi'}`}
                >
                  {isListeningDesc ? <MicOff size={12} /> : <Mic size={12} />}
                  {isListeningDesc ? `🔴 Listening (${VOICE_LANGUAGES.find(l => l.code === voiceLang)?.short || 'Voice'})...` : `🎙️ Voice (${VOICE_LANGUAGES.find(l => l.code === voiceLang)?.short || 'Hindi'})`}
                </button>

                {/* ✨ Convert to English & Fix Grammar Button */}
                <button
                  type="button"
                  disabled={isTranslatingDesc}
                  onClick={handleConvertDescription}
                  style={{
                    background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    color: '#ffffff',
                    padding: '3px 10px',
                    borderRadius: '6px',
                    fontSize: '0.7rem',
                    fontWeight: '700',
                    cursor: isTranslatingDesc ? 'wait' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
                    opacity: isTranslatingDesc ? 0.7 : 1
                  }}
                  title="Translate into fluent English with Google Translate API"
                >
                  <Sparkles size={12} /> {isTranslatingDesc ? '⏳ Translating...' : '✨ Convert to English'}
                </button>
              </div>
            </div>
            <div style={{ position: 'relative' }}>
              <textarea
                rows="3"
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Speak or type in Hindi/Hinglish (e.g. client bol rha h server slow chal rha h restart kr do) then click 'Convert to English'..."
                style={{ width: '100%', padding: '0.55rem 2.2rem 0.55rem 0.75rem', backgroundColor: 'rgba(15, 23, 42, 0.6)', border: isListeningDesc ? '1.5px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)', color: '#ffffff', borderRadius: '8px', fontSize: '0.82rem', resize: 'vertical' }}
              />
              <button
                type="button"
                onClick={() => startVoiceTyping('description')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '12px',
                  background: 'none',
                  border: 'none',
                  color: isListeningDesc ? '#ef4444' : '#94a3b8',
                  cursor: 'pointer',
                  padding: '2px'
                }}
                title="Voice Typing (Click to speak)"
              >
                {isListeningDesc ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#cbd5e1' }}>Assign Support Executive / Staff</label>
            <select
              value={formData.assignedTo}
              onChange={handleStaffSelect}
              style={{ width: '100%', padding: '0.55rem', backgroundColor: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#ffffff', borderRadius: '8px', fontSize: '0.82rem' }}
            >
              <option value="Unassigned">-- Assign Later (Unassigned) --</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.name}>
                  {emp.name} ({emp.role} • {emp.email || 'No email'})
                </option>
              ))}
            </select>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '1rem' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#94a3b8',
                padding: '0.55rem 1.1rem',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                border: 'none',
                color: '#ffffff',
                padding: '0.55rem 1.4rem',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
              }}
            >
              <Ticket size={16} /> Create Ticket & Send Email
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

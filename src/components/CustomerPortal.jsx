import React, { useState, useRef } from 'react';
import {
  Ticket,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  Server,
  User,
  Phone,
  Mail,
  Mic,
  MicOff,
  Sparkles,
  Play,
  Square,
  RotateCcw,
  Volume2,
  ShieldCheck,
  Send,
  Building,
  HelpCircle,
  Clock,
  ArrowRight,
  Headphones
} from 'lucide-react';
import { translateHinglishToEnglish } from '../utils/nlpTranslate';
import { VOICE_LANGUAGES } from './TicketModal';

const COMMON_PORTAL_ISSUES = [
  { label: '⚡ Select Common Issue (Or Record / Type below)', category: 'General Support', defaultSubject: '' },
  { label: '🔑 Password Reset / RDP Login Failed', category: 'Login Issue', defaultSubject: 'Client TSplus / RDP Password Reset' },
  { label: '📊 Tally License / Gateway Error', category: 'Tally Error', defaultSubject: 'Tally License Server Unreachable / Error' },
  { label: '🖨️ Virtual Printer / Cloud Print Issue', category: 'Printer Issue', defaultSubject: 'Virtual Printer Redirection Failed' },
  { label: '💾 Disk Space Full / Storage Lag', category: 'Disk Space', defaultSubject: 'Client Allocated Drive Space Full' },
  { label: '🐢 Server Slowness / High Lag', category: 'Performance', defaultSubject: 'High Lag / Slow Response on Session' },
  { label: '➕ New User Setup / Permission Issue', category: 'User Setup', defaultSubject: 'New User Account Setup / Permission' },
  { label: '📋 Other Technical Assistance', category: 'General Support', defaultSubject: 'Technical Assistance Request' }
];

export default function CustomerPortal({ onSwitchToStaffLogin }) {
  // Verification Form State
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verifiedClient, setVerifiedClient] = useState(null);

  // Ticket Form State
  const [issueCategory, setIssueCategory] = useState('General Support');
  const [priority, setPriority] = useState('MEDIUM');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [voiceLang, setVoiceLang] = useState('hi-IN');

  // Voice Typing States
  const [isListeningSubject, setIsListeningSubject] = useState(false);
  const [isListeningDesc, setIsListeningDesc] = useState(false);
  const [isTranslatingSubject, setIsTranslatingSubject] = useState(false);
  const [isTranslatingDesc, setIsTranslatingDesc] = useState(false);
  const recognitionRef = useRef(null);

  // Audio Voice Note Recording States
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioBase64, setAudioBase64] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);

  // Submission States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState(null);

  // 1. VERIFY CLIENT
  const handleVerifyClient = async (e) => {
    e.preventDefault();
    if (!username.trim() || !phone.trim()) {
      setVerifyError('Please enter both your Username and Registered Phone Number.');
      return;
    }

    setIsVerifying(true);
    setVerifyError('');
    try {
      const res = await fetch('/api/public/verify-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), phone: phone.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success && data.client) {
        setVerifiedClient(data.client);
        setVerifyError('');
      } else {
        setVerifiedClient(null);
        setVerifyError(data.error || 'No registered client account found matching these credentials.');
      }
    } catch (err) {
      setVerifyError('Unable to connect to verification server. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  // 2. AUDIO NOTE RECORDING (MediaRecorder API)
  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          setAudioBase64(reader.result);
        };

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecordingAudio(true);
      setRecordingSeconds(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Mic access error:', err);
      alert('🎙️ Microphone access was blocked. Please allow microphone access in your browser to record a voice message.');
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorderRef.current && isRecordingAudio) {
      mediaRecorderRef.current.stop();
      setIsRecordingAudio(false);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  };

  const deleteAudioRecording = () => {
    setAudioBlob(null);
    setAudioBase64('');
    setAudioUrl('');
    setRecordingSeconds(0);
  };

  // 3. MULTILINGUAL VOICE TYPING (Speech-to-Text)
  const startVoiceTyping = async (field) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice typing is supported in Google Chrome, Edge, and mobile browsers.');
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

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = voiceLang || 'hi-IN';
      recognition.continuous = true;
      recognition.interimResults = true;

      const baseText = field === 'subject' ? subject.trim() : description.trim();

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
          if (field === 'subject') {
            setSubject(baseText ? `${baseText} ${currentSpoken}` : currentSpoken);
          } else {
            setDescription(baseText ? `${baseText} ${currentSpoken}` : currentSpoken);
          }
        }
      };

      recognition.onerror = () => {
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
      setIsListeningSubject(false);
      setIsListeningDesc(false);
    }
  };

  // 4. GOOGLE TRANSLATE ENGINE
  const handleConvertSubject = async () => {
    if (!subject) return;
    setIsTranslatingSubject(true);
    try {
      const trans = await translateHinglishToEnglish(subject);
      setSubject(trans);
    } finally {
      setIsTranslatingSubject(false);
    }
  };

  const handleConvertDescription = async () => {
    if (!description) return;
    setIsTranslatingDesc(true);
    try {
      const trans = await translateHinglishToEnglish(description);
      setDescription(trans);
    } finally {
      setIsTranslatingDesc(false);
    }
  };

  // 5. SUBMIT PUBLIC TICKET
  const handleSubmitTicket = async (e) => {
    e.preventDefault();
    if (!verifiedClient) {
      alert('Please verify your username and phone number first.');
      return;
    }

    if (!subject.trim() && !description.trim() && !audioBase64) {
      alert('Please provide a subject, description, or record a voice note explaining your issue.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        username: verifiedClient.username,
        phone: verifiedClient.phone,
        company: verifiedClient.company,
        customerEmail: verifiedClient.email,
        serverId: verifiedClient.serverId,
        serverName: verifiedClient.serverName,
        drive: verifiedClient.drive,
        issueCategory,
        priority,
        subject: subject.trim() || (audioBase64 ? '🎙️ Voice Message Support Ticket' : `${issueCategory} Support Request`),
        description: description.trim(),
        audioBase64: audioBase64 || ''
      };

      const res = await fetch('/api/public/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success && data.ticket) {
        setSubmittedTicket(data.ticket);
      } else {
        alert(data.error || 'Failed to submit ticket. Please check connection and try again.');
      }
    } catch (err) {
      alert('Server error occurred during ticket submission.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatSeconds = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#060911', color: '#ffffff', fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <header style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', backgroundColor: 'rgba(11, 15, 25, 0.9)', backdropFilter: 'blur(12px)', padding: '0.85rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #0284c7, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 15px rgba(2, 132, 199, 0.4)' }}>
            <Headphones size={20} color="#ffffff" />
          </div>
          <div>
            <div style={{ fontWeight: '800', fontSize: '1.05rem', letterSpacing: '-0.02em', color: '#ffffff' }}>
              VPS <span style={{ color: '#38bdf8' }}>Helpdesk</span>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Innovation Web Works Customer Portal</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <a
            href="https://wa.me/919999999999"
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: '0.76rem', fontWeight: '700', color: '#34d399', textDecoration: 'none', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '5px 10px', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.3)' }}
          >
            💬 WhatsApp Helpdesk
          </a>
          <button
            type="button"
            onClick={onSwitchToStaffLogin}
            style={{ fontSize: '0.76rem', fontWeight: '600', color: '#94a3b8', background: 'transparent', border: '1px solid rgba(255, 255, 255, 0.12)', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer' }}
          >
            Staff Login
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ flex: 1, maxWidth: '780px', width: '100%', margin: '0 auto', padding: '2rem 1.25rem' }}>
        {submittedTicket ? (
          <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '16px', padding: '2.5rem 1.75rem', textAlign: 'center', boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '2px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem auto' }}>
              <CheckCircle2 size={36} color="#10b981" />
            </div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#ffffff', margin: '0 0 0.5rem 0' }}>Ticket Raised Successfully!</h2>
            <p style={{ color: '#94a3b8', fontSize: '0.88rem', maxWidth: '450px', margin: '0 auto 1.5rem auto' }}>
              Your support ticket has been received by our technical engineering desk. We are actively reviewing it.
            </p>

            <div style={{ backgroundColor: 'rgba(6, 9, 17, 0.8)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '1.25rem', maxWidth: '480px', margin: '0 auto 1.75rem auto', textAlign: 'left', fontSize: '0.84rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.6rem', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <span style={{ color: '#64748b' }}>Ticket ID:</span>
                <span style={{ color: '#38bdf8', fontWeight: '800' }}>{submittedTicket.id}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <span style={{ color: '#64748b' }}>Client / Company:</span>
                <span style={{ color: '#ffffff', fontWeight: '700' }}>{submittedTicket.company}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <span style={{ color: '#64748b' }}>Server Node:</span>
                <span style={{ color: '#cbd5e1' }}>{submittedTicket.serverName} ({submittedTicket.drive})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <span style={{ color: '#64748b' }}>Status:</span>
                <span style={{ color: '#fbbf24', fontWeight: '800', backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>PENDING REVIEW</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.6rem' }}>
                <span style={{ color: '#64748b' }}>Voice Message:</span>
                <span style={{ color: submittedTicket.voiceNoteUrl ? '#34d399' : '#94a3b8', fontWeight: '600' }}>
                  {submittedTicket.voiceNoteUrl ? '🎙️ Attached (.webm)' : 'None'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
              <button
                type="button"
                onClick={() => {
                  setSubmittedTicket(null);
                  setSubject('');
                  setDescription('');
                  deleteAudioRecording();
                }}
                style={{ background: 'linear-gradient(135deg, #0284c7, #2563eb)', color: '#ffffff', border: 'none', padding: '0.65rem 1.5rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer' }}
              >
                Raise Another Ticket
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
              <h1 style={{ fontSize: '1.75rem', fontWeight: '900', letterSpacing: '-0.03em', color: '#ffffff', margin: '0 0 0.5rem 0' }}>
                Raise a <span style={{ color: '#38bdf8' }}>Support Ticket</span>
              </h1>
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>
                Enter your registered VPS username and phone number to verify and raise an issue via Voice Note or Text.
              </p>
            </div>

            {/* STEP 1: IDENTITY VERIFICATION */}
            <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.8)', border: verifiedClient ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '14px', padding: '1.35rem', marginBottom: '1.5rem', boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: verifiedClient ? '#10b981' : '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: '800', color: '#fff' }}>
                    1
                  </div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800', color: '#ffffff' }}>
                    Verify Your Registered Account
                  </h3>
                </div>

                {verifiedClient && (
                  <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#34d399', backgroundColor: 'rgba(16, 185, 129, 0.15)', padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={13} /> Verified Account
                  </span>
                )}
              </div>

              {!verifiedClient ? (
                <form onSubmit={handleVerifyClient}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#cbd5e1', display: 'block', marginBottom: '4px' }}>
                        1. Client Username <span style={{ color: '#f43f5e' }}>*</span>
                      </label>
                      <div style={{ position: 'relative' }}>
                        <User size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                        <input
                          type="text"
                          required
                          placeholder="e.g. rohit_tally or Company"
                          value={username}
                          onChange={e => setUsername(e.target.value)}
                          style={{ width: '100%', padding: '0.55rem 0.65rem 0.55rem 2rem', backgroundColor: '#090d16', border: '1px solid rgba(255, 255, 255, 0.12)', color: '#ffffff', borderRadius: '8px', fontSize: '0.85rem' }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#cbd5e1', display: 'block', marginBottom: '4px' }}>
                        2. Registered Phone Number <span style={{ color: '#f43f5e' }}>*</span>
                      </label>
                      <div style={{ position: 'relative' }}>
                        <Phone size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                        <input
                          type="tel"
                          required
                          placeholder="e.g. 9876543210"
                          value={phone}
                          onChange={e => setPhone(e.target.value)}
                          style={{ width: '100%', padding: '0.55rem 0.65rem 0.55rem 2rem', backgroundColor: '#090d16', border: '1px solid rgba(255, 255, 255, 0.12)', color: '#ffffff', borderRadius: '8px', fontSize: '0.85rem' }}
                        />
                      </div>
                    </div>
                  </div>

                  {verifyError && (
                    <div style={{ padding: '0.65rem 0.85rem', backgroundColor: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.35)', color: '#f87171', borderRadius: '8px', fontSize: '0.78rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertCircle size={15} />
                      <span>{verifyError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isVerifying}
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                      color: '#ffffff',
                      border: 'none',
                      padding: '0.65rem',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: '800',
                      cursor: isVerifying ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    {isVerifying ? '🔍 Verifying Account...' : 'Verify My Account & Proceed'}
                  </button>
                </form>
              ) : (
                /* VERIFIED CLIENT DETAILS CARD */
                <div style={{ backgroundColor: 'rgba(6, 9, 17, 0.8)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '10px', padding: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem', fontSize: '0.8rem' }}>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '0.72rem', display: 'block' }}>Company / Client:</span>
                      <strong style={{ color: '#ffffff', fontSize: '0.9rem' }}>{verifiedClient.company}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '0.72rem', display: 'block' }}>Username:</span>
                      <strong style={{ color: '#38bdf8' }}>{verifiedClient.username}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '0.72rem', display: 'block' }}>Server IP Node:</span>
                      <strong style={{ color: '#34d399' }}>{verifiedClient.serverName || 'VPS'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '0.72rem', display: 'block' }}>Assigned Drive:</span>
                      <strong style={{ color: '#fbbf24' }}>{verifiedClient.drive || 'Drive D'}</strong>
                    </div>
                  </div>

                  <div style={{ marginTop: '0.75rem', paddingTop: '0.6rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                      ✉️ Notification Email: <strong style={{ color: '#cbd5e1' }}>{verifiedClient.email || 'Not specified'}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setVerifiedClient(null);
                        setVerifyError('');
                      }}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Change Username / Phone
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* STEP 2: ISSUE DETAILS & VOICE NOTE */}
            {verifiedClient && (
              <form onSubmit={handleSubmitTicket} style={{ backgroundColor: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '14px', padding: '1.35rem', boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.25rem' }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: '800', color: '#fff' }}>
                    2
                  </div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800', color: '#ffffff' }}>
                    Describe Your Issue (Voice Message or Text)
                  </h3>
                </div>

                {/* 🎙️ 1. DIRECT VOICE MESSAGE AUDIO RECORDER */}
                <div style={{ backgroundColor: 'rgba(6, 9, 17, 0.9)', border: isRecordingAudio ? '1.5px solid #ef4444' : '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '12px', padding: '1.1rem', marginBottom: '1.25rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#38bdf8', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Volume2 size={16} /> 🎙️ Send Voice Audio Message (Best & Fastest)
                  </div>
                  <p style={{ fontSize: '0.74rem', color: '#94a3b8', margin: '0 0 0.85rem 0' }}>
                    Click the microphone below and speak naturally in your own language to explain your problem to our engineers.
                  </p>

                  {!audioBlob ? (
                    <div>
                      {!isRecordingAudio ? (
                        <button
                          type="button"
                          onClick={startAudioRecording}
                          style={{
                            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                            color: '#ffffff',
                            border: 'none',
                            padding: '0.65rem 1.4rem',
                            borderRadius: '30px',
                            fontSize: '0.84rem',
                            fontWeight: '800',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 15px rgba(239, 68, 68, 0.4)'
                          }}
                        >
                          <Mic size={16} /> Record Voice Message
                        </button>
                      ) : (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ color: '#ef4444', fontWeight: '800', fontSize: '0.9rem', animation: 'pulse 1s infinite' }}>
                            🔴 Recording: {formatSeconds(recordingSeconds)}
                          </span>
                          <button
                            type="button"
                            onClick={stopAudioRecording}
                            style={{
                              backgroundColor: '#ffffff',
                              color: '#ef4444',
                              border: 'none',
                              padding: '0.55rem 1.2rem',
                              borderRadius: '25px',
                              fontSize: '0.8rem',
                              fontWeight: '800',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <Square size={14} fill="#ef4444" /> Stop & Save
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* RECORDED AUDIO PLAYER PREVIEW */
                    <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.35)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CheckCircle2 size={18} color="#10b981" />
                        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#34d399' }}>
                          Voice Note Recorded ({formatSeconds(recordingSeconds)})
                        </span>
                      </div>

                      <audio controls src={audioUrl} style={{ height: '36px', maxWidth: '240px' }} />

                      <button
                        type="button"
                        onClick={deleteAudioRecording}
                        style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '0.75rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'underline' }}
                      >
                        <RotateCcw size={12} /> Re-record
                      </button>
                    </div>
                  )}
                </div>

                {/* Common Issue Selector */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#cbd5e1', display: 'block', marginBottom: '4px' }}>
                    Quick Issue Category
                  </label>
                  <select
                    value={issueCategory}
                    onChange={e => {
                      setIssueCategory(e.target.value);
                      const found = COMMON_PORTAL_ISSUES.find(i => i.category === e.target.value || i.label.includes(e.target.value));
                      if (found && found.defaultSubject) setSubject(found.defaultSubject);
                    }}
                    style={{ width: '100%', padding: '0.55rem', backgroundColor: '#090d16', border: '1px solid rgba(255, 255, 255, 0.12)', color: '#38bdf8', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '700' }}
                  >
                    {COMMON_PORTAL_ISSUES.map((issue, idx) => (
                      <option key={idx} value={issue.category}>{issue.label}</option>
                    ))}
                  </select>
                </div>

                {/* Subject Field with Multi-Language Voice Typing + Translate */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '6px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#cbd5e1' }}>
                      Ticket Title / Subject
                    </label>

                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <select
                        value={voiceLang}
                        onChange={e => setVoiceLang(e.target.value)}
                        style={{ backgroundColor: '#090d16', border: '1px solid rgba(56, 189, 248, 0.35)', color: '#38bdf8', padding: '2px 6px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: '700' }}
                      >
                        {VOICE_LANGUAGES.map(l => (
                          <option key={l.code} value={l.code}>{l.label}</option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => startVoiceTyping('subject')}
                        style={{
                          backgroundColor: isListeningSubject ? '#ef4444' : 'rgba(239, 68, 68, 0.12)',
                          border: isListeningSubject ? '1px solid #ef4444' : '1px solid rgba(239, 68, 68, 0.4)',
                          color: isListeningSubject ? '#ffffff' : '#f87171',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '0.68rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {isListeningSubject ? <MicOff size={11} /> : <Mic size={11} />}
                        {isListeningSubject ? '🔴 Listening...' : '🎙️ Voice Type'}
                      </button>

                      <button
                        type="button"
                        disabled={isTranslatingSubject}
                        onClick={handleConvertSubject}
                        style={{
                          background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                          border: 'none',
                          color: '#ffffff',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '0.68rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                      >
                        <Sparkles size={11} /> {isTranslatingSubject ? 'Translating...' : '✨ To English'}
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="e.g. Password reset or Tally not starting..."
                    style={{ width: '100%', padding: '0.55rem 0.75rem', backgroundColor: '#090d16', border: '1px solid rgba(255, 255, 255, 0.12)', color: '#ffffff', borderRadius: '8px', fontSize: '0.85rem' }}
                  />
                </div>

                {/* Description with Voice Typing */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '6px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#cbd5e1' }}>
                      Additional Details / Remarks (Optional)
                    </label>

                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => startVoiceTyping('description')}
                        style={{
                          backgroundColor: isListeningDesc ? '#ef4444' : 'rgba(239, 68, 68, 0.12)',
                          border: isListeningDesc ? '1px solid #ef4444' : '1px solid rgba(239, 68, 68, 0.4)',
                          color: isListeningDesc ? '#ffffff' : '#f87171',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '0.68rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {isListeningDesc ? <MicOff size={11} /> : <Mic size={11} />}
                        {isListeningDesc ? '🔴 Listening...' : '🎙️ Voice Type'}
                      </button>

                      <button
                        type="button"
                        disabled={isTranslatingDesc}
                        onClick={handleConvertDescription}
                        style={{
                          background: 'linear-gradient(135deg, #0284c7, #2563eb)',
                          border: 'none',
                          color: '#ffffff',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '0.68rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                      >
                        <Sparkles size={11} /> {isTranslatingDesc ? 'Translating...' : '✨ To English'}
                      </button>
                    </div>
                  </div>

                  <textarea
                    rows="3"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Speak or type in Hindi/English (e.g. Please check user session on drive d)..."
                    style={{ width: '100%', padding: '0.55rem 0.75rem', backgroundColor: '#090d16', border: '1px solid rgba(255, 255, 255, 0.12)', color: '#ffffff', borderRadius: '8px', fontSize: '0.82rem', resize: 'vertical' }}
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    fontWeight: '800',
                    cursor: isSubmitting ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)'
                  }}
                >
                  <Send size={16} /> {isSubmitting ? '⏳ Submitting Ticket...' : 'Submit Support Ticket Now'}
                </button>
              </form>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', padding: '1rem', textAlign: 'center', fontSize: '0.72rem', color: '#64748b' }}>
        Innovation Web Works • 24x7 VPS Operations & Enterprise Technical Helpdesk
      </footer>
    </div>
  );
}

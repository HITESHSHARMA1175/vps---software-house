import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Eye,
  RefreshCw,
  Maximize2,
  Minimize2,
  Download,
  ExternalLink,
  Shield,
  Activity,
  Radio,
  Clock,
  Sparkles,
  AlertCircle,
  Play,
  Pause
} from 'lucide-react';

export default function LiveScreenModal({
  isOpen,
  onClose,
  session,
  server,
  onOpenWebConsole
}) {
  const [screenBase64, setScreenBase64] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastCapturedAt, setLastCapturedAt] = useState(null);
  const [refreshInterval, setRefreshInterval] = useState(2500); // 2.5s default auto-refresh
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [latencyMs, setLatencyMs] = useState(null);

  const containerRef = useRef(null);
  const timerRef = useRef(null);
  const isFetchingRef = useRef(false);

  const serverId = session?.serverId || server?.id || server?.ipPort;
  const sessionId = session?.sessionId || '1';
  const username = session?.username || 'Client';
  const serverName = session?.serverName || server?.name || session?.serverIp || 'VPS Server';

  const fetchLiveFrame = useCallback(async (isManual = false) => {
    if (!serverId || !sessionId) return;
    if (isFetchingRef.current && !isManual) return;

    isFetchingRef.current = true;
    if (isManual) setLoading(true);

    const startTime = Date.now();
    try {
      const url = `/api/servers/${encodeURIComponent(serverId)}/sessions/${encodeURIComponent(sessionId)}/live-screen${isManual ? '?force=true' : ''}`;
      const res = await fetch(url);
      const data = await res.json();

      const elapsed = Date.now() - startTime;
      setLatencyMs(elapsed);

      if (data.success && data.screenBase64) {
        setScreenBase64(data.screenBase64);
        setLastCapturedAt(data.capturedAt || new Date().toLocaleTimeString());
        setError(null);
      } else if (data.pending) {
        // Still pending on agent, keep last frame
        if (!screenBase64) {
          setError(data.message || 'Connecting to session screen feed...');
        }
      } else {
        if (!screenBase64) {
          setError(data.error || data.message || 'Unable to capture session display.');
        }
      }
    } catch (err) {
      if (!screenBase64) {
        setError('Network error contacting screen streaming API.');
      }
    } finally {
      isFetchingRef.current = false;
      if (isManual) setLoading(false);
    }
  }, [serverId, sessionId, screenBase64]);

  // Initial fetch and polling loop
  useEffect(() => {
    if (!isOpen) {
      setScreenBase64(null);
      setError(null);
      setLastCapturedAt(null);
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // First snapshot
    fetchLiveFrame(true);

    // Setup auto-refresh timer
    if (isAutoRefresh && refreshInterval > 0) {
      timerRef.current = setInterval(() => {
        fetchLiveFrame(false);
      }, refreshInterval);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, isAutoRefresh, refreshInterval, fetchLiveFrame]);

  // Fullscreen toggle handler
  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  // Download screenshot
  const handleDownloadSnapshot = () => {
    if (!screenBase64) return;
    const link = document.createElement('a');
    link.href = `data:image/jpeg;base64,${screenBase64}`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.download = `Screen_${username}_Session${sessionId}_${timestamp}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen || !session) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        zIndex: 1600,
        backgroundColor: 'rgba(0, 0, 0, 0.88)',
        backdropFilter: 'blur(8px)'
      }}
    >
      <div
        ref={containerRef}
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: isFullscreen ? '100vw' : '1100px',
          width: isFullscreen ? '100vw' : '95%',
          height: isFullscreen ? '100vh' : 'auto',
          maxHeight: isFullscreen ? '100vh' : '92vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '1.25rem',
          backgroundColor: '#0b1120',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: isFullscreen ? '0px' : '16px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9), 0 0 30px rgba(56, 189, 248, 0.15)'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 15px rgba(16, 185, 129, 0.4)'
            }}>
              <Eye size={18} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#ffffff' }}>
                  Live Screen Viewer — {username}
                </span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }} />
                  Session {sessionId}
                </span>
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  ({serverName})
                </span>
              </div>
              <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
                Zero Credentials Required • Direct Windows Desktop Snapshot Stream
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {onOpenWebConsole && (
              <button
                onClick={() => {
                  onClose();
                  onOpenWebConsole(session);
                }}
                className="btn btn-secondary btn-sm"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  borderColor: 'rgba(56, 189, 248, 0.3)',
                  color: '#38bdf8',
                  fontSize: '12px',
                  padding: '5px 10px'
                }}
                title="Switch to interactive TSplus Web Console to type and click"
              >
                <ExternalLink size={13} />
                <span>Interactive Console</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--text-muted)', padding: '6px' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Action & Stream Controls Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '10px',
          padding: '8px 12px',
          marginBottom: '12px',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          {/* Left: Stream Mode Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setIsAutoRefresh(!isAutoRefresh)}
              className={`btn btn-xs ${isAutoRefresh ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: isAutoRefresh ? 'linear-gradient(135deg, #10b981, #059669)' : undefined,
                border: 'none',
                padding: '4px 9px',
                fontSize: '11.5px'
              }}
            >
              {isAutoRefresh ? <Play size={12} fill="#ffffff" /> : <Pause size={12} />}
              <span>{isAutoRefresh ? 'Live Feed (ON)' : 'Paused'}</span>
            </button>

            {isAutoRefresh && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Interval:</span>
                {[
                  { label: '1s', val: 1000 },
                  { label: '2.5s', val: 2500 },
                  { label: '5s', val: 5000 }
                ].map(opt => (
                  <button
                    key={opt.val}
                    onClick={() => setRefreshInterval(opt.val)}
                    style={{
                      padding: '2px 7px',
                      fontSize: '11px',
                      borderRadius: '4px',
                      border: '1px solid',
                      borderColor: refreshInterval === opt.val ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                      backgroundColor: refreshInterval === opt.val ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                      color: refreshInterval === opt.val ? '#34d399' : 'var(--text-muted)',
                      cursor: 'pointer'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Manual Capture, Fullscreen, Download */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => fetchLiveFrame(true)}
              disabled={loading}
              className="btn btn-secondary btn-xs"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 9px', fontSize: '11.5px' }}
              title="Capture immediate screenshot frame"
            >
              <RefreshCw size={12} className={loading ? 'spin' : ''} />
              <span>Snapshot</span>
            </button>

            <button
              onClick={handleDownloadSnapshot}
              disabled={!screenBase64}
              className="btn btn-secondary btn-xs"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 9px', fontSize: '11.5px' }}
              title="Download image (.jpg)"
            >
              <Download size={12} />
              <span>Save</span>
            </button>

            <button
              onClick={handleToggleFullscreen}
              className="btn btn-secondary btn-xs"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 9px', fontSize: '11.5px' }}
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              <span>{isFullscreen ? 'Exit Full' : 'Fullscreen'}</span>
            </button>
          </div>
        </div>

        {/* Live Screen Canvas Container */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#030712',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          overflow: 'hidden',
          position: 'relative',
          minHeight: '440px'
        }}>
          {screenBase64 ? (
            <img
              src={`data:image/jpeg;base64,${screenBase64}`}
              alt={`Live Screen ${username} Session ${sessionId}`}
              style={{
                width: '100%',
                height: '100%',
                maxHeight: isFullscreen ? 'calc(100vh - 120px)' : '68vh',
                objectFit: 'contain',
                display: 'block'
              }}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem', maxWidth: '420px' }}>
              {error ? (
                <div>
                  <AlertCircle size={44} color="#f59e0b" style={{ margin: '0 auto 12px', opacity: 0.8 }} />
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#ffffff', marginBottom: '6px' }}>
                    Screen Feed Unavailable
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
                    {error}
                  </div>
                  <button
                    onClick={() => fetchLiveFrame(true)}
                    className="btn btn-primary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <RefreshCw size={13} />
                    <span>Retry Screen Capture</span>
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '50%',
                    border: '3px solid rgba(56, 189, 248, 0.2)',
                    borderTopColor: '#38bdf8',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 16px'
                  }} />
                  <div style={{ fontSize: '14px', fontWeight: '700', color: '#ffffff', marginBottom: '4px' }}>
                    Connecting to Session {sessionId}...
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Fetching live Windows desktop from {serverName}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Subdued live watermark overlay in bottom right */}
          {screenBase64 && (
            <div style={{
              position: 'absolute',
              bottom: '10px',
              right: '12px',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(4px)',
              padding: '3px 8px',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              fontSize: '10.5px',
              color: '#34d399',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
              <span>LIVE • Session {sessionId}</span>
            </div>
          )}
        </div>

        {/* Footer Info Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '10px',
          paddingTop: '8px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          fontSize: '11px',
          color: 'var(--text-muted)',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span>Target: <strong style={{ color: '#ffffff' }}>{username}</strong></span>
            <span>Session: <strong style={{ color: '#ffffff' }}>{sessionId}</strong></span>
            <span>Status: <strong style={{ color: '#34d399' }}>Active</strong></span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {latencyMs !== null && (
              <span>Latency: <strong style={{ color: latencyMs < 800 ? '#34d399' : '#f59e0b' }}>{latencyMs}ms</strong></span>
            )}
            {lastCapturedAt && (
              <span>Updated: <strong style={{ color: '#ffffff' }}>{lastCapturedAt}</strong></span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

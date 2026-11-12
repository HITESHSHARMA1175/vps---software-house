import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, RefreshCw, Send, AlertTriangle } from 'lucide-react';
import { useAuth, API_BASE } from '../contexts/AuthContext';

/**
 * Agent key rollout panel (SUPER_ADMIN only).
 * Shows per-server delivery status from GET /api/agent-keys/status and lets the admin
 * deliver keys in bulk or retry one server. It never receives or shows a key or hash.
 */
export default function AgentKeyRolloutPanel({ servers = [] }) {
  const { currentUser, authFetch } = useAuth();
  const isSuperAdmin = currentUser && currentUser.role === 'SUPER_ADMIN';

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const readError = async (res, fallback) => {
    try {
      const body = await res.json();
      return body.error || body.message || fallback;
    } catch (e) {
      return fallback;
    }
  };

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authFetch(`${API_BASE}/agent-keys/status`);
      if (!res.ok) throw new Error(await readError(res, 'Could not load rollout status.'));
      setStatus(await res.json());
    } catch (e) {
      setError(e.message || 'Could not load rollout status.');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    if (isSuperAdmin) loadStatus();
  }, [isSuperAdmin, loadStatus]);

  if (!isSuperAdmin) return null;

  const deliverAll = async () => {
    setBusyId('ALL');
    setError('');
    setResult(null);
    try {
      const res = await authFetch(`${API_BASE}/servers/deploy-agent-keys`, { method: 'POST', body: JSON.stringify({}) });
      if (!res.ok) throw new Error(await readError(res, 'Bulk delivery failed.'));
      setResult(await res.json());
      await loadStatus();
    } catch (e) {
      setError(e.message || 'Bulk delivery failed.');
    } finally {
      setBusyId(null);
    }
  };

  const retryOne = async (serverId) => {
    setBusyId(serverId);
    setError('');
    setResult(null);
    try {
      const res = await authFetch(`${API_BASE}/servers/${encodeURIComponent(serverId)}/deploy-agent-key`, { method: 'POST' });
      if (!res.ok) throw new Error(await readError(res, 'Delivery failed.'));
      const body = await res.json().catch(() => ({}));
      setResult({
        queued: body.queued || [],
        needs_update: body.needs_update || [],
        skipped: body.skipped || []
      });
      await loadStatus();
    } catch (e) {
      setError(e.message || 'Delivery failed.');
    } finally {
      setBusyId(null);
    }
  };

  const nameFor = (id) => {
    const s = servers.find((x) => x.id === id);
    return s ? s.name : id;
  };
  const idOf = (item) => (item && typeof item === 'object' ? (item.serverId || item.id) : item);

  const rows = (status && Array.isArray(status.servers)) ? status.servers : [];
  const ready = !!(status && status.readyForEnforce);
  const needsUpdate = result && Array.isArray(result.needs_update) ? result.needs_update : [];

  return (
    <section
      aria-labelledby="agent-key-rollout-title"
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '10px',
        padding: '0.9rem 1rem',
        margin: '1rem 0'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <strong id="agent-key-rollout-title" style={{ fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
          Agent key rollout
          <span
            style={{
              fontSize: '0.72rem',
              padding: '2px 8px',
              borderRadius: '999px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              color: ready ? '#4ade80' : '#fbbf24',
              backgroundColor: ready ? 'rgba(34, 197, 94, 0.12)' : 'rgba(245, 158, 11, 0.12)',
              border: `1px solid ${ready ? 'rgba(34, 197, 94, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`
            }}
          >
            {ready ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
            {ready ? 'Ready for enforce' : 'Not ready for enforce'}
          </span>
        </strong>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={loadStatus} disabled={loading || busyId !== null}>
            <RefreshCw size={14} /> {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={deliverAll} disabled={busyId !== null}>
            <Send size={14} /> {busyId === 'ALL' ? 'Delivering...' : 'Deliver keys to all servers'}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" style={{ marginTop: '8px', display: 'flex', gap: '6px', fontSize: '0.8rem', color: '#fca5a5' }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div role="status" style={{ marginTop: '8px', fontSize: '0.8rem', color: '#cbd5e1' }}>
          Queued: {(result.queued || []).length} · Needs agent update: {needsUpdate.length} · Skipped: {(result.skipped || []).length}
          {needsUpdate.length > 0 && (
            <div style={{ marginTop: '4px', color: '#fbbf24' }}>
              These servers run an older agent and were sent an agent update first:{' '}
              {needsUpdate.map((item) => nameFor(idOf(item))).join(', ')}. Deliver keys again once they update.
            </div>
          )}
        </div>
      )}

      <div style={{ overflowX: 'auto', marginTop: '10px' }}>
        <table className="vps-fleet-table">
          <thead>
            <tr>
              <th scope="col">Server</th>
              <th scope="col">Key installed</th>
              <th scope="col">Valid request</th>
              <th scope="col">Last valid</th>
              <th scope="col">Agent version</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{loading ? 'Loading...' : 'No status available.'}</td></tr>
            )}
            {rows.map((row) => (
              <tr key={row.serverId}>
                <td>{nameFor(row.serverId)}</td>
                <td style={{ color: row.hasHash ? '#4ade80' : '#fca5a5' }}>{row.hasHash ? 'Yes' : 'No'}</td>
                <td style={{ color: row.lastRequestValid ? '#4ade80' : '#fca5a5' }}>{row.lastRequestValid ? 'Yes' : 'No'}</td>
                <td>{row.lastValidAt ? new Date(row.lastValidAt).toLocaleString() : 'Never'}</td>
                <td>{row.agentVersion || 'Unknown'}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => retryOne(row.serverId)}
                    disabled={busyId !== null}
                    aria-label={`Deliver key to ${nameFor(row.serverId)}`}
                  >
                    {busyId === row.serverId ? 'Sending...' : 'Retry'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

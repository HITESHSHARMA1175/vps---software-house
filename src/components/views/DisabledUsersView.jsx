import React, { useState, useMemo } from 'react';
import {
  UserMinus,
  Server,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Download,
  ShieldAlert,
  UserX,
  Building,
  Key,
  Unlock
} from 'lucide-react';
import AgentInstallModal from '../AgentInstallModal';

export default function DisabledUsersView({
  servers = [],
  users = [],
  telemetryData = {},
  onDirectRemoteConnect,
  onRefreshTelemetry,
  onToggleUserStatus,
  onChangePassword
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [serverFilter, setServerFilter] = useState('ALL');
  const [reasonFilter, setReasonFilter] = useState('ALL');
  const [selectedAgentServer, setSelectedAgentServer] = useState(servers[0]?.id || '');
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);

  // Compute full comprehensive list of disabled accounts across server nodes & subscriptions
  const allDisabledAccounts = useMemo(() => {
    const items = [];
    const seenKeys = new Set();

    // 1. Gather OS-level disabled accounts from ALL telemetry nodes & server records
    servers.forEach(s => {
      const sIpPure = s.ipPort ? s.ipPort.split(':')[0] : '';
      const tData = telemetryData[s.id] || telemetryData[s.ipPort] || telemetryData[s.name] || (sIpPure && telemetryData[sIpPure]) || null;
      const rawDisabled = tData?.disabledServerUsers || s.lastKnownDisabledUsers;
      const agentDisabledNames = Array.isArray(rawDisabled)
        ? rawDisabled.map(u => (u || '').toLowerCase())
        : (typeof rawDisabled === 'string' && rawDisabled ? [rawDisabled.toLowerCase()] : []);

      agentDisabledNames.forEach(uLower => {
        const itemKey = `dis-agent-${s.id}-${uLower}`;
        if (!seenKeys.has(itemKey)) {
          seenKeys.add(itemKey);
          const matched = users.find(usr => 
            (usr.username || '').toLowerCase() === uLower && 
            (usr.serverId === s.id || usr.serverId === s.ipPort || usr.serverId === s.name || (sIpPure && usr.serverId === sIpPure))
          );
          items.push({
            id: itemKey,
            username: matched ? matched.username : uLower,
            company: matched ? matched.company : (matched ? matched.username : uLower),
            serverId: s.id,
            serverName: s.name || s.ipPort || 'Windows VPS Node',
            serverIp: s.ipPort || s.name,
            type: 'AGENT_DISABLED',
            reason: 'Windows Local Account Disabled (OS Level)',
            userObj: matched || { username: uLower, company: uLower, serverId: s.id }
          });
        }
      });
    });

    // Also check any raw telemetryData keys not explicitly mapped in servers array
    Object.keys(telemetryData || {}).forEach(tKey => {
      const tData = telemetryData[tKey];
      const rawDisabled = tData?.disabledServerUsers;
      const disArr = Array.isArray(rawDisabled)
        ? rawDisabled
        : (typeof rawDisabled === 'string' && rawDisabled ? [rawDisabled] : []);

      if (disArr.length > 0) {
        const matchedServer = servers.find(s => s.id === tKey || s.ipPort === tKey || s.name === tKey);
        disArr.forEach(uName => {
          const uLower = (uName || '').toLowerCase();
          const itemKey = `dis-agent-raw-${tKey}-${uLower}`;
          const existingKey = `dis-agent-${matchedServer?.id}-${uLower}`;
          if (!seenKeys.has(itemKey) && !seenKeys.has(existingKey)) {
            seenKeys.add(itemKey);
            items.push({
              id: itemKey,
              username: uName,
              company: uName,
              serverId: matchedServer?.id || tKey,
              serverName: matchedServer?.name || tKey,
              serverIp: matchedServer?.ipPort || tKey,
              type: 'AGENT_DISABLED',
              reason: 'Windows Local Account Disabled (OS Level)',
              userObj: { username: uName, company: uName, serverId: matchedServer?.id || tKey }
            });
          }
        });
      }
    });

    // 2. Gather ALL client subscriptions explicitly marked as Disabled / Suspended / Inactive / Expired
    users.forEach(u => {
      const uLower = (u.username || '').toLowerCase();
      const statusLower = (u.status || '').toLowerCase();
      const isSuspendedOrDisabled = statusLower === 'disabled' || statusLower === 'suspended' || statusLower === 'inactive' || statusLower === 'expired' || u.isDisabled === true;

      if (isSuspendedOrDisabled) {
        const itemKey = `dis-db-${u.id || uLower}`;
        if (!seenKeys.has(itemKey)) {
          seenKeys.add(itemKey);
          const matchedServer = servers.find(s => s.id === u.serverId || s.ipPort === u.serverId || s.name === u.serverId);
          items.push({
            id: itemKey,
            username: u.username,
            company: u.company || u.username,
            serverId: matchedServer ? matchedServer.id : (u.serverId || 'UNASSIGNED'),
            serverName: matchedServer ? matchedServer.name : (u.serverId || 'System Wide'),
            serverIp: matchedServer ? matchedServer.ipPort : 'N/A',
            type: 'SUBSCRIPTION_DISABLED',
            reason: `Subscription ${u.status || 'Disabled'}`,
            userObj: u
          });
        }
      }
    });

    return items;
  }, [servers, users, telemetryData]);

  // Filtered disabled accounts list
  const filteredAccounts = allDisabledAccounts.filter(acc => {
    if (serverFilter !== 'ALL' && acc.serverId !== serverFilter) return false;
    if (reasonFilter !== 'ALL' && acc.type !== reasonFilter) return false;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchName = (acc.username || '').toLowerCase().includes(q);
      const matchComp = (acc.company || '').toLowerCase().includes(q);
      const matchServer = (acc.serverName || '').toLowerCase().includes(q);
      if (!matchName && !matchComp && !matchServer) return false;
    }
    return true;
  });

  const agentDisabledCount = allDisabledAccounts.filter(a => a.type === 'AGENT_DISABLED').length;
  const subDisabledCount = allDisabledAccounts.filter(a => a.type === 'SUBSCRIPTION_DISABLED').length;
  const affectedServersCount = new Set(allDisabledAccounts.map(a => a.serverId)).size;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* HEADER BAR */}
      <div className="surface-card" style={{
        padding: '20px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(245, 158, 11, 0.05) 100%)',
        border: '1px solid rgba(239, 68, 68, 0.25)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            color: 'var(--accent-rose)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(239, 68, 68, 0.3)'
          }}>
            <UserMinus size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
              Disabled &amp; Suspended Accounts Center
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, marginTop: '3px' }}>
              Dedicated tracking for disabled local Windows user accounts and suspended client subscriptions across VPS nodes.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {servers.length > 1 && (
            <select
              value={selectedAgentServer || servers[0]?.id || ''}
              onChange={e => setSelectedAgentServer(e.target.value)}
              className="input-select"
              style={{ padding: '7px 12px', fontSize: '12px' }}
              aria-label="Select VPS server for agent setup"
            >
              {servers.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.ipPort})</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setIsAgentModalOpen(true)}
            className="btn btn-primary btn-md"
            style={{ backgroundColor: 'var(--accent-emerald)', borderColor: 'var(--accent-emerald)', color: '#000', fontWeight: '700' }}
          >
            <Download size={15} /> Setup Agent
          </button>
          {onRefreshTelemetry && (
            <button
              onClick={onRefreshTelemetry}
              className="btn btn-secondary btn-md"
              style={{ color: 'var(--accent-rose)', borderColor: 'rgba(239, 68, 68, 0.4)' }}
            >
              <RefreshCw size={15} /> Refresh Accounts Status
            </button>
          )}
        </div>
      </div>

      {/* OVERVIEW KPI METRICS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        <div className="surface-card" style={{ backgroundColor: allDisabledAccounts.length > 0 ? 'rgba(239, 68, 68, 0.05)' : 'var(--bg-surface)' }}>
          <div style={{ fontSize: '11px', color: allDisabledAccounts.length > 0 ? 'var(--accent-rose)' : 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '6px' }}>Total Disabled Accounts</div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: allDisabledAccounts.length > 0 ? 'var(--accent-rose)' : 'var(--text-primary)' }}>{allDisabledAccounts.length}</div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>Across Server Fleet</div>
        </div>

        <div className="surface-card">
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '6px' }}>Windows OS Level Disabled</div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--accent-amber)' }}>{agentDisabledCount}</div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>Detected by Server Agent</div>
        </div>

        <div className="surface-card">
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '6px' }}>Suspended Subscriptions</div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary)' }}>{subDisabledCount}</div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>Expired / Inactive in System</div>
        </div>

        <div className="surface-card">
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', marginBottom: '6px' }}>Affected VPS Nodes</div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{affectedServersCount}</div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>Out of {servers.length} Total Nodes</div>
        </div>
      </div>

      {/* FILTER & SEARCH CONTROLS */}
      <div className="surface-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
          <Search size={16} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by username, company, or server name..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 12px',
              fontSize: '12.5px',
              color: 'var(--text-primary)'
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select
            value={serverFilter}
            onChange={e => setServerFilter(e.target.value)}
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              fontWeight: '600'
            }}
          >
            <option value="ALL">All Server Nodes ({servers.length})</option>
            {servers.map(srv => (
              <option key={srv.id} value={srv.id}>{srv.name}</option>
            ))}
          </select>

          <select
            value={reasonFilter}
            onChange={e => setReasonFilter(e.target.value)}
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              fontWeight: '600'
            }}
          >
            <option value="ALL">All Disabled Reasons</option>
            <option value="AGENT_DISABLED">Windows Local Account Disabled</option>
            <option value="SUBSCRIPTION_DISABLED">Subscription Suspended / Expired</option>
          </select>
        </div>
      </div>

      {/* MAIN DISABLED ACCOUNTS TABLE */}
      <div className="surface-card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(239, 68, 68, 0.12)', color: 'var(--accent-rose)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserX size={17} />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                Disabled &amp; Suspended Accounts List ({filteredAccounts.length})
              </h3>
              <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: 0, marginTop: '2px' }}>
                Full record of local accounts disabled on Windows OS or suspended in system subscriptions.
              </p>
            </div>
          </div>

          <span className={`badge ${filteredAccounts.length > 0 ? 'badge-rose' : 'badge-emerald'}`} style={{ fontSize: '10.5px' }}>
            {filteredAccounts.length} Account(s) Found
          </span>
        </div>

        {filteredAccounts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--accent-emerald)', fontSize: '13px', fontWeight: '600' }}>
            <CheckCircle2 size={28} style={{ marginBottom: '10px', display: 'block', margin: '0 auto 10px' }} />
            No disabled or suspended accounts match your search filter! All accounts are active and healthy.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Disabled Username</th>
                  <th>Company / Client</th>
                  <th>VPS Server Node &amp; IP</th>
                  <th>Detection Details / Reason</th>
                  <th>Account Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map(acc => (
                  <tr key={acc.id}>
                    <td style={{ fontWeight: '700', color: 'var(--accent-rose)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <UserX size={14} />
                      {acc.username}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {acc.company}
                    </td>
                    <td className="font-mono" style={{ fontSize: '11.5px' }}>
                      <span style={{ color: 'var(--primary)', fontWeight: '600' }}>{acc.serverName}</span> • <span style={{ color: 'var(--text-muted)' }}>{acc.serverIp}</span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {acc.reason}
                    </td>
                    <td>
                      <span className="badge badge-rose" style={{ fontSize: '10.5px' }}>
                        ● Disabled / Suspended
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end' }}>
                        {onToggleUserStatus && (
                          <button
                            onClick={() => onToggleUserStatus(acc.userObj, 'Active')}
                            className="btn btn-primary btn-sm"
                            style={{ padding: '3px 8px', fontSize: '11px', backgroundColor: '#10b981', borderColor: '#10b981', color: '#fff', fontWeight: '700', gap: '4px' }}
                            title="Enable & Unlock Windows VPS Local Account"
                          >
                            <Unlock size={12} /> Enable
                          </button>
                        )}
                        {onChangePassword && (
                          <button
                            onClick={() => onChangePassword(acc.userObj)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '3px 8px', fontSize: '11px', color: '#fbbf24', gap: '4px' }}
                            title="Set New Password on Windows VPS"
                          >
                            <Key size={12} /> Password
                          </button>
                        )}
                        <button
                          onClick={() => onDirectRemoteConnect(acc.userObj, 'USER')}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '3px 8px', fontSize: '11px' }}
                        >
                          Inspect
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* AGENT INSTALL MODAL */}
      {isAgentModalOpen && (
        <AgentInstallModal
          isOpen={isAgentModalOpen}
          onClose={() => setIsAgentModalOpen(false)}
          server={servers.find(s => s.id === selectedAgentServer) || servers[0]}
          isOnline={(() => {
            const tgt = servers.find(s => s.id === selectedAgentServer) || servers[0];
            if (!tgt) return false;
            const tData = telemetryData[tgt.id] || telemetryData[tgt.ipPort] || (tgt.ipPort && telemetryData[tgt.ipPort.split(':')[0]]);
            return tData?.isRealAgent && tData?.status === 'ONLINE';
          })()}
        />
      )}
    </div>
  );
}

// Pure helpers for delivering an Agent_Key to an agent through a SET_AGENT_KEY job.
// No I/O. See design section 19.
import { normalizeIp } from './clientIp.js';

// Host part of "ip:port" (or a bare ip), normalized; null if not an IP.
function hostOfIpPort(ipPort) {
  if (ipPort === null || ipPort === undefined) return null;
  const s = String(ipPort).trim();
  if (!s) return null;
  const whole = normalizeIp(s);
  if (whole) return whole;
  const bracket = s.match(/^\[([^\]]+)\]:\d+$/);
  if (bracket) return normalizeIp(bracket[1]);
  const idx = s.lastIndexOf(':');
  if (idx > 0 && s.indexOf(':') === idx) return normalizeIp(s.slice(0, idx));
  return null;
}

export const SET_AGENT_KEY_ACTION = 'SET_AGENT_KEY';

export function buildSetAgentKeyJob({ serverId, agentKey }) {
  return {
    id: `job-set-agent-key-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    action: SET_AGENT_KEY_ACTION,
    serverId: serverId || '',
    agentKey: agentKey || '',
    status: 'PENDING',
    resultMessage: '',
    createdAt: new Date().toISOString()
  };
}

// Returns a copy of the job without the agentKey field.
export function stripAgentKey(job) {
  if (!job || typeof job !== 'object') return job;
  const { agentKey, ...rest } = job;
  return rest;
}

// Clears secrets in place (idempotent) and returns the same job object.
export function scrubJobSecrets(job) {
  if (!job || typeof job !== 'object') return job;
  if ('agentKey' in job) job.agentKey = '';
  if ('password' in job) job.password = '';
  if ('newPassword' in job) job.newPassword = '';
  return job;
}

export function isJobDeliverable({ job, server, clientIp, secure, isProduction } = {}) {
  if (!job || !job.agentKey) return true;
  if (isProduction && secure !== true) return false;
  const requester = normalizeIp(clientIp);
  const registered = hostOfIpPort(server && server.ipPort);
  return !!requester && !!registered && requester === registered;
}

function parseVersion(v) {
  if (v === null || v === undefined) return null;
  const m = String(v).trim().replace(/^v/i, '').match(/^(\d+(?:\.\d+){0,3})$/);
  return m ? m[1].split('.').map(Number) : null;
}

// True when the agent is older than minVersion; missing/unparsable agent version counts as old.
export function needsAgentUpdate(agentVersion, minVersion) {
  const a = parseVersion(agentVersion);
  if (!a) return true;
  const m = parseVersion(minVersion);
  if (!m) return false;
  const len = Math.max(a.length, m.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0;
    const y = m[i] || 0;
    if (x !== y) return x < y;
  }
  return false;
}

import net from 'node:net';

/**
 * Normalize a raw address: strips port, brackets, zone id and the ::ffff: prefix.
 * Returns null when the result is not a valid IPv4/IPv6 address.
 */
export function normalizeIp(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;

  if (s.startsWith('[')) {
    const end = s.indexOf(']');
    if (end < 0) return null;
    s = s.slice(1, end);
  } else if (/^[^:]+:\d+$/.test(s)) {
    // IPv4 (or hostname) with port
    s = s.slice(0, s.lastIndexOf(':'));
  }

  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);

  s = s.toLowerCase();
  if (s.startsWith('::ffff:') && net.isIPv4(s.slice(7))) s = s.slice(7);

  return net.isIP(s) ? s : null;
}

/**
 * Build a matcher from a list of IPs / CIDR entries.
 * Invalid entries throw an Error naming the entry.
 */
export function parseTrustedProxies(list) {
  const bl = new net.BlockList();
  const entries = (list || []).map((x) => String(x ?? '').trim()).filter(Boolean);
  if (entries.length > 50) {
    throw new Error(`Too many trusted proxy entries: ${entries.length} (maximum 50)`);
  }
  for (const e of entries) {
    const [addr, prefix, ...rest] = e.split('/');
    const ip = normalizeIp(addr);
    const type = ip ? (net.isIPv4(ip) ? 'ipv4' : 'ipv6') : null;
    if (!type || rest.length) throw new Error(`Invalid trusted proxy entry: ${e}`);
    if (prefix === undefined) {
      bl.addAddress(ip, type);
    } else {
      const max = type === 'ipv4' ? 32 : 128;
      if (!/^\d+$/.test(prefix) || Number(prefix) > max) {
        throw new Error(`Invalid trusted proxy entry: ${e}`);
      }
      bl.addSubnet(ip, Number(prefix), type);
    }
  }
  return {
    check(ip) {
      const n = normalizeIp(ip);
      if (!n) return false;
      return bl.check(n, net.isIPv4(n) ? 'ipv4' : 'ipv6');
    },
  };
}

function headerValue(headers, name) {
  const v = headers?.[name];
  return Array.isArray(v) ? v.join(',') : typeof v === 'string' ? v : '';
}

export function deriveClientIp({ socketAddress, headers, trusted }) {
  const sock = normalizeIp(socketAddress) ?? '127.0.0.1';
  if (!trusted || !trusted.check(sock)) return sock;

  const fromList = (v) => v.split(',').map(normalizeIp).filter(Boolean);
  let chain = fromList(headerValue(headers, 'x-forwarded-for'));
  if (!chain.length) chain = fromList(headerValue(headers, 'cf-connecting-ip').split(',')[0] || '');
  if (!chain.length) chain = fromList(headerValue(headers, 'x-real-ip').split(',')[0] || '');

  for (let i = chain.length - 1; i >= 0; i--) {
    if (!trusted.check(chain[i])) return chain[i];
  }
  return sock;
}

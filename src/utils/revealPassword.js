// Fetches a stored password on demand (SUPER_ADMIN only on the server).
// The value is returned to the caller for a single action and is never cached here.
export const MASKED_PASSWORD_TEXT = '••••••••';

async function postReveal(authFetch, apiBase, path) {
  const res = await authFetch(`${apiBase}${path}`, { method: 'POST', body: JSON.stringify({}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success || typeof data.password !== 'string') {
    throw new Error(data.error || 'Unable to reveal password');
  }
  return data.password;
}

export function revealClientPassword(authFetch, apiBase, clientId) {
  return postReveal(authFetch, apiBase, `/clients/${encodeURIComponent(clientId)}/reveal-password`);
}

export function revealServerPassword(authFetch, apiBase, serverId) {
  return postReveal(authFetch, apiBase, `/servers/${encodeURIComponent(serverId)}/reveal-password`);
}

export async function copyRevealedPassword(fetcher) {
  const pw = await fetcher();
  await navigator.clipboard.writeText(pw);
}

// Session cookie options (task 32.1, design 23.2).
// `secure` never reads x-forwarded-proto directly: req.secure is only true for forwarded
// headers from trusted proxies (list-based 'trust proxy' in server.js).

export function sessionCookieOptions({ config, req, maxAgeMs }) {
  return {
    httpOnly: true,
    secure: Boolean(config?.isProduction || req?.secure),
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs
  };
}

// Same flags without maxAge: browsers only drop a cookie when the clear call matches how it was set.
export function sessionClearOptions({ config, req }) {
  const { maxAge, ...rest } = sessionCookieOptions({ config, req, maxAgeMs: undefined });
  return rest;
}

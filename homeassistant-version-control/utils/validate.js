import path from 'path';

/**
 * Resolve userPath under basePath and verify it doesn't escape.
 * Throws on null bytes or traversal.
 */
export function safePath(basePath, userPath) {
  if (!userPath || typeof userPath !== 'string') {
    throw new Error('Path is required');
  }

  if (userPath.includes('\0')) {
    console.log(`[security] Path traversal blocked: null byte in path (base: ${basePath})`);
    throw new Error('Invalid path: null bytes not allowed');
  }

  const resolvedBase = path.resolve(basePath);
  const resolved = path.resolve(basePath, userPath);

  if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
    console.log(`[security] Path traversal blocked: ${userPath} (base: ${basePath})`);
    throw new Error('Invalid path: traversal not allowed');
  }

  return resolved;
}

/**
 * Validate a git commit hash (4-40 hex chars).
 */
export function isValidCommitHash(hash) {
  if (!hash || typeof hash !== 'string') {
    return false;
  }
  return /^[0-9a-f]{4,40}$/i.test(hash);
}

/**
 * Check if an origin is an allowed local/private network address.
 */
export function isAllowedOrigin(origin) {
  if (!origin) return false;

  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    console.log(`[security] CORS origin rejected: ${origin}`);
    return false;
  }

  const hostname = parsed.hostname;

  // Localhost variants
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return true;
  }

  // RFC 1918 private ranges - parse IPv4
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map(Number);
    if (octets.some(o => o > 255)) {
      console.log(`[security] CORS origin rejected: ${origin}`);
      return false;
    }

    // 10.0.0.0/8
    if (octets[0] === 10) return true;
    // 172.16.0.0/12
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
    // 192.168.0.0/16
    if (octets[0] === 192 && octets[1] === 168) return true;
  }

  console.log(`[security] CORS origin rejected: ${origin}`);
  return false;
}

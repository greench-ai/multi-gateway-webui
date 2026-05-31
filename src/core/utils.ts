// ─── ID Generation ─────────────────────────────────────────────────────────────

export function generateId(): string {
  return crypto.randomUUID();
}

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Base64URL ────────────────────────────────────────────────────────────────

export function base64UrlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function base64UrlDecode(str: string): Uint8Array {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  const decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    bytes[i] = decoded.charCodeAt(i);
  }
  return bytes;
}

// ─── Time ─────────────────────────────────────────────────────────────────────

export function nowMs(): number {
  return Date.now();
}

// ─── DOM Helpers ──────────────────────────────────────────────────────────────

export function svgIcon(path: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

// ─── Class Styling ────────────────────────────────────────────────────────────

export function statusColor(status: string): string {
  switch (status) {
    case 'connected': return '#4ade80';
    case 'connecting': return '#facc15';
    case 'error': return '#f87171';
    default: return '#6b7280';
  }
}

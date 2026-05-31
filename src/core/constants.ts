// Allowed client IDs by the OpenClaw Gateway protocol
export const ALLOWED_CLIENT_IDS = [
  'cli',
  'webchat-ui',
  'ios',
  'android',
  'node',
  'plugin',
  'gateway-client',
] as const;

export type AllowedClientId = typeof ALLOWED_CLIENT_IDS[number];

// Protocol version
export const PROTOCOL_MIN = 3;
export const PROTOCOL_MAX = 4;
export const PROTOCOL_DEFAULT = 4;

// Client identity
export const CLIENT_ID: AllowedClientId = 'webchat-ui';
export const CLIENT_VERSION = '1.0.0';
export const CLIENT_PLATFORM = 'web';
export const CLIENT_MODE = 'operator';

// UI identity (for display)
export const UI_NAME = 'HubClaw';
export const UI_VERSION = '1.0.0';

// Reconnection
export const RECONNECT_BASE_DELAY_MS = 1000;
export const RECONNECT_MAX_DELAY_MS = 30000;
export const RECONNECT_MAX_ATTEMPTS = 10;

// RPC timeouts
export const RPC_TIMEOUT_MS = 30000;

// Protocol frame sizes
export const MAX_PAYLOAD_BYTES = 26214400; // 25 MB
export const MAX_BUFFERED_BYTES = 52428800; // 50 MB

// ─── Protocol Types ────────────────────────────────────────────────────────────

export interface ConnectParams {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: string;
    version: string;
    platform: string;
    mode: string;
  };
  role: string;
  scopes: string[];
  caps: string[];
  commands: string[];
  permissions: Record<string, unknown>;
  auth: {
    token?: string;
    password?: string;
    deviceToken?: string;
  };
  locale: string;
  userAgent: string;
  device?: {
    id: string;
    publicKey: string;
    signature: string;
    signedAt: number;
    nonce?: string;
  };
}

export interface ConnectChallenge {
  type: 'event';
  event: 'connect.challenge';
  payload: {
    nonce: string;
    ts: number;
  };
}

export interface HelloOk {
  type: 'res';
  id: string;
  ok: true;
  payload: {
    type: 'hello-ok';
    protocol: number;
    server: { version: string; connId: string };
    features: { methods: string[]; events: string[] };
    snapshot: Record<string, unknown>;
    auth: {
      role: string;
      scopes: string[];
      deviceToken?: string;
    };
    policy: {
      maxPayload: number;
      maxBufferedBytes: number;
      tickIntervalMs: number;
    };
  };
}

export interface ReqFrame {
  type: 'req';
  id: string;
  method: string;
  params?: unknown;
}

export interface ResFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
    retryable?: boolean;
    retryAfterMs?: number;
  };
}

export interface EventFrame {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: { presence?: number; health?: number };
}

// ─── Gateway State ─────────────────────────────────────────────────────────────

export type GatewayStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface GatewayConfig {
  id: string;
  name: string;
  gatewayUrl: string;
  token: string;
}

export interface GatewayState {
  config: GatewayConfig;
  status: GatewayStatus;
  error?: string;
  scopes: string[];
  role?: string;
  version?: string;
  connId?: string;
  lastSeen?: number;
}

// ─── Session ──────────────────────────────────────────────────────────────────

export interface SessionInfo {
  sessionKey: string;
  sessionId?: string;
  agentId?: string;
  updatedAtMs?: number;
  model?: string;
  thinking?: boolean;
  activeRunId?: string;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  runId?: string;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export interface StoredGateway {
  id: string;
  name: string;
  gatewayUrl: string;
  token: string; // stored but used directly
}

export interface StoredConfig {
  version: number;
  gateways: StoredGateway[];
}

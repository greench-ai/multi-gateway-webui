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

export type GatewayStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'pairing-required';

export interface GatewayConfig {
  id: string;
  name: string;
  gatewayUrl: string;
  token: string;
  /** SSH user the operator can use to approve pairing requests on the gateway host. */
  sshUser?: string;
  /** SSH host (Tailscale IP or hostname) the operator SSHes into to approve pairing. */
  sshHost?: string;
  /**
   * The `client.id` value the gateway expects in the connect frame.
   * GreenchClaw gateways: 'GreenchClaw-control-ui' (or 'GreenchClaw-tui')
   * OpenClaw / NexisClaw gateways: 'webchat-ui' (or 'cli')
   * Defaults to 'GreenchClaw-control-ui' if omitted.
   */
  clientId?: 'GreenchClaw-control-ui' | 'webchat-ui' | 'cli' | 'GreenchClaw-tui';
  /**
   * The `client.mode` value the gateway expects. Allowed: 'ui' | 'webchat' | 'cli' | 'backend' | 'node' | 'probe' | 'test'.
   * Defaults to 'ui'.
   */
  clientMode?: 'ui' | 'webchat' | 'cli' | 'backend' | 'node' | 'probe' | 'test';
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
  /** Last raw message received from the gateway. For debug visibility. */
  lastMessage?: unknown;
  pairingDeviceId?: string;
  /** SSH command (or CLI snippet) to run on the gateway host to approve the device. */
  pairingApproveCommand?: string;
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
  /** SSH user the operator can use to approve pairing requests on the gateway host. */
  sshUser?: string;
  /** SSH host (Tailscale IP or hostname) the operator SSHes into to approve pairing. */
  sshHost?: string;
}

export interface StoredConfig {
  version: number;
  gateways: StoredGateway[];
}

// ─── Rooms ─────────────────────────────────────────────────────────────────────

/** A named, multi-agent conversation. The operator + 1+ agent members. */
export interface Room {
  id: string;
  /** Operator's label, e.g. "HubClaw build". */
  name: string;
  /** Optional markdown description. */
  description?: string;
  /** Participants. Always includes the operator implicitly. */
  members: RoomMember[];
  createdAt: number;
  /** Last message timestamp (any author). */
  updatedAt: number;
  /** Soft-delete flag — archived rooms move to the bottom of the list. */
  archived: boolean;
  /** Sticky to top of the sidebar. */
  pinned: boolean;
  /** When true, each agent's chat.send is prefixed with the other agents'
   *  recent replies so the room behaves like a true group chat. See ROOMS-DESIGN.md §7. */
  shareRepliesWithMembers: boolean;
}

export interface RoomMember {
  /** Gateway id of the member agent, e.g. "goten". */
  agentId: string;
  addedAt: number;
}

/** Identifies who wrote a room message. */
export type MessageAuthor =
  | { kind: 'operator' }
  | { kind: 'agent'; agentId: string }
  | { kind: 'system'; reason: 'member-joined' | 'member-left' | 'room-created' };

/** A single message in a room. Authored by operator, agent, or system. */
export interface RoomMessage {
  id: string;
  roomId: string;
  author: MessageAuthor;
  /** Markdown content. */
  content: string;
  timestamp: number;
  /** Per-agent fan-out state. One entry per member agent the message was sent to.
   *  Only present when author.kind === 'operator' (i.e. we initiated the fan-out). */
  delivery?: MessageDelivery[];
  /** Agent replies streamed in over time, in the order they arrive. */
  replies: AgentReply[];
  /** True if the operator cancelled the message before all replies arrived. */
  cancelled: boolean;
}

export interface MessageDelivery {
  agentId: string;
  status: 'pending' | 'sent' | 'failed';
  /** Deterministic: `room:${roomId}:${agentId}`. */
  sessionKey: string;
  error?: string;
  sentAt?: number;
}

export interface AgentReply {
  /** Matches a chat message id from the gateway. */
  id: string;
  agentId: string;
  content: string;
  timestamp: number;
}

/**
 * Build the deterministic session key for an agent in a room.
 *
 * BUGFIX 2026-06-03: was `room:${roomId}:${agentId}`. The GreenchClaw
 * gateway only recognizes session keys starting with `agent:`, `acp:`,
 * or `subagent:` (see /home/greench/GreenchClaw/src/sessions/session-key-utils.ts:
 *   isAgentSessionKey, isSubagentSessionKey, isAcpSessionKey).
 * A `room:` key was accepted by chat.send (so the user saw ✓ delivery)
 * but the gateway's session runtime never sent back events for it
 * (no agent loop, no event stream), so the room never received replies.
 *
 * Fix: use the `agent:` prefix with the agentId and a sub-key for the
 * room. The gateway's parseAgentSessionKey() will match this, the agent
 * will be invoked, and the room listener in rooms-manager.bindGlobal
 * (which now also matches `agent:` prefix) will route replies back.
 */
export function roomSessionKey(roomId: string, agentId: string): string {
  return `agent:${agentId}:room-${roomId}`;
}


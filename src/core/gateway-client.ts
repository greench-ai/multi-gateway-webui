import type {
  ConnectParams,
  ConnectChallenge,
  GatewayConfig,
  GatewayState,
  SessionInfo,
  ResFrame,
  EventFrame,
} from './types';
import {
  PROTOCOL_MIN,
  PROTOCOL_MAX,
  CLIENT_ID,
  CLIENT_VERSION,
  CLIENT_PLATFORM,
  CLIENT_MODE,
  RPC_TIMEOUT_MS,
} from './constants';
import { generateId, nowMs } from './utils';
import { cryptoManager } from './crypto-manager';

type StatusCallback = (state: GatewayState) => void;
type EventCallback = (event: string, payload: unknown) => void;
type SessionsCallback = (sessions: SessionInfo[]) => void;
type ChatCallback = (sessionKey: string, messages: unknown[]) => void;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class GatewayClient {
  private ws: WebSocket | null = null;
  private config: GatewayConfig;
  private state: GatewayState;

  private reqId = 1;
  private pending = new Map<string, PendingRequest>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private onStatusChange: StatusCallback;
  private onEvent: EventCallback;
  private onSessions: SessionsCallback | null = null;
  private onChat: ChatCallback | null = null;

  constructor(
    config: GatewayConfig,
    callbacks: { onStatus: StatusCallback; onEvent: EventCallback }
  ) {
    this.config = config;
    this.onStatusChange = callbacks.onStatus;
    this.onEvent = callbacks.onEvent;
    this.state = {
      config,
      status: 'disconnected',
      scopes: [],
    };
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  get state_(): GatewayState {
    return this.state;
  }

  connect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Reset retry counter so the user can manually reconnect after fixing
    // an issue (e.g. pairing approved, network back online, etc).
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.setStatus('connecting');

    const wsUrl = this.config.gatewayUrl;
    const origin = wsUrl.startsWith('wss')
      ? 'https://' + wsUrl.slice(5)
      : 'http://' + wsUrl.slice(3);

    this.ws = new WebSocket(wsUrl);
    this.ws.onmessage = (e) => this.handleMessage(e.data);
    this.ws.onopen = () => this.handleOpen();
    this.ws.onclose = (e) => this.handleClose(e.code, e.reason);
    this.ws.onerror = (e) => this.handleError(e);
  }

  disconnect(): void {
    this.reconnectAttempts = Infinity; // prevent reconnection
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  async rpc<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }

    const id = generateId();
    const frame = {
      type: 'req' as const,
      id,
      method,
      params,
    };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, RPC_TIMEOUT_MS);

      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.ws!.send(JSON.stringify(frame));
    });
  }

  setCallbacks(onSessions?: SessionsCallback, onChat?: ChatCallback): void {
    this.onSessions = onSessions ?? null;
    this.onChat = onChat ?? null;
  }

  // ─── Connection Lifecycle ────────────────────────────────────────────────────

  private handleOpen(): void {
    // Wait for connect.challenge from gateway
  }

  private handleClose(code: number, reason: string): void {
    this.clearPending();

    // Don't overwrite a pairing-required or connected state — the gateway
    // closes the WS after sending a connect response (success or pairing-
    // required), and we don't want the close event to flip the card back
    // to "connecting" while waiting for the user to approve.
    if (this.state.status === 'pairing-required' || this.state.status === 'connected') {
      return;
    }

    if (this.reconnectAttempts < 10) {
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      this.reconnectAttempts++;
      this.setStatus('connecting');
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    } else {
      this.setStatus('error', `Disconnected (${code}): ${reason}`);
    }
  }

  private handleError(e: Event): void {
    // Error will be followed by close
  }

  // ─── Message Handling ────────────────────────────────────────────────────────

  private async handleMessage(raw: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log('[ws msg]', raw.slice(0, 200));
    // Stash the last message for debug visibility in the card UI.
    try { this.state.lastMessage = JSON.parse(raw); } catch { /* keep last */ }
    let msg: ConnectChallenge | ResFrame | EventFrame;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // Connect challenge — send connect request
    if (msg.type === 'event' && (msg as ConnectChallenge).event === 'connect.challenge') {
      const challenge = msg as ConnectChallenge;
      await this.sendConnect(challenge.payload.nonce);
      return;
    }

    // Response to our connect or RPC
    if (msg.type === 'res') {
      const res = msg as ResFrame;

      // RPC response
      const pending = this.pending.get(res.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(res.id);
        if (res.ok) {
          pending.resolve(res.payload ?? {});
        } else {
          pending.reject(new Error(res.error?.message ?? 'Unknown error'));
        }
      }

      // Connect response (hello-ok)
      if (res.payload && typeof res.payload === 'object' && (res.payload as Record<string, unknown>).type === 'hello-ok') {
        const hello = res as unknown as {
          payload: {
            type: 'hello-ok';
            protocol: number;
            server: { version: string; connId: string };
            auth: { role: string; scopes: string[]; deviceToken?: string };
            policy: { maxPayload: number; maxBufferedBytes: number; tickIntervalMs: number };
          };
        };
        this.handleHelloOk(hello.payload);
        return;
      }

      // Connect rejected — special-case pairing-required
      if (!res.ok && res.error) {
        const details = (res.error.details ?? {}) as {
          code?: string;
          requestId?: string;
          deviceId?: string;
        };
        if (details.code === 'PAIRING_REQUIRED') {
          this.handlePairingRequired(details.deviceId ?? '', details.requestId ?? '');
          return;
        }
        // Other connect rejection — record error
        this.setStatus('error', `${res.error.code ?? 'connect-reject'}: ${res.error.message}`);
      }
      return;
    }

    // Server event
    if (msg.type === 'event') {
      const evt = msg as EventFrame;
      this.handleServerEvent(evt);
    }
  }

  private async sendConnect(nonce: string): Promise<void> {
    const { token } = this.config;

    // Prepare connect params
    const connectParams: ConnectParams = {
      minProtocol: PROTOCOL_MIN,
      maxProtocol: PROTOCOL_MAX,
      client: {
        id: CLIENT_ID,
        version: CLIENT_VERSION,
        platform: CLIENT_PLATFORM,
        mode: CLIENT_MODE,
      },
      role: 'operator',
      scopes: ['operator.read', 'operator.write'],
      caps: [],
      commands: [],
      permissions: {},
      auth: { token },
      locale: navigator.language || 'en-US',
      userAgent: `hubclaw/${CLIENT_VERSION}`,
    };

    // Add device auth. Crypto init failure here means the SPA booted without
    // a working device identity — do NOT silently fall back to no device auth,
    // because the gateway will reject the connect once allowInsecureAuth=false.
    // Surface the error to the user instead.
    const deviceAuth = await cryptoManager.createDeviceAuth(
      'operator',
      ['operator.read', 'operator.write'],
      token,
      nonce ?? undefined
    );
    if (deviceAuth.nonce) {
      connectParams.device = deviceAuth;
    }

    const frame = {
      type: 'req' as const,
      id: String(this.reqId++),
      method: 'connect',
      params: connectParams,
    };

    this.ws!.send(JSON.stringify(frame));
  }

  private handlePairingRequired(deviceId: string, requestId: string): void {
    // Stop retrying — pairing requires explicit operator action on the gateway host.
    this.reconnectAttempts = Infinity;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const host = this.parseHostFromUrl(this.config.gatewayUrl);
    const cmd = `ssh ${this.config.sshUser ?? 'greench'}@${host} '/home/${this.config.sshUser ?? 'greench'}/bin/GreenchClaw devices approve ${requestId}'`;
    this.state.pairingDeviceId = deviceId;
    this.state.pairingApproveCommand = cmd;
    this.setStatus('pairing-required', `Device ${deviceId.slice(0, 12)}… needs approval on ${host}`);
  }

  private parseHostFromUrl(url: string): string {
    try {
      return new URL(url).host.split(':')[0];
    } catch {
      return url;
    }
  }

  private handleHelloOk(hello: {
    protocol: number;
    server: { version: string; connId: string };
    auth: { role: string; scopes: string[] };
    policy: { tickIntervalMs: number };
  }): void {
    this.reconnectAttempts = 0;
    this.setStatus('connected', undefined, hello.auth.scopes, hello.auth.role);
    this.state.version = hello.server.version;
    this.state.connId = hello.server.connId;

    // Start heartbeat
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      // Gateway sends tick events automatically
    }, hello.policy.tickIntervalMs);
  }

  private handleServerEvent(evt: EventFrame): void {
    const { event, payload } = evt;

    // Presence updates
    if (event === 'presence') {
      this.onEvent(event, payload);
      return;
    }

    // Health/tick — ignore
    if (event === 'tick' || event === 'health') {
      return;
    }

    // Session events
    if (event === 'session.started' || event === 'session.ended' || event === 'session.updated') {
      this.onEvent(event, payload);
      return;
    }

    // Chat messages
    // BUGFIX 2026-06-03: added 'chat' to the list. The GreenchClaw
    // gateway emits streaming chat updates as 'chat' events (not
    // 'agent.message' or 'chat.message'). Payload shape:
    //   { runId, sessionKey, seq, state: 'delta'|'final', message }
    // The connection-manager routes the payload.sessionKey to the
    // chat-message channel; rooms-manager.bindGlobal matches the
    // sessionKey and attaches the reply to the right room.
    if (event === 'agent.message' || event === 'chat.message' || event === 'chat') {
      this.onEvent(event, payload);
      return;
    }

    // Run events
    if (event === 'run.started' || event === 'run.ended' || event === 'run.output') {
      this.onEvent(event, payload);
      return;
    }

    // Default: pass through
    this.onEvent(event, payload);
  }

  // ─── Status Helpers ─────────────────────────────────────────────────────────

  private setStatus(
    status: GatewayState['status'],
    error?: string,
    scopes?: string[],
    role?: string
  ): void {
    this.state = {
      ...this.state,
      status,
      error,
      scopes: scopes ?? this.state.scopes,
      role: role ?? this.state.role,
      lastSeen: nowMs(),
    };
    this.onStatusChange(this.state);
  }

  private clearPending(): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('Connection closed'));
    }
    this.pending.clear();
  }

  // ─── High-level API ─────────────────────────────────────────────────────────

  async listSessions(): Promise<SessionInfo[]> {
    const res = await this.rpc<{ items: SessionInfo[] }>('sessions.list', { limit: 50 });
    return res.items ?? [];
  }

  async createSession(): Promise<string> {
    const res = await this.rpc<{ sessionKey: string }>('sessions.create', {});
    return res.sessionKey;
  }

  async sendMessage(sessionKey: string, message: string, idempotencyKey?: string): Promise<void> {
    // BUGFIX 2026-06-03: the GreenchClaw gateway only streams 'chat'
    // events to nodes that have explicitly subscribed via
    // `sessions.messages.subscribe` (see
    // /home/greench/GreenchClaw/src/gateway/server-methods/sessions.ts
    // and server-node-subscriptions.ts). Without this, chat.send
    // delivers the message but no agent.message/chat events come
    // back, so the room view never sees the reply.
    //
    // We subscribe first (idempotent on the server side, returns
    // already-subscribed if duplicate), then send. If subscribe
    // fails for any reason we still try the send — some gateway
    // versions may auto-subscribe on chat.send.
    try {
      await this.rpc('sessions.messages.subscribe', { sessionKey });
    } catch (e) {
      console.warn('[gateway-client] sessions.messages.subscribe failed, sending anyway:', e);
    }
    await this.rpc('chat.send', { sessionKey, message, idempotencyKey: idempotencyKey ?? crypto.randomUUID() });
  }

  async getChatHistory(sessionKey: string, limit = 50): Promise<unknown[]> {
    const res = await this.rpc<{ items: unknown[] }>('chat.history', { sessionKey, limit });
    return res.items ?? [];
  }

  async getConfig(): Promise<Record<string, unknown>> {
    const res = await this.rpc<{ config: Record<string, unknown> }>('config.get', {});
    return res.config ?? {};
  }
}

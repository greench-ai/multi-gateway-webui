import type { GatewayConfig, GatewayState, SessionInfo } from './types';
import { GatewayClient } from './gateway-client';

export type ConnectionEvents = {
  'status-change': (gatewayId: string, state: GatewayState) => void;
  'event': (gatewayId: string, event: string, payload: unknown) => void;
  'sessions-update': (gatewayId: string, sessions: SessionInfo[]) => void;
  'chat-message': (gatewayId: string, sessionKey: string, message: unknown) => void;
};

type EventHandler<K extends keyof ConnectionEvents> = ConnectionEvents[K];

export class ConnectionManager {
  private clients = new Map<string, GatewayClient>();
  private states = new Map<string, GatewayState>();

  private handlers = new Map<keyof ConnectionEvents, Set<EventHandler<keyof ConnectionEvents>>>();

  // ─── Registration ────────────────────────────────────────────────────────────

  addGateway(config: GatewayConfig): GatewayClient {
    // Remove existing if present
    if (this.clients.has(config.id)) {
      this.clients.get(config.id)!.disconnect();
      this.clients.delete(config.id);
      this.states.delete(config.id);
    }

    const client = new GatewayClient(config, {
      onStatus: (state) => {
        this.states.set(config.id, state);
        this.emit('status-change', config.id, state);
      },
      onEvent: (event, payload) => {
        this.emit('event', config.id, event, payload);
      },
    });

    client.setCallbacks(
      (sessions) => this.emit('sessions-update', config.id, sessions),
      (sessionKey, messages) => this.emit('chat-message', config.id, sessionKey, messages)
    );

    this.clients.set(config.id, client);
    return client;
  }

  removeGateway(gatewayId: string): void {
    const client = this.clients.get(gatewayId);
    if (client) {
      client.disconnect();
      this.clients.delete(gatewayId);
      this.states.delete(gatewayId);
    }
  }

  getClient(gatewayId: string): GatewayClient | undefined {
    return this.clients.get(gatewayId);
  }

  getState(gatewayId: string): GatewayState | undefined {
    return this.states.get(gatewayId);
  }

  getAllStates(): Map<string, GatewayState> {
    return new Map(this.states);
  }

  // ─── Connection ─────────────────────────────────────────────────────────────

  connect(gatewayId: string): void {
    const client = this.clients.get(gatewayId);
    if (client) client.connect();
  }

  connectAll(): void {
    for (const client of this.clients.values()) {
      client.connect();
    }
  }

  disconnect(gatewayId: string): void {
    const client = this.clients.get(gatewayId);
    if (client) client.disconnect();
  }

  disconnectAll(): void {
    for (const client of this.clients.values()) {
      client.disconnect();
    }
  }

  // ─── Event Bus ─────────────────────────────────────────────────────────────

  on<K extends keyof ConnectionEvents>(event: K, handler: EventHandler<K>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    (this.handlers.get(event) as Set<EventHandler<K>>).add(handler);
  }

  off<K extends keyof ConnectionEvents>(event: K, handler: EventHandler<K>): void {
    this.handlers.get(event)?.delete(handler);
  }

  private emit<K extends keyof ConnectionEvents>(event: K, ...args: Parameters<ConnectionEvents[K]>): void {
    const handlers = this.handlers.get(event) as Set<ConnectionEvents[K]> | undefined;
    if (handlers) {
      for (const handler of handlers) {
        try {
          (handler as Function)(...args);
        } catch (e) {
          console.error(`[ConnectionManager] Handler error for ${event}:`, e);
        }
      }
    }
  }
}

export const connectionManager = new ConnectionManager();

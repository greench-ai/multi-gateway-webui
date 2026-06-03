// rooms-manager.ts
// In-memory model + fan-out coordinator for rooms.
// Persistence is in rooms-storage.ts (IndexedDB).
// Gateway RPC is via connectionManager + the per-gateway GatewayClient.
//
// Responsibilities:
//   - CRUD on rooms (create, update, delete, archive, pin)
//   - Send an operator message: persist, fan out to all members in parallel,
//     collect per-agent deliveries
//   - Receive agent replies from any gateway, attach to the right room message
//   - Emit state-change events so UI can re-render
//
// See ROOMS-DESIGN.md §5, §6, §7 for the full protocol.

import type {
  AgentReply,
  MessageAuthor,
  MessageDelivery,
  Room,
  RoomMember,
  RoomMessage,
} from '../core/types';
import { roomSessionKey } from '../core/types';
import { connectionManager } from '../core/connection-manager';
import { roomsStorage, roomMessagesStorage } from './rooms-storage';

// ─── Event Bus ────────────────────────────────────────────────────────────────

type EventHandler<T> = (data: T) => void;

type RoomsEvents = {
  'rooms-change': () => void;
  'room-change': (roomId: string) => void;
  'message-change': (roomId: string, messageId: string) => void;
  'unread-change': (roomId: string, hasUnread: boolean) => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'r-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
}

const DELIVERY_TIMEOUT_MS = 60_000;

// ─── RoomsManager ─────────────────────────────────────────────────────────────

class RoomsManager {
  private rooms = new Map<string, Room>();
  /** Index of in-flight operator messages by room id. */
  private messages = new Map<string, RoomMessage[]>();
  /** Tracks which room messages have been viewed (last-seen message id per room). */
  private lastViewedAt = new Map<string, number>();
  /** Map of agent reply id -> which room message it's been attached to (dedup). */
  private replyIndex = new Map<string, string>();
  /** Timeouts for in-flight deliveries, keyed by messageId+agentId. */
  private deliveryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Subscribed flag for the global chat-message listener. */
  private bound = false;
  /** Unread state: roomId -> true if there are unviewed messages from agents. */
  private unread = new Set<string>();

  private handlers = new Map<keyof RoomsEvents, Set<EventHandler<unknown>>>();

  constructor() {
    this.bindGlobal();
  }

  // ─── Persistence ────────────────────────────────────────────────────────────

  async load(): Promise<void> {
    const all = await roomsStorage.listRooms();
    this.rooms.clear();
    for (const r of all) this.rooms.set(r.id, r);
    // Hydrate message cache for each room (so the UI has data to render)
    this.messages.clear();
    for (const r of all) {
      const msgs = await roomMessagesStorage.listMessages(r.id);
      this.messages.set(r.id, msgs);
    }
    this.emit('rooms-change');
  }

  // ─── Event Bus ─────────────────────────────────────────────────────────────

  on<K extends keyof RoomsEvents>(event: K, handler: RoomsEvents[K]): void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    (this.handlers.get(event) as Set<EventHandler<unknown>>).add(handler as EventHandler<unknown>);
  }

  off<K extends keyof RoomsEvents>(event: K, handler: RoomsEvents[K]): void {
    const set = this.handlers.get(event);
    if (set) set.delete(handler as EventHandler<unknown>);
  }

  private emit<K extends keyof RoomsEvents>(event: K, ...args: Parameters<RoomsEvents[K]>): void {
    const set = this.handlers.get(event);
    if (set) {
      for (const h of set) (h as EventHandler<unknown>)(args[0]);
    }
  }

  // ─── Global chat-message listener (one place, dispatch to rooms) ───────────

  private bindGlobal(): void {
    if (this.bound) return;
    connectionManager.on('chat-message', (gatewayId, sessionKey, message) => {
      // BUGFIX 2026-06-03: room sessionKey is now `agent:${agentId}:room-${roomId}`
      // (was `room:${roomId}:${agentId}`) so the GreenchClaw gateway
      // recognizes it as an agent session and runs the agent loop.
      // Two matching shapes:
      //   - 'agent:${agentId}:room-${roomId}'  (room chat — new)
      //   - 'room:${roomId}:${agentId}'         (legacy, for any in-flight
      //                                            messages before the upgrade)
      if (!sessionKey) return;
      let roomId: string | null = null;
      let agentId: string | null = null;
      if (sessionKey.startsWith('agent:')) {
        // agent:${agentId}:room-${roomId}
        const m = sessionKey.match(/^agent:([^:]+):room-(.+)$/);
        if (!m) return;
        agentId = m[1];
        roomId = m[2];
      } else if (sessionKey.startsWith('room:')) {
        // room:${roomId}:${agentId}
        const parts = sessionKey.split(':');
        if (parts.length < 3) return;
        roomId = parts[1];
        agentId = parts[2];
      } else {
        return;
      }
      // Sanity: the gateway reporting should match the agent in the sessionKey.
      if (gatewayId !== agentId) return;
      const msg = message as { id?: string; content?: unknown; role?: string; timestamp?: number };
      if (!msg || !msg.id) return;
      this.handleAgentReply(roomId, {
        id: String(msg.id),
        agentId,
        content: typeof msg.content === 'string' ? msg.content : String(msg.content ?? ''),
        timestamp: Number(msg.timestamp ?? Date.now()),
      });
    });
    this.bound = true;
  }

  // ─── Queries ────────────────────────────────────────────────────────────────

  listRooms(): Room[] {
    return Array.from(this.rooms.values()).sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.archived !== b.archived) return a.archived ? 1 : -1;
      return b.updatedAt - a.updatedAt;
    });
  }

  getRoom(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  getMessages(roomId: string): RoomMessage[] {
    return this.messages.get(roomId) ?? [];
  }

  hasUnread(roomId: string): boolean {
    return this.unread.has(roomId);
  }

  // ─── Room CRUD ──────────────────────────────────────────────────────────────

  async createRoom(opts: { name: string; description?: string; members: string[]; shareRepliesWithMembers?: boolean }): Promise<Room> {
    const now = Date.now();
    const room: Room = {
      id: uuid(),
      name: opts.name.trim(),
      description: opts.description?.trim() || undefined,
      members: opts.members.map((agentId) => ({ agentId, addedAt: now })),
      createdAt: now,
      updatedAt: now,
      archived: false,
      pinned: false,
      shareRepliesWithMembers: opts.shareRepliesWithMembers ?? false,
    };
    this.rooms.set(room.id, room);
    this.messages.set(room.id, []);
    await roomsStorage.putRoom(room);
    // System "room-created" message
    await this.appendSystemMessage(room.id, 'room-created', `Room "${room.name}" created`);
    this.emit('rooms-change');
    this.emit('room-change', room.id);
    return room;
  }

  async updateRoom(id: string, patch: Partial<Pick<Room, 'name' | 'description' | 'pinned' | 'archived' | 'shareRepliesWithMembers'>>): Promise<Room | undefined> {
    const r = this.rooms.get(id);
    if (!r) return undefined;
    const next: Room = { ...r, ...patch, updatedAt: Date.now() };
    this.rooms.set(id, next);
    await roomsStorage.putRoom(next);
    this.emit('rooms-change');
    this.emit('room-change', id);
    return next;
  }

  async setMembers(id: string, agentIds: string[]): Promise<Room | undefined> {
    const r = this.rooms.get(id);
    if (!r) return undefined;
    const now = Date.now();
    const nextMembers: RoomMember[] = agentIds.map((agentId) => {
      const existing = r.members.find((m) => m.agentId === agentId);
      return existing ?? { agentId, addedAt: now };
    });
    const added = agentIds.filter((a) => !r.members.find((m) => m.agentId === a));
    const removed = r.members.filter((m) => !agentIds.includes(m.agentId)).map((m) => m.agentId);
    const next: Room = { ...r, members: nextMembers, updatedAt: now };
    this.rooms.set(id, next);
    await roomsStorage.putRoom(next);
    for (const agentId of added) {
      await this.appendSystemMessage(id, 'member-joined', `${agentId} joined the room`);
    }
    for (const agentId of removed) {
      await this.appendSystemMessage(id, 'member-left', `${agentId} left the room`);
    }
    this.emit('rooms-change');
    this.emit('room-change', id);
    return next;
  }

  async deleteRoom(id: string): Promise<void> {
    this.rooms.delete(id);
    this.messages.delete(id);
    this.unread.delete(id);
    await roomsStorage.deleteRoom(id);
    this.emit('rooms-change');
  }

  // ─── Unread tracking ────────────────────────────────────────────────────────

  markViewed(roomId: string): void {
    this.lastViewedAt.set(roomId, Date.now());
    if (this.unread.has(roomId)) {
      this.unread.delete(roomId);
      this.emit('unread-change', roomId, false);
    }
  }

  // ─── Send (operator) ───────────────────────────────────────────────────────

  /**
   * Operator sends a message in a room. Persists optimistically, fans out to
   * every member agent in parallel, captures per-agent delivery state, and
   * returns the message so the UI can render it immediately.
   */
  async sendOperatorMessage(roomId: string, content: string): Promise<RoomMessage | undefined> {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    const trimmed = content.trim();
    if (!trimmed) return undefined;
    if (room.members.length === 0) return undefined;

    const now = Date.now();
    const msg: RoomMessage = {
      id: uuid(),
      roomId,
      author: { kind: 'operator' },
      content: trimmed,
      timestamp: now,
      delivery: room.members.map((m) => ({
        agentId: m.agentId,
        status: 'pending',
        sessionKey: roomSessionKey(roomId, m.agentId),
      })),
      replies: [],
      cancelled: false,
    };
    await this.appendMessage(msg);
    // Bump room updatedAt
    await this.updateRoom(roomId, {});

    // Fan out in parallel — don't await all before returning the optimistic msg.
    void this.fanOut(msg, room);
    return msg;
  }

  private async fanOut(msg: RoomMessage, room: Room): Promise<void> {
    if (!msg.delivery) return;
    // Optional: include other agents' recent replies as context for each agent.
    // Only do this if the room has shareRepliesWithMembers === true.
    const includeContext = room.shareRepliesWithMembers;
    const priorReplies = includeContext ? this.formatPriorReplies(room) : '';

    const tasks = msg.delivery.map(async (d) => {
      const client = connectionManager.getClient(d.agentId);
      if (!client) {
        d.status = 'failed';
        d.error = 'gateway not connected';
        await this.persistMessage(msg);
        this.emit('message-change', msg.roomId, msg.id);
        return;
      }
      const state = connectionManager.getState(d.agentId);
      if (!state || state.status !== 'connected') {
        d.status = 'failed';
        d.error = `gateway status: ${state?.status ?? 'unknown'}`;
        await this.persistMessage(msg);
        this.emit('message-change', msg.roomId, msg.id);
        return;
      }

      // Set a per-delivery timeout
      const timer = setTimeout(() => {
        if (d.status === 'pending') {
          d.status = 'failed';
          d.error = 'timeout (60s)';
          void this.persistMessage(msg);
          this.emit('message-change', msg.roomId, msg.id);
        }
        this.deliveryTimers.delete(msg.id + ':' + d.agentId);
      }, DELIVERY_TIMEOUT_MS);
      this.deliveryTimers.set(msg.id + ':' + d.agentId, timer);

      try {
        const text = includeContext ? this.composeContextMessage(msg.content, priorReplies, room) : msg.content;
        await client.sendMessage(d.sessionKey, text);
        d.status = 'sent';
        d.sentAt = Date.now();
        await this.persistMessage(msg);
        this.emit('message-change', msg.roomId, msg.id);
      } catch (e) {
        d.status = 'failed';
        d.error = e instanceof Error ? e.message : String(e);
        await this.persistMessage(msg);
        this.emit('message-change', msg.roomId, msg.id);
      } finally {
        const t = this.deliveryTimers.get(msg.id + ':' + d.agentId);
        if (t) clearTimeout(t);
        this.deliveryTimers.delete(msg.id + ':' + d.agentId);
      }
    });

    await Promise.allSettled(tasks);
  }

  /** Build the "other agents' recent replies" prefix for context-sharing rooms. */
  private formatPriorReplies(room: Room): string {
    const msgs = this.getMessages(room.id);
    const recent = msgs.slice(-6); // last 3 user+assistant pairs
    if (recent.length === 0) return '';
    const lines: string[] = [];
    for (const m of recent) {
      if (m.author.kind === 'operator') {
        lines.push(`[operator] ${m.content}`);
      } else if (m.author.kind === 'agent') {
        lines.push(`[${m.author.agentId}] ${m.content}`);
      }
    }
    return lines.join('\n');
  }

  private composeContextMessage(operatorContent: string, priorReplies: string, room: Room): string {
    const otherMembers = room.members.map((m) => m.agentId).join(', ');
    return [
      `[Room: ${room.name}]`,
      `[Other participants in this room: ${otherMembers}]`,
      priorReplies ? `[Recent replies:]\n${priorReplies}` : '[No prior replies yet — you are the first to respond.]',
      ``,
      `Your task: ${operatorContent}`,
    ].join('\n');
  }

  // ─── Receive (agent) ────────────────────────────────────────────────────────

  private async handleAgentReply(roomId: string, reply: AgentReply): Promise<void> {
    // Dedup: same reply id won't attach twice
    if (this.replyIndex.has(reply.id)) return;
    const room = this.rooms.get(roomId);
    if (!room) return;
    // Find the most recent operator message that includes this agent in its delivery
    const msgs = this.messages.get(roomId) ?? [];
    let target: RoomMessage | undefined;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.author.kind !== 'operator') continue;
      if (m.delivery?.some((d) => d.agentId === reply.agentId && d.status === 'sent')) {
        target = m;
        break;
      }
    }
    if (!target) {
      // No matching sent delivery. The agent replied to a session we don't have a record of.
      // Attach to a synthetic "agent-initiated" message so the UI shows it.
      const synth: RoomMessage = {
        id: uuid(),
        roomId,
        author: { kind: 'agent', agentId: reply.agentId },
        content: reply.content,
        timestamp: reply.timestamp,
        replies: [],
        cancelled: false,
      };
      this.replyIndex.set(reply.id, synth.id);
      await this.appendMessage(synth);
      await this.updateRoom(roomId, {});
      this.markUnread(roomId);
      return;
    }
    target.replies.push(reply);
    this.replyIndex.set(reply.id, target.id);
    await this.persistMessage(target);
    await this.updateRoom(roomId, {});
    this.markUnread(roomId);
    this.emit('message-change', roomId, target.id);
  }

  private markUnread(roomId: string): void {
    const lastViewed = this.lastViewedAt.get(roomId) ?? 0;
    // We consider it unread if the last reply's timestamp is after lastViewed.
    const msgs = this.messages.get(roomId) ?? [];
    const latest = msgs[msgs.length - 1];
    if (latest && latest.timestamp > lastViewed) {
      if (!this.unread.has(roomId)) {
        this.unread.add(roomId);
        this.emit('unread-change', roomId, true);
      }
    }
  }

  // ─── Internal persistence helpers ──────────────────────────────────────────

  private async appendMessage(msg: RoomMessage): Promise<void> {
    const list = this.messages.get(msg.roomId) ?? [];
    list.push(msg);
    this.messages.set(msg.roomId, list);
    await roomMessagesStorage.putMessage(msg);
  }

  private async persistMessage(msg: RoomMessage): Promise<void> {
    await roomMessagesStorage.putMessage(msg);
  }

  private async appendSystemMessage(
    roomId: string,
    reason: 'member-joined' | 'member-left' | 'room-created',
    content: string
  ): Promise<void> {
    const msg: RoomMessage = {
      id: uuid(),
      roomId,
      author: { kind: 'system', reason } as MessageAuthor,
      content,
      timestamp: Date.now(),
      replies: [],
      cancelled: false,
    };
    await this.appendMessage(msg);
    this.emit('message-change', roomId, msg.id);
  }
}

export const roomsManager = new RoomsManager();

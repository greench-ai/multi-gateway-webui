import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { roomsManager } from '../stores/rooms-manager';
import { connectionManager } from '../core/connection-manager';
import type { Room, RoomMessage } from '../core/types';
import './room-view';
import './room-create-modal';
import './room-settings-modal';

@customElement('rooms-tab')
export class RoomsTab extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
    }

    .room-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .room-list::-webkit-scrollbar { width: 6px; }
    .room-list::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 3px; }

    .room-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 10px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s;
      position: relative;
    }

    .room-row:hover { background: #1e1e2a; }
    .room-row.selected { background: #1a1a24; border: 1px solid #2a2a3a; }

    .room-row.archived { opacity: 0.55; }

    .row-top {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .room-name {
      font-size: 14px;
      font-weight: 500;
      color: #e0e0e8;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .pin { color: #f59e0b; font-size: 12px; }
    .archive { color: #6b7280; font-size: 12px; }

    .row-meta {
      display: flex;
      gap: 8px;
      font-size: 11px;
      color: #6b7280;
    }

    .unread-dot {
      width: 8px;
      height: 8px;
      background: #6366f1;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .empty {
      padding: 24px 16px;
      font-size: 13px;
      color: #6b7280;
      text-align: center;
      line-height: 1.5;
    }
  `;

  @state() private rooms: Room[] = [];
  @state() private unread = new Set<string>();
  @state() private lastMessages = new Map<string, RoomMessage | undefined>();
  @state() private selectedRoomId: string | null = null;
  @state() private showCreate = false;
  @state() private settingsRoomId: string | null = null;

  private boundRooms = false;
  private boundUnread = false;

  connectedCallback(): void {
    super.connectedCallback();
    void this.refresh();
    this.bindEvents();
    this.addEventListener('new-room', this.openCreate as EventListener);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.boundRooms) {
      roomsManager.off('rooms-change', this.onRoomsChange);
      roomsManager.off('unread-change', this.onUnreadChange);
      roomsManager.off('message-change', this.onMessageChange);
    }
    this.removeEventListener('new-room', this.openCreate as EventListener);
  }

  private bindEvents(): void {
    if (this.boundRooms) return;
    roomsManager.on('rooms-change', this.onRoomsChange);
    roomsManager.on('unread-change', this.onUnreadChange);
    roomsManager.on('message-change', this.onMessageChange);
    this.boundRooms = true;
  }

  private onRoomsChange = (): void => { void this.refresh(); };
  private onUnreadChange = (roomId: string, hasUnread: boolean): void => {
    const next = new Set(this.unread);
    if (hasUnread) next.add(roomId); else next.delete(roomId);
    this.unread = next;
  };
  private onMessageChange = (roomId: string): void => {
    const msgs = roomsManager.getMessages(roomId);
    const last = msgs[msgs.length - 1];
    const next = new Map(this.lastMessages);
    next.set(roomId, last);
    this.lastMessages = next;
  };

  private async refresh(): Promise<void> {
    this.rooms = roomsManager.listRooms();
    const last = new Map<string, RoomMessage | undefined>();
    for (const r of this.rooms) {
      const msgs = roomsManager.getMessages(r.id);
      last.set(r.id, msgs[msgs.length - 1]);
    }
    this.lastMessages = last;
  }

  private handleSelect(roomId: string): void {
    this.selectedRoomId = roomId;
    roomsManager.markViewed(roomId);
  }

  private handleNew(): void {
    this.showCreate = true;
  }

  private openCreate = (): void => {
    this.showCreate = true;
  };

  private handleSettings(roomId: string, e: Event): void {
    e.stopPropagation();
    this.settingsRoomId = roomId;
  }

  private metaFor(room: Room): string {
    const m = room.members.length;
    const count = m === 0 ? 'no members' : m === 1 ? '1 member' : `${m} members`;
    const last = this.lastMessages.get(room.id);
    const ts = last ? new Date(last.timestamp).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) : '';
    return [count, ts].filter(Boolean).join(' · ');
  }

  private previewFor(room: Room): string {
    const m = this.lastMessages.get(room.id);
    if (!m) return 'no messages yet';
    const who = m.author.kind === 'operator' ? 'you' : m.author.kind === 'agent' ? m.author.agentId : 'system';
    const text = m.content.length > 60 ? m.content.slice(0, 60) + '…' : m.content;
    return `${who}: ${text}`;
  }

  render() {
    // If a room is selected, show the room view full-width in the right pane
    if (this.selectedRoomId) {
      const room = this.rooms.find((r) => r.id === this.selectedRoomId);
      if (!room) {
        this.selectedRoomId = null;
        return this.renderList();
      }
      return html`
        <room-view
          .room=${room}
          @back=${() => { this.selectedRoomId = null; }}
          @open-settings=${() => { this.settingsRoomId = room.id; }}
        ></room-view>

        ${this.settingsRoomId === room.id
          ? html`<room-settings-modal
              .room=${room}
              @close=${() => { this.settingsRoomId = null; }}
            ></room-settings-modal>`
          : ''}
      `;
    }
    return this.renderList();
  }

  private renderList() {
    return html`
      <div class="room-list">
        ${this.rooms.length === 0
          ? html`<div class="empty">
              No rooms yet. Click <strong>+</strong> in the header to create one.
              <div style="margin-top:12px;">
                <button
                  @click=${() => (this.showCreate = true)}
                  style="background:#6366f1;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;"
                >+ New Room</button>
              </div>
            </div>`
          : this.rooms.map(
              (r) => html`
                <div
                  class="room-row ${r.archived ? 'archived' : ''} ${r.id === this.selectedRoomId ? 'selected' : ''}"
                  @click=${() => this.handleSelect(r.id)}
                >
                  <div class="row-top">
                    ${this.unread.has(r.id) ? html`<div class="unread-dot"></div>` : ''}
                    ${r.pinned ? html`<span class="pin" title="pinned">📌</span>` : ''}
                    <span class="room-name">${r.name}</span>
                    <button
                      class="add-btn"
                      style="width:24px;height:24px;font-size:14px;background:transparent;color:#6b7280;"
                      @click=${(e: Event) => this.handleSettings(r.id, e)}
                      title="Room settings"
                    >⚙</button>
                  </div>
                  <div class="row-meta">
                    <span>${this.metaFor(r)}</span>
                  </div>
                  <div class="row-meta">
                    <span style="color:#9ca3af;">${this.previewFor(r)}</span>
                  </div>
                </div>
              `
            )}
      </div>

      ${this.showCreate
        ? html`<room-create-modal
            @close=${() => { this.showCreate = false; }}
            @created=${(e: CustomEvent<{ id: string }>) => {
              this.showCreate = false;
              this.selectedRoomId = e.detail.id;
            }}
          ></room-create-modal>`
        : ''}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'rooms-tab': RoomsTab;
  }
  interface HTMLElementEventMap {
    'new-room': CustomEvent<void>;
  }
}

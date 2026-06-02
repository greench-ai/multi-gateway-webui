import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { roomsManager } from '../stores/rooms-manager';
import { connectionManager } from '../core/connection-manager';
import type { Room, RoomMessage } from '../core/types';

@customElement('room-view')
export class RoomView extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
      background: #0f0f14;
    }

    header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      background: #1a1a24;
      border-bottom: 1px solid #2a2a3a;
    }

    .back {
      background: transparent;
      border: 1px solid #2a2a3a;
      border-radius: 6px;
      color: #e0e0e8;
      padding: 4px 10px;
      cursor: pointer;
      font-size: 13px;
    }
    .back:hover { background: #1e1e2a; }

    h2 {
      flex: 1;
      font-size: 16px;
      font-weight: 600;
      color: #fff;
      margin: 0;
    }

    .settings-btn {
      background: transparent;
      border: 1px solid #2a2a3a;
      border-radius: 6px;
      color: #e0e0e8;
      padding: 4px 10px;
      cursor: pointer;
      font-size: 13px;
    }
    .settings-btn:hover { background: #1e1e2a; }

    .members {
      font-size: 12px;
      color: #6b7280;
      padding: 8px 20px;
      border-bottom: 1px solid #2a2a3a;
      background: #14141c;
    }

    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .messages::-webkit-scrollbar { width: 6px; }
    .messages::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 3px; }

    .empty {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #4b5563;
      font-size: 14px;
    }

    .input-area {
      display: flex;
      gap: 8px;
      padding: 16px;
      border-top: 1px solid #2a2a3a;
      background: #14141c;
    }

    .input-area input {
      flex: 1;
      padding: 12px 16px;
      background: #1a1a24;
      border: 1px solid #2a2a3a;
      border-radius: 8px;
      color: #e0e0e8;
      font-size: 14px;
      outline: none;
    }
    .input-area input:focus { border-color: #6366f1; }
    .input-area input::placeholder { color: #4b5563; }

    .send-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      background: #6366f1;
      border: none;
      border-radius: 8px;
      color: #fff;
      cursor: pointer;
    }
    .send-btn:hover { background: #4f46e5; }
    .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  `;

  @property({ attribute: false }) room!: Room;

  @state() private messages: RoomMessage[] = [];
  @state() private input = '';
  @state() private sending = false;
  @state() private now = Date.now();

  private bound = false;
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this.refresh();
    this.bind();
    this.tickInterval = setInterval(() => { this.now = Date.now(); }, 30_000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.bound) {
      roomsManager.off('room-change', this.onChange);
      roomsManager.off('message-change', this.onChange);
    }
    if (this.tickInterval) clearInterval(this.tickInterval);
  }

  updated(changed: Map<string, unknown>): void {
    if (changed.has('room')) {
      this.refresh();
      this.bind();
    }
  }

  private bind(): void {
    if (this.bound) return;
    roomsManager.on('room-change', this.onChange);
    roomsManager.on('message-change', this.onChange);
    this.bound = true;
  }

  private onChange = (): void => { this.refresh(); };

  private refresh(): void {
    if (!this.room) return;
    this.messages = roomsManager.getMessages(this.room.id);
    roomsManager.markViewed(this.room.id);
    // Scroll to bottom
    setTimeout(() => {
      const el = this.renderRoot?.querySelector('.messages');
      if (el) (el as HTMLElement).scrollTop = (el as HTMLElement).scrollHeight;
    }, 0);
  }

  private formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private memberBadges(): unknown {
    const all = ['you', ...this.room.members.map((m) => m.agentId)];
    return html`<span>Members: ${all.map((m) => html`<span style="color:#9ca3af;margin-right:8px;">${m}</span>`)}</span>`;
  }

  private async handleSend(): Promise<void> {
    if (!this.input.trim() || this.sending) return;
    const text = this.input.trim();
    this.input = '';
    this.sending = true;
    try {
      await roomsManager.sendOperatorMessage(this.room.id, text);
    } finally {
      this.sending = false;
    }
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void this.handleSend();
    }
  }

  private renderMessage(m: RoomMessage) {
    if (m.author.kind === 'system') {
      return html`
        <div style="align-self:center;color:#6b7280;font-size:12px;border:1px dashed #2a2a3a;padding:4px 10px;border-radius:8px;">
          ${m.content}
        </div>
      `;
    }
    const isOperator = m.author.kind === 'operator';
    let label = 'system';
    if (isOperator) label = 'you';
    else if (m.author.kind === 'agent') label = m.author.agentId;
    const bubbleStyle = isOperator
      ? 'align-self:flex-end;background:#6366f1;color:#fff;border-bottom-right-radius:4px;'
      : 'align-self:flex-start;background:#1e1e2a;color:#e0e0e8;border-bottom-left-radius:4px;';
    return html`
      <div style="display:flex;flex-direction:column;gap:4px;max-width:80%;${isOperator ? 'align-self:flex-end;' : 'align-self:flex-start;'}">
        <div style="font-size:11px;color:#6b7280;${isOperator ? 'text-align:right;' : ''}">
          ${label} · ${this.formatTime(m.timestamp)}
        </div>
        <div class="message-bubble" style="padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word;${bubbleStyle}">
          ${m.content}
        </div>
        ${m.delivery && m.delivery.length > 0 ? this.renderDeliveryChips(m) : ''}
        ${m.replies.length > 0
          ? html`<div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;${isOperator ? 'align-items:flex-end;' : 'align-items:flex-start;'}">
              ${m.replies.map((r) => this.renderReply(r))}
            </div>`
          : ''}
      </div>
    `;
  }

  private renderDeliveryChips(m: RoomMessage) {
    return html`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;${m.author.kind === 'operator' ? 'justify-content:flex-end;' : ''}">
      ${(m.delivery ?? []).map((d) => {
        const status = d.status === 'sent' ? '✓' : d.status === 'failed' ? '✗' : '⏳';
        const color = d.status === 'sent' ? '#10b981' : d.status === 'failed' ? '#ef4444' : '#6b7280';
        return html`<span title="${d.agentId} ${d.status}${d.error ? ' — ' + d.error : ''}" style="font-size:10px;color:${color};background:#14141c;padding:2px 6px;border-radius:4px;font-family:monospace;">${status} ${d.agentId}</span>`;
      })}
    </div>`;
  }

  private renderReply(r: RoomMessage extends { replies: (infer R)[] } ? R : never) {
    return html`
      <div style="display:flex;flex-direction:column;gap:2px;max-width:80%;align-self:flex-start;">
        <div style="font-size:10px;color:#6b7280;">${r.agentId} · ${this.formatTime(r.timestamp)}</div>
        <div style="padding:8px 12px;border-radius:10px;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word;background:#1a1a24;color:#e0e0e8;border-bottom-left-radius:4px;">
          ${r.content}
        </div>
      </div>
    `;
  }

  render() {
    if (!this.room) return html``;
    return html`
      <header>
        <button class="back" @click=${() => this.dispatchEvent(new CustomEvent('back', { bubbles: true, composed: true }))}>← Rooms</button>
        <h2>${this.room.name}</h2>
        <button class="settings-btn" @click=${() => this.dispatchEvent(new CustomEvent('open-settings', { bubbles: true, composed: true }))}>⚙ Settings</button>
      </header>
      <div class="members">${this.memberBadges()}</div>

      <div class="messages">
        ${this.messages.length === 0
          ? html`<div class="empty">No messages yet. Type below to send to all ${this.room.members.length} member(s).</div>`
          : this.messages.map((m) => this.renderMessage(m))}
      </div>

      <div class="input-area">
        <input
          type="text"
          placeholder=${this.room.members.length === 0 ? 'Add members before sending' : 'Type a message...'}
          .value=${this.input}
          ?disabled=${this.room.members.length === 0}
          @input=${(e: InputEvent) => (this.input = (e.target as HTMLInputElement).value)}
          @keydown=${this.handleKeydown}
        />
        <button class="send-btn" ?disabled=${!this.input.trim() || this.sending || this.room.members.length === 0} @click=${() => this.handleSend()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'room-view': RoomView;
  }
}

import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { GatewayState, SessionInfo } from '../core/types';
import { connectionManager } from '../core/connection-manager';

@customElement('sessions-list')
export class SessionsList extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      border-bottom: 1px solid #2a2a3a;
      background: #14141c;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid #2a2a3a;
    }

    .header h3 {
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #6b7280;
      margin: 0;
    }

    .refresh-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: #6b7280;
      cursor: pointer;
      font-size: 14px;
    }

    .refresh-btn:hover {
      background: #1e1e2a;
      color: #e0e0e8;
    }

    .refresh-btn.loading svg {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .sessions {
      display: flex;
      flex-direction: column;
      max-height: 200px;
      overflow-y: auto;
    }

    .sessions::-webkit-scrollbar {
      width: 6px;
    }

    .sessions::-webkit-scrollbar-thumb {
      background: #2a2a3a;
      border-radius: 3px;
    }

    .session {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      cursor: pointer;
      transition: background 0.1s;
      border-bottom: 1px solid #1e1e2a;
    }

    .session:hover {
      background: #1e1e2a;
    }

    .session.selected {
      background: #1e1e2a;
      border-left: 2px solid #6366f1;
    }

    .session-icon {
      width: 32px;
      height: 32px;
      background: #2a2a3a;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #6b7280;
      font-size: 14px;
      flex-shrink: 0;
    }

    .session-info {
      flex: 1;
      min-width: 0;
    }

    .session-key {
      font-size: 13px;
      color: #e0e0e8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .session-meta {
      font-size: 11px;
      color: #6b7280;
      margin-top: 2px;
    }

    .empty {
      padding: 20px;
      text-align: center;
      color: #6b7280;
      font-size: 13px;
    }

    .new-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin: 8px 16px 8px;
      padding: 8px;
      background: #6366f1;
      border: none;
      border-radius: 6px;
      color: #fff;
      font-size: 13px;
      cursor: pointer;
    }

    .new-btn:hover {
      background: #4f46e5;
    }
  `;

  @property({ type: String }) gatewayId!: string;
  @property({ type: Object }) gatewayState!: GatewayState;
  @property({ type: String }) selectedSessionKey: string | null = null;

  @state() private sessions: SessionInfo[] = [];
  @state() private loading = false;

  private sessionEventsBound = false;

  updated(changedProps: Map<string, unknown>): void {
    if (changedProps.has('gatewayId') || changedProps.has('gatewayState')) {
      this.loadSessions();
      this.listenForEvents();
    }
  }

  private listenForEvents(): void {
    if (this.sessionEventsBound) return;
    connectionManager.on('event', (id, event, _payload) => {
      if (id !== this.gatewayId) return;
      if (event === 'session.started' || event === 'session.ended' || event === 'session.updated') {
        this.loadSessions();
      }
    });
    this.sessionEventsBound = true;
  }

  async loadSessions(): Promise<void> {
    const client = connectionManager.getClient(this.gatewayId);
    if (!client || this.gatewayState.status !== 'connected') return;

    this.loading = true;
    try {
      this.sessions = await client.listSessions();
    } catch (e) {
      console.error('[SessionsList] Failed to load sessions:', e);
    } finally {
      this.loading = false;
    }
  }

  async handleNewSession(): Promise<void> {
    const client = connectionManager.getClient(this.gatewayId);
    if (!client) return;

    try {
      const sessionKey = await client.createSession();
      this.dispatchEvent(new CustomEvent('select-session', { detail: sessionKey, bubbles: true, composed: true }));
      this.loadSessions();
    } catch (e) {
      console.error('[SessionsList] Failed to create session:', e);
    }
  }

  private formatTime(ts?: number): string {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  render() {
    return html`
      <div class="header">
        <h3>Sessions</h3>
        <button class="refresh-btn ${this.loading ? 'loading' : ''}" @click=${this.loadSessions} title="Refresh">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6"></path>
            <path d="M1 20v-6h6"></path>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
      </div>

      <button class="new-btn" @click=${this.handleNewSession}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        New Session
      </button>

      <div class="sessions">
        ${this.sessions.length === 0
          ? html`<div class="empty">No sessions yet</div>`
          : this.sessions.map(
              (s) => html`
                <div
                  class="session ${s.sessionKey === this.selectedSessionKey ? 'selected' : ''}"
                  @click=${() => this.dispatchEvent(new CustomEvent('select-session', { detail: s.sessionKey, bubbles: true, composed: true }))}
                >
                  <div class="session-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                  </div>
                  <div class="session-info">
                    <div class="session-key">${s.sessionKey}</div>
                    <div class="session-meta">
                      ${s.agentId ? `Agent: ${s.agentId}` : ''} ${s.updatedAtMs ? `· ${this.formatTime(s.updatedAtMs)}` : ''}
                    </div>
                  </div>
                </div>
              `
            )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sessions-list': SessionsList;
  }
}

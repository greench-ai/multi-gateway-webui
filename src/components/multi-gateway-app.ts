import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { connectionManager } from '../core/connection-manager';
import { storageManager } from '../stores/storage-manager';
import { cryptoManager } from '../core/crypto-manager';
import { generateId } from '../core/utils';
import type { GatewayConfig, GatewayState, SessionInfo, StoredGateway } from '../core/types';
import './gateway-card';
import './gateway-form';
import './chat-panel';
import './sessions-list';
import './add-gateway-modal';
import './rooms-tab';
import { roomsManager } from '../stores/rooms-manager';

@customElement('multi-gateway-app')
export class MultiGatewayApp extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: #0f0f14;
      color: #e0e0e8;
    }

    header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      background: #1a1a24;
      border-bottom: 1px solid #2a2a3a;
    }

    header h1 {
      font-size: 18px;
      font-weight: 600;
      color: #fff;
    }

    .logo {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
    }

    main {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    .sidebar {
      width: 280px;
      min-width: 280px;
      background: #14141c;
      border-right: 1px solid #2a2a3a;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid #2a2a3a;
    }

    .sidebar-header h2 {
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #6b7280;
    }

    .add-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      background: #6366f1;
      border: none;
      border-radius: 6px;
      color: #fff;
      cursor: pointer;
      font-size: 18px;
      transition: background 0.15s;
    }

    .add-btn:hover {
      background: #4f46e5;
    }

    .gateway-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .gateway-list::-webkit-scrollbar {
      width: 6px;
    }

    .gateway-list::-webkit-scrollbar-track {
      background: transparent;
    }

    .gateway-list::-webkit-scrollbar-thumb {
      background: #2a2a3a;
      border-radius: 3px;
    }

    .content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      color: #6b7280;
    }

    .empty-state svg {
      width: 64px;
      height: 64px;
      opacity: 0.3;
    }

    .empty-state p {
      font-size: 15px;
    }

    .empty-state button {
      padding: 10px 20px;
      background: #6366f1;
      border: none;
      border-radius: 8px;
      color: #fff;
      font-size: 14px;
      cursor: pointer;
    }

    .empty-state button:hover {
      background: #4f46e5;
    }

    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
  `;

  @state() private gateways: GatewayState[] = [];
  @state() private selectedGatewayId: string | null = null;
  @state() private selectedSessionKey: string | null = null;
  @state() private showAddModal = false;
  @state() private editingGateway: StoredGateway | null = null;
  @state() private sidebarTab: 'gateways' | 'rooms' = 'gateways';
  /**
   * Queue of seed gateways that need a token pasted on first run.
   * Populated when SEED_GATEWAYS ships with empty token fields (the
   * new build-time-stripped state — see vite-plugins/strip-seed-tokens.ts).
   * The user pastes each token via the existing edit modal; once all
   * are entered, this clears and the modal closes.
   */
  @state() private pendingTokenGateways: StoredGateway[] = [];
  /**
   * If true, the next handleSaveGateway will advance to the next
   * pending-token gateway instead of just closing the modal.
   * Set when the modal was opened by the auto-prompt flow.
   */
  @state() private inTokenPromptFlow = false;
  /**
   * Total number of gateways that were in the queue when the prompt
   * flow started. Used to display "X of N" progress to the user.
   */
  @state() private totalPendingCount = 0;

  connectedCallback(): void {
    super.connectedCallback();
    this.init();
  }

  private async init(): Promise<void> {
    // Initialize crypto
    await cryptoManager.init();

    // Load saved gateways (async — reads from IndexedDB)
    const saved = await storageManager.loadConfigAsync();
    let gateways = saved.gateways;

    // First run: seed the 9-agent fleet from the shared knowledge file
    if (gateways.length === 0) {
      const { SEED_GATEWAYS } = await import('../stores/seed-gateways');
      await storageManager.seedFromList(SEED_GATEWAYS);
      gateways = SEED_GATEWAYS;
    } else {
      // Refresh URL/ssh/token fields from the seed for known gateway ids.
      // This lets us fix URLs (e.g. drop a stray /ws path) and re-load
      // tokens without forcing the user to manually re-add or clear
      // IndexedDB. Tokens are still in-memory only in the storage manager,
      // so we have to populate gw.token here for connectionManager.
      const { SEED_GATEWAYS } = await import('../stores/seed-gateways');
      const byId = new Map(SEED_GATEWAYS.map((g) => [g.id, g]));
      for (const gw of gateways) {
        const fresh = byId.get(gw.id);
        if (!fresh) continue;
        let changed = false;
        if (gw.gatewayUrl !== fresh.gatewayUrl) { gw.gatewayUrl = fresh.gatewayUrl; changed = true; }
        if (gw.sshHost !== fresh.sshHost) { gw.sshHost = fresh.sshHost; changed = true; }
        if (gw.sshUser !== fresh.sshUser) { gw.sshUser = fresh.sshUser; changed = true; }
        // Re-load the token from the seed on every boot ONLY if the
        // shipped seed still contains it. With strip-seed-tokens the
        // bundle ships empty tokens (security: see F1 audit), so this
        // branch no longer auto-populates. We track gateways that need
        // a user-pasted token for the first-run prompt.
        if (gw.token && fresh.token && gw.token !== fresh.token) {
          // Source has a real token but IDB has a different one — trust IDB.
          // (This branch can't fire post-F1 fix since fresh.token is "".)
        }
        if (!gw.token && !fresh.token) {
          // Both empty: known seed gateway with no token anywhere.
          // Add to the queue for first-run prompt.
          this.pendingTokenGateways.push(gw);
        }
        if (changed) {
          await storageManager.addGatewayAsync(gw);
        }
      }
    }

    for (const gw of gateways) {
      const config: GatewayConfig = {
        id: gw.id,
        name: gw.name,
        gatewayUrl: gw.gatewayUrl,
        token: gw.token,
        sshUser: gw.sshUser,
        sshHost: gw.sshHost,
      };
      connectionManager.addGateway(config);
    }

    // Listen for status changes
    connectionManager.on('status-change', (_id, state) => {
      this.gateways = [...connectionManager.getAllStates().values()];
    });

    // Initial state
    this.gateways = [...connectionManager.getAllStates().values()];

    // Connect all
    connectionManager.connectAll();

    // Load rooms from IndexedDB
    void roomsManager.load();

    // First-run token-prompt: if any known seed gateway has no token
    // (because the build-time strip removed it from the bundle), open
    // the edit modal for the first one. The handleSaveGateway flow
    // will advance through the queue.
    if (this.pendingTokenGateways.length > 0) {
      // Defer to next tick so the DOM is ready
      setTimeout(() => this.openNextTokenPrompt(), 0);
    }
  }

  private openNextTokenPrompt(): void {
    const next = this.pendingTokenGateways[0];
    if (!next) {
      this.inTokenPromptFlow = false;
      this.showAddModal = false;
      return;
    }
    this.editingGateway = next;
    this.inTokenPromptFlow = true;
    if (this.totalPendingCount === 0) {
      this.totalPendingCount = this.pendingTokenGateways.length;
    }
    this.showAddModal = true;
  }

  private handleSkipGateway(): void {
    // Skip = take the current gateway off the front of the queue and
    // put it at the back. User can come back to it via the edit flow
    // or by reloading the page. The token in IDB stays empty; card
    // shows "no token" until they edit it.
    if (this.pendingTokenGateways.length === 0) return;
    const skipped = this.pendingTokenGateways.shift();
    if (skipped) this.pendingTokenGateways.push(skipped);
    if (this.pendingTokenGateways.length > 0) {
      this.openNextTokenPrompt();
    } else {
      this.inTokenPromptFlow = false;
      this.showAddModal = false;
    }
  }

  private handleAddGateway(): void {
    this.editingGateway = null;
    this.showAddModal = true;
  }

  private handleAddBtn(): void {
    if (this.sidebarTab === 'gateways') {
      this.handleAddGateway();
    } else {
      // Delegate to the rooms tab via a DOM event
      const tab = this.renderRoot?.querySelector('rooms-tab');
      if (tab) tab.dispatchEvent(new CustomEvent('new-room', { bubbles: true, composed: true }));
    }
  }

  private handleEditGateway(e: CustomEvent<GatewayConfig>): void {
    const stored = storageManager.getGateway(e.detail.id);
    this.editingGateway = stored ?? null;
    this.showAddModal = true;
  }

  private async handleSaveGateway(e: CustomEvent<StoredGateway>): Promise<void> {
    const gw = e.detail;
    storageManager.addGateway(gw);

    const config: GatewayConfig = {
      id: gw.id,
      name: gw.name,
      gatewayUrl: gw.gatewayUrl,
      token: gw.token,
    };

    const existing = connectionManager.getClient(gw.id);
    if (existing) {
      existing.disconnect();
    }

    const client = connectionManager.addGateway(config);
    client.connect();

    this.gateways = [...connectionManager.getAllStates().values()];

    // If we were in the first-run token-prompt flow and the saved
    // gateway was the one being prompted for, advance to the next.
    if (this.inTokenPromptFlow && this.pendingTokenGateways[0]?.id === gw.id) {
      this.pendingTokenGateways.shift();
      this.openNextTokenPrompt();
    } else {
      this.showAddModal = false;
    }
  }

  private handleDeleteGateway(e: CustomEvent<string>): void {
    const id = e.detail;
    storageManager.removeGateway(id);
    connectionManager.removeGateway(id);
    if (this.selectedGatewayId === id) {
      this.selectedGatewayId = null;
      this.selectedSessionKey = null;
    }
    this.gateways = [...connectionManager.getAllStates().values()];
  }

  private handleSelectGateway(e: CustomEvent<string>): void {
    this.selectedGatewayId = e.detail;
    this.selectedSessionKey = null;
  }

  private handleReconnectGateway(id: string): void {
    const client = connectionManager.getClient(id);
    if (client) client.connect();
  }

  private handleSelectSession(e: CustomEvent<string>): void {
    this.selectedSessionKey = e.detail;
  }

  private get selectedGateway(): GatewayState | undefined {
    return this.gateways.find((g) => g.config.id === this.selectedGatewayId);
  }

  render() {
    return html`
      <header>
        <div class="logo">H</div>
        <h1>HubClaw</h1>
      </header>

      <main>
        <aside class="sidebar">
          <div class="sidebar-header" style="gap:0;">
            <div style="display:flex;gap:8px;flex:1;">
              <button
                style="background:${this.sidebarTab === 'gateways' ? '#1e1e2a' : 'transparent'};color:${this.sidebarTab === 'gateways' ? '#fff' : '#6b7280'};border:none;padding:4px 10px;border-radius:6px;font-size:13px;cursor:pointer;"
                @click=${() => (this.sidebarTab = 'gateways')}
              >Gateways</button>
              <button
                style="background:${this.sidebarTab === 'rooms' ? '#1e1e2a' : 'transparent'};color:${this.sidebarTab === 'rooms' ? '#fff' : '#6b7280'};border:none;padding:4px 10px;border-radius:6px;font-size:13px;cursor:pointer;"
                @click=${() => (this.sidebarTab = 'rooms')}
              >Rooms</button>
            </div>
            <button
              class="add-btn"
              @click=${this.handleAddBtn}
              title=${this.sidebarTab === 'gateways' ? 'Add Gateway' : 'New Room'}
            >+</button>
          </div>
          ${this.sidebarTab === 'gateways'
            ? html`<div class="gateway-list">
                ${this.gateways.length === 0
                  ? html`<p style="padding:16px;font-size:13px;color:#6b7280;">No gateways configured</p>`
                  : this.gateways.map(
                      (gw) => html`
                        <gateway-card
                          .state=${gw}
                          ?selected=${gw.config.id === this.selectedGatewayId}
                          @select=${(e: CustomEvent) => this.handleSelectGateway(e.detail)}
                          @edit=${(e: CustomEvent) => this.handleEditGateway(e.detail)}
                          @delete=${(e: CustomEvent) => this.handleDeleteGateway(e.detail)}
                          @reconnect=${(e: CustomEvent) => this.handleReconnectGateway(e.detail)}
                        ></gateway-card>
                      `
                    )}
              </div>`
            : html`<div class="gateway-list">
                <p style="padding:16px;font-size:13px;color:#6b7280;line-height:1.5;">
                  Pick a room on the right, or click <strong>+</strong> to create one.
                </p>
              </div>`}
        </aside>

        <section class="content">
          ${this.sidebarTab === 'rooms'
            ? html`<rooms-tab style="display:flex;flex:1;"></rooms-tab>`
            : this.selectedGatewayId && this.selectedGateway
            ? html`
                <sessions-list
                  .gatewayId=${this.selectedGatewayId}
                  .gatewayState=${this.selectedGateway}
                  .selectedSessionKey=${this.selectedSessionKey}
                  @select-session=${(e: CustomEvent<string>) => this.handleSelectSession(e)}
                ></sessions-list>

                ${this.selectedSessionKey
                  ? html`
                      <chat-panel
                        .gatewayId=${this.selectedGatewayId}
                        .sessionKey=${this.selectedSessionKey}
                      ></chat-panel>
                    `
                  : html`
                      <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <p>Select a session to start chatting</p>
                      </div>
                    `}
              `
            : html`
                <div class="empty-state">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                  </svg>
                  <p>Select a gateway to get started</p>
                  <button @click=${this.handleAddGateway}>Add Gateway</button>
                </div>
              `}
        </section>
      </main>

      ${this.showAddModal
        ? html`
            <div class="modal-overlay" @click=${(e: MouseEvent) => e.target === e.currentTarget && (this.showAddModal = false)}>
              <add-gateway-modal
                .gateway=${this.editingGateway}
                .promptInfo=${this.inTokenPromptFlow
                  ? { index: this.pendingTokenGateways.length > 0
                      ? (this.totalPendingCount - this.pendingTokenGateways.length + 1)
                      : 0,
                      total: this.totalPendingCount }
                  : null}
                ?showSkip=${this.inTokenPromptFlow}
                @save=${this.handleSaveGateway}
                @skip=${this.handleSkipGateway}
                @close=${() => (this.showAddModal = false)}
              ></add-gateway-modal>
            </div>
          `
        : ''}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'multi-gateway-app': MultiGatewayApp;
  }
}

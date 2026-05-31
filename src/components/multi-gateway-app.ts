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

  connectedCallback(): void {
    super.connectedCallback();
    this.init();
  }

  private async init(): Promise<void> {
    // Initialize crypto
    await cryptoManager.init();

    // Load saved gateways
    const saved = storageManager.loadConfig();
    for (const gw of saved.gateways) {
      const config: GatewayConfig = {
        id: gw.id,
        name: gw.name,
        gatewayUrl: gw.gatewayUrl,
        token: gw.token,
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
  }

  private handleAddGateway(): void {
    this.editingGateway = null;
    this.showAddModal = true;
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

    this.showAddModal = false;
    this.gateways = [...connectionManager.getAllStates().values()];
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
          <div class="sidebar-header">
            <h2>Gateways</h2>
            <button class="add-btn" @click=${this.handleAddGateway} title="Add Gateway">+</button>
          </div>
          <div class="gateway-list">
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
                    ></gateway-card>
                  `
                )}
          </div>
        </aside>

        <section class="content">
          ${this.selectedGatewayId && this.selectedGateway
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
                @save=${this.handleSaveGateway}
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

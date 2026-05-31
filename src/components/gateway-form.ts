import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { StoredGateway } from '../core/types';
import { generateId } from '../core/utils';

@customElement('gateway-form')
export class GatewayForm extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    h3 {
      font-size: 18px;
      font-weight: 600;
      margin: 0;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    label {
      font-size: 13px;
      font-weight: 500;
      color: #9ca3af;
    }

    input {
      padding: 10px 12px;
      background: #1a1a24;
      border: 1px solid #2a2a3a;
      border-radius: 6px;
      color: #e0e0e8;
      font-size: 14px;
      outline: none;
      transition: border-color 0.15s;
    }

    input:focus {
      border-color: #6366f1;
    }

    input::placeholder {
      color: #4b5563;
    }

    .test-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .test-btn {
      padding: 8px 16px;
      background: #2a2a3a;
      border: none;
      border-radius: 6px;
      color: #e0e0e8;
      font-size: 13px;
      cursor: pointer;
      white-space: nowrap;
    }

    .test-btn:hover {
      background: #3a3a4a;
    }

    .test-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .test-result {
      font-size: 13px;
    }

    .test-result.ok {
      color: #4ade80;
    }

    .test-result.error {
      color: #f87171;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }

    .cancel-btn {
      padding: 10px 20px;
      background: transparent;
      border: 1px solid #2a2a3a;
      border-radius: 6px;
      color: #9ca3af;
      font-size: 14px;
      cursor: pointer;
    }

    .cancel-btn:hover {
      background: #1a1a24;
    }

    .save-btn {
      padding: 10px 20px;
      background: #6366f1;
      border: none;
      border-radius: 6px;
      color: #fff;
      font-size: 14px;
      cursor: pointer;
    }

    .save-btn:hover {
      background: #4f46e5;
    }

    .save-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;

  @property({ type: Object }) gateway: StoredGateway | null = null;

  @state() private name = '';
  @state() private gatewayUrl = '';
  @state() private token = '';
  @state() private testing = false;
  @state() private testResult: { ok: boolean; error?: string } | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    if (this.gateway) {
      this.name = this.gateway.name;
      this.gatewayUrl = this.gateway.gatewayUrl;
      this.token = this.gateway.token;
    }
  }

  render() {
    return html`
      <h3>${this.gateway ? 'Edit Gateway' : 'Add Gateway'}</h3>

      <div class="field">
        <label>Name</label>
        <input
          type="text"
          placeholder="My Agent Server"
          .value=${this.name}
          @input=${(e: InputEvent) => (this.name = (e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="field">
        <label>Gateway URL</label>
        <input
          type="text"
          placeholder="ws://192.168.1.100:18789"
          .value=${this.gatewayUrl}
          @input=${(e: InputEvent) => (this.gatewayUrl = (e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="field">
        <label>Gateway Token</label>
        <input
          type="password"
          placeholder="Paste your gateway token here"
          .value=${this.token}
          @input=${(e: InputEvent) => (this.token = (e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="field">
        <label>Test Connection</label>
        <div class="test-row">
          <button
            class="test-btn"
            ?disabled=${!this.gatewayUrl || !this.token || this.testing}
            @click=${this.handleTest}
          >
            ${this.testing ? 'Testing...' : 'Test'}
          </button>
          ${this.testResult
            ? html`<span class="test-result ${this.testResult.ok ? 'ok' : 'error'}">
                ${this.testResult.ok ? '✓ Connected' : '✕ ' + (this.testResult.error ?? 'Failed')}
              </span>`
            : ''}
        </div>
      </div>

      <div class="actions">
        <button class="cancel-btn" @click=${this.handleCancel}>Cancel</button>
        <button
          class="save-btn"
          ?disabled=${!this.name || !this.gatewayUrl || !this.token}
          @click=${this.handleSave}
        >
          ${this.gateway ? 'Save Changes' : 'Add Gateway'}
        </button>
      </div>
    `;
  }

  private async handleTest(): Promise<void> {
    this.testing = true;
    this.testResult = null;

    try {
      const result = await this.testConnection(this.gatewayUrl, this.token);
      this.testResult = result;
    } catch (e) {
      this.testResult = { ok: false, error: String(e) };
    } finally {
      this.testing = false;
    }
  }

  private testConnection(gatewayUrl: string, token: string): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      const ws = new WebSocket(gatewayUrl);
      const timeout = setTimeout(() => {
        ws.close();
        resolve({ ok: false, error: 'Connection timeout (10s)' });
      }, 10000);

      ws.onmessage = (e) => {
        let msg: { type?: string; event?: string; payload?: { nonce?: string; type?: string }; id?: string; ok?: boolean; error?: { message?: string } };
        try { msg = JSON.parse(e.data); } catch { return; }

        // Handle connect.challenge
        if (msg.type === 'event' && msg.event === 'connect.challenge') {
          const nonce = msg.payload?.nonce;
          ws.send(JSON.stringify({
            type: 'req',
            id: 'test-1',
            method: 'connect',
            params: {
              minProtocol: 3,
              maxProtocol: 4,
              client: { id: 'webchat-ui', version: '1.0.0', platform: 'web', mode: 'ui' },
              role: 'operator',
              scopes: [],
              caps: [],
              commands: [],
              permissions: {},
              auth: { token },
              locale: navigator.language || 'en-US',
              userAgent: 'hubclaw-test/1.0.0',
            }
          }));
          return;
        }

        // Handle hello-ok
        if (msg.type === 'res' && msg.payload?.type === 'hello-ok') {
          clearTimeout(timeout);
          ws.close();
          resolve({ ok: true });
          return;
        }

        // Handle error response
        if (msg.type === 'res' && !msg.ok) {
          clearTimeout(timeout);
          ws.close();
          resolve({ ok: false, error: msg.error?.message || 'Connection failed' });
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        ws.close();
        resolve({ ok: false, error: 'WebSocket error' });
      };

      ws.onclose = () => {
        clearTimeout(timeout);
        // If we haven't resolved yet
      };
    });
  }

  private handleCancel(): void {
    this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }));
  }

  private handleSave(): void {
    const stored: StoredGateway = {
      id: this.gateway?.id ?? generateId(),
      name: this.name,
      gatewayUrl: this.gatewayUrl,
      token: this.token,
    };
    this.dispatchEvent(new CustomEvent('save', { detail: stored, bubbles: true, composed: true }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gateway-form': GatewayForm;
  }
}

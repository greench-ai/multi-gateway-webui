import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { GatewayState } from '../core/types';
import { statusColor } from '../core/utils';

@customElement('gateway-card')
export class GatewayCard extends LitElement {
  static styles = css`
    :host {
      display: block;
      margin-bottom: 4px;
    }

    .card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
      width: 100%;
      text-align: left;
    }

    .card:hover {
      background: #1e1e2a;
    }

    .card.selected {
      background: #1e1e2a;
      border-color: #6366f1;
    }

    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
      box-shadow: 0 0 6px currentColor;
    }

    .status-text {
      font-size: 11px;
      margin-top: 2px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .info {
      flex: 1;
      min-width: 0;
    }

    .name {
      font-size: 14px;
      font-weight: 500;
      color: #e0e0e8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .url {
      font-size: 11px;
      color: #6b7280;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 2px;
    }

    .actions {
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.15s;
    }

    .card:hover .actions {
      opacity: 1;
    }

    .actions button {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 4px;
      color: #6b7280;
      cursor: pointer;
      font-size: 12px;
    }

    .actions button:hover {
      background: #2a2a3a;
      color: #e0e0e8;
    }

    .actions button.delete:hover {
      background: #3f1e1e;
      color: #f87171;
    }

    .pairing {
      margin-top: 6px;
      padding: 6px 8px;
      background: #2a1f12;
      border: 1px solid #fb923c;
      border-radius: 4px;
      font-family: monospace;
      font-size: 11px;
      color: #fed7aa;
      display: flex;
      align-items: center;
      gap: 6px;
      word-break: break-all;
    }

    .pairing code {
      flex: 1;
      white-space: pre-wrap;
    }

    .pairing .copy {
      flex: 0 0 auto;
      background: transparent;
      border: 1px solid #fb923c;
      color: #fb923c;
      border-radius: 3px;
      padding: 2px 6px;
      cursor: pointer;
    }

    .pairing .copy:hover {
      background: #fb923c;
      color: #1a1a1a;
    }

    .debug {
      margin-top: 6px;
      padding: 6px 8px;
      background: #14141c;
      border: 1px solid #2a2a3a;
      border-radius: 4px;
      font-family: monospace;
      font-size: 10px;
      color: #6b7280;
      word-break: break-all;
    }
  `;

  @property({ type: Object }) state!: GatewayState;
  @property({ type: Boolean }) selected = false;

  render() {
    const color = statusColor(this.state.status);
    const statusText = this.state.status.charAt(0).toUpperCase() + this.state.status.slice(1);
    const isPairing = this.state.status === 'pairing-required';

    return html`
      <div class="card ${this.selected ? 'selected' : ''}" @click=${this.handleSelect}>
        <div class="status-dot" style="background:${color}"></div>
        <div class="info">
          <div class="name">${this.state.config.name}</div>
          <div class="url">${this.state.config.gatewayUrl}</div>
          <div class="status-text" style="color:${color}">${statusText}</div>
          ${isPairing && this.state.pairingApproveCommand
            ? html`
                <div class="pairing">
                  <code>${this.state.pairingApproveCommand}</code>
                  <button
                    class="copy"
                    @click=${(e: Event) => { e.stopPropagation(); navigator.clipboard.writeText(this.state.pairingApproveCommand ?? ''); }}
                    title="Copy command"
                  >📋</button>
                </div>
              `
            : null}
          ${this.state.lastMessage
            ? html`<div class="debug">${JSON.stringify(this.state.lastMessage).slice(0, 240)}</div>`
            : null}
        </div>
        <div class="actions">
          <button title="Reconnect" @click=${this.handleReconnect}>↻</button>
          <button title="Edit" @click=${this.handleEdit}>✎</button>
          <button class="delete" title="Delete" @click=${this.handleDelete}>✕</button>
        </div>
      </div>
    `;
  }

  private handleSelect(): void {
    this.dispatchEvent(new CustomEvent('select', {
      detail: this.state.config.id,
      bubbles: true,
      composed: true,
    }));
  }

  private handleReconnect(e: MouseEvent): void {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('reconnect', {
      detail: this.state.config.id,
      bubbles: true,
      composed: true,
    }));
  }

  private handleEdit(e: MouseEvent): void {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('edit', {
      detail: this.state.config,
      bubbles: true,
      composed: true,
    }));
  }

  private handleDelete(e: MouseEvent): void {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('delete', {
      detail: this.state.config.id,
      bubbles: true,
      composed: true,
    }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gateway-card': GatewayCard;
  }
}

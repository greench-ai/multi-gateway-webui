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
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
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
  `;

  @property({ type: Object }) state!: GatewayState;
  @property({ type: Boolean }) selected = false;

  render() {
    const color = statusColor(this.state.status);
    const statusText = this.state.status.charAt(0).toUpperCase() + this.state.status.slice(1);

    return html`
      <div class="card ${this.selected ? 'selected' : ''}" @click=${this.handleSelect}>
        <div class="status-dot" style="background:${color}"></div>
        <div class="info">
          <div class="name">${this.state.config.name}</div>
          <div class="url">${this.state.config.gatewayUrl}</div>
        </div>
        <div class="actions">
          <button title="Edit" @click=${this.handleEdit}>✎</button>
          <button class="delete" title="Delete" @click=${this.handleDelete}>✕</button>
        </div>
      </div>
    `;
  }

  private handleSelect(): void {
    this.dispatchEvent(new CustomEvent('select', { bubbles: true, composed: true }));
  }

  private handleEdit(e: MouseEvent): void {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('edit', { bubbles: true, composed: true }));
  }

  private handleDelete(e: MouseEvent): void {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('delete', { bubbles: true, composed: true }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gateway-card': GatewayCard;
  }
}

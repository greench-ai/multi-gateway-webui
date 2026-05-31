import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { StoredGateway } from '../core/types';
import './gateway-form';

@customElement('add-gateway-modal')
export class AddGatewayModal extends LitElement {
  static styles = css`
    :host {
      background: #1a1a24;
      border: 1px solid #2a2a3a;
      border-radius: 12px;
      padding: 24px;
      min-width: 420px;
      max-width: 90vw;
      max-height: 90vh;
      overflow-y: auto;
    }

    .close-btn {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: #6b7280;
      cursor: pointer;
      font-size: 18px;
    }

    .close-btn:hover {
      background: #2a2a3a;
      color: #e0e0e8;
    }
  `;

  @property({ type: Object }) gateway: StoredGateway | null = null;

  render() {
    return html`
      <gateway-form
        .gateway=${this.gateway}
        @save=${this.handleSave}
        @cancel=${this.handleClose}
      ></gateway-form>
    `;
  }

  private handleSave(e: CustomEvent<StoredGateway>): void {
    this.dispatchEvent(new CustomEvent('save', { detail: e.detail, bubbles: true, composed: true }));
  }

  private handleClose(): void {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'add-gateway-modal': AddGatewayModal;
  }
}

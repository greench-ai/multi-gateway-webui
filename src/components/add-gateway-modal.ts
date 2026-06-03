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

    .prompt-banner {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 12px 16px;
      margin-bottom: 16px;
      background: #1a1f2a;
      border: 1px solid #fb923c;
      border-radius: 8px;
      color: #fed7aa;
      font-size: 13px;
    }

    .prompt-banner strong {
      color: #fb923c;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .prompt-banner .hint {
      color: #9ca3af;
      font-size: 12px;
      margin-top: 2px;
    }

    .skip-row {
      display: flex;
      justify-content: flex-end;
      margin-top: 8px;
      padding-top: 12px;
      border-top: 1px solid #2a2a3a;
    }

    .skip-btn {
      padding: 8px 16px;
      background: transparent;
      border: 1px solid #6b7280;
      border-radius: 6px;
      color: #9ca3af;
      font-size: 13px;
      cursor: pointer;
    }

    .skip-btn:hover {
      border-color: #fb923c;
      color: #fb923c;
    }
  `;

  @property({ type: Object }) gateway: StoredGateway | null = null;
  /**
   * When set, the modal renders a banner above the form showing the
   * first-run token-prompt progress (e.g. "Gateway 3 of 9 — paste token
   * to continue"). Cleared/null hides the banner for normal add/edit flows.
   */
  @property({ type: Object }) promptInfo: { index: number; total: number } | null = null;
  /**
   * When true, the modal renders a "Skip" button next to the form's
   * Save button. Used in the first-run token-prompt flow so users can
   * defer a specific gateway and come back to it later.
   */
  @property({ type: Boolean }) showSkip = false;

  render() {
    return html`
      ${this.promptInfo
        ? html`
            <div class="prompt-banner">
              <strong>First-run token setup</strong>
              <span>Gateway ${this.promptInfo.index} of ${this.promptInfo.total} — paste the token to continue</span>
              ${this.promptInfo.total > 1
                ? html`<span class="hint">Or click Skip to do this later</span>`
                : null}
            </div>
          `
        : null}
      <gateway-form
        .gateway=${this.gateway}
        @save=${this.handleSave}
        @cancel=${this.handleClose}
      ></gateway-form>
      ${this.showSkip
        ? html`
            <div class="skip-row">
              <button class="skip-btn" @click=${this.handleSkip}>Skip for now</button>
            </div>
          `
        : null}
    `;
  }

  private handleSave(e: CustomEvent<StoredGateway>): void {
    this.dispatchEvent(new CustomEvent('save', { detail: e.detail, bubbles: true, composed: true }));
  }

  private handleClose(): void {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  private handleSkip(): void {
    this.dispatchEvent(new CustomEvent('skip', { bubbles: true, composed: true }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'add-gateway-modal': AddGatewayModal;
  }
}
